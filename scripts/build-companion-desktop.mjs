import { access } from 'node:fs/promises';

const required = [
  'apps/companion-desktop/src/main.mjs',
  'apps/companion-desktop/src/preload.mjs',
  'apps/companion-desktop/src/index.html',
  'apps/companion-desktop/src/renderer.mjs',
  'apps/companion-desktop/src/service-runner.mjs',
  'apps/companion-service/src/server.ts',
];

await Promise.all(required.map(async (file) => access(file)));
console.log('Companion desktop build check passed.');
