#!/usr/bin/env node
import Pastel from 'pastel';

const app = new Pastel({
  importMeta: import.meta,
  name: 'limps',
  version: '0.2.2',
  description: 'Local Iterative Multi-agent Planning Server',
});

await app.run();
