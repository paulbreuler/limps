import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDirectedGraph } from '../dist/src/graph/directedGraph.js';

const defaultConfigPath = '/Users/paul/Documents/GitHub/limps/.limps/config.json';
const configPath = resolve(process.argv[2] ?? defaultConfigPath);

if (!existsSync(configPath)) {
  console.error(`Config not found: ${configPath}`);
  console.error('Usage: npm run preview:3d -- /absolute/path/to/.limps/config.json');
  process.exit(1);
}

const configRaw = readFileSync(configPath, 'utf8');
const config = JSON.parse(configRaw);
if (!config.plansPath || typeof config.plansPath !== 'string') {
  console.error(`Invalid config at ${configPath}: missing plansPath`);
  process.exit(1);
}

const graph = buildDirectedGraph(config.plansPath);
const graphJson = JSON.stringify({
  nodes: graph.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    type: node.type,
  })),
  links: graph.edges.map((edge) => ({
    source: edge.from,
    target: edge.to,
    type: edge.type,
  })),
});

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LIMPS Graph Preview</title>
    <style>
      html, body, #graph { width: 100%; height: 100%; margin: 0; background: #f3f4f6; font-family: sans-serif; }
      .hud { position: fixed; top: 8px; left: 8px; z-index: 10; background: rgba(255,255,255,0.9); padding: 8px 10px; border-radius: 8px; border: 1px solid #d1d5db; }
    </style>
    <script src="https://unpkg.com/3d-force-graph"></script>
  </head>
  <body>
    <div class="hud">LIMPS Graph Preview (3D)</div>
    <div id="graph"></div>
    <script>
      const colorByType = {
        plan: '#60a5fa',
        agent: '#a78bfa',
        doc: '#34d399',
        roadmap: '#f472b6',
        canvas: '#fbbf24',
        base: '#f87171'
      };

      fetch('/graph.json')
        .then((res) => res.json())
        .then((data) => {
          const graph = ForceGraph3D()(document.getElementById('graph'))
            .graphData(data)
            .backgroundColor('rgba(0,0,0,0)')
            .nodeColor((n) => colorByType[n.type] || '#64748b')
            .nodeLabel((n) => n.label)
            .linkWidth(1.2)
            .linkDirectionalArrowLength(4)
            .linkDirectionalArrowRelPos(1)
            .onEngineStop(() => graph.zoomToFit(400, 80));
        })
        .catch((err) => {
          console.error(err);
          alert('Failed to load graph data');
        });
    </script>
  </body>
</html>`;

const server = createServer((req, res) => {
  if (req.url === '/graph.json') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(graphJson);
    return;
  }

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') return;
  const url = `http://127.0.0.1:${address.port}`;
  console.log(`Preview server running at ${url}`);
  console.log('Press Ctrl+C to stop.');

  if (process.platform === 'darwin') {
    const opener = spawn('open', [url], { detached: true, stdio: 'ignore' });
    opener.unref();
  }
});
