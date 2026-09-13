# like_obsidian_md_viewer

A standalone, really-robust markdown file viewer — Obsidian-parity rendering,
not "miles away from a good markdown editor." Extracted from the
`clank-workbench` sandbox (`packages/markdown-editor`) once the direction
proved out, because this viewer — not any one host — is the actual goal.

The editor is a fork of [`kenforthewin/atomic-editor`](https://github.com/kenforthewin/atomic-editor),
with an Obsidian compatibility layer in `src/obsidian/`. Read `UPSTREAM.md`
before touching anything outside that directory — it explains why this is a
full fork rather than a partial vendor or a dependency, and which files are
ours to change.

## Run the playground

```bash
npm install
npm run dev
```

Opens on `http://127.0.0.1:5400`. `index.html` is the editable playground
(switch fixtures, toggle light/dark); `parity.html?f=<fixture>` is the bare
capture page used for pixel comparisons against a real Obsidian instance.

## Test

```bash
npm run test        # vitest — unit/contract tests for the editor
npm run typecheck   # tsc --noEmit
```

`tests/markdown-parity/` holds the Obsidian-parity research harness —
Python + CDP scripts that capture both editors and measure the gap
(`measure_gap.py`, `capture_obsidian.py`, `capture_ours.mjs`, …). These drive
against a live, remote-debuggable Obsidian instance and are exploratory
tooling, not part of the automated test suite.

## Layout

- `src/` — the editor itself. `src/obsidian/` is our delta over upstream.
- `dev/` — the playground and the parity capture page.
- `tests/markdown-parity/` — the Obsidian-comparison research harness.
- `docs/`, `reports/` — the research report that led to forking atomic-editor.

## Status

Mid pixel-parity tuning, and **not yet a general file-open viewer**: the
playground (`dev/main.js`) only loads three hardcoded fixtures
(`01-elements`, `02-note`, `scratch`) — there is no file picker, CLI
argument, or file-loading host yet for opening an arbitrary `.md` file.
That's the gap between "the editing surface renders Obsidian-parity
markdown" (true today) and "a normal markdown file viewer" (the actual
goal, still ahead).

`reports/markdown-viewer-research-2026-09-11.html` has the research behind
the fork decision; `UPSTREAM.md` has the delta discipline. The next steps
historically were to keep narrowing the measured gaps (math/code/table
block spacing, the emphasis-mark cursor reveal) against a running Obsidian
oracle, add real file loading, then do "a lightweight port into the card" —
SystemSketch's whiteboard Markdown block — once this viewer is solid on its
own.
