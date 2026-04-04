import { expect, test } from '@playwright/test';
import { buildCheckoutItems, paddlePriceIds } from '../src/lib/paddle/prices';
import { getTeacherTotalPrice } from '../src/lib/teacherPlan';

test('teacher pricing uses base plus seats', async () => {
  expect(getTeacherTotalPrice('monthly', 8)).toBe(50);
  expect(getTeacherTotalPrice('yearly', 8)).toBe(480);
});

test('teacher checkout uses base and seat items', async () => {
  expect(buildCheckoutItems('teacher', 'monthly', 8)).toEqual([
    { priceId: paddlePriceIds.teacherBase.monthly, quantity: 1 },
    { priceId: paddlePriceIds.teacherSeat.monthly, quantity: 8 },
  ]);

  expect(buildCheckoutItems('student', 'yearly')).toEqual([
    { priceId: paddlePriceIds.student.yearly, quantity: 1 },
  ]);
});

test('landing page teacher calculator updates with seat count and billing cycle', async ({ page }) => {
  await page.goto('/#pricing');

  const seatInput = page.getByLabel('Teacher student count');
  await expect(seatInput).toHaveValue('8');
  await expect(page.getByText('Teacher base + 8 student seats at $5 each.')).toBeVisible();
  await expect(page.getByText('$50/mo')).toBeVisible();

  await seatInput.fill('12');
  await expect(page.getByText('Teacher base + 12 student seats at $5 each.')).toBeVisible();
  await expect(page.getByText('$70/mo')).toBeVisible();

  await page.getByRole('button', { name: 'Yearly' }).click();
  await expect(page.getByText('Teacher base + 12 student seats at $48 each.')).toBeVisible();
  await expect(page.getByText('$672/yr')).toBeVisible();
});
