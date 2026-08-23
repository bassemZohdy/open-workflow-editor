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
  await expect(page.locator('pre')).toContainText('COPY ai/ /app/ai/');
  await expect(page.locator('pre')).toContainText('WORKFLOW_SUBFLOW_PATH=/app/ai');

  await page.getByRole('button', { name: 'deployment.yaml', exact: true }).click();
  await expect(page.locator('pre')).toContainText('ai/prompt-llm.yaml: |');
  await expect(page.locator('pre')).toContainText('subPath: ai/prompt-llm.yaml');

  await page.getByRole('button', { name: 'README.md', exact: true }).click();
  await expect(page.locator('pre')).toContainText('AI Sub-flows');
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
