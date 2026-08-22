import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

/** Replaces the whole specification text inside the CodeMirror editor. */
async function setSpecText(page, text) {
  await page.waitForFunction(() => Boolean(window.__specEditorView));
  await page.evaluate((value) => {
    const view = window.__specEditorView;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, text);
}

/**
 * Asserts the full editor document contains a substring. CodeMirror virtualizes
 * its viewport, so DOM textContent only covers the visible lines; the editor's
 * state document is the source of truth.
 */
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

test('keeps runtime controls explicit and disconnected without a gateway', async ({ page }) => {
  await expect(page.locator('.side-runtime-panel')).not.toHaveClass(/runtime-panel-collapsed/);
  // Validation state lives in the mode-tabs pill + problems panel, not a toolbar button.
  await expect(page.getByText('Valid specification')).toBeVisible();
  await expect(
    page.locator('.side-runtime-panel').getByRole('button', { name: 'Validate workflow' }),
  ).toHaveCount(0);
  await expect(page.getByText('Local demo engine')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start run' })).toBeVisible();
  await page.getByRole('tab', { name: 'Runtime gateway' }).click();
  await expect(page.getByText('No runtime gateway connected')).toBeVisible();
  await expect(page.getByText('Gateway not configured')).toBeVisible();
});

test('runs a workflow in the local demo engine', async ({ page }) => {
  await expect(page.locator('.side-runtime-panel')).not.toHaveClass(/runtime-panel-collapsed/);
  await expect(page.locator('.runtime-pace-control')).toContainText('Demo pace');
  await page.locator('.runtime-pace-control select').selectOption('250');
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.locator('.runtime-status-completed')).toBeVisible({ timeout: 8000 });
  await expect(page.getByLabel('Workflow run logs')).toContainText('Completed local demo run');
  await expect(page.getByLabel('Workflow run logs')).toContainText('Executed JavaScript in Node sandbox');
  await expect(page.getByText('Task timeline')).toBeVisible();
  await expect(page.getByText('Execution log')).toBeVisible();
  await expect(page.getByLabel('Workflow run logs')).toContainText('Mocked call rta-nol-travel-pass-service');
  const logEntries = page.locator('.runtime-log-entry');
  const logEntryCount = await logEntries.count();
  expect(logEntryCount).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.locator('.runtime-log-entry[open]')).toHaveCount(logEntryCount);
  await page.getByRole('button', { name: 'Collapse all', exact: true }).click();
  await expect(page.locator('.runtime-log-entry[open]')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/open-workflow-editor-demo-runtime.png', fullPage: true });
});

test('adds multiple switch cases through the inspector drop zone', async ({ page }) => {
  await page
    .getByRole('listbox', { name: 'Saved workflows' })
    .locator('.library-item', { hasText: 'rta-vehicle-ownership-renewal' })
    .click();
  await page.getByRole('group', { name: 'switch task checkRenewal' }).click();
  await expect(page.getByText('2 configured')).toBeVisible();

  await page.getByRole('button', { name: '＋ Add case' }).click();
  await expect(page.getByText('3 configured')).toBeVisible();
  await page.getByLabel('Case 3 name').fill('accessibleParking');
  await page.getByLabel('Case 3 name').blur();

  await page.locator('.switch-case-editor').evaluate((target) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('application/open-workflow-switch-case', 'new-case');
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  });
  await expect(page.getByText('4 configured')).toBeVisible();
});

test('shows shared task options and HTTP request attributes', async ({ page }) => {
  await page.getByRole('group', { name: 'call task verifyNolAccount' }).click();
  const nextTask = page.getByLabel('Next task');
  await expect(nextTask.locator('option').filter({ hasText: 'renewTravelPass' })).toHaveCount(1);
  await nextTask.selectOption('renewTravelPass');
  await expect(page.getByLabel('HTTP headers', { exact: true })).toBeVisible();
  await expect(page.getByLabel('HTTP query parameters', { exact: true })).toBeVisible();
  await expect(page.getByLabel('HTTP request body')).toBeVisible();
  await expect(page.getByLabel('Task input mapping')).toBeVisible();
  await expect(page.getByLabel('Task output mapping')).toBeVisible();
  await expect(page.getByLabel('Task metadata')).toBeVisible();

  await page.locator('.inspector-parameter-section summary').first().click();
  await expect(page.getByRole('button', { name: 'Add header' })).toBeHidden();
  await page.locator('.inspector-parameter-section summary').first().click();

  await expect(page.getByRole('button', { name: 'Add header' })).toBeVisible();
  await page.getByRole('button', { name: 'Specification' }).click();
  await expectSpecToContain(page, 'verifyNolAccount');
});

