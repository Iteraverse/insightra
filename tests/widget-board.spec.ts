import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import type {
  Board,
  WidgetDefinition,
  BoundDataset,
  GroupTemplate,
} from '../src/lib/widgets/types';

const market: BoundDataset = {
  id: 'test-market',
  name: '测试A股快照',
  schema: 'ashare.snapshot.v1',
  read_only: true,
  revision: 1,
  as_of: '20260922',
  updated_at: '2026-09-22T10:00:00Z',
  source: '测试',
  warnings: [],
  data: Array.from({ length: 12 }, (_, i) => ({
    ts_code: `0000${String(i).padStart(2, '0')}.SZ`,
    name: `样本${i + 1}`,
    industry: i < 6 ? '银行' : '医药',
    trade_date: '20260922',
    close: 10 + i,
    pct_chg: i - 5,
    amount: 1e8 + i * 1e7,
    total_mv: 1e10 + i * 1e9,
  })),
};
async function harness(page: Page, request: APIRequestContext, initial?: Board) {
  let board: Board = initial ?? { revision: 0, groups: [] };
  let templates: GroupTemplate[] = [];
  let reads = 0;
  const actual = (await (await request.get('/api/widgets/catalog')).json())
    .widgets as WidgetDefinition[];
  const definitions = actual.map((d) => ({
    ...d,
    datasets: [
      {
        id: market.id,
        name: market.name,
        revision: 1,
        records: 12,
        compatible: d.schema === market.schema,
        reason: '数据口径不匹配',
        read_only: true,
      },
    ],
  }));
  await page.route('**/api/widgets/catalog', (route) =>
    route.fulfill({ json: { widgets: definitions } }),
  );
  await page.route('**/api/boards/finance', async (route) => {
    if (route.request().method() === 'PUT') {
      const data = route.request().postDataJSON();
      board = { ...data, revision: board.revision + 1 };
    }
    await route.fulfill({ json: board });
  });
  await page.route('**/api/widget-groups', async (route) => {
    if (route.request().method() === 'POST') {
      const value = {
        id: `template-${templates.length + 1}`,
        group: route.request().postDataJSON(),
        created_at: '2026-09-22T10:00:00Z',
      };
      templates.push(value);
      await route.fulfill({ json: value });
    } else await route.fulfill({ json: { templates } });
  });
  await page.route('**/api/datasets/test-market', (route) => {
    reads++;
    return route.fulfill({ json: market });
  });
  return { board: () => board, reads: () => reads, definitions, templates: () => templates };
}

