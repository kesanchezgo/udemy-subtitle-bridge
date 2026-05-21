const { spawn, spawnSync } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const repoRoot = path.resolve(__dirname, '..');
const previewPort = 4173;
const previewUrl = `http://127.0.0.1:${previewPort}`;
const screenshotPath = path.join(repoRoot, 'qa-sidebar-local.png');
const finalView = (process.env.QA_CAPTURE_VIEW || 'study').toLowerCase();
const captureFullPage = process.env.QA_FULL_PAGE === '1';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.status < 500) {
        return;
      }
    } catch {
      // Keep polling until Vite is listening.
    }

    await delay(250);
  }

  throw new Error(`Vite dev server did not become ready at ${url}`);
}

function spawnDevServer() {
  const viteCli = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const dev = spawn(
    process.execPath,
    [viteCli, '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  dev.stdout.on('data', (chunk) => process.stdout.write(chunk));
  dev.stderr.on('data', (chunk) => process.stderr.write(chunk));

  return dev;
}

function stopDevServer(devServer) {
  if (!devServer || devServer.killed) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    let fallbackTimer;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(fallbackTimer);
      resolve();
    };

    devServer.once('close', done);
    devServer.once('exit', done);
    devServer.kill('SIGTERM');

    fallbackTimer = setTimeout(() => {
      if (!devServer.killed) {
        devServer.kill('SIGTERM');
      }
      done();
    }, 3000);
  });
}

