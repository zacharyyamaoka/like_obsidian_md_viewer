/**
 * Obsidian footnotes — inline reference `[^1]` and block definition
 * `[^1]: The footnote body text.`
 *
 * THE LIVE BUG: `@lezer/markdown`'s own CommonMark grammar parses `[^1]` as a
 * shortcut-reference `Link` node regardless of whether `^1` resolves to
 * anything — that's a grammar fact, not a bug in atomic's decorator. Upstream's
 * `inline-preview.ts` then does two things to every `Link` node unconditionally:
 * marks the whole span `cm-atomic-link`, and (since the link is not "active")
 * replaces its `LinkMark` children — the `[` and `]` — with nothing. Net
 * effect, verified live: `[^1]` renders as a bare, blue, clickable "^1".
 *
 * FIX CHOSEN — decoration precedence, not a parser extension. A parser-level
 * fix (teaching the grammar that `^label` inside brackets isn't a link body)
 * would be the structurally cleaner cut, but the `markdown()` parser is built
 * once, from a fixed extension list, inside `atomicExtensions.ts` — upstream's
 * own file, off limits here, and CodeMirror has no seam to graft a parser
 * extension onto an already-constructed `Language` from outside that call.
 * So instead this scans raw line text (bypassing the syntax tree entirely,
 * the same way `listGuides.ts`'s tag pills do) and wins the pixel by covering
 * the WHOLE `[^label]` / `[^label]:` span with a `Decoration.replace` widget.
 * A replace decoration owns its span — CodeMirror never renders the marks or
 * text underneath it — so upstream's `cm-atomic-link` mark and its
 * bracket-hiding replacement both simply have nothing left to draw over.
 * Confirmed in the real browser (see the file header's verification note):
 * `.cm-atomic-link` no longer matches either footnote construct.
 *
 * REVEAL RULE — deliberately NOT followed here, unlike every other construct
 * in this codebase. The house rule is "cursor inside → show raw source so it
 * stays editable." Footnotes are the measured exception: clicking directly on
 * a live Obsidian 1.12.7 reference or definition marker (verified over CDP
 * against the running oracle, cursor placed and re-placed at several offsets
 * inside `[^1]` and at `[^1]:`) produces byte-identical decorated DOM before
 * and after — Obsidian never reveals raw brackets here. It treats the marker
 * as one atomic token to retype, the same category as a list bullet or a task
 * checkbox, not as revealable inline markup like `**bold**` or a `[link]`. So
 * these decorations apply unconditionally, with no selection-overlap check.
 *
 * The two constructs get different treatment on the definition line, also
 * measured rather than assumed: the REFERENCE keeps its brackets and caret,
 * just raised and dimmed (`[^1]` all stays on screen); the DEFINITION marker
 * drops the brackets/colon entirely and shows only the label (`1`). That
 * asymmetry is Obsidian's own — not a simplification on this end.
 */
import type { Extension, Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'

/** `[^label]:` anchored at the line's first non-space character. */
const DEFINITION_RE = /^(\s*)\[\^([^\]\s]+)\]:/

/** `[^label]` anywhere in a line's text. `g` so a line can carry more than one
 *  (a definition line whose body itself references another footnote, say). */
const REFERENCE_RE = /\[\^([^\]\s]+)\]/g

/** Same fenced/indented-code guard `listGuides.ts` uses for `#tag` pills —
 *  raw text inside a code block is not markdown and must not be touched. */
function isCodeLine(text: string): boolean {
  return /^\s*(```|~~~|\t|    )/.test(text)
}

/**
 * The reference marker. Renders all three pieces as real text nodes (not one
 * opaque glyph) so the label stays copy/selectable and matches Obsidian's own
 * DOM shape: `[^` and `]` dimmer (`cm-hmd-barelink.cm-formatting`, measured
 * `--text-faint`), the label brighter (`cm-hmd-barelink` alone, measured
 * `--text-muted`).
 */
class FootnoteRefWidget extends WidgetType {
  constructor(private readonly label: string) {
    super()
  }

  eq(other: FootnoteRefWidget) {
    return other.label === this.label
  }

  toDOM() {
    const wrap = document.createElement('span')
    wrap.className = 'cm-md-footnote-ref'
    const open = document.createElement('span')
    open.className = 'cm-md-footnote-marker'
    open.textContent = '[^'
    const label = document.createElement('span')
    label.className = 'cm-md-footnote-label'
    label.textContent = this.label
    const close = document.createElement('span')
    close.className = 'cm-md-footnote-marker'
    close.textContent = ']'
    wrap.append(open, label, close)
    return wrap
  }

  /** Clicking the marker should still place a cursor, same as any widget. */
  ignoreEvent() {
    return false
  }
}

/**
 * The definition marker. Obsidian collapses `[^label]:` down to just the
 * raised label — no brackets, no colon, unlike the reference above.
 */
class FootnoteDefWidget extends WidgetType {
  constructor(private readonly label: string) {
    super()
  }

  eq(other: FootnoteDefWidget) {
    return other.label === this.label
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-md-footnote-def-marker'
    span.textContent = this.label
    return span
  }

  ignoreEvent() {
    return false
  }
}

function footnoteDecorations(view: EditorView): DecorationSet {
  const out: Array<Range<Decoration>> = []
  const doc = view.state.doc

  for (const { from, to } of view.visibleRanges) {
    let line = doc.lineAt(from)
    while (line.from <= to) {
      const text = line.text
      if (!isCodeLine(text)) {
        // A definition marker only ever sits at the true start of its line
        // (leading whitespace aside) — check it first so the reference scan
        // below can skip the prefix it consumes rather than re-matching it.
        let refStart = 0
        const def = DEFINITION_RE.exec(text)
        if (def) {
          const markerFrom = line.from
          const markerTo = line.from + def[0].length
          out.push(Decoration.replace({ widget: new FootnoteDefWidget(def[2]) }).range(markerFrom, markerTo))
          out.push(Decoration.line({ class: 'cm-md-footnote-def-line' }).range(line.from))
          refStart = def[0].length
        }

        REFERENCE_RE.lastIndex = refStart
        for (let m = REFERENCE_RE.exec(text); m; m = REFERENCE_RE.exec(text)) {
          const matchFrom = line.from + m.index
          const matchTo = matchFrom + m[0].length
          out.push(Decoration.replace({ widget: new FootnoteRefWidget(m[1]) }).range(matchFrom, matchTo))
        }
      }

      if (line.to >= doc.length || line.to >= to) break
      line = doc.line(line.number + 1)
    }
  }
  return Decoration.set(out, true)
}

const footnotePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = footnoteDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        // WHY no `update.selectionSet` here, unlike callouts/listGuides: this
        // plugin's decorations never depend on the selection (see the REVEAL
        // RULE note above) — recomputing on every cursor move would be pure
        // waste for a construct that never changes shape because of it.
        this.decorations = footnoteDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

export function footnotes(): Extension {
  return [footnotePlugin]
}
