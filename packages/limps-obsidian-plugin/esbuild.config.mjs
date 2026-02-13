export default {
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  outfile: 'main.js',
  external: ['obsidian'],
  sourcemap: true,
};
