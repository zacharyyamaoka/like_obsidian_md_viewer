/**
 * Two small parity corrections against the real Obsidian oracle. Both turned
 * out to need nothing at runtime — see `linkFixes.css` for the actual fixes:
 *
 * Fix 1 — wiki-link alias pipe leaking while the link is being edited.
 *   `../wiki-links.ts` (upstream, not ours to edit) hides the raw
 *   `[[target|` prefix and the trailing `]]` behind
 *   `cm-atomic-wiki-link-hidden-syntax` (color: transparent; font-size: 0)
 *   whenever the cursor is outside the link, and shows the raw source under
 *   `cm-atomic-wiki-link-active` — deliberately UNSTYLED, so a reveal shows
 *   plain source — whenever the cursor is inside it. That part is correct.
 *
 *   The leak is that upstream's own markdown-link syntax highlighting has no
 *   idea wiki-links exist: `[[wikilink|with an alias]]` still parses as a
 *   stray literal `[`, followed by ordinary link text `[wikilink|with an
 *   alias]`, which upstream paints as one `.cm-atomic-link` span (link color
 *   + underline). While the cursor is elsewhere this is harmless — that span
 *   ends up nested inside wiki-links.ts's hidden-syntax wrapper, and
 *   `font-size: 0` cascades down through it regardless of what color the
 *   nested span asks for. But the moment the link goes "active" for editing,
 *   wiki-links.ts's own wrapper carries no styling of its own (on purpose),
 *   so upstream's link-blue-and-underline paints straight through: the raw
 *   `wikilink|` prefix — which is not a link, not clickable, and shouldn't
 *   look like a link — renders identically to the real, clickable alias.
 *
 *   Verified against the real Obsidian oracle (CDP into the running 1.13.7
 *   instance, `01-elements.md`, mouse moved away so `:hover` isn't a
 *   confound): while revealed, Obsidian paints `[[`/`]]` in `--text-faint`
 *   and the entire `wikilink|with an alias` run — target, pipe, AND alias,
 *   with no distinction between them — in the plain link color and NO
 *   underline (`cm-link-has-alias` / `cm-link-alias-pipe` / `cm-link-alias`
 *   all resolve to identical computed styles). Underline is a `:hover`
 *   affordance only, not a reveal-state default.
 *
 *   `wiki-links.ts` produces exactly the two hooks needed to reproduce that:
 *   `.cm-atomic-wiki-link-active` is the whole revealed run (bracket
 *   characters included, as plain unwrapped text), and upstream's own
 *   `.cm-atomic-link` is nested inside it for the bracketed portion. No new
 *   decoration is required — `linkFixes.css` sets `color: var(fg-faint)` on
 *   the active wrapper (inherited by the plain-text brackets, overridden for
 *   the nested `.cm-atomic-link` span by its own more specific color rule)
 *   and cancels that nested span's underline with one higher-specificity
 *   selector. Pure CSS; see linkFixes.css for the actual rules.
 *
 * Fix 2 — heading top spacing.
 *   Also pure CSS. See linkFixes.css for the measured rule and the oracle
 *   evidence: the 16px top gap is NOT a function of heading level (a flat
 *   16px is correct for every level) — it collapses to 0 specifically when a
 *   heading immediately follows another heading across exactly one blank
 *   line. `obsidian-tokens.css` (not ours to edit, and being edited
 *   concurrently) currently gives h1 an incorrect 24px and h2/h3 a
 *   coincidentally-correct flat 16px, with no collapse rule at all; this
 *   file's CSS is loaded after it and is the final word on both counts.
 *
 * Nothing here needs a ViewPlugin or StateField: both fixes react to
 * decorations/classes `wiki-links.ts` and the heading highlighter already
 * emit, purely through CSS specificity and inheritance. Exported as a
 * function (matching `callouts()` / `listGuides()`) so a later fix that DOES
 * need runtime code has a natural home, and so callers don't need to know
 * which of the two this currently is.
 */
import type { Extension } from '@codemirror/state'

export function linkFixes(): Extension {
  return []
}
