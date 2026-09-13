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
}
