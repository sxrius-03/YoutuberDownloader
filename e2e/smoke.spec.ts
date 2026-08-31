import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Youtube Downloader Desktop App - Smoke & Visual', () => {
  test.beforeAll(async () => {
    const screenshotDir = path.join(process.cwd(), 'e2e-screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('App loads without errors and renders main header', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');

    // Check title and brand
    await expect(page.locator('.brand-title')).toContainText('Youtube Downloader');
    await expect(page.locator('.brand-subtitle')).toHaveText(/Desktop Native v\d+\.\d+\.\d+/);

    // Check tabs are present
    const singleTab = page.locator('button.tab-btn:has-text("Download Único")');
    const playlistTab = page.locator('button.tab-btn:has-text("Playlist")');
    const historyTab = page.locator('button.tab-btn:has-text("Histórico")');

    await expect(singleTab).toBeVisible();
    await expect(playlistTab).toBeVisible();
    await expect(historyTab).toBeVisible();

    // Check active tab class
    await expect(singleTab).toHaveClass(/active/);

    // Check Single Download input
    const input = page.locator('input.search-input');
    await expect(input).toBeVisible();

    // Capture screenshot of Single Download tab
    await page.screenshot({ path: 'e2e-screenshots/01-single-download.png', fullPage: true });

    expect(errors).toEqual([]);
  });

  test('Can navigate between all 3 tabs smoothly', async ({ page }) => {
    await page.goto('/');

    const singleTab = page.locator('button.tab-btn:has-text("Download Único")');
    const playlistTab = page.locator('button.tab-btn:has-text("Playlist")');
    const historyTab = page.locator('button.tab-btn:has-text("Histórico")');

    // Go to Playlist tab
    await playlistTab.click();
    await expect(playlistTab).toHaveClass(/active/);
    await page.waitForTimeout(300);
    const playlistInput = page.locator('input.search-input');
    await expect(playlistInput).toBeVisible();
    await page.screenshot({ path: 'e2e-screenshots/02-playlist-tab.png', fullPage: true });

    // Go to History tab
    await historyTab.click();
    await expect(historyTab).toHaveClass(/active/);
    await page.waitForTimeout(300);
    await expect(page.locator('h3:has-text("Histórico de Downloads")')).toBeVisible();
    await page.screenshot({ path: 'e2e-screenshots/03-history-tab.png', fullPage: true });

    // Return to Single Download tab
    await singleTab.click();
    await expect(singleTab).toHaveClass(/active/);
    await page.waitForTimeout(300);
    const singleInput = page.locator('input.search-input');
    await expect(singleInput).toBeVisible();
  });
});
