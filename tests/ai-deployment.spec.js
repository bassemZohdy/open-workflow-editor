import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

// ---------------------------------------------------------------------------
// Task 35: deployment bundle ships referenced AI sub-flow artifacts
// ---------------------------------------------------------------------------

test('deployment bundle ships AI sub-flow artifacts for AI delegations', async ({ page }) => {
  // Add an AI delegation task (auto-scaffolds the sub-flow tab).
  await page.keyboard.press('Control+Shift+P');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await expect(dialog).toBeVisible();
  await page.keyboard.type('Add LLM call task');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.document-tab')).toHaveCount(2);

  // Switch back to the parent workflow tab and open the bundle.
  await page.locator('.document-tab').first().click();
  await expect(page.locator('.workflow-name-input')).toHaveValue('rta-nol-travel-pass-renewal');
  await page.getByRole('button', { name: 'Deploy bundle' }).click();
  const bundleDialog = page.getByRole('dialog', { name: 'Workflow Deployment Bundle' });
  await expect(bundleDialog).toBeVisible();

  await page.getByRole('button', { name: 'Dockerfile', exact: true }).click();
  await expect(page.locator('pre')).toContainText('COPY subflows/ /app/subflows/');
  await expect(page.locator('pre')).toContainText('WORKFLOW_SUBFLOW_PATH=/app/subflows');

  await page.getByRole('button', { name: 'deployment.yaml', exact: true }).click();
  await expect(page.locator('pre')).toContainText('subflows/ai/prompt-llm.yaml: |');
  await expect(page.locator('pre')).toContainText('subPath: subflows/ai/prompt-llm.yaml');

  // Shipped sub-flow artifacts preview in their own tab.
  await page.getByRole('button', { name: 'subflows/ai/prompt-llm.yaml', exact: true }).click();
  await expect(page.locator('pre')).toContainText('ai-providers');
  await expect(page.getByRole('button', { name: /^📋 Copy subflows\/ai\/prompt-llm\.yaml$/ })).toBeVisible();

  await page.getByRole('button', { name: 'README.md', exact: true }).click();
  await expect(page.locator('pre')).toContainText('Sub-flows');
});

// ---------------------------------------------------------------------------
// Task 37: bundle ships user sub-flow documents from the workspace
// ---------------------------------------------------------------------------

test('deployment bundle ships a scaffolded user sub-flow document', async ({ page }) => {
  // Scaffold a non-AI sub-flow from a run task's inspector.
  await page.getByRole('button', { name: 'Add Run JavaScript task' }).press('Enter');
  await page.getByLabel('Run mode').selectOption('subflow');
  await page.getByLabel('Sub-flow name', { exact: true }).fill('billing-process');
  await page.getByLabel('Sub-flow name', { exact: true }).blur();
  await page.getByRole('button', { name: /Scaffold.*billing-process/i }).click();
  await expect(page.locator('.workflow-name-input')).toHaveValue('billing-process');
  await expect(page.locator('.document-tab')).toHaveCount(2);

  // Back on the parent, the bundle ships the scaffolded sub-flow document.
  await page.locator('.document-tab').first().click();
  await page.getByRole('button', { name: 'Deploy bundle' }).click();
  const bundleDialog = page.getByRole('dialog', { name: 'Workflow Deployment Bundle' });
  await expect(bundleDialog).toBeVisible();
  await page.getByRole('button', { name: 'deployment.yaml', exact: true }).click();
  await expect(page.locator('pre')).toContainText('subflows/');
  await expect(page.locator('pre')).toContainText('billing-process.yaml: |');
  await expect(page.locator('pre')).toContainText('subflowReady: true');

  // The user sub-flow artifact previews in its own tab (Task 44).
  await page.getByRole('button', { name: /subflows\/.*billing-process\.yaml/ }).click();
  await expect(page.locator('pre')).toContainText('subflowReady: true');
});

// ---------------------------------------------------------------------------
// Task 38: demo engine executes referenced sub-flow documents
// ---------------------------------------------------------------------------

test('demo engine executes the scaffolded sub-flow document', async ({ page }) => {
  // Scaffold a non-AI sub-flow from a run task's inspector.
  await page.getByRole('button', { name: 'Add Run JavaScript task' }).press('Enter');
  await page.getByLabel('Run mode').selectOption('subflow');
  await page.getByLabel('Sub-flow name', { exact: true }).fill('billing-process');
  await page.getByLabel('Sub-flow name', { exact: true }).blur();
  await page.getByRole('button', { name: /Scaffold.*billing-process/i }).click();
  await expect(page.locator('.workflow-name-input')).toHaveValue('billing-process');

  // Back on the parent, running against the demo engine executes the sub-flow.
  await page.locator('.document-tab').first().click();
  await expect(page.locator('.runtime-pace-control select')).toBeVisible();
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.locator('.runtime-status-completed')).toBeVisible({ timeout: 8000 });
  const logs = page.getByLabel('Workflow run logs');
  await expect(logs).toContainText('Executing sub-flow dubai-government/billing-process');
  await expect(logs).toContainText('Completed sub-flow dubai-government/billing-process');
  await expect(logs).toContainText('Completed local demo run');

  // The task timeline annotates executed sub-flow steps with their scope.
  const subflowStep = page.locator('.runtime-progress-item').filter({ hasText: 'initSubflow' }).first();
  await expect(subflowStep).toContainText('runTask/subflow/billing-process/initSubflow');
});

