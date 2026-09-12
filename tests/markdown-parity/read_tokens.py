#!/usr/bin/env python3
"""Read Obsidian's REAL computed design tokens out of the running instance.

Obsidian publishes its CSS variable NAMES in the developer docs but not their
shipped values — those live only in the compiled app. So we measure them from
the live renderer instead of copying numbers from a blog post.
"""
import json
import sys

from playwright.sync_api import sync_playwright

VARS = [
    "--font-text-size", "--font-text", "--font-monospace",
    "--line-height-normal", "--line-height-tight", "--file-line-width",
    "--text-normal", "--text-muted", "--text-faint", "--text-accent",
    "--background-primary", "--background-secondary", "--background-modifier-border",
    "--h1-size", "--h2-size", "--h3-size", "--h4-size", "--h5-size", "--h6-size",
    "--h1-weight", "--h2-weight", "--h3-weight", "--h4-weight",
    "--h1-color", "--h2-color", "--h3-color",
    "--p-spacing", "--list-indent", "--list-spacing",
    "--code-background", "--code-normal", "--code-size",
    "--blockquote-border-color", "--blockquote-border-thickness",
    "--table-header-background", "--table-border-color", "--table-border-width",
    "--table-cell-padding", "--table-row-alt-background",
    "--callout-border-width", "--callout-padding", "--callout-radius",
    "--text-highlight-bg", "--text-selection", "--tag-background", "--tag-color",
    "--checkbox-color", "--embed-border-left",
]

# Elements whose *effective* rendering we want, not just the variable.
PROBES = {
    "body": "body",
    "editor": ".markdown-source-view .cm-content",
    "h1": ".cm-content .HyperMD-header-1, .cm-content .cm-header-1",
    "callout-note": '.callout[data-callout="note"]',
    "callout-title": ".callout-title",
    "table": ".cm-content table",
    "th": ".cm-content th",
    "td": ".cm-content td",
    "code": ".HyperMD-codeblock, .cm-content .cm-inline-code",
    "quote": ".cm-content .HyperMD-quote",
    "tag": ".cm-content .cm-hashtag",
    "checkbox": '.cm-content input[type="checkbox"]',
}

PROPS = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "color",
         "backgroundColor", "padding", "margin", "borderRadius",
         "borderLeftWidth", "borderLeftColor", "borderColor", "borderWidth",
         "maxWidth", "letterSpacing"]


def app_page(browser):
    for ctx in browser.contexts:
        for pg in ctx.pages:
            try:
                if pg.evaluate("() => !!(window.app && window.app.workspace)"):
                    return pg
            except Exception:
                continue
    return None


def main() -> int:
    cdp = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:9344"
    with sync_playwright() as pw:
        page = app_page(pw.chromium.connect_over_cdp(cdp))
        if page is None:
            print("no obsidian page", file=sys.stderr)
            return 2
        out = page.evaluate(
            """([vars, probes, props]) => {
                const root = getComputedStyle(document.body);
                const tokens = {};
                for (const v of vars) {
                    const val = root.getPropertyValue(v).trim();
                    if (val) tokens[v] = val;
                }
                const computed = {};
                for (const [name, sel] of Object.entries(probes)) {
                    const el = document.querySelector(sel);
                    if (!el) { computed[name] = null; continue; }
                    const cs = getComputedStyle(el);
                    const o = {};
                    for (const p of props) o[p] = cs[p];
                    computed[name] = o;
                }
                return { tokens, computed };
            }""",
            [VARS, PROBES, PROPS],
        )
        print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
