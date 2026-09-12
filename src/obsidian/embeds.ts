/**
 * Wiki embeds — `![[note]]` transclusion.
 *
 * Obsidian renders the embedded note's content inline as a quoted block: the
 * target's title bold above its body, a 2px accent rail down the left
 * (`--embed-border-start: 2px solid var(--interactive-accent)`, the one side
 * of `.markdown-embed`'s border that isn't `none`), and a small expand
 * affordance pinned to the top-right corner (`.markdown-embed-link`, a
 * Maximize2-shaped glyph). Values measured from a running Obsidian 1.12.7's
 * own app.css and cross-checked against the oracle capture — see
 * `.markdown-embed`, `.embed-title`, `.markdown-embed-link`.
 *
 * WHY a StateField and not a ViewPlugin: the rendered widget (title + body)
 * is a block-level replacement of the source line, and CodeMirror requires
 * block replace decorations to be produced at state level — the same
 * constraint `properties.ts` documents for frontmatter (view plugins may not
 * supply line-break-spanning or block-level replacements).
 *
 * A missing/unresolvable target still renders its title row: the task brief
 * is explicit that a silently vanishing embed is the worst outcome, so the
 * body falls back to a muted "not found" line instead of rendering nothing.
 */
import { syntaxTree } from '@codemirror/language'
import { type EditorState, type Extension, type Range, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'

export interface EmbedsConfig {
  /** Returns the target note's markdown text, or null when it cannot be
   *  resolved. Left undefined, every embed renders as "not found" — the same
   *  degrade-visibly stance `wikiLinks()` takes when `resolve` is omitted. */
  resolveEmbed?: (target: string) => string | null
}

/** A whole line consisting of nothing but `![[target]]` (optionally
 *  `![[target|Alias]]`). Obsidian only embeds a block when the wikilink owns
 *  its own line; an inline `![[x]]` mid-sentence is out of scope here, and
 *  isn't exercised by the fixture. */
const EMBED_RE = /^[ \t]*!\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\][ \t]*$/

interface ParsedEmbed {
  from: number
  to: number
  target: string
  title: string
}

/**
 * Strip a leading YAML frontmatter fence so the embedded body matches what
 * Obsidian shows: the target's properties render in the target's OWN
 * Properties panel, not repeated inside every place it gets embedded.
 * Deliberately does not reuse `properties.ts`'s `parseFrontmatter` — that
 * module is being edited concurrently by another agent, and the only thing
 * needed here is "where does the fence end", not a parsed row list.
 */
function stripFrontmatter(text: string): string {
  if (!text.startsWith('---')) return text
  const lines = text.split('\n')
  if (lines[0].trim() !== '---') return text
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t === '---' || t === '...') {
      return lines.slice(i + 1).join('\n').replace(/^\n+/, '')
    }
  }
  return text
}

/** True when `pos` sits inside a fenced or indented code block, so a literal
 *  `![[…]]` typed as code sample text is never mistaken for a real embed. */
function isInsideCode(state: EditorState, pos: number): boolean {
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
    node;
    node = node.parent
  ) {
    if (node.name === 'CodeBlock' || node.name === 'FencedCode') return true
  }
  return false
}

function findEmbeds(state: EditorState): ParsedEmbed[] {
  const out: ParsedEmbed[] = []
  const doc = state.doc
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const match = EMBED_RE.exec(line.text)
    if (!match) continue
    if (isInsideCode(state, line.from)) continue
    const target = match[1].trim()
    const alias = match[2]?.trim()
    out.push({ from: line.from, to: line.to, target, title: alias || target })
  }
  return out
}

class EmbedWidget extends WidgetType {
  private title: string
  /** Resolved markdown text, or null for "not found". */
  private body: string | null

  constructor(title: string, body: string | null) {
    super()
    this.title = title
    this.body = body
  }

  eq(other: EmbedWidget): boolean {
    return other.title === this.title && other.body === this.body
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'md-embed' + (this.body === null ? ' md-embed-missing' : '')

    const title = document.createElement('div')
    title.className = 'md-embed-title'
    title.textContent = this.title
    wrap.append(title)

    const expand = document.createElement('span')
    expand.className = 'md-embed-expand'
    expand.setAttribute('aria-hidden', 'true')
    wrap.append(expand)

    const body = document.createElement('div')
    if (this.body === null) {
      body.className = 'md-embed-body md-embed-body-missing'
      body.textContent = 'Note not found.'
    } else {
      body.className = 'md-embed-body'
      body.textContent = stripFrontmatter(this.body).trim()
    }
    wrap.append(body)

    return wrap
  }

  /** Decorative chrome, not a dead end: a click still places a cursor in the
   *  source line, the same reveal-on-click rule every block widget in this
   *  layer follows (see `properties.ts`'s own `ignoreEvent`). */
  ignoreEvent(): boolean {
    return false
  }
}

function buildDecorations(state: EditorState, config: EmbedsConfig): DecorationSet {
  const found = findEmbeds(state)
  if (found.length === 0) return Decoration.none

  const out: Array<Range<Decoration>> = []
  for (const embed of found) {
    // Reveal the raw `![[target]]` whenever the cursor overlaps its line —
    // the same rule every construct in this layer follows, so the source
    // stays editable by clicking into it.
    const cursorOnLine = state.selection.ranges.some(
      (r) => r.from <= embed.to && r.to >= embed.from,
    )
    if (cursorOnLine) continue

    const resolved = config.resolveEmbed?.(embed.target) ?? null
    out.push(
      Decoration.replace({
        widget: new EmbedWidget(embed.title, resolved),
        block: true,
      }).range(embed.from, embed.to),
    )
  }
  return Decoration.set(out, true)
}

const embedsField = (config: EmbedsConfig) =>
  StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state, config),
    update(value, tr) {
      if (!tr.docChanged && !tr.selection) return value
      return buildDecorations(tr.state, config)
    },
    provide: (f) => EditorView.decorations.from(f),
  })

export function embeds(config: EmbedsConfig = {}): Extension {
  return [embedsField(config)]
}
