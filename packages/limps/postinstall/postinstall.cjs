#!/usr/bin/env node

/**
 * Postinstall hook: Auto-restart limps HTTP daemons after upgrade.
 *
 * This script runs after `npm install` to ensure daemons are using the latest code.
 * It gracefully stops old daemons and restarts them with the same configuration.
 *
 * Features:
 * - ✅ Lock file prevents concurrent installs from racing
 * - ✅ Graceful shutdown (SIGTERM → wait → SIGKILL)
 * - ✅ Health check polling after restart
 * - ✅ Opt-out via LIMPS_SKIP_POSTINSTALL=1
 * - ✅ Never fails npm install (always exits 0)
 * - ✅ Clear error messages for manual recovery
 *
 * Security: Only restarts daemons in standard system PID directory.
 */

const { spawn } = require('child_process');
const { existsSync, openSync, closeSync, readFileSync, unlinkSync, readdirSync } = require('fs');
const { join, dirname } = require('path');
const { homedir, platform } = require('os');
const { request: httpRequest } = require('http');

// Configuration
const SHUTDOWN_TIMEOUT_MS = 10000; // 10 seconds before SIGKILL
const HEALTH_CHECK_TIMEOUT_MS = 30000; // 30 seconds for daemon to become healthy
const HEALTH_CHECK_INTERVAL_MS = 1000; // Poll every 1 second
const LOCK_STALE_MS = 60000; // Lock files older than 60s are considered stale

/**
 * Get the system-wide PID directory (same logic as pidfile.ts).
 */
function getSystemPidDir() {
  let appDataPath;
  if (platform() === 'darwin') {
    appDataPath = join(homedir(), 'Library', 'Application Support', 'limps');
  } else if (platform() === 'win32') {
    appDataPath = join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'limps');
  } else {
    const xdgDataHome = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
    appDataPath = join(xdgDataHome, 'limps');
  }
  return join(appDataPath, 'pids');
}

/**
 * Acquire a lock file to prevent concurrent postinstall executions.
 * Returns the file descriptor on success, or null if lock cannot be acquired.
 */
function acquireLock(lockPath) {
  try {
    // Try to create lock file exclusively
    const fd = openSync(lockPath, 'wx');
    return fd;
  } catch (err) {
    if (err.code === 'EEXIST') {
      // Check if lock is stale
      try {
        const stats = require('fs').statSync(lockPath);
        const ageMs = Date.now() - stats.mtimeMs;
        if (ageMs > LOCK_STALE_MS) {
          console.log('Removing stale lock file...');
          unlinkSync(lockPath);
          return acquireLock(lockPath); // Retry
        }
      } catch {
        // Lock file disappeared or permission error
      }
      return null; // Lock held by another process
    }
    throw err; // Unexpected error
  }
}

/**
 * Release the lock file.
 */
