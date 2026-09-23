import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : 'chromium',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:5173/');
  for (const [theme, label] of [
    ['neutral', '中性浅色'],
    ['paper', '纸感暖白'],
    ['night', '石墨深色'],
  ]) {
    await page.getByRole('button', { name: '打开外观设置' }).click();
    await page.getByRole('button', { name: new RegExp(label) }).click();
    await page.getByRole('button', { name: '关闭外观设置' }).click();
    for (const [label, name] of [
      ['概览', 'overview'],
      ['知识空间', 'knowledge'],
      ['健康记录', 'health'],
      ['家庭环境', 'home'],
      ['数据连接', 'settings'],
      ['数据管理', 'datasets'],
      ['金融资产', 'finance-board'],
    ]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.locator('main').waitFor();
      if (name === 'finance-board') await page.locator('.cloud-canvas canvas').waitFor();
      await page.waitForTimeout(150);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error(`${name} ${theme} overflows`);
      await page.screenshot({ path: `artifacts/${name}-${theme}.png`, fullPage: true });
    }
  }
  await page.getByRole('button', { name: '数据研究', exact: true }).click();
  await page.getByRole('button', { name: '产业网络', exact: true }).click();
  await page.locator('.atlas-company').first().waitFor();
  await page.screenshot({ path: 'artifacts/industry-live.png', fullPage: true });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Reviewed 7 workspaces across 3 themes; no page errors or document overflow.');
} finally {
  await browser.close();
}
