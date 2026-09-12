#!/usr/bin/env python3
"""Where does the height gap accumulate, block by block?

Uses CodeMirror's OWN geometry (`view.lineBlockAt(pos).top`) on both sides
rather than DOM rects: it returns document-space coordinates directly, so it
needs no scroll maths and is immune to virtualization — an unrendered line
still has a measured height. The DOM-rect version of this returned zeros for
Obsidian and sent me chasing a phantom.
"""
import json, subprocess
from playwright.sync_api import sync_playwright

MARKS = ["# Heading one","## Heading two","Body copy sets","## Lists","- First bullet",
         "1. First ordered","- [x] A completed","## Quotes and callouts","> A plain blockquote",
         "> [!note]","> [!warning]","> [!tip]","## Table","| Column A","## Code",
         "## Links and references","## Rules and math","A footnote reference"]

GEOM = """(marks) => {
  const view = %s;
  if (!view) return null;
  const text = view.state.doc.toString();
  const out = {};
  for (const m of marks) {
    const pos = text.indexOf(m);
    out[m] = pos < 0 ? null : Math.round(view.lineBlockAt(pos).top);
  }
  return out;
}"""

def obsidian():
    with sync_playwright() as pw:
        b = pw.chromium.connect_over_cdp("http://127.0.0.1:9344")
        page = next((pg for ctx in b.contexts for pg in ctx.pages
                     if _ok(pg)), None)
        if page is None: raise SystemExit("oracle not reachable")
        page.evaluate("""async () => {
            const f = app.vault.getAbstractFileByPath('01-elements.md')
            await app.workspace.getLeaf(false).openFile(f, { state:{ mode:'source', source:false } })
        }""")
        page.wait_for_timeout(2500)
        return page.evaluate(
            GEOM % "app.workspace.activeEditor && app.workspace.activeEditor.editor && app.workspace.activeEditor.editor.cm",
            MARKS)

def _ok(pg):
    try: return pg.evaluate("() => !!(window.app && window.app.workspace)")
    except Exception: return False

ours = json.loads(subprocess.run(["node","/home/bam/.markdown-acceptance/measure_ours.mjs"],
        capture_output=True, text=True, cwd="/home/bam/clank-workbench").stdout.strip().splitlines()[-1])
theirs = obsidian()
if theirs is None: raise SystemExit("could not reach Obsidian's EditorView")

print(f"{'block':26} {'obsidian':>9} {'ours':>7} {'delta':>7} {'this block':>11}")
prev = None
for m in MARKS:
    o, u = theirs.get(m), ours.get(m)
    if o is None or u is None:
        print(f"{m[:26]:26} {'--':>9} {'--':>7}"); continue
    d = u - o
    step = "" if prev is None else f"{d-prev:+d}"
    print(f"{m[:26]:26} {o:>9} {u:>7} {d:>+7} {step:>11}")
    prev = d
