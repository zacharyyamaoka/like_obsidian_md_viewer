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
import { embeds, type EmbedsConfig } from './embeds'
import { footnotes } from './footnotes'
import { inlineTitle, type InlineTitleConfig } from './inlineTitle'
import { linkFixes } from './linkFixes'
import { listGuides } from './listGuides'
import { math, mathMarkdown } from './math'
import { properties } from './properties'

export interface ObsidianMarkdownConfig extends AtomicExtensionsConfig {
  /** Extra extensions, appended last so they can out-rank ours with `Prec`. */
  extensions?: readonly Extension[]
  /** Wiki-link behaviour, passed straight through to upstream's own config.
   * Left undefined, `[[links]]` still RENDER but are inert: no async
   * resolution, no `[[` completion, and a click cannot navigate. */
  wikiLinks?: WikiLinksConfig
  /** `![[note]]` transclusion. Left undefined, every embed renders as
   * "not found" — the same degrade-visibly stance `wikiLinks` takes without
   * a `resolve`. */
  embeds?: EmbedsConfig
  /** The filename-as-heading chrome above the document (and above
   * Properties, when present). Omitted or empty renders nothing. */
  inlineTitle?: InlineTitleConfig
}

export function obsidianMarkdown(config: ObsidianMarkdownConfig = {}): Extension[] {
  const {
    extensions = [],
    codeLanguages,
    wikiLinks: wikiLinkConfig,
    embeds: embedsConfig,
    inlineTitle: inlineTitleConfig,
    ...rest
  } = config
  return [
    // Upstream's set, untouched. Its default `codeLanguages` is `[]`; we pass
    // the full language-data registry so a ```python fence highlights without
    // each host wiring its own list.
    ...atomicExtensions({
      ...rest,
      codeLanguages: codeLanguages ?? languages,
      // math.ts needs a real grammar node (InlineMath/MathBlock), not just a
      // decoration over the existing tree, and the markdown() parser is
      // built once, inside atomicExtensions() — this is the only seam that
      // reaches it.
      markdownExtensions: [mathMarkdown],
    }),
    // --- ours, appended ------------------------------------------------
    // Anchored at document position 0 with side: -1 (see inlineTitle.ts), so
    // it draws before properties()'s frontmatter block below on the position
    // tie — title, then Properties, then content, matching real Obsidian.
    inlineTitle(inlineTitleConfig ?? {}),
    // Upstream leaves wikiLinks() out of its default set; Obsidian has them.
    wikiLinks(wikiLinkConfig ?? {}),
    callouts(),
    // Frontmatter must out-rank the markdown parser, which otherwise reads
    // `title:` followed by `---` as a setext heading.
    properties(),
    listGuides(),
    embeds(embedsConfig ?? {}),
    // Wins the `[^1]` / `[^1]:` pixel by fully replacing the span upstream's
    // Link-node highlighting (inlinePreview, inside atomicExtensions above)
    // otherwise paints over — see footnotes.ts's own header for why it has
    // to come as a decoration precedence fix rather than a parser change.
    footnotes(),
    math(),
    // Pure CSS (see linkFixes.ts) — the extension itself is a no-op; its
    // fixes are wired through linkFixes.css, loaded after obsidian-tokens.css.
    linkFixes(),
    ...extensions,
  ]
}

export { callouts }
export { embeds }
export { footnotes }
export { inlineTitle }
export { linkFixes }
export { listGuides }
export { math, mathMarkdown }
export { parseFrontmatter } from './properties'
export { properties }
export { atomicExtensions } from '../atomicExtensions'
export type { AtomicExtensionsConfig }
export type { EmbedsConfig }
export type { InlineTitleConfig }
export type { WikiLinksConfig }
