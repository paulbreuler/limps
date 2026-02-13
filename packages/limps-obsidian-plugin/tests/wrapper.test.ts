import test from 'node:test';
import assert from 'node:assert/strict';
import { execCommand, parseDependencyPathConversionText, runLimps } from '../src/cli/wrapper.js';

test('execCommand parses valid JSON output', async () => {
  const result = await execCommand<{ ok: boolean }>({
    command: process.execPath,
    args: ['-e', 'console.log(JSON.stringify({ok:true}))'],
    cwd: process.cwd(),
    timeoutMs: 2000,
    parseJson: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { ok: true });
});

test('execCommand returns parse failure for invalid JSON', async () => {
  const result = await execCommand({
    command: process.execPath,
    args: ['-e', 'console.log("not-json")'],
    cwd: process.cwd(),
    timeoutMs: 2000,
    parseJson: true,
  });

  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /Failed to parse JSON output/);
});

test('execCommand reports non-zero exit code and stderr', async () => {
  const result = await execCommand({
    command: process.execPath,
    args: ['-e', 'console.error("boom"); process.exit(3);'],
    cwd: process.cwd(),
    timeoutMs: 2000,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 3);
  assert.match(result.stderr, /boom/);
});

test('execCommand marks timeout failures', async () => {
  const result = await execCommand({
    command: process.execPath,
    args: ['-e', 'setTimeout(() => console.log("late"), 2000);'],
    cwd: process.cwd(),
    timeoutMs: 20,
  });

  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
});

test('runLimps injects --config when provided', async () => {
  const result = await runLimps<string[]>(
    ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', '--'],
    {
      limpsPath: process.execPath,
      configPath: '/tmp/test-config.json',
      cwd: process.cwd(),
      timeoutMs: 2000,
      parseJson: true,
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, ['--config', '/tmp/test-config.json']);
});

test('parseDependencyPathConversionText parses structured plain text output', () => {
  const parsed = parseDependencyPathConversionText(`
Dependency path conversion complete

Plans processed: 7
Files scanned: 26
Files updated: 10
Dependencies converted: 42

Warnings:
  - unresolved dependency in 001.agent.md
  - another warning
`);

  assert.deepEqual(parsed, {
    plansProcessed: 7,
    filesScanned: 26,
    filesUpdated: 10,
    dependenciesConverted: 42,
    warnings: ['unresolved dependency in 001.agent.md', 'another warning'],
  });
});

test('parseDependencyPathConversionText returns null when required fields are missing', () => {
  const parsed = parseDependencyPathConversionText('Files scanned: 2');
  assert.equal(parsed, null);
});
