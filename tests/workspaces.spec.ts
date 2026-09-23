import { test, expect } from '@playwright/test';

test('research resource navigation and personal pages expose clear data states', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '研究工作台' })).toBeVisible();
  await expect(page.locator('.research-navigation')).toHaveCount(0);
  await page.getByRole('button', { name: /数据集/ }).click();
  await expect(page.getByRole('columnheader', { name: '记录数' })).toBeVisible();
  await page.getByRole('button', { name: /实验记录/ }).click();
  await expect(page.getByRole('heading', { name: '还没有实验运行' })).toBeVisible();
  await page.getByRole('button', { name: '健康记录', exact: true }).click();
  await page.getByRole('button', { name: '切换到我的数据' }).click();
  await expect(page.getByRole('heading', { name: '等待你的第一条健康记录' })).toBeVisible();
  await page.getByRole('button', { name: '家庭环境', exact: true }).click();
  await page.getByRole('button', { name: '选择房间 卧室', exact: true }).click();
  await expect(page.locator('.home-reading-panel h2')).toHaveText('卧室');
  expect(errors).toEqual([]);
});

test('settings masks credentials and reports endpoint failures without claiming success', async ({
  page,
}) => {
  await page.route('**/api/settings', (route) =>
    route.fulfill({
      json: {
        variables: [
          { key: 'TUSHARE_TOKEN', configured: true, masked: '••••••••', source: 'local' },
          { key: 'BINANCE_API_KEY', configured: false, masked: '', source: 'local' },
          { key: 'BINANCE_API_SECRET', configured: false, masked: '', source: 'local' },
        ],
      },
    }),
  );
  await page.route('**/api/connections', (route) => route.fulfill({ json: { checks: [] } }));
  await page.route('**/api/connections/tushare/test?*', (route) =>
    route.fulfill({
      json: {
        ok: false,
        status: 'permission_denied',
        message: '当前接口权限不足（测试响应）',
        api_name: 'trade_cal',
        latency_ms: 123,
        checked_at: '2026-09-22T10:00:00Z',
        rows: [],
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: '数据连接', exact: true }).click();
  await expect(page.locator('#TUSHARE_TOKEN')).toHaveValue('');
  await page.getByRole('button', { name: '检验接口', exact: true }).click();
  await expect(page.locator('.check-result')).toContainText('接口权限不足');
  await expect(page.locator('.data-table')).toContainText('失败');
  await page.screenshot({ path: 'artifacts/settings-test.png', fullPage: true });
});

test('local document import, chunk inspection and deletion round-trip', async ({
  page,
  request,
}) => {
  const name = `界面测试-${Date.now()}.md`;
  let id: string | undefined;
  try {
    await page.goto('/');
    await page.getByRole('button', { name: '知识空间', exact: true }).click();
    await page.screenshot({ path: 'artifacts/knowledge.png', fullPage: true });
    await page.locator('input[type=file]').setInputFiles({
      name,
      mimeType: 'text/markdown',
      buffer: Buffer.from(
        '# 测试文档\n' + '用于验证本地知识库导入、分块与回溯。'.repeat(60) + name,
      ),
    });
    await expect(page.locator('.message.success')).toContainText('已导入 1 份文档');
    const response = await request.get('/api/documents');
    id = (await response.json()).documents.find((d: { name: string }) => d.name === name)?.id;
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('片段 01', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '删除文档', exact: true }).click();
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(page.locator('.message.success')).toContainText('文档及其本地分块已删除');
    id = undefined;
  } finally {
    if (!id) {
      const remaining = await request.get('/api/documents');
      id = (await remaining.json()).documents.find(
        (doc: { name: string }) => doc.name === name,
      )?.id;
    }
    if (id) await request.delete(`/api/documents/${id}`);
  }
});

test('new workspaces fit mobile widths and market uses real cached data or an explicit error', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '金融资产', exact: true }).click();
  await expect(page.locator('.market-dashboard')).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: 'artifacts/finance.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['概览', '知识空间', '家庭环境', '数据连接']) {
    await page.getByRole('button', { name: '打开导航' }).click();
    await page.getByRole('button', { name, exact: true }).click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      name,
    ).toBe(true);
  }
});
