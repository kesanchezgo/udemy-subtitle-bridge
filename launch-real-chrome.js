const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs');
const path = require('path');

chromium.use(stealth);

(async () => {
    const extensionPath = path.join(__dirname, '/');
    const userDataDir = path.join(__dirname, 'chrome-real-profile');
    
    // Leer cookies
    let cookies = [];
    try {
        const rawTokens = fs.readFileSync('token.txt', 'utf8').trim();
        cookies = rawTokens.split(';').map(pair => {
            const [name, ...rest] = pair.trim().split('=');
            if (!name) return null;
            let val = rest.join('=').trim();
            // Limpiar comillas iniciales/finales si existen en el token para evitar rechazos HTTP
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
    } catch (e) {
        console.log("No se pudo leer token.txt o ocurrió un error:", e.message);
    }

    console.log("🚀 Iniciando Chrome REAL (instalado en el sistema)...");
    
    // Usamos el Chrome real del sistema, en lugar del Chromium descargado por Playwright
    // Ocultamos la etiqueta de automatización para evitar que Cloudflare nos detecte
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

    console.log("🌐 Navegando a la clase de Udemy en el navegador real...");
    await page.goto('https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/learn/lecture/12451530?start=15#overview', { waitUntil: 'domcontentloaded' });
    
    try {
        console.log("⏳ Esperando contenedor de video. Le daremos mucho más tiempo (30 segundos)...");
        await page.waitForSelector('.video-player--container--', { timeout: 30000 });
        console.log("✅ Contenedor de video detectado.");
        
        console.log("⏳ Verificando inyección de panel (#usg-learning-panel)...");
        await page.waitForSelector('#usg-learning-panel', { timeout: 60000 });
        console.log("✅ ¡ÉXITO CRÍTICO! El panel fue inyectado correctamente en el DOM real de Udemy.");
        await page.screenshot({ path: 'test-real-chrome-exito.png', fullPage: true });
    } catch (e) {
        console.log("⚠️ Limitación detectada o demora en carga: ", e.message);
        try {
            await page.screenshot({ path: 'test-real-chrome-error.png', fullPage: true });
            const pageHtml = await page.content();
            fs.writeFileSync('error-dom.html', pageHtml);
            console.log("Capturamos el DOM de la página para revisar qué bloquea.");
        } catch (screenshotError) {
            console.log("❌ No se pudo tomar captura final porque la ventana del navegador fue cerrada inesperadamente por el usuario o se cerró de golpe.");
        }
    }

    console.log("⏳ Dejaré esta ventana abierta por 15 segundos para que veas el resultado visualmente y luego cerraré la prueba de forma limpia.");
    setTimeout(async () => {
        await context.close();
        process.exit(0);
    }, 15000);
})();