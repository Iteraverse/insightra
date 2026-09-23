import { test, expect } from '@playwright/test';
import { WidgetRefreshCoordinator } from '../src/lib/widgets/refresh';
import type { BoundDataset, RefreshState, Board, WidgetDefinition } from '../src/lib/widgets/types';

const dataset: BoundDataset = {
  id: 'refresh-data',
  name: '刷新测试快照',
  revision: 1,
  schema: 'ashare.snapshot.v1',
  updated_at: '2026-09-22T10:00:00Z',
  as_of: '20260922',
  source: '测试',
  read_only: true,
  data: [
    {
      ts_code: '000001.SZ',
      name: '样本公司',
      industry: '银行',
      trade_date: '20260922',
      close: 10,
      pct_chg: 1,
      amount: 1000,
      total_mv: 10000,
    },
  ],
};

test('independent clocks coalesce reads, retain failures, and stop after destruction', async () => {
  let now = 100_000,
    reads = 0,
    visible = true,
    fail = false;
  let current: Record<string, RefreshState> = {};
  const original = Date.now;
  Date.now = () => now;
  const coordinator = new WidgetRefreshCoordinator(
    async () => {
      reads++;
      if (fail) throw new Error('测试失败');
      return dataset;
    },
    (state) => (current = state),
    () => '',
    () => visible,
  );
  const flush = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  try {
    coordinator.configure([
      { id: 'fast', sourceId: dataset.id, interval: 15, kind: 'market-map' },
      { id: 'slow', sourceId: dataset.id, interval: 60, kind: 'market-map' },
    ]);
    await flush();
    expect(reads).toBe(1);
    expect(current.fast.completedAt).toBe(now);
    now += 15000;
    coordinator.tick();
    await flush();
    expect(reads).toBe(2);
    expect(current.slow.completedAt).toBe(100000);
    fail = true;
    now += 15000;
    coordinator.tick();
    await flush();
    expect(current.fast.error).toBe('测试失败');
    expect(current.fast.data).toEqual(dataset);
    expect(current.fast.completedAt).toBe(now);
    expect(current.slow.error).toBeUndefined();
    visible = false;
    now += 60000;
    coordinator.tick();
    await flush();
    expect(reads).toBe(3);
    visible = true;
    fail = false;
    coordinator.tick();
    await flush();
    expect(reads).toBe(4);
    expect(current.fast.error).toBeUndefined();
    expect(current.slow.completedAt).toBe(now);
    coordinator.destroy();
    now += 60000;
    coordinator.tick();
    await flush();
    expect(reads).toBe(4);
  } finally {
    coordinator.destroy();
    Date.now = original;
  }
});

test('widget settings persist full width and refresh interval with visible success, busy, and failure', async ({
  page,
  request,
}) => {
  let board: Board = {
    revision: 1,
    groups: [
      {
        id: 'g',
        title: '测试看板',
        widgets: [
          {
            id: 'refresh-widget',
            kind: 'market-map',
            sources: { market: dataset.id },
            size: 'wide',
            options: { area: 'total_mv' },
            refresh_seconds: 0,
          },
        ],
      },
    ],
  };
  const catalog = (await (await request.get('/api/widgets/catalog')).json())
    .widgets as WidgetDefinition[];
  for (const definition of catalog)
    definition.datasets = [
      {
        id: dataset.id,
        name: dataset.name,
        records: 1,
        revision: 1,
        compatible: definition.kind !== 'index-board',
        reason: '',
      },
    ];
  await page.route('**/api/widgets/catalog', (route) =>
    route.fulfill({ json: { widgets: catalog } }),
  );
  await page.route('**/api/widget-groups', (route) => route.fulfill({ json: { templates: [] } }));
  await page.route('**/api/boards/finance', async (route) => {
    if (route.request().method() === 'PUT')
      board = { ...route.request().postDataJSON(), revision: board.revision + 1 };
    await route.fulfill({ json: board });
  });
  let reads = 0,
    release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/datasets/refresh-data', async (route) => {
    reads++;
    if (reads === 2) {
      await gate;
      await route.fulfill({ status: 503, json: { detail: '测试刷新失败' } });
    } else await route.fulfill({ json: dataset });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '金融资产', exact: true }).click();
  const indicator = page.locator('.widget-refresh-state');
  await expect(indicator).toHaveAttribute('data-refresh-status', 'success');
  await expect(indicator.locator('time')).toHaveText(/\d{2}:\d{2}:\d{2}/);
  await page.getByRole('button', { name: 'A 股大盘云图设置', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'A 股大盘云图设置' })).toBeVisible();
  await page.getByLabel('A 股大盘云图刷新周期').selectOption('15');
  await page.getByLabel('A 股大盘云图尺寸').selectOption('full');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.locator('.widget-placement')).toHaveClass(/size-full/);
  const grid = (await page.locator('.widget-grid').boundingBox())!,
    card = (await page.locator('.widget-placement').boundingBox())!;
  expect(Math.abs(grid.width - card.width)).toBeLessThan(2);
  await page.getByRole('button', { name: '保存看板', exact: true }).click();
  expect(board.groups[0].widgets[0].refresh_seconds).toBe(15);
  expect(board.groups[0].widgets[0].size).toBe('full');
  await page.getByRole('button', { name: '刷新A 股大盘云图', exact: true }).click();
  await expect(indicator).toHaveAttribute('data-refresh-status', 'loading');
  await expect(indicator).toContainText('刷新中');
  await expect(page.locator('.cloud-canvas canvas')).toBeVisible();
  release();
  await expect(indicator).toHaveAttribute('data-refresh-status', 'failure');
  await expect(page.locator('.widget-error-note')).toContainText('测试刷新失败');
  const failureColor = await indicator
    .locator('i')
    .evaluate((e) => getComputedStyle(e).backgroundColor);
  await page.getByRole('button', { name: '刷新A 股大盘云图', exact: true }).click();
  await expect(indicator).toHaveAttribute('data-refresh-status', 'success');
  expect(
    await indicator.locator('i').evaluate((e) => getComputedStyle(e).backgroundColor),
  ).not.toBe(failureColor);
  const before = await page
    .locator('.cloud-canvas canvas')
    .evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await page.getByRole('button', { name: '打开外观设置' }).click();
  await page.getByRole('button', { name: /石墨深色/ }).click();
  await page.getByRole('button', { name: '关闭外观设置' }).click();
  await expect
    .poll(() =>
      page.locator('.cloud-canvas canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL()),
    )
    .not.toBe(before);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page.getByRole('button', { name: '金融资产', exact: true }).click();
  await page.getByRole('button', { name: 'A 股大盘云图设置', exact: true }).click();
  await expect(page.getByLabel('A 股大盘云图刷新周期')).toHaveValue('15');
  await expect(page.getByLabel('A 股大盘云图尺寸')).toHaveValue('full');
});
