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

const FIXTURE_DIR = '/home/bam/clank-workbench/tests/markdown-parity/fixtures'
const file = new URLSearchParams(location.search).get('f') || '01-elements'
const host = document.getElementById('host')
host.className = 'md-obsidian'
try {
  const doc = await (await fetch(`/@fs${FIXTURE_DIR}/${file}.md`)).text()
  const view = new EditorView({ parent: host, state: EditorState.create({ doc, extensions: obsidianMarkdown({}) }) })
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