test('shows JavaScript tasks with the Node sandbox security boundary', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Run JavaScript task' }).press('Enter');
  await expect(page.getByRole('group', { name: 'run task runTask' })).toBeVisible();
  await expect(page.getByLabel('JavaScript code')).toHaveValue(/reference: input\.reference/);
  await expect(page.getByLabel('Run mode')).toHaveValue('javascript');
  await expect(page.getByLabel('Resource catalog 1 name')).toHaveValue('dubai-services');
  await expect(page.getByText('Function contract')).toBeVisible();
  await expect(page.locator('.security-note')).toContainText('Node server sandbox');
});

test('deletes a selected task through the Inspector confirmation', async ({ page }) => {
  await page.getByRole('group', { name: 'set task checkTravelPassExpiry' }).click();
  await page.getByRole('button', { name: 'Delete task', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Delete “checkTravelPassExpiry”?');
  await page.getByRole('button', { name: 'Keep task' }).click();
  await expect(page.getByRole('group', { name: 'set task checkTravelPassExpiry' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete task', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete task', exact: true }).click();
  await expect(page.getByRole('group', { name: 'set task checkTravelPassExpiry' })).toHaveCount(0);
});

test('supports validated JavaScript functions and sub-flow references', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Run JavaScript task' }).press('Enter');
  const code = page.getByLabel('JavaScript code');
  await code.fill('not a function');
  await code.blur();
  await expect(page.locator('.field-error')).toContainText('Use a function expression');

  await page.getByLabel('Run mode').selectOption('subflow');
  await expect(page.getByLabel('Sub-flow namespace')).toHaveValue('dubai-government');
  await page.getByLabel('Sub-flow name', { exact: true }).fill('renewal-notification');
  await page.getByLabel('Sub-flow name', { exact: true }).blur();
  await page.getByRole('button', { name: 'Specification' }).click();
  await expectSpecToContain(page, 'renewal-notification');
  await expectSpecToContain(page, 'workflow:');
});

test('builds typed JSON values and ISO duration controls', async ({ page }) => {
  await page.getByRole('group', { name: 'call task renewTravelPass' }).click();
  const body = page.getByLabel('HTTP request body');
  await expect(body.locator('.json-builder-row')).toHaveCount(2);
  await body.getByRole('button', { name: '＋ Add body property' }).click();
  await body.getByLabel('HTTP request body 3 key').fill('renewalDate');
  await body.getByLabel('HTTP request body 3 type').selectOption('date');
  await body.getByLabel('HTTP request body 3 value').fill('2026-08-20');
  await body.getByLabel('HTTP request body 3 value').blur();
  await page.getByRole('button', { name: 'Specification' }).click();
  await expectSpecToContain(page, "renewalDate: '2026-08-20'");

  await page.getByRole('button', { name: 'Canvas' }).click();
  await page.getByRole('button', { name: 'Add Wait task' }).press('Enter');
  await page.getByRole('group', { name: 'wait task waitTask' }).click();
  await page.getByLabel('Wait duration amount').fill('10');
  await page.getByLabel('Wait duration unit').selectOption('M');
  await page.getByRole('button', { name: 'Specification' }).click();
  await expectSpecToContain(page, 'wait: PT10M');
});

test('creates a task from the accessible palette and synchronizes its properties', async ({ page }) => {
  await expect(page).toHaveTitle('Open Workflow Editor');

  await page.getByRole('button', { name: 'Add Set value task' }).press('Enter');
  const task = page.getByRole('group', { name: 'set task setTask' });
  await expect(task).toBeVisible();

  const valueInput = page.getByRole('textbox', { name: 'Set task variables 1 value' });
  await valueInput.fill('ready');
  await valueInput.blur();
  await page.getByRole('button', { name: 'Specification' }).click();
  await expectSpecToContain(page, 'ready');
});

test('supports drag/drop, invalid specification feedback, and workflow duplication', async ({ page }) => {
  const source = page.locator('.palette-item').filter({ hasText: 'Call HTTP' });
  await expect(source).toBeVisible();
  await page.locator('.canvas-shell').evaluate((target) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('application/open-workflow-task', 'call');
    const eventOptions = { bubbles: true, cancelable: true, dataTransfer, clientX: 420, clientY: 300 };
    target.dispatchEvent(new DragEvent('dragover', eventOptions));
    target.dispatchEvent(new DragEvent('drop', eventOptions));
  });
  await expect(page.getByRole('group', { name: /call task callTask/ })).toBeVisible();

  await page.getByRole('button', { name: 'Specification' }).click();
  await setSpecText(page, 'document: [');
  await expect(page.getByText('Invalid specification')).toBeVisible();

  await setSpecText(
    page,
    `document:
  dsl: "1.0.3"
  namespace: default
  name: customer-onboarding
  version: "0.1.0"
do: []`,
  );
  await expect(page.getByText('Valid specification')).toBeVisible();
  await setSpecText(
    page,
    `document:
  dsl: "1.0.3"
  namespace: default
  name: unsupported-example
  version: "0.1.0"
do:
  - badTask:
      imaginary: true`,
  );
  await expect(page.getByText('Unsupported task or structure', { exact: true })).toBeVisible();
  await setSpecText(
    page,
    `document:
  dsl: "1.0.3"
  namespace: default
  name: customer-onboarding
  version: "0.1.0"
do: []`,
  );
  await expect(page.getByText('Valid specification')).toBeVisible();
  await page.getByRole('button', { name: 'Canvas' }).click();
  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByLabel('Workflow name')).toHaveValue('customer-onboarding-copy');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page
      .getByRole('listbox', { name: 'Saved workflows' })
      .locator('.library-item', { hasText: 'customer-onboarding-copy' }),
  ).toHaveCount(1);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByLabel('Workflow name')).toHaveValue('dewa-move-to');
});

