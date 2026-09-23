import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('button', { name: '金融资产', exact: true }).click();
  await page.locator('.cloud-canvas canvas').waitFor({ timeout: 30000 });
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'artifacts/market-dashboard.png', fullPage: true });
  console.log(JSON.stringify({ widgets: await page.locator('.market-widget').count(), errors }));
  await page.getByRole('button', { name: 'A 股大盘云图设置', exact: true }).click();
  await page.screenshot({ path: 'artifacts/widget-settings.png' });
  await page.getByLabel('A 股大盘云图尺寸').selectOption('full');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'artifacts/market-full-width.png', fullPage: true });
  await page.getByRole('button', { name: '添加小组件', exact: true }).click();
  await page.screenshot({ path: 'artifacts/widget-library.png', fullPage: true });
  await page.getByRole('button', { name: '关闭小组件库' }).click();
  await page.getByRole('button', { name: '管理数据源', exact: true }).click();
  await page.locator('.source-adapters article').first().waitFor();
  await page.screenshot({ path: 'artifacts/market-sources.png', fullPage: true });
} finally {
  await browser.close();
}
