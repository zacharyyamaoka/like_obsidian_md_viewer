import { launchChrome, openCdpPage, evaluate, delay } from '../cdp_kit.mjs'
const MARKS = ["# Heading one","## Heading two","Body copy sets","## Lists","- First bullet","1. First ordered","- [x] A completed","## Quotes and callouts","> A plain blockquote","> [!note]","> [!warning]","> [!tip]","## Table","| Column A","## Code","## Links and references","## Rules and math","A footnote reference"]
const s = await launchChrome({ label: 'measure' })
const p = await openCdpPage(await s.devToolsPort(), { width: 1456, height: 1250 })
try {
  await p.send('Page.navigate', { url: 'http://127.0.0.1:5400/parity.html?f=01-elements' })
  await delay(3200)
  console.log(await evaluate(p, `(() => {
    const view = window.__view, text = view.state.doc.toString(), o = {}
    for (const m of ${JSON.stringify(MARKS)}) { const pos = text.indexOf(m); o[m] = pos < 0 ? null : Math.round(view.lineBlockAt(pos).top) }
    return JSON.stringify(o)
  })()`))
} finally { p.close(); s.kill() }
