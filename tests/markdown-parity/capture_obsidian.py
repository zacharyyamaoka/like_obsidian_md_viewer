#!/usr/bin/env python3
"""Capture the ORACLE: real Obsidian rendering the acceptance fixtures.

Connects to an already-running headless Obsidian over CDP, opens each fixture in
Live Preview, collapses the chrome so the capture is the EDITOR and nothing else,
and screenshots the full scroll height of the content (not just the viewport).

The output of this script is the thing our viewer has to match.

Usage:
  capture_obsidian.py --cdp http://127.0.0.1:9344 --out /path/to/shots FILE.md [FILE.md ...]
"""
import argparse
import io
import json
import pathlib
import sys
import time

from playwright.sync_api import sync_playwright

# Obsidian's Live Preview editor root. `.markdown-source-view` is the editing
# surface; `.cm-sizer` inside it is the full-height content box (the scroller
# only shows a viewport slice, so screenshotting the scroller would clip).
EDITOR = ".workspace-leaf.mod-active .markdown-source-view"
SIZER = ".workspace-leaf.mod-active .cm-sizer"


SCROLLER = ".workspace-leaf.mod-active .cm-scroller"


def stitch_scroller(page, dest: pathlib.Path):
    """Screenshot the whole document by scrolling the editor in viewport-sized
    steps and composing the frames.

    WHY not one tall element screenshot: CodeMirror virtualizes, so the
    full-height `.cm-sizer` is mostly UNPAINTED outside the measured viewport —
    a single element capture comes back with a blank lower half (measured: the
    bottom third of a 3416px doc was empty). And WHY not simply make the window
    tall enough to avoid virtualizing: a 1500x4200 Xvfb framebuffer crashes
    Electron's GPU process outright (bus error, measured on this box). Stitching
    is the only approach that is both complete and stable.
    """
    from PIL import Image

    geom = page.evaluate(
        """(sel) => {
            const sc = document.querySelector(sel);
            if (!sc) return null;
            return { ch: sc.clientHeight, sh: sc.scrollHeight,
                     w: Math.round(sc.getBoundingClientRect().width) };
        }""",
        SCROLLER,
    )
    if not geom:
        return None

    el = page.query_selector(SCROLLER)
    view_h, total_h = geom["ch"], geom["sh"]
    frames, offsets, y = [], [], 0
    idx = 0
    while y < total_h:
        page.evaluate("([sel, y]) => { document.querySelector(sel).scrollTop = y }", [SCROLLER, y])
        time.sleep(0.45)
        actual = page.evaluate("(sel) => document.querySelector(sel).scrollTop", SCROLLER)
        buf = el.screenshot()
        frames.append(Image.open(io.BytesIO(buf)))
        offsets.append(actual)
        idx += 1
        if actual + view_h >= total_h - 1:
            break
        y = actual + view_h
        if idx > 40:  # runaway guard
            break

    scale = frames[0].width / geom["w"] if geom["w"] else 1
    canvas = Image.new("RGB", (frames[0].width, round(total_h * scale)), (30, 30, 30))
    for img, off in zip(frames, offsets):
        canvas.paste(img, (0, round(off * scale)))
    canvas.save(dest)
    return canvas.size


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
    ap.add_argument("--cdp", default="http://127.0.0.1:9344")
    ap.add_argument("--out", required=True)
    ap.add_argument("--width", type=int, default=900)
    ap.add_argument("files", nargs="+")
    args = ap.parse_args()

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(args.cdp)
        page = app_page(browser)
        if page is None:
            print("ERROR: no Obsidian app page found over CDP", file=sys.stderr)
            return 2

        page.wait_for_function("() => window.app.workspace.layoutReady === true", timeout=60_000)

        # Collapse both sidebars and hide the tab header so the capture is the
        # document surface alone — the chrome is not what we're matching.
        page.evaluate("""() => {
            app.workspace.leftSplit && app.workspace.leftSplit.collapse();
            app.workspace.rightSplit && app.workspace.rightSplit.collapse();
            const style = document.createElement('style');
            style.id = 'acceptance-capture';
            style.textContent = `
              .workspace-tabs .workspace-tab-header-container,
              .workspace-leaf .view-header,
              .status-bar { display: none !important; }
              /* freeze the caret so a blink can't change the pixels */
              * { caret-color: transparent !important;
                  animation-duration: 0s !important; transition-duration: 0s !important; }
            `;
            document.head.appendChild(style);
        }""")
        time.sleep(0.6)

        results = []
        for rel in args.files:
            page.evaluate(
                """async (p) => {
                    const f = app.vault.getAbstractFileByPath(p);
                    await app.workspace.getLeaf(false).openFile(f, { state: { mode: 'source', source: false } });
                }""",
                rel,
            )
            time.sleep(2.5)
            # Force every line to render: CodeMirror virtualizes, so a tall
            # element screenshot of an un-scrolled doc paints only the measured
            # viewport. Walk the scroller to the bottom first, then return.
            page.evaluate("""async () => {
                const sc = document.querySelector('.workspace-leaf.mod-active .cm-scroller');
                if (!sc) return;
                const step = Math.max(200, sc.clientHeight - 100);
                for (let y = 0; y < sc.scrollHeight; y += step) {
                    sc.scrollTop = y;
                    await new Promise(r => setTimeout(r, 120));
                }
                sc.scrollTop = 0;
                await new Promise(r => setTimeout(r, 400));
            }""")
            time.sleep(1.0)

            name = pathlib.Path(rel).stem + ".png"
            shot = stitch_scroller(page, out / name)
            if shot is None:
                print(f"  !! no editor element for {rel}", file=sys.stderr)
                continue
            results.append({"file": rel, "shot": str(out / name),
                            "w": shot[0], "h": shot[1]})
            print(f"  captured {rel} -> {name}  ({shot[0]}x{shot[1]})")

        print(json.dumps({"ok": True, "shots": results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
