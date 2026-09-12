#!/usr/bin/env python3
"""Dump the CSS rules Obsidian's renderer actually has loaded.

This reads `document.styleSheets` in the live app — the same thing any Obsidian
theme author inspects in DevTools to learn what to override. We use it as a
SPEC: the values tell us what to build, and we then write our own rules against
our own DOM. Obsidian's selectors target Obsidian's markup, so they could not be
pasted in wholesale even if we wanted to.

Usage:
  dump_css.py [cdp-url] --grep callout --grep checkbox ...
"""
import argparse
import json
import re
import sys

from playwright.sync_api import sync_playwright


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
    ap = argparse.ArgumentParser()
    ap.add_argument("cdp", nargs="?", default="http://127.0.0.1:9344")
    ap.add_argument("--grep", action="append", default=[])
    ap.add_argument("--out")
    args = ap.parse_args()

    with sync_playwright() as pw:
        page = app_page(pw.chromium.connect_over_cdp(args.cdp))
        if page is None:
            print("no obsidian page", file=sys.stderr)
            return 2
        rules = page.evaluate(
            """() => {
                const out = [];
                const walk = (list) => {
                    for (const r of list) {
                        if (r.cssRules) { walk(r.cssRules); continue; }
                        if (r.cssText) out.push(r.cssText);
                    }
                };
                for (const sheet of document.styleSheets) {
                    try { walk(sheet.cssRules); } catch (e) { /* cross-origin */ }
                }
                return out;
            }"""
        )

    print(f"# {len(rules)} rules loaded", file=sys.stderr)
    if args.grep:
        pat = re.compile("|".join(re.escape(g) for g in args.grep), re.I)
        rules = [r for r in rules if pat.search(r.split("{")[0])]
        print(f"# {len(rules)} match {args.grep}", file=sys.stderr)

    text = "\n".join(rules)
    if args.out:
        open(args.out, "w").write(text)
        print(f"# written to {args.out}", file=sys.stderr)
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
