/**
 * Playground for the markdown editor — a real editable surface, not a capture
 * harness. Loads the same fixtures the Obsidian parity oracle renders, so what
 * you type here is directly comparable to what Obsidian does with the same file.
 *
 * Edits are kept in localStorage per document so a reload doesn't lose them;
 * "Reset document" puts the fixture back.
 */
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { obsidianMarkdown } from '../src/obsidian/index'

// Upstream's stylesheet FIRST — 830 lines covering table cells, wiki-link
// states, the link hover icon, hr, images, and the rules that stop width jitter
// when typing through `**`. Our Obsidian token layer goes on top, never instead.
import '../src/styles/inline-preview.css'
import '../src/obsidian/obsidian-tokens.css'

const DOCS = {
  '01-elements': 'Element coverage (every construct)',
  '02-note': 'A realistic note',
  scratch: 'Blank — type your own',
}

const BLANK = `# Scratch

Type anything. A few things worth trying:

> [!tip] Callouts
> Type \`> [!warning] Heads up\` on a new line.

| Column | Try it |
| ------ | ------ |
| tables | click a cell and type |
| tab    | press Tab inside a list |

- [ ] a task — click the checkbox
- press Tab here to indent
`

const FIXTURE_DIR = '/home/bam/clank-workbench/tests/markdown-parity/fixtures'

const host = document.getElementById('host')
const picker = document.getElementById('doc')
const themeBtn = document.getElementById('theme')
const resetBtn = document.getElementById('reset')

for (const [id, label] of Object.entries(DOCS)) {
  const opt = document.createElement('option')
  opt.value = id
  opt.textContent = label
  picker.append(opt)
}

const storageKey = (id) => `md-playground:${id}`
let view = null

async function fixture(id) {
  if (id === 'scratch') return BLANK
  // WHY /@fs/ and not a relative path: the fixtures live above the vite root,
  // so `../../../` escapes it and vite silently serves index.html instead of
  // the markdown (measured: the editor loaded the page's own HTML as its doc).
  const res = await fetch(`/@fs${FIXTURE_DIR}/${id}.md`)
  if (!res.ok) throw new Error(`fixture ${id} -> ${res.status}`)
  return res.text()
}

async function load(id, { fresh = false } = {}) {
  let doc
  const saved = fresh ? null : localStorage.getItem(storageKey(id))
  try {
    doc = saved ?? (await fixture(id))
  } catch (err) {
    doc = `# Could not load ${id}\n\n${String(err)}`
  }
  if (fresh) localStorage.removeItem(storageKey(id))

  view?.destroy()
  host.className = 'md-obsidian'
  view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc,
      extensions: [
        ...obsidianMarkdown({
          onLinkClick: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) localStorage.setItem(storageKey(id), u.state.doc.toString())
        }),
      ],
    }),
  })
  localStorage.setItem('md-playground:last', id)
  // Test seam, same convention as the rest of this repo's journeys.
  window.__mdEditor = {
    doc: () => view.state.doc.toString(),
    scrollTo: (needle) => {
      const pos = view.state.doc.toString().indexOf(needle)
      if (pos >= 0) view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
      return pos
    },
  }
}

picker.addEventListener('change', () => load(picker.value))
resetBtn.addEventListener('click', () => load(picker.value, { fresh: true }))
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  themeBtn.textContent = next === 'dark' ? 'Light' : 'Dark'
  localStorage.setItem('md-playground:theme', next)
})

const savedTheme = localStorage.getItem('md-playground:theme')
if (savedTheme) {
  document.documentElement.dataset.theme = savedTheme
  themeBtn.textContent = savedTheme === 'dark' ? 'Light' : 'Dark'
}
const last = localStorage.getItem('md-playground:last')
picker.value = last && last in DOCS ? last : '01-elements'
load(picker.value)
