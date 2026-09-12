/**
 * Math — `$inline$` and `$$block$$`, rendered with KaTeX.
 *
 * Obsidian typesets both as real mathematics (confirmed in the oracle
 * capture: `$E = mc^2$` comes out as italic serif math glyphs inline, and a
 * `$$...$$` fence becomes a centred display block) — never as raw text or a
 * fenced code block. KaTeX (`throwOnError: false`) is the renderer; a parse
 * error comes back as red source text, which is what Obsidian does too.
 *
 * WHY a parser extension and not a regex-over-visible-lines pass (the
 * alternative this codebase's other constructs mostly use, e.g.
 * `listGuides.ts`'s `#tag` regex): a regex has no idea a `$` is sitting
 * inside a fenced/inline code span — `` `cost is $5` `` would get mathified
 * by a naive scan. Registering `mathMarkdown` as a real `@lezer/markdown`
 * extension avoids that by construction: every inline parser is offered
 * every position the existing parsers haven't already claimed, and by the
 * time the scanner reaches a `$` inside `` `...` ``, `InlineCode` has
 * already consumed the whole span and jumped past it — our parser is never
 * even invoked there. The block fence gets the same protection: its body is
 * walked line-by-line the same way `FencedCode`'s own body is, never handed
 * to the inline pass at all, so a stray `$` inside a following ` ``` ` block
 * is likewise untouched.
 *
 * Node shapes, mirroring `highlight.ts`'s `==highlight==` extension:
 *   InlineMath      — `$...$`, single line only (multi-line is `$$`'s job)
 *   InlineMathMark  — the two delimiting `$` characters
 *   MathBlock       — `$$` ... `$$`, one or more lines
 *   MathBlockMark   — each fence line (opening, and closing if present)
 *
 * Both mark nodes reuse `t.processingInstruction`, which `atomic-theme.ts`
 * already renders faint — the same treatment every other revealed delimiter
 * (`**`, backtick, `==`) gets in this editor, so revealed math marks need no
 * bespoke rule here. The math content itself is tagged `t.monospace`, which
 * that theme already maps to `--atomic-editor-font-mono` — matching a
 * measured Obsidian detail (its own raw `.cm-math` source span is
 * monospaced) for free, again with no CSS of ours needed for the revealed
 * state.
 */
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import { tags as t } from '@lezer/highlight'
import {
  type BlockContext,
  type BlockParser,
  type Element,
  type InlineContext,
  type Line,
  type MarkdownConfig,
} from '@lezer/markdown'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import './math.css'

// ------------------------------------------------------------------ parser

function isSpaceOrNewline(code: number): boolean {
  return code === 32 /* space */ || code === 9 /* tab */ || code === 10 /* \n */
}

/** A line whose visible content (past any blockquote/list markers) is
 * exactly `$$`, optionally trailing-spaced — the block fence, opening or
 * closing. */
function isMathFence(line: Line): boolean {
  return /^\$\$[ \t]*$/.test(line.text.slice(line.pos))
}

/**
 * `$...$`, modelled directly on this package's own `InlineCode` (a
 * self-terminating delimiter scanned in one pass, no open/close matching
 * needed) rather than the `Highlight`/`Strikethrough` two-sided
 * `addDelimiter` dance — dollar math has no nesting to resolve.
 *
 * The no-space-adjacent-to-either-`$` rule is the same currency
 * disambiguation Pandoc (and markdown-it-katex, which is what Obsidian's
 * math support is built on) uses: without it, ordinary prose like "costs $5
 * and $10 more" would read as one inline-math span running from the first
 * `$` to the second.
 */
function parseInlineMath(cx: InlineContext, next: number, start: number): number {
  if (next !== 36 /* $ */) return -1
  if (cx.char(start + 1) === 36) return -1 // `$$` here is the block fence's job

  const after = cx.char(start + 1)
  if (after < 0 || isSpaceOrNewline(after)) return -1

  for (let pos = start + 1; pos < cx.end; pos++) {
    const ch = cx.char(pos)
    if (ch === 10 /* \n */) return -1 // inline math never crosses a line break
    if (ch === 92 /* \ */) {
      pos++ // an escaped character can't be the closing `$`
      continue
    }
    if (ch === 36) {
      if (isSpaceOrNewline(cx.char(pos - 1))) return -1
      return cx.addElement(
        cx.elt('InlineMath', start, pos + 1, [
          cx.elt('InlineMathMark', start, start + 1),
          cx.elt('InlineMathMark', pos, pos + 1),
        ]),
      )
    }
  }
  return -1
}

/**
 * `$$` ... `$$`, modelled on this package's own `FencedCode`: an eager
 * block parser that recognizes the opening fence on sight, then walks lines
 * itself via `cx.nextLine()` looking for the close. Like `FencedCode`, an
 * unterminated fence runs to the end of the document/context rather than
 * failing to match — the same "still a block while you're mid-typing it"
 * behaviour every fenced construct in this parser has.
 */
