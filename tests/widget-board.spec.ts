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
