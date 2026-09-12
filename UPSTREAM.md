# This package is a fork of `kenforthewin/atomic-editor`

| | |
|---|---|
| Upstream | https://github.com/kenforthewin/atomic-editor |
| Forked at | `b6ed65f01bde4510031bc7a495520bc1a7688c66` |
| Date | 2026-09-11 |
| License | MIT — `LICENSE` kept verbatim |
| npm equivalent | `@atomic-editor/editor@0.6.2` |

## The rule

**`src/` is upstream's tree. Our additions live in `src/obsidian/`.** A diff of
everything outside `src/obsidian/` against the upstream tag is our carried
delta, and it should stay small enough to read.

## Why a fork and not a dependency

Two of the gaps we must close are bugs *inside* upstream's own decoration
builders (frontmatter parsed as a setext heading; a stray bracket on a
non-aliased `[[wikilink]]`). A CodeMirror extension cannot un-emit a decoration
another extension already produced for the same range, so neither is fixable by
layering — `patch-package` across two consuming repos was the only alternative.

## Why a FULL fork and not a partial vendor

The first attempt vendored ten modules and rebuilt the composition by hand. That
silently dropped, and a later audit confirmed lost:

- `drawSelection`, `highlightActiveLine`, `dropCursor`, `indentOnInput`,
  `rectangularSelection`, `highlightSpecialChars`, multiple selections
- `indentWithTab` — Tab did nothing, and in a real page moved focus out
- `markdownLanguage.data.of({ closeBrackets: … })` — the markdown delimiter
  pairing, without which upstream's own `extendEmphasisPair` and
  `startAsteriskList` are unreachable dead code
- upstream's minimal find panel, replaced by CM6's unstyled stock one
- `atomicEditorTheme` entirely
- `onLinkClick` routing for links *inside table cells*
- `src/styles/inline-preview.css` — **830 lines**, leaving 39 upstream classes
  with no rule: raw markdown visible inside rendered table cells, wiki-link
  states, the link hover icon, `hr`, images, and the rules that stop width
  jitter when typing through `**`
- every imperative behaviour: reveal-on-open, the search/undo/redo/read-only
  handle, `documentId` remount semantics
- `src/__tests__/` — 9 files of contract tests that would have caught most of
  the above

None of it is visible in a screenshot, which is exactly why it went unnoticed.

## `src/atomicExtensions.ts` — our one edit to upstream's own code

Upstream's built-in extension list lived inside the React component, reachable
only by mounting React. Our second consumer is a tldraw canvas card that cannot
take a React dependency. That list is framework-free (the search panel is plain
DOM, the reveal field is a plain `StateField`), so it is lifted into a factory
**line for line, in the same order**, and the React wrapper calls it.

`src/searchPanel.ts` is the same move for upstream's own `defaultSearchPanel` —
note it is *not* a `@codemirror/search` export and no such export exists; an
earlier extraction assumed it was, imported it from there, and the editor failed
to mount.

Both are deliberately shaped as small patches to offer upstream. Every merged PR
shrinks what we carry.

## Pulling upstream changes

```
git remote add atomic https://github.com/kenforthewin/atomic-editor.git
git fetch atomic
git diff b6ed65f..atomic/main -- src/
```

Our files (`src/obsidian/`, `src/atomicExtensions.ts`, `src/searchPanel.ts`) are
the only ones that should conflict.

## What upstream does NOT have, and we add

- **Callouts** (`src/obsidian/callouts.ts`) — `> [!note]`. Upstream renders the
  first line as a link-ish `!note`.
- **Obsidian token layer** (`src/obsidian/obsidian-tokens.css`) — loaded *after*
  `src/styles/inline-preview.css`, never instead of it. Values measured from a
  running Obsidian 1.12.7 rather than copied from the developer docs, which
  publish variable names but not shipped values.
- **`wikiLinks()` in the default set** — upstream leaves it opt-in; Obsidian has
  wiki links, so our composition includes it.
- Still to come: math, the Properties panel, slash commands.
