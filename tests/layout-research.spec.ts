import { test, expect } from '@playwright/test';
import { initialLayout, cloneLayout, type HomeLayout } from '../src/lib/home-layout';

test('home editor changes dimensions, drags furniture, undo, saves, and restores', async ({
  page,
}) => {
  let stored: HomeLayout | null = null;
  await page.route('**/api/home/layout', async (route) => {
    if (route.request().method() === 'PUT') stored = route.request().postDataJSON();
    await route.fulfill({
      json: { layout: stored, saved_at: stored ? '2026-09-23T00:00:00Z' : null },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '家庭环境', exact: true }).click();
  await page.getByRole('button', { name: '编辑家庭布局' }).click();
  const width = page.getByRole('spinbutton', { name: '房间宽度', exact: true });
  await width.fill('4.8');
  await width.press('Tab');
  await expect(width).toHaveValue('4.8');
  await page.getByRole('button', { name: '添加沙发', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: '家具宽度', exact: true })).toHaveValue('2.2');
  await page.getByRole('button', { name: '旋转 90°' }).click();
  await expect(page.getByRole('spinbutton', { name: '家具宽度', exact: true })).toHaveValue('0.9');
  await page.getByRole('button', { name: '撤销布局修改' }).click();
  await expect(page.getByRole('spinbutton', { name: '家具宽度', exact: true })).toHaveValue('2.2');
  const selected = page.locator('.plan-furniture.furniture-selected');
  const box = (await selected.boundingBox())!;
  const before = await page.getByRole('spinbutton', { name: '家具 X', exact: true }).inputValue();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('spinbutton', { name: '家具 X', exact: true })).not.toHaveValue(
    before,
  );
  await page.getByRole('button', { name: '选择房间 客厅', exact: true }).focus();
  await page.keyboard.press('Enter');
  const handle = page.locator('[data-resize="living"]');
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 - 5, h.y + h.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByRole('textbox', { name: '房间名称', exact: true })).toHaveValue('客厅');
  await expect(width).not.toHaveValue('4.8');
  expect(Number(await width.inputValue())).toBeLessThan(4.8);
  await page.screenshot({ path: 'artifacts/home-editor.png', fullPage: true });
  await page.getByRole('button', { name: '保存布局', exact: true }).click();
  await expect(page.locator('.message.success')).toContainText('布局已保存');
  expect(stored!.furniture.length).toBe(initialLayout.furniture.length + 1);
  await page.reload();
  await page.getByRole('button', { name: '家庭环境', exact: true }).click();
  await expect(page.getByText('已保存的家庭布局', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '编辑家庭布局' }).click();
  await expect(width).toHaveValue(String(stored!.rooms[0].width));
  await page.getByRole('button', { name: '添加房间', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '房间名称', exact: true })).toHaveValue('新房间');
  await page.getByRole('button', { name: '取消编辑', exact: true }).click();
  expect(stored!.rooms.length).toBe(4);
});

test('invalid layout blocks save and mobile editor does not overflow', async ({ page }) => {
  await page.route('**/api/home/layout', (route) =>
    route.fulfill({
      json: { layout: cloneLayout(initialLayout), saved_at: '2026-09-23T00:00:00Z' },
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('button', { name: '家庭环境', exact: true }).click();
  await page.getByRole('button', { name: '编辑家庭布局' }).click();
  const width = page.getByRole('spinbutton', { name: '房间宽度', exact: true });
  await width.fill('9');
  await width.press('Tab');
  await expect(page.locator('.layout-validation')).toContainText('重叠');
  await expect(page.getByRole('button', { name: '保存布局', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '取消编辑', exact: true }).click();
});

test('research project notes persist and can be found in the project list', async ({
  page,
  request,
}) => {
  const name = `research-ui-${Date.now()}`;
  let id: string | undefined;
  try {
    await page.goto('/');
    await page.getByRole('button', { name: '新建研究', exact: true }).click();
    await page.getByRole('textbox', { name: '研究名称', exact: true }).fill(name);
    await page
      .getByRole('textbox', { name: '假设与验证范围', exact: true })
      .fill('验证行业动量，明确样本与可用时点。');
    await page.getByRole('button', { name: '保存研究', exact: true }).click();
    await expect(page.locator('.message.success')).toContainText('研究草稿已保存');
    await page.reload();
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.getByRole('textbox', { name: '假设与验证范围', exact: true })).toHaveValue(
      '验证行业动量，明确样本与可用时点。',
    );
    await page.screenshot({ path: 'artifacts/research-project.png', fullPage: true });
  } finally {
    const p = await request.get('/api/research/projects');
    id = (await p.json()).projects.find((p: { name: string }) => p.name === name)?.id;
    if (id) await request.delete(`/api/research/projects/${id}`);
  }
});
