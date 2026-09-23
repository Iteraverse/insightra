import { test, expect } from '@playwright/test';
test('correlation workspace selects symbols and interval, inspects matrix, and invalidates old selection', async ({
  page,
}) => {
  const stocks = [
    { code: '000001.SZ', name: '样本甲', industry: '银行' },
    { code: '600000.SH', name: '样本乙', industry: '银行' },
  ];
  await page.route('**/api/research/correlation/stocks', (r) =>
    r.fulfill({ json: { stocks, as_of: '20260922' } }),
  );
  await page.route('**/api/research/correlation', async (r) => {
    const q = r.request().postDataJSON();
    expect(q.symbols).toEqual(stocks.map((s) => s.code));
    await r.fulfill({
      json: {
        symbols: stocks,
        start: q.start.replaceAll('-', ''),
        end: q.end.replaceAll('-', ''),
        dates: ['20260910', '20260911', '20260914', '20260915', '20260916', '20260917'],
        samples: 6,
        matrix: [
          [1, -0.75],
          [-0.75, 1],
        ],
        method: 'Pearson',
        warnings: [],
        coverage: stocks.map((s) => ({
          code: s.code,
          rows: 6,
          dataset_id: 'test-' + s.code,
          revision: 1,
        })),
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '数据研究', exact: true }).click();
  await page.getByRole('button', { name: '区间相关度分析', exact: true }).click();
  for (const s of stocks) {
    await page.getByLabel('搜索分析股票').fill(s.name);
    await page.locator('.correlation-results button').click();
  }
  await page.getByLabel('相关分析开始日期').fill('2026-09-01');
  await page.getByRole('button', { name: '计算相关矩阵', exact: true }).click();
  await expect(page.locator('.correlation-matrix')).toBeVisible();
  await page.getByRole('button', { name: '样本甲 与 样本乙：-0.750', exact: true }).click();
  await expect(page.locator('.correlation-detail')).toContainText('-0.7500');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出矩阵', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('correlation-20260901-20260922.csv');
  await page.getByLabel('相关分析开始日期').fill('2026-09-02');
  await expect(page.locator('.correlation-notice')).toContainText('选择已变化');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
