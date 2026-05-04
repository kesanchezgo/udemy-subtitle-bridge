const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
    const extensionPath = path.join(__dirname, '/');
    
    // Configurar las cookies desde tu archivo token.txt
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

    console.log("🚀 Iniciando navegador automatizado con tu sesión y la extensión...");
    
    // Usar channel 'chrome' nativo en lugar del Chromium default para evitar bloqueos
    const browser = await chromium.launchPersistentContext('', {
        headless: false,
        channel: 'chrome',
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`
        ]
    });

    await browser.addCookies(cookies);
    
    const page = browser.pages().length > 0 ? browser.pages()[0] : await browser.newPage();
    
    console.log("🌐 Navegando a la clase de Udemy...");
    await page.goto('https://www.udemy.com/course/java-in-depth-become-a-complete-java-engineer/learn/lecture/12451530?start=15#overview', { waitUntil: 'domcontentloaded' });
    
    try {
        console.log("⏳ Esperando a que Udemy renderice...");
        await page.waitForTimeout(10000); // Darle tiempo para cargar todo el DOM / React
        console.log("Guardando HTML para inspeccionar...");
        const html = await page.content();
        fs.writeFileSync('udemy-page.html', html);
        
        console.log("Tomando screenshot...");
        await page.screenshot({ path: 'test-debug.png', fullPage: true });
        
    } catch(e) {
        console.log("⚠️ Error en el debug: " + e.message);
    }

    console.log("Cerrando la prueba en 3 segundos...");
    setTimeout(() => { browser.close(); process.exit(0); }, 3000);
})();