function releaseLock(fd, lockPath) {
  try {
    closeSync(fd);
    unlinkSync(lockPath);
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Discover all running limps daemons from PID files.
 */
function discoverRunningDaemons() {
  const pidDir = getSystemPidDir();
  if (!existsSync(pidDir)) {
    return [];
  }

  const daemons = [];
  const entries = readdirSync(pidDir);

  for (const entry of entries) {
    if (!entry.startsWith('limps-') || !entry.endsWith('.pid')) {
      continue;
    }

    const pidFilePath = join(pidDir, entry);
    try {
      const contents = JSON.parse(readFileSync(pidFilePath, 'utf-8'));

      // Validate required fields
      if (
        typeof contents.pid === 'number' &&
        typeof contents.port === 'number' &&
        typeof contents.host === 'string' &&
        typeof contents.startedAt === 'string'
      ) {
        // Check if process is still running
        if (isProcessRunning(contents.pid)) {
          daemons.push({
            pid: contents.pid,
            port: contents.port,
            host: contents.host,
            configPath: contents.configPath,
            pidFilePath,
          });
        }
      }
    } catch {
      // Invalid PID file, skip it
    }
  }

  return daemons;
}

/**
 * Check if a process is still running.
 */
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0); // Signal 0 tests existence
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop a daemon gracefully (SIGTERM, then SIGKILL after timeout).
 */
async function stopDaemon(pid) {
  if (!isProcessRunning(pid)) {
    return; // Already stopped
  }

  console.log(`  Stopping daemon (PID ${pid})...`);

  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    if (err.code === 'ESRCH') {
      return; // Process already gone
    }
    throw err;
  }

  // Wait for graceful shutdown
  const startTime = Date.now();
  while (Date.now() - startTime < SHUTDOWN_TIMEOUT_MS) {
    if (!isProcessRunning(pid)) {
      console.log(`  ✓ Daemon stopped gracefully`);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Force kill
  console.log(`  Daemon didn't stop gracefully, forcing SIGKILL...`);
  try {
    process.kill(pid, 'SIGKILL');
  } catch (err) {
    if (err.code === 'ESRCH') {
      return; // Already gone
    }
    throw err;
  }

  // Verify it's dead
  await new Promise(resolve => setTimeout(resolve, 1000));
  if (isProcessRunning(pid)) {
    throw new Error(`Failed to kill daemon (PID ${pid})`);
  }
  console.log(`  ✓ Daemon force-stopped`);
}

/**
 * Start a limps daemon.
 */
async function startDaemon(configPath, port, host) {
  console.log(`  Starting daemon on ${host}:${port}...`);

  const args = ['start', '--port', port.toString(), '--host', host];
  if (configPath) {
    args.push('--config', configPath);
  }

  // Get the path to limps binary (in dist/cli.js)
  const limpsPath = join(__dirname, '..', 'dist', 'cli.js');

  const child = spawn(process.execPath, [limpsPath, ...args], {
    detached: true,
    stdio: 'ignore',
  });

  child.unref(); // Allow parent to exit independently

  // Wait a moment for the process to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log(`  Daemon process spawned, checking health...`);
}

/**
 * Check daemon health via HTTP.
 */
function checkHealth(host, port) {
  return new Promise((resolve) => {
    const req = httpRequest(
      {
        hostname: host,
        port,
        method: 'GET',
        path: '/health',
        timeout: 3000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(body);
              resolve(data.status === 'ok');
            } catch {
              resolve(false);
            }
          } else {
            resolve(false);
          }
        });
      }
    );

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * Wait for daemon to become healthy.
 */
async function waitForHealth(host, port) {
  const startTime = Date.now();

  while (Date.now() - startTime < HEALTH_CHECK_TIMEOUT_MS) {
    const healthy = await checkHealth(host, port);
    if (healthy) {
      console.log(`  ✓ Daemon is healthy`);
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS));
  }

  return false;
}

/**
 * Main restart logic.
 */
async function restartDaemons() {
  // Check for opt-out
  if (process.env.LIMPS_SKIP_POSTINSTALL === '1') {
    console.log('LIMPS_SKIP_POSTINSTALL=1, skipping daemon restart');
    return;
  }

  // Acquire lock
  const lockPath = join(getSystemPidDir(), '.postinstall.lock');
  const lockFd = acquireLock(lockPath);

  if (lockFd === null) {
    console.log('Another limps install is in progress, skipping restart');
    return;
  }

  try {
    console.log('Checking for running limps daemons...');
    const daemons = discoverRunningDaemons();

    if (daemons.length === 0) {
      console.log('No running daemons found');
      return;
    }

    console.log(`Found ${daemons.length} running daemon(s), restarting...`);

    for (const daemon of daemons) {
      try {
        console.log(`\nRestarting daemon on ${daemon.host}:${daemon.port}...`);

        // Stop old daemon
        await stopDaemon(daemon.pid);

        // Start new daemon
        await startDaemon(daemon.configPath, daemon.port, daemon.host);

        // Wait for health check
        const healthy = await waitForHealth(daemon.host, daemon.port);

        if (healthy) {
          console.log(`✓ Successfully restarted daemon on ${daemon.host}:${daemon.port}`);
        } else {
          console.error(`✗ Daemon started but failed health check on ${daemon.host}:${daemon.port}`);
          console.error(`  Manual restart: limps stop && limps start --port ${daemon.port}`);
        }
      } catch (err) {
        console.error(`✗ Failed to restart daemon on ${daemon.host}:${daemon.port}:`);
        console.error(`  ${err.message}`);
        console.error(`  Manual restart: limps stop && limps start --port ${daemon.port}`);
      }
    }

    console.log('\nDaemon restart complete');
  } finally {
    releaseLock(lockFd, lockPath);
  }
}

// Run with error handling
restartDaemons()
  .catch((err) => {
    console.warn('Warning: postinstall daemon restart failed:', err.message);
    console.warn('Your limps installation is still valid.');
    console.warn('If you have running daemons, restart them manually: limps stop && limps start');
  })
  .finally(() => {
    // Always exit 0 - never fail npm install
    process.exit(0);
  });
