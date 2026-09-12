#!/usr/bin/env python3
"""Query Obsidian's app.css by SELECTOR (not by whole-rule text).

The stylesheet opens with a single `body{...}` rule that defines every design
token on one physical line, so a naive grep matches it for literally any
keyword. Splitting selector from declarations first is what makes a query useful.
"""
import re, sys, pathlib

RULES = []
for line in pathlib.Path('obsidian-app.css').read_text().splitlines():
    if '{' not in line: continue
    sel, _, body = line.partition('{')
    RULES.append((sel.strip(), body.rstrip('}').strip()))

def query(pat, limit=40, maxlen=210):
    rx = re.compile(pat, re.I)
    n = 0
    for sel, body in RULES:
        if sel == 'body' or len(sel) > 400: continue
        if rx.search(sel):
            print(f"{sel}\n    {body[:maxlen]}")
            n += 1
            if n >= limit: break
    if n == 0: print(f"  (no selector matches /{pat}/)")

if __name__ == '__main__':
    for p in sys.argv[1:]:
        print(f"\n########## /{p}/")
        query(p)
