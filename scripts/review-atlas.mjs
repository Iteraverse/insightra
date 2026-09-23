import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1120 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await mkdir('artifacts', { recursive: true });
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('button', { name: '产业网络', exact: true }).click();
  await page.locator('.atlas-company').first().waitFor({ timeout: 30000 });
  await page.screenshot({ path: 'artifacts/atlas-global.png', fullPage: true });
  console.log(
    JSON.stringify({
      companies: await page.locator('.atlas-company').count(),
      edges: await page.locator('.atlas-edges path').count(),
      communities: await page.locator('.atlas-community').count(),
      errors,
    }),
  );
  await page.getByRole('textbox', { name: '搜索产业公司' }).fill('宁德时代');
  await page.locator('.supply-search-results button').first().click();
  await page.screenshot({ path: 'artifacts/atlas-selected.png', fullPage: true });
  await page.getByRole('button', { name: '定位选中公司', exact: true }).click();
  await page.screenshot({ path: 'artifacts/atlas-zoom.png', fullPage: true });
} catch (error) {
  console.log(
    JSON.stringify({ error: String(error), errors, body: await page.locator('main').innerText() }),
  );
  await page.screenshot({ path: 'artifacts/atlas-debug.png', fullPage: true });
  throw error;
} finally {
  await browser.close();
}
