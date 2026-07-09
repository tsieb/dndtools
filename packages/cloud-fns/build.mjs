// Bundle each Lambda handler into build/<name>/index.mjs.
//
// @dndtools/core resolves to raw TypeScript source (its package `exports` point
// at ./src/index.ts) — esbuild transpiles it inline, exactly how the Vite app
// consumes it. aws-jwt-verify is bundled too. The AWS SDK v3 (@aws-sdk/*,
// @smithy/*) is provided by the nodejs20.x runtime, so it stays external to keep
// the bundle small.
import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'build');

const ENTRYPOINTS = [
  { name: 'signaling-authorizer', entry: 'src/signaling/authorizer.ts' },
  { name: 'signaling-handler', entry: 'src/signaling/handler.ts' },
  { name: 'sync-handler', entry: 'src/sync/handler.ts' },
  { name: 'app-api-handler', entry: 'src/app-api/handler.ts' },
];

rmSync(out, { recursive: true, force: true });

for (const e of ENTRYPOINTS) {
  await build({
    entryPoints: [resolve(here, e.entry)],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: resolve(out, e.name, 'index.mjs'),
    external: ['@aws-sdk/*', '@smithy/*'],
    // Some transitive deps use CommonJS require(); provide a shim under ESM.
    banner: {
      js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
    },
    logLevel: 'info',
  });
  console.log(`built ${e.name} -> build/${e.name}/index.mjs`);
}
