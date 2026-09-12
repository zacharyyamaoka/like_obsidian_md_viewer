/**
 * YAML frontmatter rendered as Obsidian's Properties panel.
 *
 * Without this, frontmatter is not merely unstyled — it is actively WRONG:
 * `---` on the line after a key makes the markdown parser read the key as a
 * setext heading, so `title: Element coverage` paints as a giant H2 and
 * `tags: [a, b]` gets parsed as a link. That mis-parse is the single loudest
 * difference from Obsidian at the top of any real note.
 *
 * WHY a StateField and not a ViewPlugin: the frontmatter block spans several
 * lines, and CodeMirror refuses a line-break-spanning replacement from a view
 * plugin ("Decorations that replace line breaks may not be specified via
 * plugins") — it must be resolved at state level, before the viewport is known.
 *
 * Layout values measured from a running Obsidian 1.12.7: key column 144px
 * (9em), key text 14px muted, value 14px normal, tag pills 14px at radius 28px
 * on a 10% accent tint.
 */
import { type EditorState, type Extension, type Range, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'

export interface PropertyRow {
  key: string
  /** Rendered as pills when the YAML value was a list. */
  values: string[]
  list: boolean
}

/** Lucide glyphs Obsidian uses per property type, by mask so they follow colour. */
const ICONS: Record<string, string> = {
  tags: 'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z M7 7h.01',
  text: 'M17 6.1H3 M21 12.1H3 M15.1 18H3',
}

function iconFor(key: string): string {
  return key.toLowerCase() === 'tags' ? ICONS.tags : ICONS.text
}

/**
 * Parse a leading `---` fenced YAML block. Deliberately shallow: enough for
 * `key: value` and `key: [a, b]` / `key:\n  - a`, which is what a Properties
 * panel can display. Anything it cannot read falls through as a plain string so
 * the row still appears rather than vanishing.
 */
export function parseFrontmatter(text: string): { rows: PropertyRow[]; to: number } | null {
  if (!text.startsWith('---')) return null
  const lines = text.split('\n')
  if (lines[0].trim() !== '---') return null
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t === '---' || t === '...') { end = i; break }
  }
  if (end < 0) return null

  const rows: PropertyRow[] = []
  for (let i = 1; i < end; i++) {
    const line = lines[i]
    const m = /^([A-Za-z0-9_\-. ]+):\s*(.*)$/.exec(line)
    if (!m) {
      // A `  - item` continuation belongs to the row above.
      const cont = /^\s*-\s+(.*)$/.exec(line)
      if (cont && rows.length) {
        rows[rows.length - 1].values.push(cont[1].trim())
        rows[rows.length - 1].list = true
      }
      continue
    }
    const [, key, raw] = m
    const value = raw.trim()
    if (value.startsWith('[') && value.endsWith(']')) {
      rows.push({
        key: key.trim(),
        values: value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean),
        list: true,
      })
    } else {
      rows.push({ key: key.trim(), values: value ? [value] : [], list: false })
    }
  }
  // +1 for the closing fence's own newline, clamped by the caller.
  const to = lines.slice(0, end + 1).join('\n').length
  return { rows, to }
}

class PropertiesWidget extends WidgetType {
  private rows: PropertyRow[]

  constructor(rows: PropertyRow[]) {
    super()
    this.rows = rows
  }

  eq(other: PropertiesWidget) {
    return JSON.stringify(other.rows) === JSON.stringify(this.rows)
  }

  toDOM() {
    const container = document.createElement('div')
    container.className = 'md-properties'

    const heading = document.createElement('div')
    heading.className = 'md-properties-heading'
    heading.textContent = 'Properties'
    container.append(heading)

    const list = document.createElement('div')
    list.className = 'md-properties-list'
    for (const row of this.rows) {
      const el = document.createElement('div')
      el.className = 'md-property'

      const key = document.createElement('div')
      key.className = 'md-property-key'
      const icon = document.createElement('span')
      icon.className = 'md-property-icon'
      icon.style.setProperty(
        '--md-prop-icon',
        `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconFor(row.key)
          .split(' M')
          .map((d, i) => `<path d="${i ? 'M' + d : d}"/>`)
          .join('')}</svg>')`,
      )
      const label = document.createElement('span')
      label.className = 'md-property-key-label'
      label.textContent = row.key
      key.append(icon, label)

      const value = document.createElement('div')
      value.className = 'md-property-value'
      if (row.list) {
        for (const v of row.values) {
          const pill = document.createElement('span')
          pill.className = 'md-property-pill'
          pill.textContent = v
          value.append(pill)
        }
      } else {
        value.textContent = row.values.join(' ')
      }

      el.append(key, value)
      list.append(el)
    }
    container.append(list)

    const add = document.createElement('div')
    add.className = 'md-properties-add'
    add.textContent = '+ Add property'
    container.append(add)
    return container
  }

  /** Clicking the panel should place a cursor in the source, like any widget. */
  ignoreEvent() {
    return false
  }
}

function buildDecorations(state: EditorState): DecorationSet {
  const text = state.doc.toString()
  const parsed = parseFrontmatter(text)
  if (!parsed || parsed.rows.length === 0) return Decoration.none

  const to = Math.min(parsed.to, state.doc.length)
  // Reveal the raw YAML whenever the cursor is inside it — the same rule every
  // other construct follows, so the source stays editable by clicking in.
  const cursorInside = state.selection.ranges.some((r) => r.from <= to && r.to >= 0)
  if (cursorInside) return Decoration.none

  const out: Array<Range<Decoration>> = [
    Decoration.replace({ widget: new PropertiesWidget(parsed.rows), block: true }).range(0, to),
  ]
  return Decoration.set(out, true)
}

const propertiesField = StateField.define<DecorationSet>({
  create: (state) => buildDecorations(state),
  update(value, tr) {
    if (!tr.docChanged && !tr.selection) return value
    return buildDecorations(tr.state)
  },
  provide: (f) => EditorView.decorations.from(f),
})

export function properties(): Extension {
  return [propertiesField]
}
