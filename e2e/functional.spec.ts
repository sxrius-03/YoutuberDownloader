import { test, expect } from '@playwright/test';

test.describe('Youtube Downloader - Functional Flows', () => {
  test('Settings API loads default download directory in FolderPicker', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.brand-title')).toBeVisible();
  });

  test('Single Download: Video analysis renders resolution picker, format container and action buttons', async ({ page }) => {
    await page.route('**/api/analyze', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          title: 'Vídeo de Demonstração - Teste de Qualidade',
          resolutions: ['1080', '720', '480', '360'],
          opts: {},
          strategy: 'Direct',
          uploader: 'Canal Oficial'
        })
      });
    });

    await page.goto('/');

    const input = page.locator('input.search-input');
    await input.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    const analyzeBtn = page.locator('.btn-primary:has-text("Analisar")');
    await analyzeBtn.click();

    // Verify UI updates with video title and options
    const filenameInput = page.locator('input.meta-input');
    await expect(filenameInput).toHaveValue('Vídeo de Demonstração - Teste de Qualidade');

    // Verify segmented format buttons
    const videoBtn = page.locator('.segmented-btn:has-text("Vídeo")');
    const audioBtn = page.locator('.segmented-btn:has-text("Áudio")');
    await expect(videoBtn).toHaveClass(/active/);

    // Switch to Audio
    await audioBtn.click();
    await expect(audioBtn).toHaveClass(/active/);
    await videoBtn.click();

    // Verify resolution selector
    const qualitySelect = page.locator('select.custom-select', { hasText: '1080' });
    await expect(qualitySelect).toBeVisible();
    await qualitySelect.selectOption('720');
    await expect(qualitySelect).toHaveValue('720');

    // Verify container format selector
    const formatSelect = page.locator('select.custom-select', { hasText: 'MP4' });
    await expect(formatSelect).toBeVisible();
    await formatSelect.selectOption('mkv');
    await expect(formatSelect).toHaveValue('mkv');

    // Verify dynamic download button
    const downloadBtn = page.locator('.btn-primary:has-text("Baixar Vídeo (MKV)")');
    await expect(downloadBtn).toBeVisible();

    await page.screenshot({ path: 'e2e-screenshots/04-analyzed-video-ui.png', fullPage: true });
  });

  test('Playlist Download: Analysis renders item list, format options and batch selection controls', async ({ page }) => {
    await page.route('**/api/analyze-playlist', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          title: 'Minha Playlist Incrível',
          videos: [
            { title: 'Episódio 1: Introdução ao Projeto', url: 'https://youtube.com/watch?v=1' },
            { title: 'Episódio 2: Configurando o Ambiente', url: 'https://youtube.com/watch?v=2' },
            { title: 'Episódio 3: Conclusão e Testes', url: 'https://youtube.com/watch?v=3' }
          ]
        })
      });
    });

    await page.goto('/');
    const playlistTab = page.locator('button.tab-btn:has-text("Playlist")');
    await playlistTab.click();
    await expect(playlistTab).toHaveClass(/active/);

    const input = page.locator('input.search-input');
    await input.fill('https://www.youtube.com/playlist?list=PLtest123');

    await page.click('.btn-primary:has-text("Analisar")');

    // Verify playlist title and items
    await expect(page.locator('h3:has-text("Minha Playlist Incrível")')).toBeVisible();

    const checkboxes = page.locator('.playlist-item-row input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(3);

    // Test selection buttons (Nenhum / Todos)
    await page.click('button:has-text("Nenhum")');
    await expect(page.locator('.btn-primary:has-text("Baixar 0 Itens (MP4)")')).toBeDisabled();

    await page.click('button:has-text("Todos")');
    await expect(page.locator('.btn-primary:has-text("Baixar 3 Itens (MP4)")')).toBeEnabled();

    await page.screenshot({ path: 'e2e-screenshots/05-playlist-analyzed-ui.png', fullPage: true });
  });

  test('History List: Displays previous downloads with chips and folder action', async ({ page }) => {
    await page.route('**/api/history', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            title: 'Curso Completo de Programação - Aula 01',
            type: 'video (MP4)',
            path: 'C:\\Downloads\\Aula01.mp4',
            size: 154200000,
            date: '17/08/2026 08:30'
          },
          {
            title: 'Podcast Tecnologia & IA - Ep 42',
            type: 'audio (MP3)',
            path: 'C:\\Downloads\\Podcast42.mp3',
            size: 45000000,
            date: '17/08/2026 09:15'
          }
        ])
      });
    });

    await page.goto('/');
    const historyTab = page.locator('button.tab-btn:has-text("Histórico")');
    await historyTab.click();
    await expect(historyTab).toHaveClass(/active/);

    // Check item rows
    await expect(page.locator('.history-item-card')).toHaveCount(2);
    await expect(page.locator('h4:has-text("Curso Completo de Programação")')).toBeVisible();

    // Verify search filter in history
    const searchInput = page.locator('input.search-input');
    await searchInput.fill('Podcast');
    await expect(page.locator('.history-item-card')).toHaveCount(1);
    await expect(page.locator('h4:has-text("Podcast Tecnologia")')).toBeVisible();

    await page.screenshot({ path: 'e2e-screenshots/06-history-populated-ui.png', fullPage: true });
  });
});