function restoreProductionDist() {
  if (process.env.QA_RESTORE_BUILD === '0') return;

  console.log('Restaurando dist de producción después de QA...');
  const viteCli = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const result = spawnSync(process.execPath, [viteCli, 'build'], {
    cwd: repoRoot,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error('No se pudo restaurar dist con vite build');
  }
}

async function ensureVisible(locator, message) {
  await locator.waitFor({ state: 'visible', timeout: 8000 });
  if (!(await locator.isVisible())) {
    throw new Error(message);
  }
}

async function clickIfVisible(locator) {
  if (await locator.isVisible().catch(() => false)) {
    await locator.click();
    return true;
  }
  return false;
}

async function activateGuestMode(page) {
  await ensureVisible(page.getByText('Subtitle Bridge', { exact: true }).first(), 'Auth title not found');
  await ensureVisible(page.getByRole('button', { name: 'Iniciar sesión' }).first(), 'Login tab/button not found');
  await page.getByRole('button', { name: 'Crear cuenta' }).first().click();
  await ensureVisible(page.getByRole('button', { name: 'Crear cuenta gratis' }), 'Signup submit button not found');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await ensureVisible(page.getByRole('button', { name: 'Continuar sin cuenta' }), 'Guest entry button not found');
  await page.getByRole('button', { name: 'Continuar sin cuenta' }).click();
}

async function activateDevMode(page) {
  const gearButton = page.getByTitle('Triple-click para activar Dev mode');
  await ensureVisible(gearButton, 'Dev mode gear button not found');
  await gearButton.evaluate((element) => {
    for (let index = 0; index < 3; index += 1) {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }
  });
  await page.getByRole('button', { name: 'Dev', exact: true }).waitFor({ state: 'visible', timeout: 5000 });
}

async function testDockChrome(page) {
  await ensureVisible(page.getByText('Subtitle Bridge', { exact: true }).first(), 'Dock header title not found');
  await ensureVisible(page.getByText('EN → ES Subtitles', { exact: true }), 'Dock header subtitle not found');

  const resizeHandle = page.getByTitle('Arrastrar para redimensionar');
  await ensureVisible(resizeHandle, 'Resize handle not found');
  const box = await resizeHandle.boundingBox();
  if (!box) throw new Error('Resize handle has no bounding box');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 80, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  const collapseButton = page.getByTitle('Colapsar dock');
  await ensureVisible(collapseButton, 'Collapse button not found');
  await collapseButton.click();
  await ensureVisible(page.getByTitle('Expandir Subtitle Bridge'), 'Collapsed dock expand control not found');
  await page.getByTitle('Expandir Subtitle Bridge').click();
  await ensureVisible(page.getByRole('button', { name: 'Study', exact: true }), 'Dock did not expand back to tabs');
}

async function testStudy(page) {
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await ensureVisible(page.getByText('Tutor IA · Study Agent', { exact: true }), 'Study hero not found');
  await ensureVisible(page.getByText('¿PARA QUÉ ESTUDIAS ESTO?'), 'Study objective label not found');
  await ensureVisible(page.getByText('Entrevista Spring Boot', { exact: true }), 'Study objective card not found');
  await ensureVisible(page.getByText('Transcripción', { exact: false }).first(), 'Study transcript status not found');
  await ensureVisible(page.getByRole('button', { name: /Generar sesión de aprendizaje/ }), 'Study generate CTA not found');
}

async function testCaptions(page) {
  await page.getByRole('button', { name: 'Captions', exact: true }).click();
  await ensureVisible(page.getByText('Estado en vivo', { exact: true }), 'Captions live status not found');
  await ensureVisible(page.getByText('Auto EN → ES', { exact: true }), 'Captions auto translate card not found');
  await ensureVisible(page.getByText('Pipeline SRT · EN → ES', { exact: true }), 'Captions pipeline header not found');
  await ensureVisible(page.getByText('Transcripción', { exact: false }).first(), 'Captions transcript card not found');
}

async function testOverlay(page) {
  await page.getByRole('button', { name: 'Overlay', exact: true }).click();
  await ensureVisible(page.getByText('Preview', { exact: true }).first(), 'Overlay preview not found');
  await ensureVisible(page.getByText('Overlay activo', { exact: true }), 'Overlay master switch label not found');
  await page.getByRole('button', { name: 'Centro', exact: true }).click();
  await ensureVisible(page.getByText('Posición libre', { exact: true }), 'Overlay free position card not found');
  await clickIfVisible(page.getByRole('button', { name: 'Resetear', exact: true }));
}

async function testDev(page) {
  await activateDevMode(page);
  await page.getByRole('button', { name: 'Dev', exact: true }).click();
  await ensureVisible(page.getByText('Dev · Debug Panel', { exact: true }), 'Dev debug panel not found');
  await ensureVisible(page.getByRole('button', { name: /SSE Log/ }), 'Dev SSE tab not found');
  await ensureVisible(page.getByRole('button', { name: /Cache/ }), 'Dev cache tab not found');
}

async function restoreFinalView(page) {
  if (finalView === 'captions') {
    await page.getByRole('button', { name: 'Captions', exact: true }).click();
  } else if (finalView === 'overlay') {
    await page.getByRole('button', { name: 'Overlay', exact: true }).click();
  } else if (finalView === 'dev') {
    await activateDevMode(page);
    await page.getByRole('button', { name: 'Dev', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Study', exact: true }).click();
  }
}

async function main() {
  const devServer = spawnDevServer();
  let browser;

  try {
    await waitForServer(previewUrl);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
    const pageErrors = [];

    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !/Failed to load resource|ERR_CONNECTION_REFUSED/.test(msg.text())) {
        pageErrors.push(msg.text());
      }
    });

    await page.goto(previewUrl, { waitUntil: 'networkidle' });
    await activateGuestMode(page);
    await testDockChrome(page);
    await testStudy(page);
    await testCaptions(page);
    await testOverlay(page);
    await testDev(page);
    await restoreFinalView(page);

    if (pageErrors.length > 0) {
      throw new Error(`Unexpected browser errors:\n${pageErrors.join('\n')}`);
    }

    await page.screenshot({ path: screenshotPath, fullPage: captureFullPage });
    console.log(`QA local completado: screenshot guardado en ${screenshotPath}`);

    await browser.close();
    browser = null;
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }

    await stopDevServer(devServer);
    restoreProductionDist();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
