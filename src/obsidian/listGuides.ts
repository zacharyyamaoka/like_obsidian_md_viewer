/**
 * List indentation guides and `#tag` pills.
 *
 * Obsidian draws a faint vertical rule down every nesting level of a list. It
 * gets them for free from nested `<ul>`/`<ol>` markup (`li > ul::before`);
 * CodeMirror has no nesting — every line is a flat sibling — so the depth has
 * to be measured per line and painted as repeating background rules.
 */
import { syntaxTree } from '@codemirror/language'
import type { Extension, Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'

/** A list line's indent, in levels. Obsidian's editing indent is 0.85em/level
 *  but the SOURCE indent is what decides depth: a tab, or 2-4 spaces. */
function depthOf(text: string): number {
  const m = /^([\t ]*)(?:[-+*]|\d+[.)])\s/.exec(text)
  if (!m) return 0
  const ws = m[1]
  const tabs = (ws.match(/\t/g) ?? []).length
  const spaces = ws.replace(/\t/g, '').length
  return tabs + Math.floor(spaces / 2)
}

const TAG_RE = /(^|[\s(\[{])#([A-Za-z0-9_\-/]+)/g

function build(view: EditorView): DecorationSet {
  const out: Array<Range<Decoration>> = []
  const doc = view.state.doc

  for (const { from, to } of view.visibleRanges) {
    let line = doc.lineAt(from)
    while (line.from <= to) {
      const depth = depthOf(line.text)
      if (depth > 0) {
        out.push(
          Decoration.line({
            class: 'md-list-indented',
            attributes: { style: `--md-indent-depth:${depth}` },
          }).range(line.from),
        )
      }

      // Tag pills. Skipped inside code, where `#` is a comment or a heading.
      if (!/^\s*(```|~~~|\t|    )/.test(line.text)) {
        TAG_RE.lastIndex = 0
        for (let m = TAG_RE.exec(line.text); m; m = TAG_RE.exec(line.text)) {
          const start = line.from + m.index + m[1].length
          const end = start + 1 + m[2].length
          const active = view.state.selection.ranges.some((r) => r.from <= end && r.to >= start)
          if (!active) out.push(Decoration.mark({ class: 'md-tag' }).range(start, end))
        }
      }

      if (line.to >= doc.length || line.to >= to) break
      line = doc.line(line.number + 1)
    }
  }
  return Decoration.set(out, true)
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = build(u.view)
    }
  },
  { decorations: (v) => v.decorations },
)

export function listGuides(): Extension {
  // syntaxTree is imported for parity with the other extensions' shape but the
  // indent depth is genuinely a text fact, not a tree fact — a continuation
  // line of a list item has no list node of its own yet still needs the rule.
  void syntaxTree
  return [plugin]
}
