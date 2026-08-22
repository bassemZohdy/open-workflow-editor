import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

// ---------------------------------------------------------------------------
// Helper to replace the whole specification text inside CodeMirror.
// ---------------------------------------------------------------------------

async function setSpecText(page, text) {
  await page.waitForFunction(() => Boolean(window.__specEditorView));
  await page.evaluate((value) => {
    const view = window.__specEditorView;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, text);
}

/** Asserts against the full editor document (CodeMirror virtualizes its DOM). */
async function expectSpecToContain(page, text) {
  await expect
    .poll(
      () =>
        page.evaluate(() => (window.__specEditorView ? window.__specEditorView.state.doc.toString() : '')),
      {
        timeout: 8000,
      },
    )
    .toContain(text);
}

// ---------------------------------------------------------------------------
// Task 1: Code editor for the Specification view
// ---------------------------------------------------------------------------

test('specification view renders a CodeMirror editor with gutter and inline diagnostics', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Specification' }).click();
  await expect(page.locator('.spec-editor .cm-editor')).toBeVisible();
  await expect(page.locator('.spec-editor .cm-gutters')).toBeVisible();
  await expect(page.locator('.spec-editor .cm-lineNumbers')).toBeVisible();

  // Break the YAML and confirm an inline lint diagnostic appears (debounced).
  const content = page.locator('.spec-editor .cm-content');
  await content.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\ndo: [unclosed');
  await expect(page.locator('.spec-editor .cm-lint-marker-error')).toBeVisible({ timeout: 8000 });
});

test('code editor keeps save / undo shortcuts working in the specification view', async ({ page }) => {
  await page.getByRole('button', { name: 'Specification' }).click();
  await setSpecText(
    page,
    `document:
  dsl: "1.0.3"
  namespace: default
  name: undo-demo
  version: "0.1.0"
do:
  - firstTask:
      set:
        ok: true`,
  );
  const content = page.locator('.spec-editor .cm-content');
  await expectSpecToContain(page, 'undo-demo');
  await content.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n  - secondTask:\n      set:\n        ok: true');
  await expectSpecToContain(page, 'secondTask');
  await page.keyboard.press('Control+z');
  await expect
    .poll(
      () =>
        page.evaluate(() => (window.__specEditorView ? window.__specEditorView.state.doc.toString() : '')),
      {
        timeout: 8000,
      },
    )
    .not.toContain('secondTask');
});

// ---------------------------------------------------------------------------
// Task 2: Command palette
// ---------------------------------------------------------------------------

test('command palette opens with Ctrl+Shift+P and runs a command', async ({ page }) => {
  await page.keyboard.press('Control+Shift+P');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.palette-input')).toBeFocused();
  await page.keyboard.type('auto layout');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
});

test('command palette can add a task', async ({ page }) => {
  await page.keyboard.press('Control+Shift+P');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await expect(dialog).toBeVisible();
  await page.keyboard.type('Add Wait task');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('group', { name: 'wait task waitTask' })).toBeVisible({ timeout: 8000 });
});

// ---------------------------------------------------------------------------
// Task 3: Quick open
// ---------------------------------------------------------------------------

