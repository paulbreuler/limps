import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AcpServer } from '../../src/acp/server.js';

describe('AcpServer', () => {
  let server: AcpServer;

  beforeEach(() => {
    server = new AcpServer({ port: 0 }); // port 0 = random available port
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should start and stop without errors', async () => {
    await server.start();
    expect(server.isRunning()).toBe(true);
    await server.stop();
    expect(server.isRunning()).toBe(false);
  });

  it('should expose port after start', async () => {
    await server.start();
    expect(server.port).toBeGreaterThan(0);
  });

  it('should not be running before start', () => {
    expect(server.isRunning()).toBe(false);
    expect(server.port).toBe(0);
  });

  it('should handle stop when not started', async () => {
    // Should not throw
    await server.stop();
    expect(server.isRunning()).toBe(false);
  });

  it('should expose session manager', () => {
    const sessionManager = server.getSessionManager();
    expect(sessionManager).toBeDefined();
    expect(sessionManager.getSessions()).toHaveLength(0);
  });

  it('should respond to POST requests on /acp/ routes', async () => {
    await server.start();
    const port = server.port;

    const response = await fetch(`http://127.0.0.1:${port}/acp/list_tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('should reject non-POST methods', async () => {
    await server.start();
    const port = server.port;

    const response = await fetch(`http://127.0.0.1:${port}/acp/list_tasks`, {
      method: 'GET',
    });

    expect(response.status).toBe(405);
  });

  it('should return 404 for unknown tools', async () => {
    await server.start();
    const port = server.port;

    const response = await fetch(`http://127.0.0.1:${port}/acp/nonexistent_tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid JSON body', async () => {
    await server.start();
    const port = server.port;

    const response = await fetch(`http://127.0.0.1:${port}/acp/list_tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json{{{',
    });

    expect(response.status).toBe(400);
  });
});
