import { test, expect } from '@playwright/test';

test('landing page loads', async ({ page }) => {
  await page.goto('/');
  // Expect the title to contain "Quran" or similar
  await expect(page).toHaveTitle(/Quran/i);
});

test('checks for main navigation', async ({ page }) => {
  await page.goto('/');
  // Check if we can find a generic element like main or a header
  await expect(page.locator('main')).toBeVisible();
});
