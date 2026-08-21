import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test('keeps runtime controls explicit and disconnected without a gateway', async ({ page }) => {
  await expect(page.locator('.side-runtime-panel')).not.toHaveClass(/runtime-panel-collapsed/);
  await expect(page.getByRole('button', { name: 'Validate workflow' })).toBeVisible();
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
  await page.getByLabel('Dubai Government workflow examples').selectOption('rta-vehicle-ownership-renewal');
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

  await page.locator('.inspector-parameter-section summary').click();
  await expect(page.getByRole('button', { name: 'Add header' })).toBeHidden();
  await page.locator('.inspector-parameter-section summary').click();

  await expect(page.getByRole('button', { name: 'Add header' })).toBeVisible();
  await page.getByRole('button', { name: 'Specification' }).click();
  await expect(page.locator('.spec-view textarea')).toContainText('verifyNolAccount');
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
  await expect(page.locator('.spec-view textarea')).toContainText('renewal-notification');
  await expect(page.locator('.spec-view textarea')).toContainText('workflow:');
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
  await expect(page.locator('.spec-view textarea')).toContainText("renewalDate: '2026-08-20'");

  await page.getByRole('button', { name: 'Canvas' }).click();
  await page.getByRole('button', { name: 'Add Wait task' }).press('Enter');
  await page.getByRole('group', { name: 'wait task waitTask' }).click();
  await page.getByLabel('Wait duration amount').fill('10');
  await page.getByLabel('Wait duration unit').selectOption('M');
  await page.getByRole('button', { name: 'Specification' }).click();
  await expect(page.locator('.spec-view textarea')).toContainText('wait: PT10M');
});

test('creates a task from the accessible palette and synchronizes its properties', async ({ page }) => {
  await expect(page).toHaveTitle('Open Workflow Editor');

  await page.getByRole('button', { name: 'Add Set value task' }).press('Enter');
  const task = page.getByRole('group', { name: 'set task setTask' });
  await expect(task).toBeVisible();

  const valueInput = page.locator('.inspector .field').filter({ hasText: 'Value' }).locator('input');
  await valueInput.fill('ready');
  await valueInput.blur();
  await page.getByRole('button', { name: 'Specification' }).click();
  await expect(page.locator('.spec-view textarea')).toContainText('ready');
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
  await page.locator('.spec-view textarea').fill('document: [');
  await expect(page.getByText('Invalid specification')).toBeVisible();

  await page.locator('.spec-view textarea').fill(`document:
  dsl: "1.0.3"
  namespace: default
  name: customer-onboarding
  version: "0.1.0"
do: []`);
  await expect(page.getByText('Valid specification')).toBeVisible();
  await page.locator('.spec-view textarea').fill(`document:
  dsl: "1.0.3"
  namespace: default
  name: unsupported-example
  version: "0.1.0"
do:
  - badTask:
      imaginary: true`);
  await expect(page.getByText('Unsupported task or structure', { exact: true })).toBeVisible();
  await page.locator('.spec-view textarea').fill(`document:
  dsl: "1.0.3"
  namespace: default
  name: customer-onboarding
  version: "0.1.0"
do: []`);
  await expect(page.getByText('Valid specification')).toBeVisible();
  await page.getByRole('button', { name: 'Canvas' }).click();
  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByLabel('Workflow name')).toHaveValue('customer-onboarding-copy');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(
    page
      .locator('select[aria-label="Dubai Government workflow examples"] option')
      .filter({ hasText: 'customer-onboarding-copy' }),
  ).toHaveCount(1);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByLabel('Workflow name')).toHaveValue('dewa-move-to');
});

test('switches between Dubai Government service cases', async ({ page }) => {
  const picker = page.getByLabel('Dubai Government workflow examples');
  await expect(picker.locator('option')).toHaveCount(4);

  await picker.selectOption('rta-vehicle-ownership-renewal');
  await expect(page.getByLabel('Workflow name')).toHaveValue('rta-vehicle-ownership-renewal');
  await expect(page.getByRole('group', { name: 'call task renewVehicleOwnership' })).toBeVisible();

  await picker.selectOption('rta-nol-travel-pass-renewal');
  await expect(page.getByLabel('Workflow name')).toHaveValue('rta-nol-travel-pass-renewal');
  await expect(page.getByRole('group', { name: 'set task checkTravelPassExpiry' })).toBeVisible();

  await picker.selectOption('dewa-move-to');
  await expect(page.getByLabel('Workflow name')).toHaveValue('dewa-move-to');
  await expect(page.getByRole('group', { name: 'listen task listenForEjariEvent' })).toBeVisible();
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
