#!/usr/bin/env node
import Pastel from 'pastel';

const app = new Pastel({
  importMeta: import.meta,
  name: 'limps',
  version: '0.3.0',
  description: 'Local Intelligent MCP Planning Server',
});

await app.run();
