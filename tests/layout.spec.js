import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test('keeps desktop actions inside the workspace and preserves panel layouts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();

  const workspace = await page.locator('.workspace').boundingBox();
  const actions = await page.locator('.workspace-actions').boundingBox();
  expect(actions.x + actions.width).toBeLessThanOrEqual(workspace.x + workspace.width + 1);

  await page.getByRole('group', { name: 'set task checkTravelPassExpiry' }).click();
  await expect(page.getByRole('heading', { name: 'set task' })).toBeVisible();
  await page.screenshot({ path: '/tmp/open-workflow-editor-inspector.png', fullPage: true });

  await page.getByRole('button', { name: 'Specification' }).click();
  await expect(page.locator('.spec-editor .cm-editor')).toBeVisible();
  await page.screenshot({ path: '/tmp/open-workflow-editor-specification.png', fullPage: true });
});

test('keeps the graph usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  await expect(page.locator('.react-flow__node')).toHaveCount(10);
  await expect(page.locator('.react-flow__minimap')).toBeHidden();
  await page.screenshot({ path: '/tmp/open-workflow-editor-mobile-final.png', fullPage: true });
});

test('fits branched graphs after auto layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole('listbox', { name: 'Saved workflows' })
    .locator('.library-item', { hasText: 'rta-vehicle-ownership-renewal' })
    .click();
  await page.getByRole('button', { name: 'Auto layout' }).click();
  await expect(page.getByRole('button', { name: 'Unlock layout' })).toBeVisible({ timeout: 8000 });

  const canvas = await page.locator('.canvas-shell').boundingBox();
  const nodes = await page.locator('.react-flow__node').evaluateAll((items) =>
    items.map((item) => {
      const rect = item.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }),
  );
  expect(canvas).not.toBeNull();
  for (const node of nodes) {
    expect(node.left).toBeGreaterThanOrEqual(canvas.x - 2);
    expect(node.right).toBeLessThanOrEqual(canvas.x + canvas.width + 2);
    expect(node.top).toBeGreaterThanOrEqual(canvas.y - 2);
    expect(node.bottom).toBeLessThanOrEqual(canvas.y + canvas.height + 2);
  }
});

test('keeps the operations rail readable at tablet width', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.reload();

  const workspace = await page.locator('.workspace').boundingBox();
  const rail = await page.locator('.right-rail').boundingBox();
  expect(rail.width).toBeGreaterThanOrEqual(320);
  expect(rail.x).toBeGreaterThan(workspace.x + workspace.width - 1);
  await expect(page.locator('.side-runtime-panel')).toBeVisible();
  await page.screenshot({ path: '/tmp/open-workflow-editor-tablet-rail.png', fullPage: true });
});

test('supports independent and all-side-panel collapse controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();

  await page.getByRole('button', { name: 'Collapse task palette' }).click();
  await expect(page.locator('.left-rail.left-rail-collapsed')).toBeVisible();
  await page.getByRole('button', { name: 'Expand task palette' }).click();
  await expect(page.locator('.left-rail.left-rail-collapsed')).toBeHidden();

  await page.getByRole('group', { name: 'set task checkTravelPassExpiry' }).click();
  await page.getByRole('button', { name: 'Collapse Inspector' }).click();
  await expect(page.locator('.inspector.inspector-collapsed')).toBeVisible();
  await page.getByRole('button', { name: 'Expand Inspector' }).click();

  await page.getByRole('button', { name: 'Collapse Runtime' }).click();
  await expect(page.locator('.side-runtime-panel')).toHaveClass(/runtime-panel-collapsed/);
  await page.getByRole('button', { name: 'Expand Runtime' }).click();
  await expect(page.locator('.side-runtime-panel')).not.toHaveClass(/runtime-panel-collapsed/);

  await page.getByRole('button', { name: 'Collapse all side panels' }).click();
  await expect(page.locator('.editor-layout.all-panels-collapsed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expand all side panels' })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: '/tmp/open-workflow-editor-focus-canvas.png', fullPage: true });
  await page.locator('.canvas-shell').screenshot({ path: '/tmp/open-workflow-editor-focus-canvas-only.png' });
  await page.getByRole('button', { name: 'Expand all side panels' }).click();
  await expect(page.locator('.editor-layout.all-panels-collapsed')).toBeHidden();
});

test('keeps the graph visible when entering Focus Canvas directly', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();

  await page.getByRole('button', { name: 'Collapse all side panels' }).click();
  await page.waitForTimeout(250);
  await expect(page.locator('.react-flow__node')).toHaveCount(10);
  await page.screenshot({ path: '/tmp/open-workflow-editor-focus-direct.png', fullPage: true });
});