test('switches between saved workflows from the library explorer', async ({ page }) => {
  const library = page.getByRole('listbox', { name: 'Saved workflows' });
  await expect(library.locator('.library-item')).toHaveCount(4);

  await library.locator('.library-item', { hasText: 'rta-vehicle-ownership-renewal' }).click();
  await expect(page.getByLabel('Workflow name')).toHaveValue('rta-vehicle-ownership-renewal');
  await expect(page.getByRole('group', { name: 'call task renewVehicleOwnership' })).toBeVisible();

  await library.locator('.library-item', { hasText: 'rta-nol-travel-pass-renewal' }).click();
  await expect(page.getByLabel('Workflow name')).toHaveValue('rta-nol-travel-pass-renewal');
  await expect(page.getByRole('group', { name: 'set task checkTravelPassExpiry' })).toBeVisible();

  await library.locator('.library-item', { hasText: 'dewa-move-to' }).click();
  await expect(page.getByLabel('Workflow name')).toHaveValue('dewa-move-to');
  await expect(page.getByRole('group', { name: 'listen task listenForEjariEvent' })).toBeVisible();
});

test('supports dedicated task inspectors for for, fork, listen, and try tasks', async ({ page }) => {
  // for task
  await page.getByRole('button', { name: 'Add For each task' }).press('Enter');
  await expect(page.getByRole('group', { name: 'for task forTask' })).toBeVisible();
  const loopItem = page.getByLabel('Loop item variable');
  await loopItem.fill('citizen');
  await loopItem.blur();
  const loopIn = page.getByLabel('Collection expression');
  await loopIn.fill('${ $context.citizens }');
  await loopIn.blur();
  await page.getByRole('button', { name: 'Specification' }).click();
  await expectSpecToContain(page, 'each: citizen');
  await expectSpecToContain(page, 'in: ${ $context.citizens }');

  // fork task
  await page.getByRole('button', { name: 'Canvas' }).click();
  await page.getByRole('button', { name: 'Add Fork task' }).press('Enter');
  await expect(page.getByRole('group', { name: 'fork task forkTask' })).toBeVisible();
  await page.getByRole('button', { name: '＋ Add branch' }).click();
  await expect(page.getByText('2 configured')).toBeVisible();
  await page.getByLabel('Competitive fork').check();
  await page.getByRole('button', { name: 'Specification' }).click();
  await expectSpecToContain(page, 'compete: true');

  // listen task
  await page.getByRole('button', { name: 'Canvas' }).click();
  await page.getByRole('button', { name: 'Add Listen task' }).press('Enter');
  await expect(page.getByRole('group', { name: 'listen task listenTask' })).toBeVisible();
  await page.getByLabel('Event type').fill('com.dubai.smart.service.started');
  await page.getByLabel('Event type').blur();
  await page.getByRole('button', { name: 'Specification' }).click();
  await expectSpecToContain(page, 'type: com.dubai.smart.service.started');

  // try task
  await page.getByRole('button', { name: 'Canvas' }).click();
  await page.getByRole('button', { name: 'Add Try / catch task' }).press('Enter');
  await expect(page.getByRole('group', { name: 'try task tryTask' })).toBeVisible();
  await page.getByLabel('Catch error type').fill('https://demo.dubai.ae/errors/unavailable');
  await page.getByLabel('Catch error type').blur();
  await page.getByLabel('Max attempts').fill('5');
  await page.getByLabel('Max attempts').blur();
  await page.getByRole('button', { name: 'Specification' }).click();
  await expectSpecToContain(page, 'type: https://demo.dubai.ae/errors/unavailable');
  await expectSpecToContain(page, 'count: 5');
});

