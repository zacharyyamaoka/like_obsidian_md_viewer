/**
 * The capture page: the editor and nothing else, so a screenshot diff against
 * the Obsidian oracle is a difference in RENDERING, not in surrounding chrome.
 * The playground (index.html) is the one with a toolbar; this one never gets one.
 */
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { obsidianMarkdown } from '../src/obsidian/index'
import '../src/styles/inline-preview.css'
import '../src/obsidian/obsidian-tokens.css'
// Ours, loaded after the token layer so they can rely on its variables and
// win any equal-specificity tie (linkFixes.css's heading-spacing rule and
// wiki-link-active fix both depend on this order).
import '../src/obsidian/embeds.css'
import '../src/obsidian/footnotes.css'
import '../src/obsidian/inlineTitle.css'
import '../src/obsidian/linkFixes.css'
import '../src/obsidian/math.css'

const FIXTURE_DIR = '/home/bam/like_obsidian_md_viewer/tests/markdown-parity/fixtures'
const file = new URLSearchParams(location.search).get('f') || '01-elements'
const host = document.getElementById('host')
host.className = 'md-obsidian'

// `embeds()`'s resolveEmbed is synchronous (it runs inside a StateField), so
// a real host resolves against an already-loaded vault index — here that
// means pre-fetching every `![[target]]` this doc references from the same
// fixtures directory before the view is constructed, then handing back a
// plain synchronous map lookup.
async function buildEmbedResolver(doc) {
  const targets = new Set()
  for (const m of doc.matchAll(/!\[\[([^\]\n|]+)/g)) targets.add(m[1].trim())
  const cache = new Map()
  await Promise.all(
    [...targets].map(async (target) => {
      try {
        const res = await fetch(`/@fs${FIXTURE_DIR}/${target}.md`)
        cache.set(target, res.ok ? await res.text() : null)
      } catch {
        cache.set(target, null)
      }
    }),
  )
  return (target) => cache.get(target) ?? null
}

try {
  const doc = await (await fetch(`/@fs${FIXTURE_DIR}/${file}.md`)).text()
  const resolveEmbed = await buildEmbedResolver(doc)
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc,
      extensions: obsidianMarkdown({
        embeds: { resolveEmbed },
        // Obsidian's inline title is the note's filename, sans extension.
        inlineTitle: { title: file },
      }),
    }),
  })
  window.__view = view
  window.__scrollTo = (needle) => {
    const pos = view.state.doc.toString().indexOf(needle)
    if (pos >= 0) view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
    return pos
  }
  window.__ready = true
} catch (e) {
  window.__err = String((e && e.stack) || e)
  host.textContent = window.__err
}
