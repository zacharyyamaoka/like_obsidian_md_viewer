/**
 * Obsidian callouts — `> [!note] Optional title`.
 *
 * Neither CommonMark, GFM nor the vendored atomic-editor layer has any concept
 * of these; atomic renders the first line as a link-ish `!note`. This adds
 * them.
 *
 * WHY line decorations rather than a block widget: Obsidian's callout is still
 * live, editable text — you can click into the body and type. Replacing the
 * block with a widget would give a prettier box and a dead one. Contiguous
 * `Decoration.line` classes plus first/last markers let CSS draw the same box
 * around text that stays real. It also keeps this a `ViewPlugin` (cheap,
 * viewport-scoped) instead of forcing the whole-document `StateField` that any
 * line-break-spanning replacement would require.
 *
 * The type → colour/icon table is transcribed from Obsidian's own `app.css`
 * (read from a running instance), so the aliases match exactly: `hint` is
 * `tip`, `caution` is `warning`, and so on.
 */
import { syntaxTree } from '@codemirror/language'
import type { Extension, Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'

/** `> [!type]` / `> [!type]+` / `> [!type]- Title` on a blockquote's first line. */
const CALLOUT_RE = /^(\s*)>\s*\[!([A-Za-z-]+)\]([+-]?)\s*(.*)$/

/**
 * Canonical type per alias, transcribed from app.css's
 * `.callout[data-callout="…"]` selector groups. Anything unlisted falls back to
 * `note`, which is what Obsidian does with an unknown type.
 */
const ALIAS: Record<string, string> = {
  note: 'note',
  abstract: 'summary', summary: 'summary', tldr: 'summary',
  info: 'info',
  todo: 'todo',
  important: 'important',
  tip: 'tip', hint: 'tip',
  success: 'success', check: 'success', done: 'success',
  question: 'question', help: 'question', faq: 'question',
  warning: 'warning', caution: 'warning', attention: 'warning',
  failure: 'failure', fail: 'failure', missing: 'failure',
  danger: 'error', error: 'error',
  bug: 'bug',
  example: 'example',
  quote: 'quote', cite: 'quote',
}

/** Default title when the author gives none — Obsidian title-cases the type. */
function defaultTitle(rawType: string): string {
  const t = rawType.replace(/-/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

class CalloutTitleWidget extends WidgetType {
  private kind: string
  private title: string

  constructor(kind: string, title: string) {
    super()
    this.kind = kind
    this.title = title
  }

  eq(other: CalloutTitleWidget) {
    return other.kind === this.kind && other.title === this.title
  }

  toDOM() {
    const wrap = document.createElement('span')
    wrap.className = 'cm-md-callout-title'
    const icon = document.createElement('span')
    icon.className = 'cm-md-callout-icon'
    // The glyph itself is drawn in CSS via a mask keyed off data-callout, the
    // same technique Obsidian uses — so the icon inherits `currentColor` and
    // needs no per-theme SVG asset.
    icon.setAttribute('aria-hidden', 'true')
    const text = document.createElement('span')
    text.className = 'cm-md-callout-title-text'
    text.textContent = this.title
    wrap.append(icon, text)
    return wrap
  }

  /** The title is decorative; clicking it should place a cursor as usual. */
  ignoreEvent() {
    return false
  }
}

function calloutDecorations(view: EditorView): DecorationSet {
  const out: Array<Range<Decoration>> = []
  const doc = view.state.doc
  const seen = new Set<number>()

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'Blockquote') return
        if (seen.has(node.from)) return
        seen.add(node.from)

        const firstLine = doc.lineAt(node.from)
        const match = CALLOUT_RE.exec(firstLine.text)
        if (!match) return // a plain blockquote; atomic already styles it

        const [, indent, rawType, fold, titleText] = match
        const kind = ALIAS[rawType.toLowerCase()] ?? 'note'

        // Every line of the block carries the callout class so CSS can paint
        // one continuous box; first/last get the rounded corners.
        let line = firstLine
        const lastLineNo = doc.lineAt(Math.min(node.to, doc.length)).number
        while (line.number <= lastLineNo) {
          const cls =
            `cm-md-callout cm-md-callout-${kind}` +
            (line.number === firstLine.number ? ' cm-md-callout-first' : '') +
            (line.number === lastLineNo ? ' cm-md-callout-last' : '')
          out.push(
            Decoration.line({ class: cls, attributes: { 'data-callout': kind } }).range(line.from),
          )
          if (line.number === lastLineNo) break
          line = doc.line(line.number + 1)
        }

        // Replace `> [!type]` with the rendered title, but only when the cursor
        // is elsewhere — the same reveal rule every other construct follows, so
        // the source stays editable by clicking into it.
        const cursorOnTitle = view.state.selection.ranges.some(
          (r) => r.from <= firstLine.to && r.to >= firstLine.from,
        )
        if (!cursorOnTitle) {
          const markerFrom = firstLine.from + indent.length
          const markerTo = firstLine.from + firstLine.text.length
          const title = titleText.trim() || defaultTitle(rawType)
          out.push(
            Decoration.replace({ widget: new CalloutTitleWidget(kind, title) }).range(
              markerFrom,
              markerTo,
            ),
          )
        }
        void fold // collapsible callouts are a later step; parsed so the
        // marker is consumed rather than leaking into the title.
      },
    })
  }
  return Decoration.set(out, true)
}

const calloutPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = calloutDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = calloutDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

export function callouts(): Extension {
  return [calloutPlugin]
}
