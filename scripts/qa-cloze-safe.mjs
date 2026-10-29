/**
 * Verifica la plantilla cloze generada: palabra C++ (metacaracteres de regex)
 * y frase con <img onerror>. Importa VOCAB_FRONT_TEMPLATE real por el loader
 * TS (la misma plantilla que va al .apkg) y la ejecuta en Chromium.
 *
 * Uso: node scripts/qa-cloze-safe.mjs
 */
import { register } from 'node:module';
register('./ts-resolve-loader.mjs', import.meta.url);
import { chromium } from 'playwright';

const { buildVocabModel } = await import('../src/app/services/ankiDesign.ts');

// La plantilla real que viaja al .apkg, con los bloques de audio por defecto.
const VOCAB_FRONT_TEMPLATE = buildVocabModel('field').templates[0].qfmt;

// La plantilla trae {{word}}/{{sentence}} de Mustache: sustituir como lo hace
// Anki al renderizar, con los valores de la tarjeta problemática.
const word = process.env.CLOZE_WORD ?? 'C++';
const sentence = process.env.CLOZE_SENTENCE ?? '<img src=x onerror=window.__xss=1> uses C++ daily';
const expectGaps = Number(process.env.CLOZE_GAPS ?? '1');
const html = VOCAB_FRONT_TEMPLATE
  .replace(/{{#phonetic}}[\s\S]*?{{\/phonetic}}/g, '')
  .replace(/{{#audio}}[\s\S]*?{{\/audio}}/g, '')
  .replace(/{{word}}/g, word)
  // hiddenSentence guarda la frase como texto; Anki la escapa al insertarla en
  // el campo, así que aquí va escapada igual (innerText la leerá tal cual).
  .replace('{{sentence}}', sentence.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

if (!html.includes('hiddenSentence')) { console.log('plantilla sin hiddenSentence'); process.exit(1); }

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const alerts = [];
page.on('dialog', async (d) => { alerts.push(d.message()); await d.dismiss(); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 120)));

await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(500);

const st = await page.evaluate(() => {
  const out = document.getElementById('clozeOutput');
  const container = document.getElementById('contextContainer');
  return {
    containerVisible: container ? container.style.display !== 'none' : null,
    html: out ? out.innerHTML : null,
    text: out ? out.textContent : null,
    gaps: out ? out.querySelectorAll('span.cloze-gap').length : -1,
    xss: window.__xss === 1,
    tieneImg: out ? Boolean(out.querySelector('img')) : null,
  };
});
console.log('RESULTADO:', JSON.stringify(st, null, 1));
console.log('alerts:', alerts.length);
const expectVisible = process.env.CLOZE_EXPECT_VISIBLE !== 'no';
const ok = st.containerVisible === expectVisible && st.gaps === expectGaps && !st.xss && !st.tieneImg
  && (!expectVisible || (st.text ?? '').includes(process.env.CLOZE_TEXT_INCLUDE ?? 'uses'));
console.log(ok ? '✅ CLOZE SEGURO: hueco por DOM, C++ sin excepción, sin ejecución de onerror' : '❌ CLOZE FALLA');
await browser.close();
process.exit(ok ? 0 : 1);
