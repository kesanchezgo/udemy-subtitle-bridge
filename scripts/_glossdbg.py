# -*- coding: utf-8 -*-
import io
p = 'scripts/qa-full-flows.mjs'
t = io.open(p, encoding='utf-8').read()
old = "		const visibleOn = await chipVisible();"
new = """		const visibleOn = await chipVisible();
		console.log('DBG chip:', await page.evaluate(() => document.documentElement.dataset.usbGlossDebug || 'sin-dato'));"""
assert old in t
t = t.replace(old, new, 1)
old2 = "		const visibleOff = await chipVisible();"
new2 = old2 + "\n		console.log('DBG off:', await page.evaluate(() => document.documentElement.dataset.usbGlossDebug || 'sin-dato'));"
t = t.replace(old2, new2, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('dbg insertado')
