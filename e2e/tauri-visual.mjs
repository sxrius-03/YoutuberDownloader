// Verificacao visual da janela WebView2 real via CDP (padrao Semestrar/e2e/fixtures).
// Descartavel: roda fora da suite Playwright, workers irrelevantes.
import { chromium } from '@playwright/test';

const cdp = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = cdp.contexts()[0];
// Janela única do WebView2: pega a página já aberta, NÃO cria página nova.
const page = ctx.pages().find(p => (p.url() || '').startsWith('http')) || ctx.pages()[0];
await page.bringToFront();

// Aba Ajustes na janela REAL
await page.locator('button.tab-btn:has-text("Ajustes")').click();
await page.waitForTimeout(300);
await page.screenshot({ path: 'e2e-screenshots/tauri-real-settings.png', fullPage: true });

// Probe funcional: salvar 2 proxies e recarregar a tela
await page.locator('textarea.proxy-textarea').fill('http://127.0.0.1:9\nhttp://127.0.0.1:8');
await page.locator('button:has-text("Salvar proxies")').click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'e2e-screenshots/tauri-real-proxy-saved.png', fullPage: true });

// Limpar (deixa a instalacao do Eduardo sem proxies de teste)
await page.locator('textarea.proxy-textarea').fill('');
await page.locator('button:has-text("Salvar proxies")').click();
await page.waitForTimeout(500);

await cdp.close();
console.log('OK: settings tab verified in real window');