test('supports keyboard undo and redo for a canvas edit', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Wait task' }).press('Enter');
  const task = page.getByRole('group', { name: 'wait task waitTask' });
  await expect(task).toBeVisible();

  await page.keyboard.press('Meta+z');
  await expect(task).toHaveCount(0);
  await page.keyboard.press('Meta+Shift+z');
  await expect(task).toBeVisible();
});

test('supports theme switching between light, dark, and high-contrast modes', async ({ page }) => {
  const themeSelect = page.getByLabel('Editor visual theme');
  await expect(themeSelect).toBeVisible();

  await themeSelect.selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await themeSelect.selectOption('high-contrast');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'high-contrast');

  await themeSelect.selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('opens and dismisses keyboard shortcuts dialog', async ({ page }) => {
  const shortcutsButton = page.getByLabel('Keyboard shortcuts reference');
  await shortcutsButton.click();
  await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeVisible();
  await expect(page.getByText('Fit entire workflow to view')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toHaveCount(0);
});

test('browses template library and loads a workflow pattern', async ({ page }) => {
  await page.getByLabel('Open template library').click();
  const dialog = page.getByRole('dialog', { name: 'Workflow Template Catalog' });
  await expect(dialog).toBeVisible();
  await expect(page.getByText('Resilient Retry & Error Recovery')).toBeVisible();

  await page.getByRole('button', { name: 'Resilience' }).click();
  await page.getByText('Resilient Retry & Error Recovery').click();
  await page.getByRole('button', { name: 'Use template' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.workflow-name-input')).toHaveValue(/resilient-try-catch-retry/);
  await expect(page.getByRole('group', { name: 'try task processWithRetry' })).toBeVisible();
});

test('opens revision history dialog and inspects workflow diff', async ({ page }) => {
  await page.getByLabel('Workflow revision history').click();
  const dialog = page.getByRole('dialog', { name: 'Workflow Revision History & Diff' });
  await expect(dialog).toBeVisible();
  await expect(page.getByText(/Revisions/)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('supports multi-document tabs bar and tab switching', async ({ page }) => {
  await expect(page.getByRole('tablist', { name: 'Open workflow documents' })).toBeVisible();
  const initialTabs = page.locator('.document-tab');
  await expect(initialTabs).toHaveCount(1);

  await page.getByLabel('New workflow tab').click();
  await expect(page.locator('.document-tab')).toHaveCount(2);

  const tabs = page.locator('.document-tab');
  await tabs.first().click();
  await expect(tabs.first()).toHaveClass(/active/);
});

test('scaffolds and opens subflow documents from inspector', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Run JavaScript task' }).press('Enter');
  await page.getByLabel('Run mode').selectOption('subflow');
  await page.getByLabel('Sub-flow name', { exact: true }).fill('billing-process');
  await page.getByLabel('Sub-flow name', { exact: true }).blur();
  await page.getByRole('button', { name: /Scaffold.*billing-process/i }).click();

  await expect(page.locator('.workflow-name-input')).toHaveValue('billing-process');
  await expect(page.locator('.document-tab')).toHaveCount(2);
});

test('opens and views production deployment bundle dialog', async ({ page }) => {
  await page.getByRole('button', { name: 'Deploy bundle' }).click();
  const dialog = page.getByRole('dialog', { name: 'Workflow Deployment Bundle' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dockerfile', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'deployment.yaml', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Dockerfile', exact: true }).click();
  await expect(page.locator('pre')).toContainText('openworkflow/runtime:1.0.3');

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('configures custom gateway URL and bearer auth token in runtime panel', async ({ page }) => {
  await page.getByRole('tab', { name: 'Runtime gateway' }).click();
  await page.getByRole('button', { name: /Gateway settings/i }).click();

  await expect(page.getByLabel('Gateway Base URL')).toBeVisible();
  await page.getByLabel('Gateway Base URL').fill('http://127.0.0.1:8091');
  await page.getByLabel('Gateway Bearer Token').fill('prod-token-xyz');

  await page.getByRole('button', { name: 'Test ping' }).click();
  await expect(page.locator('.gateway-status-banner')).toContainText('http://127.0.0.1:8091');
});

test('preserves unsaved template tabs and names across tab switches', async ({ page }) => {
  // 1. Open template 1
  await page.getByLabel('Open template library').click();
  await page.getByRole('button', { name: 'Resilience' }).click();
  await page.getByText('Resilient Retry & Error Recovery').click();
  await page.getByRole('button', { name: 'Use template' }).click();

  // 2. Open template 2
  await page.getByLabel('Open template library').click();
  await page.getByRole('button', { name: 'Integration' }).click();
  await page.getByText('API Webhook & Decision Router').click();
  await page.getByRole('button', { name: 'Use template' }).click();

  await expect(page.locator('.document-tab')).toHaveCount(3);

  // 3. Switch back to first template tab
  const tabs = page.locator('.document-tab');
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveClass(/active/);
  await expect(page.locator('.workflow-name-input')).toHaveValue(/resilient-try-catch-retry/);

  // 4. Switch to second template tab
  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveClass(/active/);
  await expect(page.locator('.workflow-name-input')).toHaveValue(/api-webhook-router/);
});

test('renders correct icon and subtitle for try-catch container node', async ({ page }) => {
  await page.getByLabel('Open template library').click();
  await page.getByRole('button', { name: 'Resilience' }).click();
  await page.getByText('Resilient Retry & Error Recovery').click();
  await page.getByRole('button', { name: 'Use template' }).click();

  const tryNode = page.locator('.workflow-node.indigo').first();
  await expect(tryNode).toBeVisible();
  await expect(tryNode.locator('.node-icon')).toContainText('⊙');
  await expect(tryNode.locator('.node-content span').first()).toContainText('Try / catch');
});

test('supports use.functions reusable functions and call task function mode', async ({ page }) => {
  await page.getByLabel('Open template library').click();
  await page.getByRole('button', { name: 'Automation' }).click();
  await page.getByText('Reusable Functions & Common Notifier').click();
  await page.getByRole('button', { name: 'Use template' }).click();

  // Verify node subtitle shows fn: calculateTax, purple styling, and function icon ƒ
  const fnNode = page.locator('.workflow-node.purple', { hasText: 'applyTaxFunction' });
  await expect(fnNode).toBeVisible();
  await expect(fnNode.locator('.node-icon')).toContainText('ƒ');
  await expect(fnNode.locator('.node-content span').first()).toContainText('fn: calculateTax');

  // Click on the applyTaxFunction node
  await page.getByRole('group', { name: 'call task applyTaxFunction' }).click();

  // Verify call mode toggle is set to Reusable Function
  const functionModeButton = page.getByRole('button', { name: 'Reusable Function' });
  await expect(functionModeButton).toHaveClass(/active/);

  // Verify function argument editor is visible
  await expect(page.locator('.function-call-section')).toBeVisible();
});

test('renders document settings and resources in inspector when no task is selected', async ({ page }) => {
  // Click on canvas background or unselect any task
  await expect(page.getByRole('heading', { name: 'Workflow Settings' })).toBeVisible();
  await expect(page.getByLabel('Workflow doc name', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Workflow doc namespace', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Workflow doc version', { exact: true })).toBeVisible();

  // Reusable functions and catalogs are available at document level
  await expect(page.getByLabel('Document Reusable Functions')).toBeVisible();
  await expect(page.getByLabel('Document Resource Catalogs')).toBeVisible();
});

test('supports symmetrical panel collapse and flex-grow in the right rail', async ({ page }) => {
  const collapseRuntimeButton = page.getByRole('button', { name: 'Collapse Runtime' });
  await collapseRuntimeButton.click();

  // Verify runtime is collapsed to 54px and inspector is expanded
  const runtimePanel = page.locator('.side-runtime-panel');
  await expect(runtimePanel).toHaveClass(/runtime-panel-collapsed/);

  const inspector = page.locator('.inspector');
  const box = await inspector.boundingBox();
  expect(box?.height).toBeGreaterThan(400);

  // Restore runtime
  const expandRuntimeButton = page.getByRole('button', { name: 'Expand Runtime' });
  await expandRuntimeButton.click();
  await expect(runtimePanel).not.toHaveClass(/runtime-panel-collapsed/);
});
