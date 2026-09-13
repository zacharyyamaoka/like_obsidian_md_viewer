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
// WHY forward-slash it: main.js/parity.js build a `/@fs${FIXTURE_DIR}` URL for
// Vite's raw-filesystem route, which wants POSIX-style separators —
// fileURLToPath() returns native ones, so on Windows this would otherwise
// hand back backslashes and break the URL.
const fixtureDir = (repoRoot + 'tests/markdown-parity/fixtures').split('\\').join('/')

const VIRTUAL_ID = 'virtual:fixture-dir'
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    port: 5400,
    strictPort: true,
    host: '127.0.0.1',
    fs: { allow: [repoRoot] },
  },
  // WHY a virtual module, not `define`: verified directly against this
  // repo's pinned Vite (8.3.0) that `define` only gets applied on the
  // bundled/build path — `npm run dev`'s unbundled dev-server transform
  // skips it entirely, so `__FIXTURE_DIR__` was shipped to the browser
  // completely literal (a `ReferenceError` waiting to happen) even though a
  // production build replaced it correctly. A virtual module's `load()`
  // hook runs the same way in both dev and build, so there's no dev/build
  // split to fall into.
  plugins: [
    {
      name: 'fixture-dir',
      resolveId(id) {
        if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID
      },
      load(id) {
        if (id === RESOLVED_VIRTUAL_ID) return `export const FIXTURE_DIR = ${JSON.stringify(fixtureDir)}`
      },
    },
  ],
}
