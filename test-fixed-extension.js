const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const path = require('path');

chromium.use(stealth);

(async () => {
    const extensionPath = path.join(__dirname, '/');
    const userDataDir = path.join(__dirname, 'chrome-test-profile');
    
    // Leer cookies nuevas
    let cookies = [];
    try {
        const rawTokens = fs.readFileSync('token.txt', 'utf8').trim();
        cookies = rawTokens.split(';').map(pair => {
            const [name, ...rest] = pair.trim().split('=');
            if (!name) return null;
            let val = rest.join('=').trim();
            if (val.startsWith('"') && val.endsWith('"')) {
                val = val.slice(1, -1);
            }
            return { 
                name: name.trim(), 
                value: val, 
                url: 'https://www.udemy.com',
                secure: true
            };
        }).filter(Boolean);
        console.log(`✅ Inyectando ${cookies.length} cookies nuevas...`);
    } catch (e) {
        console.log("⚠️ No se pudo leer token.txt:", e.message);
    }

    console.log("🚀 Lanzando Chrome REAL sin bloqueos de página...");
    
    const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chrome', 
        headless: false,
        ignoreDefaultArgs: ['--enable-automation'], 
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--disable-blink-features=AutomationControlled',
            '--start-maximized'
        ],
        viewport: null
    });

    if (cookies.length > 0) {
        await context.addCookies(cookies);
    }
    
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    console.log("🌐 Navegando a la clase de Udemy...");
    const startTime = Date.now();
    
    try {
        await page.goto('https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/learn/lecture/38610530?start=285#overview', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
        });
        
        const loadTime = Date.now() - startTime;
        console.log(`✅ Página cargada en ${loadTime}ms (sin bloqueos)`);
        
        console.log("⏳ Esperando que Udemy renderize el reproductor (React)..."); 
        await page.waitForTimeout(5000); // React rendering delay
        
        const panelExists = await page.evaluate(() => !!document.querySelector('#usg-learning-panel'));
        const videoExists = await page.evaluate(() => !!document.querySelector('.video-player--container--'));
        
        // Debug: exportar HTML para ver qué se cargó
        const html = await page.content();
        fs.writeFileSync('debug-page-content.html', html);
        console.log(`📄 HTML exportado a debug-page-content.html (${html.length} bytes)`);
        
        // Buscar pistas en el HTML
        if (html.includes('video-player')) {
            console.log("✅ 'video-player' encontrado en HTML (clase/atributo)");
        }
        if (html.includes('learner-player')) {
            console.log("✅ 'learner-player' encontrado en HTML");
        }
        if (html.includes('paywall') || html.includes('Enroll') || html.includes('Join')) {
            console.log("⚠️ Paywall o mensaje de compra detectado - el curso podría estar bloqueado");
        }
        
        if (panelExists && videoExists) {
            console.log("✅ ¡ÉXITO! Panel inyectado correctamente debajo del reproductor.");
            await page.screenshot({ path: 'success-extension-works.png', fullPage: true });
        } else {
            console.log("⚠️ Panel no encontrado o video container no visible aún.");
            console.log(`   Panel existe: ${panelExists}, Video container existe: ${videoExists}`);
            console.log("   Esperando más tiempo para React render...");
            
            // Intentar esperar más para que React renderice
            await page.waitForSelector('.video-player--container--', { timeout: 15000 }).catch(() => null);
            
            const panelExists2 = await page.evaluate(() => !!document.querySelector('#usg-learning-panel'));
            const videoExists2 = await page.evaluate(() => !!document.querySelector('.video-player--container--'));
            
            if (videoExists2) {
                console.log(`✅ Video container apareció después de espera. Panel: ${panelExists2}`);
                await page.screenshot({ path: 'success-extension-works.png', fullPage: true });
            }
        }
        
    } catch (e) {
        console.log("❌ Error durante navegación:", e.message);
    }

    console.log("Ventana abierta por 20 segundos para revisar manualmente...");
    setTimeout(async () => {
        await context.close();
        process.exit(0);
    }, 20000);
})();