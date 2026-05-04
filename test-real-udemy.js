const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '.');
const UDEMY_URL = 'https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/learn/lecture/38610530?start=285#overview';

async function testRealUdemy() {
  console.log(`
╔═════════════════════════════════════════════════════════════════╗
║         PRUEBA EN UDEMY REAL CON EXTENSIÓN INSTALADA           ║
╚═════════════════════════════════════════════════════════════════╝
  `);

  console.log(`🎯 URL de prueba: ${UDEMY_URL}`);
  
  let browser;
  let page;

  try {
    // ========== PASO 1: LANZAR CHROME CON EXTENSIÓN ==========
    console.log('\n📋 PASO 1: Iniciando Chrome con extensión...');
    
    browser = await chromium.launchPersistentContext('.chromium-udemy-test', {
      headless: false,
      args: [
        `--load-extension=${EXTENSION_PATH}`,
        '--disable-extensions-except=' + EXTENSION_PATH,
        '--disable-blink-features=AutomationControlled',
      ],
      // Ignore HTTPS errors para cookies HTTPS
      ignoreHTTPSErrors: true,
    });

    console.log('  ✅ Chrome iniciado correctamente');

    // ========== PASO 2: CREAR PÁGINA (EXTENSIÓN INYECTARÁ SCRIPT) ==========
    console.log('\n📋 PASO 2: Creando página...');
    
    page = await browser.newPage();
    console.log('  ✅ Página creada (el manifest inyectará el content-script)');

    // ========== PASO 3: INYECTAR COOKIES ==========
    console.log('\n📋 PASO 3: Inyectando cookies desde token.txt...');
    
    // Leer cookies
    const cookieString = fs.readFileSync('token.txt', 'utf-8').trim();
    const cookiePairs = cookieString
      .split(';')
      .map(pair => {
        const trimmed = pair.trim();
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) return null;
        
        const name = trimmed.substring(0, eqIdx).trim();
        const value = trimmed.substring(eqIdx + 1).trim();
        return { name, value };
      })
      .filter(p => p && p.name && p.name.length > 0); // Solo válidos

    console.log(`  📍 Inyectando ${cookiePairs.length} cookies...`);
    
    if (cookiePairs.length > 0) {
      console.log(`  Primera cookie: ${cookiePairs[0].name}=${cookiePairs[0].value.substring(0, 30)}...`);
    }

    // Inyectar cookies con url Y path
    await page.context().addCookies(
      cookiePairs.map(({ name, value }) => ({
        name: name,
        value: value || '',
        url: 'https://www.udemy.com/',
      }))
    );

    console.log('  ✅ Cookies inyectadas');

    // Set listener before step 4, before navigation.
    const errorMessages = [];
    const usgMessages = [];
    const allLogs = [];

    page.on('console', (msg) => {
      const text = msg.text();
      allLogs.push(`[${msg.type().toUpperCase()}] ${text}`);
      
      if (msg.type() === 'error') {
        errorMessages.push(text);
      }
      if (text.includes('[USG]')) {
        usgMessages.push(text);
      }
    });

    // ========== PASO 4: NAVEGAR A UDEMY ==========
    console.log('\n📋 PASO 4: Navegando a Udemy...');
    const startTime = Date.now();

    try {
      await page.goto(UDEMY_URL, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
    } catch (e) {
      console.log(`  ⚠️ Timeout o error de navegación (continuando): ${e.message.substring(0, 100)}`);
    }

    const loadTime = Date.now() - startTime;
    console.log(`  ✅ Página cargada en ${loadTime}ms`);

    // ========== PASO 5: ESPERAR A QUE REACT RENDERICE ==========
    console.log('\n📋 PASO 5: Esperando renderización y panel...');

    // Esperar hasta 15 segundos o hasta que encontremos el video player
    const startWait = Date.now();
    let videoFound = false;
    let panelFound = false;
    
    while (Date.now() - startWait < 25000) {
      const status = await page.evaluate(() => {
        const selectors = [
          ".video-player--container--",
          "[data-purpose='video-player']",
          ".video-player",
          "[class*='player']",
          ".learner-video-player"
        ];
        const videoContainer = selectors.some(s => !!document.querySelector(s));
        const panel = !!document.querySelector('#usg-learning-panel');
        return { videoContainer, panel };
      });
      
      if (status.videoContainer) videoFound = true;
      if (status.panel) {
        panelFound = true;
        console.log('  ✅ Panel detectado!');
        break;
      }
      
      if (videoFound && !panelFound && (Date.now() - startWait) > 10000) {
        console.log('  ⚠️ Video encontrado pero panel aún esperando...');
      }
      
      await page.waitForTimeout(500);
    }

    if (videoFound && !panelFound) {
      console.log('  ⚠️ Video encontrado pero panel no aparecció (verificando después de espera)');
    }

    // ========== PASO 6: INTERACTUAR CONTRA EL VIDEO ===========
    if (panelFound) {
      console.log('\n📋 PASO 6: Dando click al botón Retry translation para probar el flujo de Extracción...');
      await page.evaluate(() => {
        const retryBtn = document.querySelector('#usg-retry-translation-btn');
        if (retryBtn) retryBtn.click();
      });
      // Esperar un rato para que el Extraction y el Fake LLM hagan el log
      await page.waitForTimeout(8000); 
    } else {
      await page.waitForTimeout(8000);
    }
    
    console.log('\n📋 PASO 7: Verificando inyección del panel...');

    const pageStatus = await page.evaluate(() => {
      const panel = document.querySelector('#usg-learning-panel');
      
      // Buscar video container con múltiples selectores
      const selectors = [
        ".video-player--container--",
        "[data-purpose='video-player']",
        ".video-player",
        "[class*='player']",
        ".learner-video-player"
      ];
      let videoContainer = null;
      for (const s of selectors) {
        videoContainer = document.querySelector(s);
        if (videoContainer) break;
      }
      
      const body = document.body.innerText;

      return {
        panelExists: !!panel,
        panelText: panel ? panel.innerText : null,
        videoExists: !!videoContainer,
        titleInPage: document.title,
        hasPaywall: body.includes('Enroll') || body.includes('Join') || body.includes('purchase') || body.includes('Comprar'),
        hasReproducir: body.includes('Reproducir') || body.includes('Play'),
        pageUrl: window.location.href,
        documentReady: document.readyState,
      };
    });

    console.log(`\n📊 RESULTADOS:`);
    console.log(`  Panel encontrado: ${pageStatus.panelExists ? '✅ SÍ' : '❌ NO'}`);
    if (pageStatus.panelText) {
      console.log(`  Contenido del panel: "${pageStatus.panelText.substring(0, 100)}..."`);
    }
    console.log(`  Video container: ${pageStatus.videoExists ? '✅ SÍ' : '❌ NO'}`);
    console.log(`  Página title: ${pageStatus.titleInPage}`);
    console.log(`  ¿Paywall detectado?: ${pageStatus.hasPaywall ? '⚠️ SÍ' : '✅ NO'}`);
    console.log(`  ¿Botón Reproducir/Play?: ${pageStatus.hasReproducir ? '✅ VISIBLE' : '❌ NO'}`);
    console.log(`  Page state: ${pageStatus.documentReady}`);

    // ========== PASO 7: VERIFICAR ERRORES EN CONSOLA ==========
    console.log('\n📋 PASO 7: Verificando errores y logs globales...');
    // Already hooked: const allLogs = [];

    console.log('\n📋 PASO 8: Verificando errores y logs...');
    // Esperar a que se procesen logs que ya ocurrieron
    await page.waitForTimeout(2000);

    console.log(`  Errores de console: ${errorMessages.length}`);
    if (errorMessages.length > 0) {
      console.log(`  ❌ Errores encontrados:`);
      errorMessages.forEach(err => console.log(`    - ${err.substring(0, 150)}`));
    }
    
    if (usgMessages.length > 0) {
      console.log(`  [USG] Mensajes: ${usgMessages.length}`);
      usgMessages.forEach(msg => console.log(`    ✓ ${msg}`));
    } else {
      console.log(`  [USG] Ningún mensaje (content-script podría no haberse ejecutado)`)
    }
    
    console.log(`\n  Total logs: ${allLogs.length}`);
    if (allLogs.length > 0 && allLogs.length <= 10) {
      console.log('  Todos los logs:');
      allLogs.forEach(log => console.log(`    ${log}`));
    }

    // ========== PASO 7: GUARDAR HTML Y SCREENSHOT ==========
    console.log('\n📋 PASO 7: Guardando estado de la página...');

    const html = await page.content();
    fs.writeFileSync('udemy-test-page.html', html);
    console.log(`  ✅ HTML guardado (${html.length} bytes)`);

    try {
      await page.screenshot({ path: 'udemy-test-screenshot.png', fullPage: false });
      console.log('  ✅ Screenshot guardado');
    } catch (e) {
      console.log(`  ℹ️ Screenshot no disponible`);
    }

    // ========== RESULTADO FINAL ==========
    console.log(`
╔═════════════════════════════════════════════════════════════════╗
║                      RESUMEN FINAL                              ║
╠═════════════════════════════════════════════════════════════════╣
║ Carga de página              │ ${loadTime}ms                  
║ Panel inyectado              │ ${pageStatus.panelExists ? '✅ ÉXITO' : '❌ NO'}                    
║ Video container              │ ${pageStatus.videoExists ? '✅ SÍ' : '❌ NO'}                    
║ Paywall bloqueado            │ ${pageStatus.hasPaywall ? '⚠️ ACTIVO' : '✅ INACTIVO'}                 
║ Errores console              │ ${errorMessages.length === 0 ? '✅ NONE' : `⚠️ ${errorMessages.length}`}                    
╠═════════════════════════════════════════════════════════════════╣
║ CONCLUSIÓN:
║ ${pageStatus.panelExists 
  ? '✅ EXTENSIÓN FUNCIONANDO CORRECTAMENTE' 
  : pageStatus.hasPaywall 
  ? '⚠️ PAYWALL ACTIVO - Session cookies pueden haber expirado' 
  : '❌ Panel no inyectado - Revisar logs'}
║
╚═════════════════════════════════════════════════════════════════╝
    `);

    // Mantener navegador abierto 15 segundos para inspección manual
    console.log('\n🔍 Ventana abierta por 15 segundos para inspección manual...');
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('\n❌ ERROR FATAL:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n✅ Prueba completada, navegador cerrado');
    }
  }
}

testRealUdemy().catch(console.error);