test('source-bound widgets can be grouped, moved, saved as templates and restored', async ({
  page,
  request,
}) => {
  const h = await harness(page, request);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '金融资产', exact: true }).click();
  await page.getByRole('button', { name: '添加第一个组件' }).click();
  await expect(page.getByRole('dialog', { name: '小组件库' })).toBeVisible();
  await expect(page.getByLabel('组件数据源')).toHaveValue('test-market');
  await page.getByRole('button', { name: '添加组件', exact: true }).click();
  await expect(page.locator('.cloud-canvas canvas')).toBeVisible();
  await expect(page.locator('.market-widget-group')).toHaveCount(1);
  await page.getByRole('button', { name: '保存编组', exact: true }).click();
  await expect(page.locator('.board-inline-message')).toContainText('已保存到编组库');
  await page.getByRole('button', { name: '添加小组件', exact: true }).click();
  await page.getByRole('button', { name: /已保存编组/ }).click();
  await page.getByRole('button', { name: '整体添加', exact: true }).click();
  await expect(page.locator('.market-widget-group')).toHaveCount(2);
  expect(h.reads()).toBe(1);
  const first = (await page.locator('.market-widget-group').nth(0).getAttribute('data-group'))!;
  const second = (await page.locator('.market-widget-group').nth(1).getAttribute('data-group'))!;
  const group2 = page.locator(`[data-group="${second}"]`);
  await group2.getByRole('textbox', { name: '编组名称 2' }).fill('对照观察');
  await group2.getByRole('textbox').press('Tab');
  await group2
    .getByRole('button', { name: '拖动编组 对照观察' })
    .dragTo(page.locator(`[data-group="${first}"] .widget-group-heading`));
  await expect(page.locator('.market-widget-group').first()).toHaveAttribute('data-group', second);
  await page.getByRole('button', { name: '下移编组 对照观察' }).click();
  await page.getByRole('button', { name: '上移编组 对照观察' }).click();
  await expect(page.locator('.market-widget-group').first()).toHaveAttribute('data-group', second);
  const group1 = page.locator(`[data-group="${first}"]`);
  await group1.getByRole('button', { name: 'A 股大盘云图设置', exact: true }).click();
  await page.getByLabel('云图面积指标').selectOption('amount');
  await page.getByRole('button', { name: '通用设置', exact: true }).click();
  await page.getByLabel('A 股大盘云图移动到编组').selectOption(second);
  await expect(group2.locator('.market-widget')).toHaveCount(2);
  await group1.getByRole('button', { name: '删除编组 市场观察' }).click();
  await group1.getByRole('button', { name: '确认删除编组' }).click();
  await page.getByRole('button', { name: '保存看板', exact: true }).click();
  await expect(page.locator('.board-inline-message')).toContainText('看板编组');
  expect(h.board().groups).toHaveLength(1);
  expect(h.board().groups[0].widgets).toHaveLength(2);
  expect(new Set(h.board().groups[0].widgets.map((w) => w.id)).size).toBe(2);
  await page.reload();
  await page.getByRole('button', { name: '金融资产', exact: true }).click();
  await expect(page.getByRole('heading', { name: '对照观察', exact: true })).toBeVisible();
  await expect(page.locator('.market-widget')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('widget library blocks an incompatible data source', async ({ page, request }) => {
  await harness(page, request);
  await page.goto('/');
  await page.getByRole('button', { name: '金融资产', exact: true }).click();
  await page.getByRole('button', { name: '添加第一个组件' }).click();
  await page.locator('.widget-kind-list button').filter({ hasText: '核心指数' }).click();
  await expect(page.getByRole('button', { name: '添加组件', exact: true })).toBeDisabled();
  await expect(page.locator('.dependency-missing')).toContainText('还没有满足字段要求');
});

test('widget loading keeps its frame and refresh failure keeps last successful data', async ({
  page,
  request,
}) => {
  const board: Board = {
    revision: 1,
    groups: [
      {
        id: 'g1',
        title: '加载测试',
        widgets: [
          {
            id: 'w1',
            kind: 'market-map',
            sources: { market: 'test-market' },
            size: 'wide',
            options: { area: 'total_mv' },
          },
        ],
      },
    ],
  };
  await harness(page, request, board);
  let release!: () => void;
  const hold = new Promise<void>((r) => (release = r));
  let count = 0;
  await page.route('**/api/datasets/test-market', async (route) => {
    count++;
    if (count === 1) {
      await hold;
      await route.fulfill({ json: market });
    } else await route.fulfill({ status: 503, json: { detail: '测试刷新失败' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '金融资产', exact: true }).click();
  await expect(page.locator('.market-widget .loading-surface')).toBeVisible();
  const before = (await page.locator('.market-widget').boundingBox())!;
  release();
  await expect(page.locator('.cloud-canvas canvas')).toBeVisible();
  await page.waitForTimeout(350);
  const after = (await page.locator('.market-widget').boundingBox())!;
  expect(Math.abs(after.height - before.height)).toBeLessThan(4);
  await page.getByRole('button', { name: '刷新全部' }).click();
  await expect(page.locator('.widget-error-note')).toContainText('测试刷新失败');
  await expect(page.locator('.cloud-canvas canvas')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('industry loading reserves its canvas and fades into a complete topology', async ({
  page,
  request,
}) => {
  const record = await (await request.get('/api/datasets/industry-chain')).json();
  let release!: () => void;
  const hold = new Promise<void>((r) => (release = r));
  await page.route('**/api/datasets/industry-chain', async (route) => {
    await hold;
    await route.fulfill({ json: record });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '产业网络', exact: true }).click();
  await expect(page.locator('.supply-main .loading-surface')).toBeVisible();
  const before = (await page.locator('.supply-workbench').boundingBox())!;
  release();
  await expect(page.locator('.atlas-company')).toHaveCount(258);
  const after = (await page.locator('.supply-workbench').boundingBox())!;
  expect(Math.abs(after.height - before.height)).toBeLessThan(4);
});

test('cold skeleton stays inside dashboard and warm reentry shows cached data while requests wait', async ({
  page,
  request,
}) => {
  const board: Board = {
    revision: 1,
    groups: [
      {
        id: 'cache-group',
        title: '缓存测试',
        widgets: [
          {
            id: 'cache-widget',
            kind: 'market-map',
            sources: { market: market.id },
            size: 'wide',
            options: { area: 'total_mv' },
          },
        ],
      },
    ],
  };
  await harness(page, request, board);
  let release!: () => void;
  let gate = new Promise<void>((r) => (release = r));
  await page.route('**/api/boards/finance', async (route) => {
    await gate;
    await route.fulfill({ json: board });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '金融资产', exact: true }).click();
  await expect(page.locator('.dashboard-skeleton')).toBeVisible();
  const main = (await page.locator('.market-dashboard').boundingBox())!;
  for (const box of await page.locator('.dashboard-skeleton > .loading-surface').all()) {
    const rect = (await box.boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(main.x);
    expect(rect.x + rect.width).toBeLessThanOrEqual(main.x + main.width + 1);
  }
  release();
  await expect(page.locator('.cloud-canvas canvas')).toBeVisible();
  await expect(page.locator('.widget-refresh-state')).toHaveAttribute(
    'data-refresh-status',
    'success',
  );
  gate = new Promise<void>((r) => (release = r));
  await page.route('**/api/datasets/test-market', async (route) => {
    await gate;
    await route.fulfill({ status: 503, json: { detail: '离线检查' } });
  });
  await page.reload();
  await page.getByRole('button', { name: '金融资产', exact: true }).click();
  await expect(page.locator('.cloud-canvas canvas')).toBeVisible();
  await expect(page.locator('.dashboard-skeleton')).toHaveCount(0);
  await expect(page.locator('.widget-refresh-state')).toHaveAttribute(
    'data-refresh-status',
    'loading',
  );
  await page.getByRole('button', { name: '放大A 股大盘云图', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'A 股大盘云图放大浏览' });
  await expect(viewer.locator('canvas')).toBeVisible();
  await viewer.getByLabel('云图行业').selectOption('银行');
  await expect(viewer.locator('canvas')).toHaveAttribute('aria-label', /6家公司/);
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(page.getByRole('button', { name: '放大A 股大盘云图', exact: true })).toBeFocused();
  release();
  await expect(page.locator('.widget-error-note')).toContainText('离线检查');
  await expect(page.locator('.cloud-canvas canvas')).toBeVisible();
});

test('fuzzy widget search adds watchlist and persists chosen stocks; ranking is available', async ({
  page,
  request,
}) => {
  const h = await harness(page, request);
  await page.goto('/');
  await page.getByRole('button', { name: '金融资产', exact: true }).click();
  await page.getByRole('button', { name: '添加小组件', exact: true }).click();
  await page.getByLabel('搜索小组件').fill('自股');
  await expect(page.locator('.widget-kind-list > button')).toHaveCount(1);
  await page.locator('.widget-kind-list > button').click();
  await page.getByRole('button', { name: '添加组件', exact: true }).click();
  await expect(page.getByLabel('搜索股票')).toHaveCount(0);
  await page.getByRole('button', { name: '自选股观察设置', exact: true }).click();
  await page.getByLabel('搜索股票').fill('样本1');
  await page.locator('.stock-results button').first().click();
  await page.getByLabel('搜索股票').fill('');
  await expect(page.getByRole('button', { name: '移除自选 样本1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.getByRole('button', { name: '移除自选 样本1', exact: true })).toHaveCount(0);
  await expect(page.locator('.stock-table-scroll tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '保存看板', exact: true }).click();
  expect(h.board().groups[0].widgets[0].options.symbols).toEqual(['000000.SZ']);
  await page.reload();
  await page.getByRole('button', { name: '金融资产', exact: true }).click();
  await expect(page.locator('.stock-table-scroll')).toContainText('样本1');
  await page.getByRole('button', { name: '添加小组件', exact: true }).click();
  await page.getByLabel('搜索小组件').fill('涨成排');
  await page.locator('.widget-kind-list > button').click();
  await page.getByRole('button', { name: '添加组件', exact: true }).click();
  await page.getByLabel('排行指标').selectOption('down');
  await expect(page.locator('.widget-market-movers tbody tr').first()).toContainText('样本1');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('full width indices fit their content without a blank lower half', async ({
  page,
  request,
}) => {
  const board: Board = {
    revision: 1,
    groups: [
      {
        id: 'ig',
        title: '指数',
        widgets: [
          {
            id: 'iw',
            kind: 'index-board',
            sources: { indices: 'index-test' },
            size: 'full',
            options: { area: 'total_mv' },
          },
        ],
      },
    ],
  };
  await harness(page, request, board);
  const indices: BoundDataset = {
    ...market,
    id: 'index-test',
    schema: 'index.daily.v1',
    data: Array.from({ length: 4 }, (_, i) => ({
      ts_code: `00000${i}.SH`,
      name: `测试指数${i}`,
      trade_date: '20260922',
      close: 3000 + i,
      pct_chg: 1,
    })),
  };
  await page.route('**/api/datasets/index-test', (r) => r.fulfill({ json: indices }));
  await page.goto('/');
  await page.getByRole('button', { name: '金融资产', exact: true }).click();
  await expect(page.locator('.index-tile')).toHaveCount(4);
  const body = (await page.locator('.widget-index-board .widget-body').boundingBox())!;
  const grid = (await page.locator('.index-board-widget').boundingBox())!;
  expect(body.height - grid.height).toBeLessThan(8);
});

test('watchlist size controls information depth and independent settings panels', async ({
  page,
  request,
}) => {
  const board: Board = {
    revision: 1,
    groups: [
      {
        id: 'detail',
        title: '详细',
        widgets: [
          {
            id: 'detail-stock',
            kind: 'watchlist',
            sources: { market: market.id },
            size: 'small',
            options: { area: 'total_mv', symbols: ['000000.SZ'], trend_days: 10 },
          },
        ],
      },
    ],
  };
  await harness(page, request, board);
  const enriched = {
    ...market,
    data: market.data.map((row) => ({
      ...row,
      open: 9,
      high: 12,
      low: 8,
      vol: 12000,
      history: Array.from({ length: 10 }, (_, i) => ({
        trade_date: `202609${String(i + 10).padStart(2, '0')}`,
        close: 9 + i / 10,
        vol: 10000 + i * 500,
      })),
    })),
  };
  await page.route('**/api/datasets/test-market', (r) => r.fulfill({ json: enriched }));
  await page.goto('/');
  await page.getByRole('button', { name: '金融资产', exact: true }).click();
  await expect(page.locator('.stock-table-scroll')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '最高', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '自选股观察设置', exact: true }).click();
  await expect(page.getByLabel('搜索股票')).toBeVisible();
  await expect(page.getByRole('radio', { name: '大 · 2/3 行', exact: true })).toBeHidden();
  await page.getByLabel('走势交易日数').selectOption('5');
  await page.getByRole('button', { name: '通用设置', exact: true }).click();
  await expect(page.getByLabel('搜索股票')).toBeHidden();
  await page.getByRole('radio', { name: '大 · 2/3 行', exact: true }).check();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: '最高', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '成交量', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '5 日走势', exact: true })).toBeVisible();
  await expect(page.locator('.stock-trend-cell svg')).toHaveAttribute('aria-label', /5 个交易日/);
  await page.getByRole('button', { name: '保存看板', exact: true }).click();
});

test('cloud hover follows pointer, highlights stock, pins, and dismisses without crosshair', async ({
  page,
  request,
}) => {
  const board: Board = {
    revision: 1,
    groups: [
      {
        id: 'hover-group',
        title: '悬停',
        widgets: [
          {
            id: 'hover-widget',
            kind: 'market-map',
            sources: { market: market.id },
            size: 'full',
            options: { area: 'total_mv' },
          },
        ],
      },
    ],
  };
  await harness(page, request, board);
  await page.goto('/');
  await page.getByRole('button', { name: '金融资产', exact: true }).click();
  const canvas = page.locator('.cloud-canvas canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + 70);
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('收盘');
  await expect(tooltip).toContainText('成交额');
  await expect(page.locator('.cloud-hover-outline')).toBeVisible();
  expect(await canvas.evaluate((e) => getComputedStyle(e).cursor)).toBe('pointer');
  const before = (await tooltip.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2 + 18, box.y + 76);
  const after = (await tooltip.boundingBox())!;
  expect(after.x).not.toBe(before.x);
  const viewport = page.viewportSize()!;
  expect(after.x).toBeGreaterThanOrEqual(0);
  expect(after.x + after.width).toBeLessThanOrEqual(viewport.width);
  expect(after.y + after.height).toBeLessThanOrEqual(viewport.height);
  await page.mouse.down();
  await page.mouse.up();
  await page.mouse.move(10, 10);
  await expect(tooltip).toContainText('已固定');
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await page.mouse.move(box.x + 20, box.y + 50);
  await expect(tooltip).toBeVisible();
  await page.mouse.move(10, 10);
  await expect(tooltip).toHaveCount(0);
});
