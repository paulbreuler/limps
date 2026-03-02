import { createServer, type Server, type ServerResponse } from 'http';
import type { AcpConfig } from './types.js';
import { AcpSessionManager } from './session-manager.js';
import { createAcpTools, type AcpTools } from './tools.js';

export class AcpServer {
  private config: AcpConfig;
  private httpServer: Server | null = null;
  private sessionManager: AcpSessionManager;
  private _port = 0;

  constructor(config: AcpConfig) {
    this.config = config;
    this.sessionManager = new AcpSessionManager();
  }

  async start(): Promise<void> {
    const tools = createAcpTools({ sessionManager: this.sessionManager });

    this.httpServer = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');

      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        this.handleRequest(req.url ?? '/', req.headers.host ?? 'localhost', body, tools, res);
      });
    });

    const server = this.httpServer;
    await new Promise<void>((resolve, reject) => {
      server.listen(this.config.port, this.config.host ?? '127.0.0.1', () => {
        const addr = server.address();
        this._port = typeof addr === 'object' && addr ? addr.port : this.config.port;
        resolve();
      });
      server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (this.httpServer) {
      const server = this.httpServer;
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.httpServer = null;
    }
  }

  isRunning(): boolean {
    return this.httpServer !== null && this.httpServer.listening;
  }

  get port(): number {
    return this._port;
  }

  getSessionManager(): AcpSessionManager {
    return this.sessionManager;
  }

  private handleRequest(
    url: string,
    host: string,
    body: string,
    tools: AcpTools,
    res: ServerResponse
  ): void {
    const parsed = new URL(url, `http://${host}`);
    const toolName = parsed.pathname.replace('/acp/', '') as keyof AcpTools;

    if (!(toolName in tools)) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: `Unknown tool: ${toolName}` }));
      return;
    }

    let input: Record<string, unknown>;
    try {
      input = body ? (JSON.parse(body) as Record<string, unknown>) : {};
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }

    const handler = tools[toolName] as (req: Record<string, unknown>) => Promise<unknown>;
    Promise.resolve(handler(input))
      .then((result) => {
        res.writeHead(200);
        res.end(JSON.stringify(result));
      })
      .catch((err: Error) => {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      });
  }
}
