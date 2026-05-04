const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

// Agregar plugin stealth para evadir el bloqueo de bot de Udemy/Cloudflare
chromium.use(stealth);

const fs = require('fs');
const path = require('path');

(async () => {
    const extensionPath = path.join(__dirname, '/');
    
    // Leer cookies
    const rawTokens = fs.readFileSync('token.txt', 'utf8').trim();
    const cookies = rawTokens.split(';').map(pair => {
        const [name, ...rest] = pair.trim().split('=');
        return { 
            name: name.trim(), 
            value: rest.join('=').trim(), 
            domain: '.udemy.com', 
            path: '/' 
        };
    });

    console.log("🚀 Iniciando navegador en modo STEALTH (Evasión de Bots) con tu sesión...");
    
    const browser = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`
        ]
    });

    await browser.addCookies(cookies);
    
    // Configurar user agent real
    const page = browser.pages().length > 0 ? browser.pages()[0] : await browser.newPage();
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    });

    console.log("🌐 Navegando a la clase de Udemy...");
    await page.goto('https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/learn/lecture/12451530?start=15#overview', { waitUntil: 'domcontentloaded' });
    
    try {
        console.log("⏳ Esperando contenedor de video...");
        await page.waitForSelector('.video-player--container--', { timeout: 35000 });
        console.log("✅ Contenedor de video detectado. Evadimos el bloqueo.");
    } catch(e) {
        let title = await page.title();
        console.log("⚠️ Sigue sin aparecer el contenedor de video. Título de página: " + title);
        await page.screenshot({ path: 'test-stealth-error.png', fullPage: true });
    }
    
    try {
        console.log("⏳ Verificando la inyección del Panel (#usg-learning-panel)...");
        await page.waitForSelector('#usg-learning-panel', { timeout: 20000 });
        console.log("✅ ¡ÉXITO CRÍTICO! El panel fue inyectado correctamente en el DOM.");
        await page.screenshot({ path: 'test-stealth-exito.png', fullPage: true });
    } catch (e) {
        console.log("❌ No apareció el panel.");
    }

    console.log("Cerrando...");
    setTimeout(() => { browser.close(); process.exit(0); }, 3000);
})();