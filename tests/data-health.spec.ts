import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('CSV visual edits preserve codes, add rows, persist, and export', async ({
  page,
  request,
}) => {
  const name = `csv-editor-${Date.now()}.csv`;
  let id: string | undefined;
  try {
    await page.goto('/');
    await page.getByRole('button', { name: '数据管理', exact: true }).click();
    await expect(page.locator('.dataset-title h2')).toContainText('产业网络');
    await page.getByLabel('导入结构化数据').setInputFiles({
      name,
      mimeType: 'text/csv',
      buffer: Buffer.from('code,note\n001,"hello, world"\n002,test\n'),
    });
    await expect(page.locator('.dataset-title h2')).toHaveText(name);
    const input = page.getByRole('textbox', { name: '第1行 code', exact: true });
    await expect(input).toHaveValue('001');
    await input.fill('003');
    await input.press('Tab');
    await page.getByRole('button', { name: '添加行', exact: true }).click();
    await page.getByRole('textbox', { name: '第3行 code', exact: true }).fill('009');
    await page.getByRole('textbox', { name: '第3行 note', exact: true }).fill('新增记录');
    await page.getByRole('textbox', { name: '第3行 note', exact: true }).press('Tab');
    await page.getByRole('button', { name: '保存数据', exact: true }).click();
    await expect(page.locator('.message.success')).toContainText('已保存版本 v2');
    await page.getByLabel('导出格式').selectOption('csv');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出', exact: true }).click();
    const download = await downloadPromise;
    const text = await readFile((await download.path())!, 'utf8');
    expect(text).toContain('003,"hello, world"');
    expect(text).toContain('009,新增记录');
    await page.screenshot({ path: 'artifacts/data-csv.png', fullPage: true });
  } finally {
    const data = await request.get('/api/datasets');
    id = (await data.json()).datasets.find((d: { name: string }) => d.name === name)?.id;
    if (id) await request.delete(`/api/datasets/${id}`);
  }
});

test('JSON tree edits nested values and source errors are recoverable', async ({
  page,
  request,
}) => {
  const name = `json-editor-${Date.now()}.json`;
  let id: string | undefined;
  try {
    await page.goto('/');
    await page.getByRole('button', { name: '数据管理', exact: true }).click();
    await expect(page.locator('.dataset-title h2')).toBeVisible();
    await page.getByLabel('导入结构化数据').setInputFiles({
      name,
      mimeType: 'application/json',
      buffer: Buffer.from('{"profile":{"name":"原名","active":true},"values":[1,2]}'),
    });
    await expect(page.locator('.dataset-title h2')).toHaveText(name);
    await page.getByRole('button', { name: 'JSON 树', exact: true }).click();
    await page.getByRole('button', { name: '展开 profile', exact: true }).click();
    await page.getByRole('textbox', { name: '编辑 profile.name', exact: true }).fill('更新名称');
    await page.getByRole('textbox', { name: '编辑 profile.name', exact: true }).press('Tab');
    await page.getByRole('button', { name: '保存数据', exact: true }).click();
    await expect(page.locator('.message.success')).toContainText('v2');
    await page.getByRole('button', { name: '源码', exact: true }).click();
    await page.getByRole('textbox', { name: 'JSON 源码' }).fill('{bad');
    await page.getByRole('button', { name: '解析并检查 JSON' }).click();
    await expect(page.locator('.message.error')).toContainText('JSON 解析失败');
    await page.getByRole('textbox', { name: 'JSON 源码' }).fill('{"fixed":true}');
    await page.getByRole('button', { name: '保存数据', exact: true }).click();
    await expect(page.locator('.message.success')).toContainText('v3');
  } finally {
    const data = await request.get('/api/datasets');
    id = (await data.json()).datasets.find((d: { name: string }) => d.name === name)?.id;
    if (id) await request.delete(`/api/datasets/${id}`);
  }
});

test('editing industry records updates the network using the shared dataset', async ({
  page,
  request,
}) => {
  let record = await (await request.get('/api/datasets/industry-chain')).json();
  await page.route('**/api/datasets/industry-chain', async (route) => {
    if (route.request().method() === 'PUT') {
      record = {
        ...record,
        data: route.request().postDataJSON().data,
        revision: record.revision + 1,
      };
    }
    await route.fulfill({ json: record });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '数据管理', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '第1行 n', exact: true })).toHaveValue('万华化学');
  await page.getByRole('textbox', { name: '第1行 n', exact: true }).fill('万华测试名称');
  await page.getByRole('textbox', { name: '第1行 n', exact: true }).press('Tab');
  await page.getByRole('button', { name: '保存数据', exact: true }).click();
  await expect(page.locator('.message.success')).toContainText('已保存版本');
  await page.getByRole('button', { name: '数据研究', exact: true }).click();
  await page.getByRole('button', { name: '产业网络', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索产业公司' }).fill('万华测试');
  await expect(
    page.locator('.supply-search-results button').filter({ hasText: '万华测试名称' }),
  ).toBeVisible();
});

test('room selection outline renders above every room and furniture', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '家庭环境', exact: true }).click();
  await page
    .getByRole('button', { name: '选择房间 客厅', exact: true })
    .click({ position: { x: 15, y: 15 } });
  expect(
    await page.locator('.editable-plan').evaluate((svg) => {
      const selected = svg.querySelector('.room-selection-overlay')!;
      return [...svg.querySelectorAll('.plan-room,.plan-furniture')].every(
        (element) =>
          !!(element.compareDocumentPosition(selected) & Node.DOCUMENT_POSITION_FOLLOWING),
      );
    }),
  ).toBe(true);
  await expect(page.locator('.room-selection-overlay')).toHaveAttribute('pointer-events', 'none');
  await page.screenshot({ path: 'artifacts/home-edge-fixed.png', fullPage: true });
});

test('health journal daily selection and new workspaces fit small screens', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '健康记录', exact: true }).click();
  await page.getByRole('button', { name: '查看第5天记录', exact: true }).click();
  await expect(page.locator('.health-day-detail')).toContainText('DAY 05');
  await page.screenshot({ path: 'artifacts/health-journal.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('button', { name: '数据管理', exact: true }).click();
  await expect(page.locator('.dataset-title h2')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
