import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('homepage has no critical accessibility violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    // Filter out serious/critical violations
    const violations = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));

    if (violations.length > 0) {
      console.log(
        'Accessibility violations:',
        violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.length,
        })),
      );
    }

    expect(violations).toEqual([]);
  });

  test('command palette has proper ARIA attributes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open command palette
    await page.keyboard.press('Control+Shift+p');
    await page.waitForTimeout(500);

    const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();

    const violations = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));

    expect(violations).toEqual([]);
  });
});
