import { test, expect } from '@playwright/test';

test('industry data loads real local records and supports search, evidence, and company selection', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '产业网络', exact: true }).click();
  await expect(page.locator('.supply-totals')).toContainText('258');
  await expect(page.locator('.supply-totals')).toContainText('685');
  await page.getByRole('textbox', { name: '搜索产业公司' }).fill('万华');
  await page.locator('.supply-search-results button').filter({ hasText: '万华化学' }).click();
  await expect(page.locator('.supply-inspector h2')).toHaveText('万华化学');
  await expect(page.locator('.atlas-company')).toHaveCount(258);
  await expect(
    page.getByRole('img', { name: '全行业公司供应网络，包含全部公司与供应关系' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '关系明细', exact: true }).click();
  await page.getByLabel('仅选中公司的关系').uncheck();
  await page.getByLabel('关系证据筛选').selectOption('d');
  await expect(page.locator('.supply-edge-table tbody tr').first()).toContainText('公开披露');
  await page.getByRole('textbox', { name: '搜索产业公司' }).fill('不存在的公司');
  await expect(page.getByText('没有匹配的公司', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('appearance, density and saved views are reviewable and persist', async ({ page }) => {
  await page.goto('/');
  await page.screenshot({ path: 'artifacts/neutral-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '打开外观设置' }).click();
  await page.getByRole('button', { name: /纸感暖白/ }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'paper');
  await page.getByRole('button', { name: '关闭外观设置' }).click();
  await page.screenshot({ path: 'artifacts/paper-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '打开外观设置' }).click();
  await page.getByRole('button', { name: /石墨深色/ }).click();
  await page.getByRole('button', { name: '紧凑', exact: true }).click();
  await page.getByRole('button', { name: '保存当前偏好' }).click();
  await page.getByRole('button', { name: '关闭外观设置' }).click();
  await page.screenshot({ path: 'artifacts/night-desktop.png', fullPage: true });
  await page.reload();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'night');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-density', 'compact');
  await page.getByRole('button', { name: '保存的视图' }).click();
  await expect(page.locator('.toast')).toContainText('已恢复保存的视图');
});

test('small screens retain controls without document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('button', { name: '健康记录', exact: true }).click();
  await expect(page.getByRole('heading', { name: /身体有自己的节奏/ })).toBeVisible();
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('button', { name: '数据研究', exact: true }).click();
  await page.getByRole('button', { name: '产业网络', exact: true }).click();
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
  await page.getByRole('button', { name: '关系明细', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