test('demo engine executes the scaffolded AI sub-flow document (Task 40)', async ({ page }) => {
  // Add an LLM call task: the catalog-backed ai/prompt-llm sub-flow scaffolds
  // in a new tab, so the workspace document exists for the delegation.
  await page.keyboard.press('Control+Shift+P');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await expect(dialog).toBeVisible();
  await page.keyboard.type('Add LLM call task');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.document-tab')).toHaveCount(2);

  // Back on the parent: the sandbox script result must land under the script
  // task name so the canonical captureResult mapping resolves, and the run
  // completes instead of producing an undefined llmResult.
  await page.locator('.document-tab').first().click();
  await expect(page.locator('.runtime-pace-control select')).toBeVisible();
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.locator('.runtime-status-completed')).toBeVisible({ timeout: 10000 });
  const logs = page.getByLabel('Workflow run logs');
  await expect(logs).toContainText('Executing sub-flow ai/prompt-llm');
  await expect(logs).toContainText('Completed sub-flow ai/prompt-llm');
  await expect(logs).toContainText('Completed local demo run');
});

// ---------------------------------------------------------------------------
// Task 39: problems panel flags unresolved sub-flow references
// ---------------------------------------------------------------------------

test('problems panel flags an unresolved sub-flow target and selects its task', async ({ page }) => {
  // Configure a run task as a sub-flow delegation WITHOUT scaffolding a
  // document — the workspace has no matching sub-flow.
  await page.getByRole('button', { name: 'Add Run JavaScript task' }).press('Enter');
  await page.getByLabel('Run mode').selectOption('subflow');
  await page.getByLabel('Sub-flow name', { exact: true }).fill('billing-process');
  await page.getByLabel('Sub-flow name', { exact: true }).blur();

  await page.keyboard.press('Control+Shift+M');
  const panel = page.locator('.problems-panel');
  await expect(panel).toHaveClass(/open/);
  await expect(panel).toContainText('Sub-flow references');
  await expect(panel).toContainText('billing-process');
  await expect(panel).toContainText('has no document in the workspace');

  // Clicking the warning selects the delegating task (its Inspector opens)
  // and highlights the node on the canvas.
  await panel.locator('.problems-item').filter({ hasText: 'billing-process' }).click();
  await expect(page.getByLabel('Run mode')).toBeVisible();
  await expect(page.getByLabel('Sub-flow name', { exact: true })).toHaveValue('billing-process');
  await expect(page.locator('.react-flow__node-task', { hasText: 'runTask' })).toHaveClass(/selected/);

  // The Scaffold action opens the sub-flow document; the warning resolves.
  await panel.getByRole('button', { name: 'Scaffold', exact: true }).click();
  await expect(page.locator('.workflow-name-input')).toHaveValue('billing-process');
  await expect(page.locator('.document-tab')).toHaveCount(2);
  await page.locator('.document-tab').first().click();
  await expect(page.locator('.problems-panel')).not.toContainText('has no document in the workspace');
});

// ---------------------------------------------------------------------------
// Task 36: full right-rail collapse renders an icon strip without clipped text
// ---------------------------------------------------------------------------

test('right-rail full collapse shows the icon strip without clipped text', async ({ page }) => {
  // Select a task so the Inspector is populated, then collapse both panels.
  await page.getByRole('group', { name: 'set task checkTravelPassExpiry' }).click();
  await page.getByRole('button', { name: 'Collapse Inspector' }).click();
  await page.getByRole('button', { name: 'Collapse Runtime' }).click();

  const head = page.locator('.inspector-head').first();
  await expect(head).toBeVisible();
  const content = await head.evaluate((el) => window.getComputedStyle(el, '::after').content);
  expect(content).toBe('"☰"');
  await expect(page.locator('body')).not.toContainText('INSPEC');

  // Expand both back — the rail returns to its normal panels.
  await page.getByRole('button', { name: 'Expand Inspector' }).click();
  await page.getByRole('button', { name: 'Expand Runtime' }).click();
  await expect(page.locator('.inspector-head')).not.toHaveClass(/inspector-collapsed/);
  await expect(page.locator('.side-runtime-panel')).not.toHaveClass(/runtime-panel-collapsed/);
});
