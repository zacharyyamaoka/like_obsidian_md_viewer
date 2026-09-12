/**
 * The built-in extension set, lifted verbatim out of `AtomicCodeMirrorEditor`.
 *
 * WHY this file exists: everything inside that component's
 * `EditorState.create({ extensions: [...] })` is framework-free — the search
 * panel is plain DOM, the reveal field is a plain `StateField` — but it was
 * only reachable by mounting a React component. A second consumer here is a
 * tldraw canvas card that cannot take a React dependency, and an earlier
 * attempt to rebuild this list by hand silently dropped nine behaviours
 * (selection painting, Tab, emphasis auto-pairing, the find panel, multi-cursor
 * and more) precisely because a hand-rebuilt CodeMirror extension list is where
 * ordering mistakes hide.
 *
 * So: the ORDER and CONTENT below must stay line-for-line with upstream's
 * array. Do not "tidy" it. Additions belong in the caller's `extensions`, which
 * upstream already documents as the composition seam.
 *
 * This is deliberately shaped as a small patch we can offer upstream — the
 * React wrapper now calls this instead of holding the list itself.
 */
import {
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown'
import { indentOnInput, type LanguageDescription } from '@codemirror/language'
import { search, searchKeymap } from '@codemirror/search'
import { defaultSearchPanel } from './searchPanel'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  rectangularSelection,
} from '@codemirror/view'

import { atomicEditorTheme, atomicMarkdownSyntax } from './atomic-theme'
import { autoCloseCodeFence, extendEmphasisPair, startAsteriskList } from './edit-helpers'
import { highlightMarkdown } from './highlight'
import { imageBlocks } from './image-blocks'
import { inlinePreview } from './inline-preview'
import { readOnlyExtension } from './read-only'
import { tables } from './table-widget'

export interface AtomicExtensionsConfig {
  /** Routed to BOTH `inlinePreview` and `tables` — a link inside a table cell
   * must reach the host too, which the original wiring already did and a
   * hand-rebuild got wrong. */
  onLinkClick?: (url: string) => void
  codeLanguages?: readonly LanguageDescription[]
  readOnly?: boolean
  /** Supply to keep a handle on the read-only compartment for live toggling. */
  readOnlyCompartment?: Compartment
}

export function atomicExtensions(config: AtomicExtensionsConfig = {}): Extension[] {
  const {
    onLinkClick,
    codeLanguages = [],
    readOnly = false,
    readOnlyCompartment = new Compartment(),
  } = config

  const handleLinkClick = (url: string): void => {
    if (onLinkClick) onLinkClick(url)
    else window.open(url, '_blank', 'noopener,noreferrer')
  }

  return [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    rectangularSelection(),
    highlightActiveLine(),
    // Obsidian-style bracket pairing.
    closeBrackets(),
    startAsteriskList,
    extendEmphasisPair,
    autoCloseCodeFence,
    EditorView.lineWrapping,
    search({
      top: true,
      createPanel: (innerView) => {
        const panel = defaultSearchPanel(innerView)
        panel.dom.classList.add('atomic-editor-search-panel')
        return panel
      },
    }),
    // GFM via base: markdownLanguage — tables, strikethrough, task lists,
    // autolinks. Without this the parser is pure CommonMark and inline-preview
    // never sees Task / Table.
    markdown({
      base: markdownLanguage,
      codeLanguages: [...codeLanguages],
      extensions: highlightMarkdown,
    }),
    // Extend closeBrackets to markdown's symmetric delimiters. WITHOUT this
    // line `startAsteriskList` and `extendEmphasisPair` are dead code — both
    // are preconditioned on the `*|*` pair this creates.
    markdownLanguage.data.of({
      closeBrackets: { brackets: ['(', '[', '{', "'", '"', '*', '_', '`'] },
    }),
    atomicMarkdownSyntax,
    atomicEditorTheme,
    keymap.of([
      ...closeBracketsKeymap,
      ...historyKeymap,
      ...searchKeymap,
      ...markdownKeymap,
      indentWithTab,
      ...defaultKeymap,
    ]),
    tables({ onLinkClick: handleLinkClick }),
    imageBlocks(),
    inlinePreview({ onLinkClick: handleLinkClick }),
    readOnlyCompartment.of(readOnlyExtension(readOnly)),
  ]
}
