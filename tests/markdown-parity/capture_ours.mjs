/**
 * Capture OUR viewer rendering the same fixtures the Obsidian oracle rendered.
 *
 * Uses the same stitch strategy as the oracle (scroll the CM scroller, compose
 * the frames) so the two images are produced by the same method and a diff
 * between them is a real difference in rendering, not in capture technique.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { launchChrome, openCdpPage, evaluate, delay } from '/home/bam/clank-workbench/tests/cdp_kit.mjs'

const OUT = process.argv[3] || '/home/bam/.markdown-acceptance/shots-ours'
const FILES = process.argv.slice(4)
const BASE = process.argv[2] || 'http://127.0.0.1:5399'

const session = await launchChrome({ label: 'parity_ours' })
// Same viewport height as the oracle's Xvfb screen so line-breaking and the
// number of stitched frames match.
const page = await openCdpPage(await session.devToolsPort(), { width: 1456, height: 1250 })

try {
  await mkdir(OUT, { recursive: true })
  for (const f of FILES) {
    await page.send('Page.navigate', { url: `${BASE}/parity.html?f=${f}` })
    await delay(2500)
    const err = await evaluate(page, `JSON.stringify({ ready: !!window.__ready, cm: !!document.querySelector('.cm-content') })`)
    console.log(`  ${f}: ${err}`)

    const geom = JSON.parse(await evaluate(page, `(() => {
      const sc = document.querySelector('.cm-scroller')
      if (!sc) return 'null'
      return JSON.stringify({ ch: sc.clientHeight, sh: sc.scrollHeight })
    })()`))
    if (!geom) { console.log(`  !! no scroller for ${f}`); continue }

    const frames = []
    let y = 0, guard = 0
    while (y < geom.sh && guard++ < 40) {
      await evaluate(page, `document.querySelector('.cm-scroller').scrollTop = ${y}`)
      await delay(400)
      const actual = Number(await evaluate(page, `document.querySelector('.cm-scroller').scrollTop`))
      const shot = await page.send('Page.captureScreenshot', { format: 'png' })
      frames.push({ data: shot.data, off: actual })
      if (actual + geom.ch >= geom.sh - 1) break
      y = actual + geom.ch
    }
    const meta = { file: f, total: geom.sh, view: geom.ch, frames: frames.map((fr) => fr.off) }
    for (const [i, fr] of frames.entries()) {
      await writeFile(join(OUT, `${f}.frame${i}.png`), Buffer.from(fr.data, 'base64'))
    }
    await writeFile(join(OUT, `${f}.frames.json`), JSON.stringify(meta, null, 2))
    console.log(`  ${f}: ${frames.length} frames, doc ${geom.sh}px`)
  }
} finally {
  page.close(); session.kill()
}
