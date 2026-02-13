import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = dirname(scriptDir);
const pluginMain = join(packageDir, 'main.js');
const entry = join(packageDir, 'src', 'main.ts');

await build({
  entryPoints: [entry],
  outfile: pluginMain,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: ['node18'],
  external: ['obsidian'],
  sourcemap: false,
});

console.log('Built bundled Obsidian artifact:', pluginMain);
