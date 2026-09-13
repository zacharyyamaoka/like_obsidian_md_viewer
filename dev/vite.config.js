/**
 * Dev server for the markdown-editor playground.
 *
 * Root is this `dev/` directory but the editor source and the shared fixtures
 * both live above it, so `fs.allow` has to reach the repo root. Running from
 * the repo (rather than a scratch copy) is deliberate: every @codemirror/*
 * package resolves from this repo's own node_modules, which means one
 * copy of @codemirror/state and no `instanceof` failures across the boundary.
 */
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    port: 5400,
    strictPort: true,
    host: '127.0.0.1',
    fs: { allow: [repoRoot] },
  },
  // WHY define, not a hardcoded path in main.js/parity.js: those are browser
  // modules, so they can't resolve a filesystem path relative to themselves
  // the way this Node config file can. Computing it once, here, from
  // import.meta.url keeps the repo relocatable — clone it anywhere and the
  // fixture path is still correct.
  define: {
    __FIXTURE_DIR__: JSON.stringify(repoRoot + 'tests/markdown-parity/fixtures'),
  },
}
