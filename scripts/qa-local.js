const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const repoRoot = path.resolve(__dirname, '..');
const previewPort = 4173;
const previewUrl = `http://127.0.0.1:${previewPort}`;
const screenshotPath = path.join(repoRoot, 'qa-sidebar-local.png');
const finalView = (process.env.QA_CAPTURE_VIEW || 'captions').toLowerCase();
const captureFullPage = process.env.QA_FULL_PAGE === '1';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the preview server is ready.
    }

    await delay(250);
  }

  throw new Error(`Preview server did not become ready at ${url}`);
}

function spawnPreview() {
  const viteCli = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const preview = spawn(
    process.execPath,
    [viteCli, 'preview', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  preview.stdout.on('data', (chunk) => process.stdout.write(chunk));
  preview.stderr.on('data', (chunk) => process.stderr.write(chunk));

  return preview;
}

async function ensureVisible(locator, message) {
  if (!(await locator.isVisible())) {
    throw new Error(message);
  }
}

async function main() {
  const preview = spawnPreview();
  let browser;

  try {
    await waitForServer(previewUrl);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });

    await page.goto(previewUrl, { waitUntil: 'networkidle' });

    await ensureVisible(page.getByText('Subtitle Bridge', { exact: true }), 'Header title not found');
    await ensureVisible(page.getByText('EN → ES · AI Local', { exact: true }), 'Header subtitle not found');

    await ensureVisible(page.getByRole('button', { name: 'Study' }), 'Study tab not found');
    await ensureVisible(page.getByRole('button', { name: 'Captions' }), 'Captions tab not found');
    await ensureVisible(page.getByRole('button', { name: 'Overlay' }), 'Overlay tab not found');

    await page.getByRole('button', { name: 'Study' }).click();
    await ensureVisible(page.getByText('Tutor IA · Study Agent', { exact: true }), 'Study hero not found');
    await page.getByRole('button', { name: 'Refinar con IA' }).click();
    await ensureVisible(page.getByText('Objetivo refinado', { exact: true }), 'Study refine state not found');
    await page.getByRole('button', { name: 'Generar sesión de aprendizaje' }).click();
    await ensureVisible(page.getByText('Preparando tu sesión…', { exact: true }), 'Study generating state not found');
    await page.waitForTimeout(2600);
    await ensureVisible(page.getByText('¿Cómo te fue con este video?', { exact: true }), 'Study result card not found');

    await page.getByRole('button', { name: 'Captions' }).click();
    await page.getByText('Pipeline EN → ES', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    await ensureVisible(page.getByText('Capturado · Udemy', { exact: true }), 'Captions capture state not found');
    await ensureVisible(page.getByText('IA Local (Offline/Idle)', { exact: true }), 'Captions idle state not found');

    await page.getByRole('button', { name: 'Overlay' }).click();
    await page.getByText('Preview', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    await ensureVisible(page.getByText('Overlay activo', { exact: true }), 'Overlay toggle card not found');
    await page.getByRole('button', { name: 'Cine' }).click();
    await ensureVisible(page.getByText('22px', { exact: true }), 'Overlay preset did not update font size');
    await page.getByRole('button', { name: 'Por defecto' }).click();
    await ensureVisible(page.getByText('24px', { exact: true }), 'Overlay reset did not restore the default size');

    const gearButton = page.getByTitle('Triple-click para activar Dev mode');
    await gearButton.evaluate((element) => {
      for (let index = 0; index < 3; index += 1) {
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }
    });

    await page.getByRole('button', { name: 'Dev', exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    await page.getByRole('button', { name: 'Dev', exact: true }).click();
    await page.getByText('Dev · Debug Panel', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    await ensureVisible(page.getByRole('button', { name: /SSE Log/ }), 'Dev SSE tab not found');
    await ensureVisible(page.getByRole('button', { name: /Cache/ }), 'Dev cache tab not found');

    if (finalView === 'study') {
      await page.getByRole('button', { name: 'Study', exact: true }).click();
      await page.getByText('Tutor IA · Study Agent', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
      await ensureVisible(page.getByText('Tutor IA · Study Agent', { exact: true }), 'Study view did not restore before screenshot');
      await page.getByRole('button', { name: 'Generar sesión de aprendizaje' }).click();
      await page.getByText('¿Cómo te fue con este video?', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    } else if (finalView === 'dev') {
      await page.getByRole('button', { name: 'Dev', exact: true }).click();
      await ensureVisible(page.getByRole('button', { name: /SSE Log/, exact: false }), 'Dev view did not restore before screenshot');
    } else {
      await page.getByRole('button', { name: 'Captions', exact: true }).click();
      await page.getByText('Pipeline EN → ES', { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    }

    await page.screenshot({ path: screenshotPath, fullPage: captureFullPage });
    console.log(`QA local completado: screenshot guardado en ${screenshotPath}`);

    await browser.close();
    browser = null;
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }

    preview.kill('SIGINT');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});