/**
 * Probe the INTERACTIONS the audit found missing — the ones a screenshot
 * cannot show. Run against the parity harness after the fork restructure.
 */
import { launchChrome, openCdpPage, evaluate, delay, key, clickAt } from '../cdp_kit.mjs'

const URL = 'http://127.0.0.1:5400/parity.html?f=01-elements'
const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const s = await launchChrome({ label: 'interaction' })
const p = await openCdpPage(await s.devToolsPort(), { width: 1300, height: 950 })
try {
  await p.send('Page.navigate', { url: URL })
  await delay(3000)

  // Click into a plain paragraph line so the editor has focus.
  const box = JSON.parse(await evaluate(p, `(() => {
    const l = Array.from(document.querySelectorAll('.cm-line')).find(e => e.innerText.includes('Body copy sets'))
    const r = l.getBoundingClientRect()
    return JSON.stringify({ x: r.x + 40, y: r.y + r.height / 2 })
  })()`))
  await clickAt(p, box.x, box.y)
  await delay(400)

  check('highlightActiveLine', (await evaluate(p, `String(!!document.querySelector('.cm-activeLine'))`)) === 'true')

  // Select a few chars to force drawSelection to paint.
  await key(p, 'ArrowRight', 'ArrowRight', 8 /* shift */)
  await key(p, 'ArrowRight', 'ArrowRight', 8)
  await key(p, 'ArrowRight', 'ArrowRight', 8)
  await delay(300)
  check('drawSelection', (await evaluate(p, `String(!!document.querySelector('.cm-selectionBackground'))`)) === 'true')

  // Emphasis auto-pairing: typing * should produce **.
  await key(p, 'End', 'End'); await delay(150)
  await p.send('Input.dispatchKeyEvent', { type: 'keyDown', text: '*', key: '*' })
  await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: '*' })
  await delay(400)
  const afterStar = await evaluate(p, `(() => {
    const l = Array.from(document.querySelectorAll('.cm-line')).find(e => e.innerText.includes('height and measure'))
    return JSON.stringify(l ? l.innerText.slice(-4) : '')
  })()`)
  check('emphasis auto-pair (* -> **)', afterStar.includes('**'), `line tail ${afterStar}`)
  await key(p, 'z', 'KeyZ', 2); await delay(200)
  await key(p, 'z', 'KeyZ', 2); await delay(200)

  // Tab should indent rather than move focus.
  const liBox = JSON.parse(await evaluate(p, `(() => {
    const l = Array.from(document.querySelectorAll('.cm-line')).find(e => e.innerText.includes('Second bullet'))
    const r = l.getBoundingClientRect()
    return JSON.stringify({ x: r.x + r.width - 5, y: r.y + r.height / 2 })
  })()`))
  await clickAt(p, liBox.x, liBox.y); await delay(250)
  const before = await evaluate(p, `window.__view.state.doc.toString().length`)
  await key(p, 'Tab', 'Tab'); await delay(350)
  const after = await evaluate(p, `window.__view.state.doc.toString().length`)
  check('Tab indents (doc changed)', Number(after) !== Number(before), `${before} -> ${after}`)
  await key(p, 'z', 'KeyZ', 2); await delay(250)

  // Upstream's own minimal find panel, not CM6's stock one.
  await key(p, 'f', 'KeyF', 2); await delay(600)
  const panel = JSON.parse(await evaluate(p, `(() => {
    const el = document.querySelector('.cm-panels')
    return JSON.stringify({
      atomic: !!document.querySelector('.atomic-editor-search-panel'),
      hasReplace: !!document.querySelector('.cm-search input[name=replace]'),
      top: !!document.querySelector('.cm-panels-top'),
    })
  })()`))
  check('atomic find panel (not stock CM6)', panel.atomic && !panel.hasReplace, JSON.stringify(panel))
  await key(p, 'Escape', 'Escape'); await delay(300)

  // Scroll the whole doc so every construct has been rendered at least once.
  await evaluate(p, `(async () => {
    const sc = document.querySelector('.cm-scroller')
    for (let y = 0; y < sc.scrollHeight; y += sc.clientHeight - 100) {
      sc.scrollTop = y
      await new Promise(r => setTimeout(r, 150))
    }
  })()`)
  await delay(1200)

  // The 830-line stylesheet: table cells must not show raw marks, wiki links
  // must not leak brackets.
  const css = JSON.parse(await evaluate(p, `(() => {
    const cells = Array.from(document.querySelectorAll('.cm-editor td, .cm-editor th')).map(e => e.innerText)
    const wiki = Array.from(document.querySelectorAll('.cm-atomic-wiki-link')).map(e => e.innerText)
    return JSON.stringify({
      cells: cells.slice(0, 4),
      wiki,
      hrStyled: (() => { const e = document.querySelector('.cm-atomic-hr'); return e ? getComputedStyle(e).borderTopWidth : null })(),
    })
  })()`))
  check('table cells rendered (no raw pipes)', css.cells.length > 0 && !css.cells.some((c) => c.includes('|')), JSON.stringify(css.cells))
  check('wiki links hide brackets', css.wiki.length > 0 && !css.wiki.some((w) => w.includes('[')), JSON.stringify(css.wiki))
  check('hr has a rule', css.hrStyled !== null && css.hrStyled !== '0px', String(css.hrStyled))

  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
} finally {
  p.close(); s.kill()
}
