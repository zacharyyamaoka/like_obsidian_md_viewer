/**
 * Our layer: atomic-editor's own extension set, plus what Obsidian has and it
 * doesn't.
 *
 * The rule this file exists to enforce: we NEVER rebuild upstream's extension
 * list. `atomicExtensions()` is it, verbatim and in order. Everything of ours
 * is appended through the same `extensions` seam upstream documents for
 * consumers, so a future `git merge` of upstream touches their files and leaves
 * ours alone.
 *
 * Framework-free by construction — the second consumer is a tldraw canvas card
 * that cannot take a React dependency. A host wanting React uses upstream's
 * `AtomicCodeMirrorEditor`, which now calls the same factory.
 */
import { languages } from '@codemirror/language-data'
import type { Extension } from '@codemirror/state'

import { atomicExtensions, type AtomicExtensionsConfig } from '../atomicExtensions'
import { wikiLinks, type WikiLinksConfig } from '../wiki-links'
import { callouts } from './callouts'
import { listGuides } from './listGuides'
import { properties } from './properties'

export interface ObsidianMarkdownConfig extends AtomicExtensionsConfig {
  /** Extra extensions, appended last so they can out-rank ours with `Prec`. */
  extensions?: readonly Extension[]
  /** Wiki-link behaviour, passed straight through to upstream's own config.
   * Left undefined, `[[links]]` still RENDER but are inert: no async
   * resolution, no `[[` completion, and a click cannot navigate. */
  wikiLinks?: WikiLinksConfig
}

export function obsidianMarkdown(config: ObsidianMarkdownConfig = {}): Extension[] {
  const { extensions = [], codeLanguages, wikiLinks: wikiLinkConfig, ...rest } = config
  return [
    // Upstream's set, untouched. Its default `codeLanguages` is `[]`; we pass
    // the full language-data registry so a ```python fence highlights without
    // each host wiring its own list.
    ...atomicExtensions({ ...rest, codeLanguages: codeLanguages ?? languages }),
    // --- ours, appended ------------------------------------------------
    // Upstream leaves wikiLinks() out of its default set; Obsidian has them.
    wikiLinks(wikiLinkConfig ?? {}),
    callouts(),
    // Frontmatter must out-rank the markdown parser, which otherwise reads
    // `title:` followed by `---` as a setext heading.
    properties(),
    listGuides(),
    ...extensions,
  ]
}

export { callouts }
export { listGuides }
export { parseFrontmatter } from './properties'
export { properties }
export { atomicExtensions } from '../atomicExtensions'
export type { AtomicExtensionsConfig }
export type { WikiLinksConfig }
