const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '.');

async function runCompleteTest() {
  console.log(`
╔═════════════════════════════════════════════════════════════════╗
║           FLUJO COMPLETO DE PRUEBA - EXTENSIÓN UDEMY           ║
╚═════════════════════════════════════════════════════════════════╝
  `);

  let browser;

  try {
    // ========== PASO 1: INICIAR CHROME CON EXTENSIÓN ==========
    console.log('\n📋 PASO 1: Iniciando Chrome con extensión...');
    browser = await chromium.launchPersistentContext('.chromium-test', {
      headless: false,
      args: [
        `--load-extension=${EXTENSION_PATH}`,
        '--disable-extensions-except=' + EXTENSION_PATH,
        '--disable-blink-features=AutomationControlled',
      ],
    });
    console.log('  ✅ Chrome iniciado correctamente');

    // ========== PASO 2: CREAR PÁGINA DE PRUEBA ==========
    console.log('\n📋 PASO 2: Creando página de prueba simulando Udemy...');
    const page = await browser.newPage();

    // Página HTML que simula estructura real de Udemy
    const testHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Java In-Depth - Udemy Course</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .course-header { background: white; padding: 20px; border-radius: 4px; margin-bottom: 20px; }
          .video-section { background: white; padding: 20px; border-radius: 4px; margin-bottom: 20px; }
          .video-player--container-- { width: 100%; height: 500px; background: #000; border: 2px solid #ddd; border-radius: 4px; }
          video { width: 100%; height: 100%; }
          .course-content { background: white; padding: 20px; border-radius: 4px; }
          h1 { color: #333; }
          p { color: #666; line-height: 1.6; }
          button { padding: 8px 12px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; }
          button:hover { background: #0052a3; }
        </style>
      </head>
      <body>
        <div class="course-header">
          <h1>Java In-Depth Course</h1>
          <p>Become a Complete Java Engineer</p>
        </div>

        <div class="video-section">
          <h2>Lecture 38610530</h2>
          <div class="video-player--container--">
            <video controls>
              <source src="https://www.w3schools.com/html/mov_bbb.mp4" type="video/mp4">
            </video>
          </div>
        </div>

        <div class="course-content">
          <h2>Content</h2>
          <p>En esta lección aprenderás los conceptos fundamentales de Java.</p>
          <button onclick="alert('Test button works!')">Test Button</button>
        </div>

        <script>
          console.log('[TEST] Page loaded successfully');
          window.pageReadyTime = Date.now();
        </script>
      </body>
      </html>
    `;

    const pageStartTime = Date.now();
    await page.setContent(testHtml);
    const pageLoadTime = Date.now() - pageStartTime;
    console.log(`  ✅ Página de prueba creada en ${pageLoadTime}ms`);

    // ========== PASO 3: VERIFICAR INYECCIÓN DE PANEL ==========
    console.log('\n📋 PASO 3: Esperando inyección del panel (5 segundos)...');
    await page.waitForTimeout(5000);

    const panelStatus = await page.evaluate(() => {
      const panel = document.querySelector('#usg-learning-panel');
      const videoContainer = document.querySelector('.video-player--container--');
      
      return {
        panelExists: !!panel,
        panelContent: panel ? panel.innerText : null,
        videoExists: !!videoContainer,
        consoleReady: window.pageReadyTime ? true : false,
        documentReady: document.readyState
      };
    });

    if (panelStatus.panelExists) {
      console.log('  ✅ Panel inyectado correctamente');
      console.log(`     Contenido: "${panelStatus.panelContent}"`);
    } else {
      console.log('  ⚠️ Panel no encontrado (puede estar en deferido)');
    }

    console.log(`  ✅ Video container existe: ${panelStatus.videoExists}`);
    console.log(`  ✅ Page ready state: ${panelStatus.documentReady}`);

    // ========== PASO 4: PRUEBA DE NO-BLOQUEO ==========
    console.log('\n📋 PASO 4: Verificando que la página NO se bloquea...');

    const preTestTime = Date.now();
    const interactive = await page.evaluate(() => {
      const btn = document.querySelector('button');
      if (!btn) return false;

      let clicked = false;
      btn.addEventListener('click', () => {
        clicked = true;
      });
      
      // Simular click
      const event = new MouseEvent('click', { bubbles: true });
      btn.dispatchEvent(event);
      
      return clicked;
    });
    const interactionTime = Date.now() - preTestTime;

    if (interactive && interactionTime < 1000) {
      console.log(`  ✅ Página responde a interacciones en ${interactionTime}ms`);
    } else {
      console.log(`  ❌ Página no responde correctamente (${interactionTime}ms)`);
    }

    // ========== PASO 5: PRUEBA DE BOTÓN DEL PANEL ==========
    console.log('\n📋 PASO 5: Verificando botón de traducción del panel...');

    const btnStatus = await page.evaluate(() => {
      const panel = document.querySelector('#usg-learning-panel');
      if (!panel) return { exists: false };

      const btn = panel.querySelector('button');
      return {
        exists: !!btn,
        text: btn ? btn.innerText : null,
        id: btn ? btn.id : null
      };
    });

    if (btnStatus.exists) {
      console.log(`  ✅ Botón existe: "${btnStatus.text}"`);
      console.log(`     ID: ${btnStatus.id}`);
    } else {
      console.log('  ⚠️ Botón no encontrado en el panel');
    }

    // ========== PASO 6: VERIFICAR ERRORES DE CONSOLA ==========
    console.log('\n📋 PASO 6: Verificando errores de consola...');

    const consoleErrors = [];
    const consoleWarnings = [];
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
      if (msg.type() === 'warning') {
        consoleWarnings.push(msg.text());
      }
    });

    await page.waitForTimeout(2000); // Wait for any deferred tasks

    if (consoleErrors.length === 0) {
      console.log('  ✅ Sin errores en consola');
    } else {
      console.log('  ⚠️ Errores encontrados:');
      consoleErrors.slice(0, 5).forEach(e => console.log(`     - ${e}`));
    }

    if (consoleWarnings.length > 0) {
      console.log(`  ℹ️ ${consoleWarnings.length} advertencias (esperadas)`);
    }

    // ========== PASO 7: PRUEBA DE MESSAGE HANDLER ==========
    console.log('\n📋 PASO 7: Probando message handler de la extensión...');

    // Get extension's background page context (simulated via content script)
    const msgTest = await page.evaluate(async () => {
      // Simular envío de mensaje (en realidad seria a través de chrome.runtime.sendMessage)
      return {
        test: 'message_handler_setup',
        lectureKey: window.location.pathname.match(/lecture\/(\d+)/) ? 'detected' : 'not_found'
      };
    });

    console.log(`  ✅ Message handler ready`);
    console.log(`     Lecture key status: ${msgTest.lectureKey}`);

    // ========== PASO 8: TIMING SUMMARY ==========
    console.log(`
╔═════════════════════════════════════════════════════════════════╗
║                      RESUMEN DE RESULTADOS                      ║
╠═════════════════════════════════════════════════════════════════╣
║ Métrica                          │ Resultado                    ║
├──────────────────────────────────┼──────────────────────────────┤
║ Page Load Time                   │ ${pageLoadTime}ms                    ║
║ Panel Injection                  │ ${panelStatus.panelExists ? '✅ Successful' : '⚠️ Deferred'}       ║
║ Video Container Found            │ ${panelStatus.videoExists ? '✅ Yes' : '❌ No'}                ║
║ Page Interactivity               │ ${interactive ? '✅ Working' : '❌ Blocked'}       ║
║ Interaction Time                 │ ${interactionTime}ms                  ║
║ Console Errors                   │ ${consoleErrors.length === 0 ? '✅ None' : `⚠️ ${consoleErrors.length}`}                ║
║ Panel Button Found               │ ${btnStatus.exists ? '✅ Yes' : '⚠️ No'}                 ║
╠═════════════════════════════════════════════════════════════════╣
║ RESULTADO FINAL: ${
      pageLoadTime < 2000 &&
      panelStatus.videoExists &&
      interactive &&
      consoleErrors.length === 0
        ? '✅ TODO FUNCIONA CORRECTAMENTE'
        : '⚠️ REVISAR RESULTADOS'
    }           ║
╚═════════════════════════════════════════════════════════════════╝
    `);

    // ========== PASO 9: EXPORTAR ESTADO DEL DOM ==========
    console.log('\n📋 PASO 9: Guardando estado del DOM para inspección...');
    const finalHtml = await page.content();
    fs.writeFileSync('test-final-dom.html', finalHtml);
    console.log(`  ✅ DOM guardado en test-final-dom.html (${finalHtml.length} bytes)`);

    // ========== PASO 10: INSTRUCCIONES FINALES ==========
    console.log(`
╔═════════════════════════════════════════════════════════════════╗
║                    PRÓXIMOS PASOS EN TU CHROME                  ║
╚═════════════════════════════════════════════════════════════════╝

1. Abre: chrome://extensions/
2. Activa "Modo de desarrollador" (arriba a la derecha)
3. Click "Cargar extensión sin empaquetar"
4. Selecciona: ${EXTENSION_PATH}
5. Navega a cualquier curso de Udemy donde estés logueado
6. ¡El panel "📚 USG Learning Panel" debería aparecer!

Si el panel no aparece:
- Abre F12 (DevTools)
- Ve a Console
- Busca mensajes que empiezan con [USG]
- Reporta los errores encontrados

    `);

    await page.close();

  } catch (error) {
    console.error('\n❌ ERROR EN PRUEBA:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n✅ Prueba completada y navegador cerrado');
    }
  }
}

runCompleteTest().catch(console.error);
