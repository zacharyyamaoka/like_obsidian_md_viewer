/**
 * Obsidian's inline title — the file's name, rendered as a large heading above
 * the document (and above Properties, when present).
 *
 * In real Obsidian this isn't markdown at all: it's a separate contenteditable
 * DOM node bound to the file's name, sitting as a sibling of the CodeMirror
 * content and the Properties panel inside `.cm-sizer` — renaming it renames
 * the file. This editor has no file identity, only a `title` string handed in
 * by the host, so it is reproduced as chrome instead: a block widget at
 * document position 0 that occupies no source characters and has no raw form
 * to reveal. That is also why it skips the reveal-on-cursor rule every other
 * construct in this directory follows (callouts, properties) — there is no
 * underlying markdown text to protect the user's ability to edit.
 *
 * WHY a StateField and not a ViewPlugin: this is a block decoration (it must
 * sit on its own line, above the first line of content), and CodeMirror
 * refuses a block-level decoration from a ViewPlugin outright.
 *
 * WHY it renders nothing when `title` is empty: this is chrome DERIVED from a
 * filename. An empty state has no filename-shaped placeholder in Obsidian
 * either — the panel simply isn't there.
 *
 * Tokens (`--inline-title-*`) measured from a running Obsidian 1.12.7 via
 * `read_tokens.py`: size and weight track h1 (1.618em / 700) exactly,
 * line-height 1.2, margin-bottom 0.5em, letter-spacing -0.015em. Obsidian
 * itself reads these off `--h1-size`/`--h1-weight`
 * (`.HyperMD-header-1, .inline-title h1 { font-size: var(--h1-size); … }`), so
 * the CSS below does the same rather than hardcoding a second copy of the
 * numbers that could drift from the h1 rule if the theme ever changes scale.
 */
import type { Extension, Range } from '@codemirror/state'
import { Facet, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'

import './inlineTitle.css'

export interface InlineTitleConfig {
  /** The file's display name. Omitted or empty renders nothing at all. */
  title?: string
}

class InlineTitleWidget extends WidgetType {
  constructor(private readonly title: string) {
    super()
  }

  eq(other: InlineTitleWidget) {
    return other.title === this.title
  }

  toDOM() {
    const el = document.createElement('div')
    el.className = 'md-inline-title'
    el.textContent = this.title
    return el
  }

  /** Pure chrome over a filename, not source text — there is nothing here for
   * a click to place a cursor into. */
  ignoreEvent() {
    return true
  }
}

function buildDecorations(title: string | undefined): DecorationSet {
  if (!title) return Decoration.none
  // A zero-length widget, not a replace: unlike Properties' frontmatter block,
  // there is no source range to consume here, only a position to anchor to.
  // `side: -1` keeps it non-positive so it draws BEFORE any other decoration
  // anchored to position 0 — specifically properties.ts's block replace of
  // the frontmatter fence, which otherwise starts at the same position and
  // would tie with a default side of 0.
  const out: Array<Range<Decoration>> = [
    Decoration.widget({ widget: new InlineTitleWidget(title), side: -1, block: true }).range(0),
  ]
  return Decoration.set(out)
}

// StateField.define returns a module-level singleton shared by every editor
// instance that imports this file, so the title itself cannot live as a
// closed-over argument to `create` — a second editor with a different title
// would silently see the first one's. A Facet is CodeMirror's own answer to
// per-instance config (the same shape as `readOnlyFacet` in ../read-only.ts):
// each `inlineTitle()` call contributes one value, and the field's `create`
// reads it back off the state that was actually constructed with it.
const titleFacet = Facet.define<string, string>({
  combine: (values) => (values.length ? values[values.length - 1] : ''),
})

const inlineTitleField = StateField.define<DecorationSet>({
  create: (state) => buildDecorations(state.facet(titleFacet)),
  // Nothing here depends on the document or selection — the title is fixed
  // config, not parsed content — so the decoration never needs to change
  // through the field's own update() reads.
  update: (value) => value,
  provide: (f) => EditorView.decorations.from(f),
})

export function inlineTitle(config: InlineTitleConfig = {}): Extension {
  return [titleFacet.of(config.title ?? ''), inlineTitleField]
}
