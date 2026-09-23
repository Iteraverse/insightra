import { test, expect } from '@playwright/test';
import { analyzeTopology } from '../src/lib/network/topology';
import { initialLayout, cloneLayout } from '../src/lib/home-layout';

test('topology metrics count unique neighbors and normalize bridge scores', () => {
  const chain = analyzeTopology(
    ['d', 'b', 'a', 'c'],
    [
      { s: 'a', t: 'b' },
      { s: 'a', t: 'b' },
      { s: 'b', t: 'c' },
      { s: 'c', t: 'd' },
    ],
  );
  expect(chain.metrics.find((n) => n.id === 'b')?.degree).toBe(2);
  expect(chain.metrics.find((n) => n.id === 'b')?.bridge).toBeCloseTo(2 / 3);
  expect(chain.metrics.find((n) => n.id === 'a')?.bridge).toBe(0);
  expect(chain.pairs).toHaveLength(3);
  const star = analyzeTopology(
    ['c', 'a', 'b', 'd', 'e'],
    ['a', 'b', 'd', 'e'].map((t) => ({ s: 'c', t })),
  );
  expect(star.metrics.find((n) => n.id === 'c')?.bridge).toBeCloseTo(1);
  expect(
    analyzeTopology(
      ['a', 'b', 'c'],
      [
        { s: 'a', t: 'b' },
        { s: 'b', t: 'c' },
        { s: 'a', t: 'c' },
      ],
    ).metrics.every((n) => n.bridge === 0),
  ).toBe(true);
  expect(
    analyzeTopology(
      ['d', 'c', 'b', 'a'],
      [
        { s: 'c', t: 'd' },
        { s: 'b', t: 'c' },
        { s: 'a', t: 'b' },
      ],
    ).metrics,
  ).toEqual(chain.metrics);
});

test('whole-industry canvas retains every company and fixed coordinates while inspecting', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '产业网络', exact: true }).click();
  await expect(page.locator('.atlas-company')).toHaveCount(258, { timeout: 30000 });
  expect(await page.locator('.atlas-edges path').count()).toBeGreaterThan(680);
  const positions = () =>
    page
      .locator('.atlas-company')
      .evaluateAll((nodes) =>
        nodes.map((n) => [
          n.getAttribute('data-company'),
          n.getAttribute('data-x'),
          n.getAttribute('data-y'),
        ]),
      );
  const initial = await positions();
  await page.getByRole('textbox', { name: '搜索产业公司' }).fill('宁德时代');
  await page.locator('.supply-search-results button').first().click();
  await expect(page.locator('.supply-inspector h2')).toHaveText('宁德时代');
  await expect(page.locator('.atlas-company')).toHaveCount(258);
  await expect(page.locator('.atlas-edges path[marker-end]')).not.toHaveCount(0);
  await page.getByLabel('结构重要性指标').selectOption('bridge');
  expect(await positions()).toEqual(initial);
  await page.getByRole('button', { name: '放大网络', exact: true }).click();
  expect(await positions()).toEqual(initial);
  await page.getByRole('button', { name: '适配全行业', exact: true }).click();
  await page.getByRole('button', { name: '取消公司选择', exact: true }).click();
  await page.screenshot({ path: 'artifacts/atlas-verified.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('drag room floats above others, marks overlap red, rejects drop, and commits valid move', async ({
  page,
}) => {
  await page.route('**/api/home/layout', (route) =>
    route.fulfill({
      json: { layout: cloneLayout(initialLayout), saved_at: '2026-09-23T00:00:00Z' },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: '家庭环境', exact: true }).click();
  await page.getByRole('button', { name: '编辑家庭布局' }).click();
  const px = await page
    .locator('.editable-plan')
    .evaluate((e) => (e as SVGSVGElement).getScreenCTM()!.a * 50);
  const room = page.getByRole('button', { name: '选择房间 客厅', exact: true });
  const b = (await room.boundingBox())!;
  await page.mouse.move(b.x + 15, b.y + 15);
  await page.mouse.down();
  await page.mouse.move(b.x + 15 + px * 2, b.y + 15, { steps: 8 });
  await expect(page.locator('.drag-floating-layer')).toBeVisible();
  await expect(page.locator('.drag-placement-preview')).toHaveAttribute('data-valid', 'false');
  await expect(page.locator('.placement-feedback')).toContainText('不能放置');
  expect(
    await page
      .locator('.editable-plan')
      .evaluate(
        (svg) =>
          !!(
            svg
              .querySelector('.stationary-layout')!
              .compareDocumentPosition(svg.querySelector('.drag-floating-layer')!) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
  ).toBe(true);
  await page.screenshot({ path: 'artifacts/drag-invalid.png', fullPage: true });
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: '房间 X', exact: true })).toHaveValue('1');
  await expect(page.locator('.placement-status')).toContainText('已返回原位');
  const c = (await room.boundingBox())!;
  await page.mouse.move(c.x + 15, c.y + 15);
  await page.mouse.down();
  await page.mouse.move(c.x + 15 - px * 0.5, c.y + 15, { steps: 8 });
  await expect(page.locator('.drag-placement-preview')).toHaveAttribute('data-valid', 'true');
  await page.screenshot({ path: 'artifacts/drag-valid.png', fullPage: true });
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: '房间 X', exact: true })).toHaveValue('0.5');
  await page.getByRole('button', { name: '撤销布局修改', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: '房间 X', exact: true })).toHaveValue('1');
  const d = (await room.boundingBox())!;
  await page.mouse.move(d.x + 15, d.y + 15);
  await page.mouse.down();
  await page.mouse.move(d.x + 15 - px * 0.5, d.y + 15);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.drag-floating-layer')).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: '房间 X', exact: true })).toHaveValue('1');
});

test('solid furniture overlap has a red preview and reduced motion avoids pickup animation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/home/layout', (route) =>
    route.fulfill({ json: { layout: cloneLayout(initialLayout), saved_at: null } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: '家庭环境', exact: true }).click();
  await page.getByRole('button', { name: '编辑家庭布局' }).click();
  await page.getByRole('button', { name: '添加单椅', exact: true }).click();
  const original = await page.getByRole('spinbutton', { name: '家具 X', exact: true }).inputValue();
  const box = (await page.locator('.plan-furniture.furniture-selected').boundingBox())!;
  const target = await page.locator('.editable-plan').evaluate((svg) => {
    const element = svg as SVGSVGElement;
    const p = element.createSVGPoint();
    p.x = (1 + 0.7 + 0.35) * 50;
    p.y = (1 + 4 + 0.35) * 50;
    const result = p.matrixTransform(element.getScreenCTM()!);
    return { x: result.x, y: result.y };
  });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await expect(page.locator('.drag-placement-preview')).toHaveAttribute('data-valid', 'false');
  await expect(page.locator('.placement-feedback')).toContainText('家具重叠');
  expect(
    await page.locator('.drag-lift-content').evaluate((e) => getComputedStyle(e).animationName),
  ).toBe('none');
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: '家具 X', exact: true })).toHaveValue(original);
});
