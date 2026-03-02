import { render } from 'ink';
import { AcpServer } from '../acp/server.js';
import { TuiApp } from './app.js';

export async function startTui(options: { acpPort?: number; configPath?: string }): Promise<void> {
  const acpPort = options.acpPort ?? 7379;

  const acpServer = new AcpServer({ port: acpPort });
  await acpServer.start();

  const sessionManager = acpServer.getSessionManager();

  const { unmount, waitUntilExit } = render(
    <TuiApp sessionManager={sessionManager} acpPort={acpServer.port} />,
    { exitOnCtrlC: true }
  );

  try {
    await waitUntilExit();
  } finally {
    unmount();
    await acpServer.stop();
  }
}