test('quick open lists library workflows and switches to the selected one', async ({ page }) => {
  await page.keyboard.press('Control+p');
  const dialog = page.getByRole('dialog', { name: 'Quick open workflow' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.palette-command').first()).toBeVisible();
  await page.keyboard.type('rta-vehicle');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.workflow-name-input')).toHaveValue('rta-vehicle-ownership-renewal');
});

// ---------------------------------------------------------------------------
// Accordions: left-rail sections & right-rail panel heads
// ---------------------------------------------------------------------------

test('left rail accordion sections collapse, persist, and auto-minimize the rail', async ({ page }) => {
  const library = page.getByRole('listbox', { name: 'Saved workflows' });
  await expect(library).toBeVisible();
  await expect(page.locator('.left-rail .palette-list')).toBeVisible();

  // Task palette section collapses independently.
  await page.getByRole('button', { name: /Task palette/ }).click();
  await expect(page.locator('.left-rail .palette-list')).toHaveCount(0);
  await expect(library).toBeVisible();

  // Collapsing BOTH sections minimizes the whole rail to its icon strip.
  await page.getByRole('button', { name: /Workflows/ }).click();
  await expect(page.locator('.left-rail.left-rail-collapsed')).toBeVisible();
  await expect(page.locator('.accordion-head')).toHaveCount(0);

  // The minimized state persists across reloads.
  await page.reload();
  await expect(page.locator('.left-rail.left-rail-collapsed')).toBeVisible();

  // Reopening from the strip restores a usable rail (both sections open).
  await page.getByRole('button', { name: 'Expand task palette' }).click();
  await expect(page.locator('.left-rail.left-rail-collapsed')).toHaveCount(0);
  await expect(library).toBeVisible();
  await expect(page.locator('.left-rail .palette-list')).toBeVisible();

  // A single collapsed section persists without minimizing the rail.
  await page.getByRole('button', { name: /Task palette/ }).click();
  await expect(page.locator('.left-rail .palette-list')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.left-rail .palette-list')).toHaveCount(0);
  await expect(library).toBeVisible();
  await page.getByRole('button', { name: /Task palette/ }).click();
  await expect(page.locator('.left-rail .palette-list')).toBeVisible();
});

test('palette groups are accordion sections and their state persists', async ({ page }) => {
  const emitItem = page.getByRole('button', { name: 'Add Emit event task' });
  await expect(emitItem).toBeVisible();

  await page.getByRole('button', { name: /Events/ }).click();
  await expect(emitItem).toHaveCount(0);
  // Other groups stay open.
  await expect(page.getByRole('button', { name: 'Add Wait task' })).toBeVisible();

  await page.reload();
  await expect(emitItem).toHaveCount(0);

  await page.getByRole('button', { name: /Events/ }).click();
  await expect(emitItem).toBeVisible();
});

test('right rail panel heads toggle on click and show chevrons', async ({ page }) => {
  await expect(page.locator('.panel-chevron')).toHaveText('▾');
  await page.locator('.inspector-head-title').click();
  await expect(page.locator('.inspector.inspector-collapsed')).toBeVisible();
  await page.getByRole('button', { name: 'Expand Inspector' }).click();
  await expect(page.locator('.inspector.inspector-collapsed')).toHaveCount(0);

  await page.locator('.runtime-summary-title').click();
  await expect(page.locator('.side-runtime-panel')).toHaveClass(/runtime-panel-collapsed/);
  await page.getByRole('button', { name: 'Expand Runtime' }).click();
  await expect(page.locator('.side-runtime-panel')).not.toHaveClass(/runtime-panel-collapsed/);
});

// ---------------------------------------------------------------------------
// Task 15: grouped task palette + AI prototype group
// ---------------------------------------------------------------------------

test('palette is grouped and shows the AI group as coming soon', async ({ page }) => {
  const palette = page.locator('.left-rail .palette-list');
  for (const group of ['Flow control', 'Data & logic', 'Services', 'Events', 'AI']) {
    await expect(palette.getByRole('button', { name: new RegExp(`^${group.split(' ')[0]}`) })).toBeVisible();
  }
  const llm = palette.getByRole('button', { name: 'Coming soon: LLM call task' });
  await expect(llm).toBeVisible();
  await expect(llm.locator('.palette-soon')).toHaveText('soon');
  await expect(llm).toHaveAttribute('aria-disabled', 'true');
  const agent = palette.getByRole('button', { name: 'Coming soon: AI agent call task' });
  await expect(agent).toBeVisible();
  // Existing items are still addable.
  await expect(palette.getByRole('button', { name: 'Add Wait task' })).toBeVisible();
});

test('topbar avatar is a centered circle', async ({ page }) => {
  const avatar = page.locator('.avatar');
  await expect(avatar).toBeVisible();
  const style = await avatar.evaluate((el) => {
    const computed = window.getComputedStyle(el);
    return {
      // Flex items get blockified displays ("inline-flex" resolves to "flex"
      // inside the flex container) — either value proves the layout is active.
      display: computed.display,
      radius: computed.borderRadius,
      size: computed.width,
      height: computed.height,
      align: computed.alignItems,
      justify: computed.justifyContent,
    };
  });
  expect(['inline-flex', 'flex']).toContain(style.display);
  expect(style.radius).toBe('50%');
  expect(style.size).toBe('29px');
  expect(style.height).toBe('29px');
  expect(style.align).toBe('center');
  expect(style.justify).toBe('center');
});

// ---------------------------------------------------------------------------
// Tasks 25-28: palette group reorder, per-workflow theme, multi-select,
// canvas-scoped palette commands
// ---------------------------------------------------------------------------

test('palette groups reorder by drag and persist', async ({ page }) => {
  // Tall viewport keeps both group heads visible (HTML5 drags don't scroll mid-drag).
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  const first = page.getByRole('button', { name: /^Flow control/ });
  const services = page.getByRole('button', { name: /^Services/ });
  await expect(first).toBeVisible();
  // Drag Services group onto Flow control; retry once in case the first
  // drag races with the boot render.
  const hasOrder = () =>
    page.evaluate(() =>
      (window.localStorage.getItem('open-workflow-editor:palette-group-order:v1') || '').includes('Services'),
    );
  for (let attempt = 0; attempt < 2 && !(await hasOrder()); attempt += 1) {
    await services.dragTo(first);
  }
  await expect
    .poll(() =>
      page.evaluate(() => window.localStorage.getItem('open-workflow-editor:palette-group-order:v1')),
    )
    .toContain('Services');
  const palette = page.locator('.left-rail .palette-list .accordion-group');
  await expect(palette.first()).toContainText('Services');
  // Persisted across reload.
  await page.reload();
  await expect(page.locator('.left-rail .palette-list .accordion-group').first()).toContainText('Services');
});

test('per-workflow theme override applies and follows the workflow', async ({ page }) => {
  await page.keyboard.press('Control+,');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByLabel('Theme for this workflow').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.theme-override-dot')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // Switch to another workflow (no override) — falls back to the default theme.
  await page
    .getByRole('listbox', { name: 'Saved workflows' })
    .locator('.library-item', { hasText: 'rta-vehicle-ownership-renewal' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.theme-override-dot')).toHaveCount(0);

  // Back to the overridden workflow.
  await page
    .getByRole('listbox', { name: 'Saved workflows' })
    .locator('.library-item', { hasText: 'rta-nol-travel-pass-renewal' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('canvas multi-select via modifier click with bulk duplicate', async ({ page }) => {
  const firstNode = page.locator('.react-flow__node-task').first();
  const secondNode = page.locator('.react-flow__node-task').nth(1);
  await firstNode.waitFor();
  await firstNode.click();
  await secondNode.click({ modifiers: ['Control'] });
  const box = await secondNode.boundingBox();
  await page.mouse.click(box.x + 20, box.y + 10, { button: 'right' });
  const menu = page.locator('.context-menu');
  await expect(menu.getByRole('menuitem', { name: /Duplicate 2 tasks/ })).toBeVisible();
  await menu.getByRole('menuitem', { name: /Duplicate 2 tasks/ }).click();
  await expect(page.locator('.react-flow__node-task')).toHaveCount(10);
});

test('canvas-scoped palette commands switch to the canvas view', async ({ page }) => {
  await page.getByRole('button', { name: 'Specification' }).click();
  await expect(page.getByRole('button', { name: 'Canvas' })).not.toHaveClass(/active/);
  await page.keyboard.press('Control+Shift+P');
  await page.getByRole('dialog', { name: 'Command palette' }).waitFor();
  await page.keyboard.type('reset canvas zoom');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Canvas' })).toHaveClass(/active/);
  await expect(page.locator('.canvas-shell')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Task 4: independent panel collapse (right rail, icon strips)
// ---------------------------------------------------------------------------

test('right rail collapses independently of the left rail', async ({ page }) => {
  await page.getByRole('button', { name: 'Collapse Inspector' }).click();
  await page.getByRole('button', { name: 'Collapse Runtime' }).click();
  await expect(page.locator('.editor-layout')).toHaveClass(/right-rail-collapsed/);
  // The left rail stays open.
  await expect(page.locator('.editor-layout')).not.toHaveClass(/left-rail-collapsed/);
  await expect(page.locator('.left-rail .palette-list')).toBeVisible();
  // Collapsed strips show icons, not vertical text.
  const inspectorIcon = await page
    .locator('.editor-layout.right-rail-collapsed .inspector-head')
    .evaluate((el) => window.getComputedStyle(el, '::after').content);
  expect(inspectorIcon).toContain('☰');
  const runtimeIcon = await page
    .locator('.editor-layout.right-rail-collapsed .runtime-panel-head')
    .evaluate((el) => window.getComputedStyle(el, '::after').content);
  expect(runtimeIcon).toContain('▶');
  // Expanding any one of the two opens the rail again.
  await page.getByRole('button', { name: 'Expand Inspector' }).click();
  await expect(page.locator('.editor-layout')).not.toHaveClass(/right-rail-collapsed/);
});

test('collapsed left rail uses an icon instead of vertical text', async ({ page }) => {
  await page.getByRole('button', { name: 'Collapse task palette' }).click();
  const label = page.locator('.collapsed-rail-label');
  await expect(label).toBeVisible();
  const writingMode = await label.evaluate((el) => window.getComputedStyle(el).writingMode);
  expect(writingMode).toBe('horizontal-tb');
  await page.getByRole('button', { name: 'Expand task palette' }).click();
  await expect(page.locator('.left-rail .palette-list')).toBeVisible();
});

test('resize handles adjust the left rail width and persist it across reloads', async ({ page }) => {
  const leftHandle = page.locator('.resize-handle-left');
  await expect(leftHandle).toBeVisible();
  const before = await page.locator('.left-rail').boundingBox();
  const handleBox = await leftHandle.boundingBox();
  await page.mouse.move(handleBox.x + 3, handleBox.y + 120);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 83, handleBox.y + 120, { steps: 6 });
  await page.mouse.up();
  const after = await page.locator('.left-rail').boundingBox();
  expect(after.width).toBeGreaterThan(before.width + 40);
  await page.reload();
  const reloaded = await page.locator('.left-rail').boundingBox();
  expect(Math.abs(reloaded.width - after.width)).toBeLessThan(2);
});

// ---------------------------------------------------------------------------
// Task 5: context menus
// ---------------------------------------------------------------------------

test('canvas node context menu offers duplicate and delete', async ({ page }) => {
  const node = page.locator('.react-flow__node-task').first();
  await node.waitFor();
  const box = await node.boundingBox();
  await page.mouse.click(box.x + 30, box.y + 20, { button: 'right' });
  const menu = page.locator('.context-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Duplicate task' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Delete task' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('document tab context menu offers close actions', async ({ page }) => {
  await page
    .getByRole('listbox', { name: 'Saved workflows' })
    .locator('.library-item', { hasText: 'rta-vehicle-ownership-renewal' })
    .click();
  await page.getByRole('tab', { name: 'rta-nol-travel-pass-renewal' }).click({ button: 'right' });
  const menu = page.locator('.context-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Close others' })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Close others' }).click();
  await expect(page.locator('.document-tab')).toHaveCount(2);
});

// ---------------------------------------------------------------------------
// Task 6: problems panel
// ---------------------------------------------------------------------------

test('problems panel opens from the status bar and lists diagnostics', async ({ page }) => {
  await page.getByRole('button', { name: 'Specification' }).click();
  await setSpecText(
    page,
    `document:
  dsl: "1.0.3"
  namespace: default
  name: broken-demo
  version: "0.1.0"
do:
  - brokenTask:
      set:
        ok: true
      then: missingTask`,
  );
  await expect(page.locator('.status-bar')).toContainText('1 problems', { timeout: 8000 });
  await page.locator('.status-bar button').filter({ hasText: 'problems' }).click();
  const panel = page.locator('.problems-panel');
  await expect(panel).toHaveClass(/open/);
  // The SDK rejects dangling `then` transitions at validation time, so the
  // problem surfaces as a schema error naming both tasks.
  await expect(panel).toContainText('missingTask');
  await panel.locator('.problems-item').first().click();
  await expect(page.getByRole('button', { name: 'Specification' })).toHaveClass(/active/);
});

// ---------------------------------------------------------------------------
// Task 7: workspace-wide search
// ---------------------------------------------------------------------------

test('workspace search finds tasks across saved workflows', async ({ page }) => {
  await page.keyboard.press('Control+Shift+F');
  const dialog = page.getByRole('dialog', { name: 'Workspace-wide search' });
  await expect(dialog).toBeVisible();
  await page.keyboard.type('checkTravelPassExpiry');
  await expect(dialog.locator('.palette-command').first()).toContainText('checkTravelPassExpiry');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.workflow-name-input')).toHaveValue('rta-nol-travel-pass-renewal');
});

// ---------------------------------------------------------------------------
// Task 8: live status bar
// ---------------------------------------------------------------------------

test('status bar shows live selection, format and runtime state', async ({ page }) => {
  await expect(page.locator('.status-bar')).toContainText('YAML');
  await expect(page.locator('.status-bar')).toContainText('problems');
  const node = page.locator('.react-flow__node-task').first();
  await node.waitFor();
  await node.click();
  await expect(page.locator('.status-bar')).toContainText('task:');
});

// ---------------------------------------------------------------------------
// Task 10: workflow library explorer
// ---------------------------------------------------------------------------

test('library explorer lists saved workflows, switches, renames and deletes', async ({ page }) => {
  const library = page.getByRole('listbox', { name: 'Saved workflows' });
  await expect(library).toBeVisible();
  await expect(library.locator('.library-item')).toHaveCount(4);

  // Switch to another workflow.
  await library.locator('.library-item', { hasText: 'rta-vehicle-ownership-renewal' }).click();
  await expect(page.locator('.workflow-name-input')).toHaveValue('rta-vehicle-ownership-renewal');
  await expect(library.locator('.library-item.active')).toContainText('rta-vehicle-ownership-renewal');

  // Rename it via the explorer.
  const row = library.locator('.library-item', { hasText: 'dewa-move-to' });
  await row.hover();
  await row.getByRole('button', { name: 'Rename dewa-move-to' }).click();
  const input = library.getByLabel('Rename workflow dewa-move-to');
  await input.fill('dewa-relocation');
  await input.press('Enter');
  await expect(library.locator('.library-item', { hasText: 'dewa-relocation' })).toBeVisible();
  // Opening the renamed workflow reflects the new document name.
  await library.locator('.library-item', { hasText: 'dewa-relocation' }).click();
  await expect(page.locator('.workflow-name-input')).toHaveValue('dewa-relocation');
});

test('library explorer delete removes a non-active workflow', async ({ page }) => {
  const library = page.getByRole('listbox', { name: 'Saved workflows' });
  await expect(library.locator('.library-item')).toHaveCount(4);
  const row = library.locator('.library-item', { hasText: 'dewa-move-to' });
  await row.hover();
  page.once('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: 'Delete dewa-move-to' }).click();
  await expect(library.locator('.library-item')).toHaveCount(3);
});

// ---------------------------------------------------------------------------
// Task 11: tab reordering
// ---------------------------------------------------------------------------

test('tabs can be dragged to reorder the tab bar', async ({ page }) => {
  await page.getByLabel('New workflow tab').click();
  await expect(page.locator('.document-tab')).toHaveCount(2);
  const tabs = page.locator('.document-tab');
  await expect(tabs.first()).toContainText('rta-nol-travel-pass-renewal');
  // Drag the second (new) tab onto the first to move it to the front.
  await tabs.nth(1).dragTo(tabs.first());
  await expect(tabs.first()).toContainText('new-workflow');
});

// ---------------------------------------------------------------------------
// Task 12: breadcrumbs
// ---------------------------------------------------------------------------

test('breadcrumbs show the workflow / do / task chain', async ({ page }) => {
  const breadcrumb = page.locator('.breadcrumb');
  await expect(breadcrumb.locator('.breadcrumb-segment').first()).toHaveText('rta-nol-travel-pass-renewal');
  await expect(breadcrumb.locator('.breadcrumb-segment').nth(1)).toHaveText('do');
  const node = page.locator('.react-flow__node-task').first();
  await node.waitFor();
  await node.click();
  await expect(breadcrumb.locator('.breadcrumb-task')).toContainText('checkTravelPassExpiry');
});

// ---------------------------------------------------------------------------
// Task 13: settings dialog
// ---------------------------------------------------------------------------

test('settings dialog opens with Ctrl+, and applies gateway config', async ({ page }) => {
  await page.keyboard.press('Control+,');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Color theme')).toHaveValue('light');

  await dialog.getByLabel('Gateway URL').fill('https://gateway.example.internal');
  await dialog.getByLabel('Bearer token').fill('secret-token');
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toHaveCount(0);
  const stored = await page.evaluate(() => window.localStorage.getItem('open-workflow-gateway-url'));
  expect(stored).toBe('https://gateway.example.internal');
  // Applying a gateway URL switches the runtime console into gateway mode and
  // its config inputs reflect the new values.
  await page.getByRole('tab', { name: 'Runtime gateway' }).click();
  await page.getByRole('button', { name: /Gateway settings/ }).click();
  await expect(page.getByLabel('Gateway Base URL')).toHaveValue('https://gateway.example.internal');
  await expect(page.getByLabel('Gateway Bearer Token')).toHaveValue('secret-token');
});

test('settings dialog toggles the mini-map', async ({ page }) => {
  await expect(page.locator('.react-flow__minimap')).toBeVisible();
  await page.keyboard.press('Control+,');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByLabel('Mini-map on canvas').uncheck();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.react-flow__minimap')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.react-flow__minimap')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Task 14: zoom controls & minimap command
// ---------------------------------------------------------------------------

test('canvas zoom responds to Ctrl+= and the mini-map toggles from the palette', async ({ page }) => {
  const viewport = page.locator('.react-flow__viewport');
  const before = await viewport.evaluate((el) => el.style.transform);
  await page.keyboard.press('Control+=');
  await expect.poll(() => viewport.evaluate((el) => el.style.transform), { timeout: 8000 }).not.toBe(before);

  await page.keyboard.press('Control+Shift+P');
  await page.getByRole('dialog', { name: 'Command palette' }).waitFor();
  await page.keyboard.type('mini-map');
  await page.keyboard.press('Enter');
  await expect(page.locator('.react-flow__minimap')).toHaveCount(0);
});