const mathBlockParser: BlockParser = {
  name: 'MathBlock',
  before: 'FencedCode',
  parse(cx: BlockContext, line: Line) {
    if (!isMathFence(line)) return false

    const from = cx.lineStart + line.pos
    const marks: Element[] = [cx.elt('MathBlockMark', from, cx.lineStart + line.text.length)]
    let to = cx.lineStart + line.text.length

    while (cx.nextLine()) {
      if (isMathFence(line)) {
        marks.push(cx.elt('MathBlockMark', cx.lineStart + line.pos, cx.lineStart + line.text.length))
        to = cx.lineStart + line.text.length
        cx.nextLine() // step past the closing fence before we return
        break
      }
      to = cx.lineStart + line.text.length
    }

    cx.addElement(cx.elt('MathBlock', from, to, marks))
    return true
  },
}

/** Passed to `markdown({ extensions: [...] })` by the integration layer. */
export const mathMarkdown: MarkdownConfig = {
  defineNodes: [
    { name: 'MathBlock', block: true, style: t.monospace },
    { name: 'MathBlockMark', style: t.processingInstruction },
    { name: 'InlineMath', style: t.monospace },
    { name: 'InlineMathMark', style: t.processingInstruction },
  ],
  parseBlock: [mathBlockParser],
  parseInline: [{ name: 'InlineMath', parse: parseInlineMath }],
}

// -------------------------------------------------------------- rendering

/**
 * Render into a fresh element and return it. `throwOnError: false` is the
 * documented KaTeX behaviour for a bad expression (red error text in place
 * of output) — Obsidian does the same rather than breaking the line. The
 * try/catch beneath is a second net for the narrower set of KaTeX inputs
 * that still throw regardless of that flag (a handful of internal assertion
 * errors on pathological macros); falling back to the raw source keeps one
 * bad formula from taking down the whole decoration pass instead of just
 * that one widget.
 */
function renderMath(source: string, displayMode: boolean): HTMLElement {
  const el = document.createElement(displayMode ? 'div' : 'span')
  el.className = displayMode ? 'cm-md-math cm-md-math-block' : 'cm-md-math cm-md-math-inline'
  try {
    katex.render(source, el, { throwOnError: false, displayMode, output: 'html' })
  } catch {
    el.textContent = source
  }
  return el
}

class InlineMathWidget extends WidgetType {
  constructor(private readonly source: string) {
    super()
  }

  eq(other: InlineMathWidget): boolean {
    return other.source === this.source
  }

  toDOM(): HTMLElement {
    return renderMath(this.source, false)
  }

  /** Clicking rendered math should still place a cursor, like any widget
   * standing in for editable source. */
  ignoreEvent(): boolean {
    return false
  }
}

class MathBlockWidget extends WidgetType {
  constructor(private readonly source: string) {
    super()
  }

  eq(other: MathBlockWidget): boolean {
    return other.source === this.source
  }

  toDOM(): HTMLElement {
    return renderMath(this.source, true)
  }

  ignoreEvent(): boolean {
    return false
  }
}

// ------------------------------------------------------------- decoration

function buildInlineMathDecorations(view: EditorView): DecorationSet {
  const out: Array<Range<Decoration>> = []
  const state = view.state

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'InlineMath') return
        // Reveal rule: cursor/selection anywhere in the span shows raw LaTeX.
        const revealed = state.selection.ranges.some((r) => r.from <= node.to && r.to >= node.from)
        if (revealed) return
        const source = state.doc.sliceString(node.from + 1, node.to - 1)
        out.push(Decoration.replace({ widget: new InlineMathWidget(source) }).range(node.from, node.to))
      },
    })
  }
  return Decoration.set(out, true)
}

const inlineMathPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildInlineMathDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildInlineMathDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

/** The LaTeX body of a `MathBlock` node, with its fence line(s) stripped —
 * one fence if the block is still unterminated (mid-typing), two once
 * closed. Reads the node's own `MathBlockMark` children rather than
 * re-deriving fence positions from raw text, so it can't disagree with what
 * the parser actually matched. */
function mathBlockSource(state: EditorState, node: SyntaxNode): string {
  const marks = node.getChildren('MathBlockMark')
  const from = marks[0] ? marks[0].to + 1 : node.from
  const to = marks[1] ? marks[1].from - 1 : node.to
  if (to <= from) return ''
  return state.doc.sliceString(from, to)
}

function buildMathBlockDecorations(state: EditorState): DecorationSet {
  const out: Array<Range<Decoration>> = []
  // WHY ensureSyntaxTree (mirroring image-blocks.ts's own reasoning): this
  // StateField only rebuilds on doc/selection change, not as the background
  // parser makes further progress, so without forcing the parse forward a
  // `$$` fence past the initial parse window would sit as raw text until
  // some unrelated edit nudged the tree. 200ms matches the budget
  // image-blocks.ts settled on for the same problem.
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state)

  tree.iterate({
    enter(node) {
      if (node.name !== 'MathBlock') return
      const revealed = state.selection.ranges.some((r) => r.from <= node.to && r.to >= node.from)
      if (revealed) return
      const source = mathBlockSource(state, node.node)
      out.push(Decoration.replace({ widget: new MathBlockWidget(source), block: true }).range(node.from, node.to))
    },
  })
  return Decoration.set(out, true)
}

const mathBlockField = StateField.define<DecorationSet>({
  create: (state) => buildMathBlockDecorations(state),
  update(value, tr) {
    if (!tr.docChanged && !tr.selection) return value
    return buildMathBlockDecorations(tr.state)
  },
  provide: (f) => EditorView.decorations.from(f),
})

export function math(): Extension {
  return [inlineMathPlugin, mathBlockField]
}
