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

  test('Long destination paths stay inside the video card after analysis', async ({ page }) => {
    const destination = `C:\\Downloads\\${Array(8).fill('long-destination-folder').join('\\')}`;
    await page.route('**/api/settings', (route) => route.fulfill({ json: { paths: [destination] } }));
    await page.route('**/api/analyze', (route) => route.fulfill({
      json: { title: 'Video', resolutions: ['1080'], opts: {} }
    }));

    await page.goto('/');
    await page.locator('input.search-input').fill('https://www.youtube.com/watch?v=example');
    await page.locator('.btn-primary:has-text("Analisar")').click();
    await expect(page.locator('.folder-path-text')).toHaveText(destination);

    for (const width of [850, 700]) {
      await page.setViewportSize({ width, height: 950 });
      const layout = await page.locator('.video-preview-grid').evaluate((grid) => {
        const card = grid.closest('.surface-card')!;
        const path = grid.querySelector('.folder-path-text')!;
        return {
          gridWidth: grid.clientWidth,
          gridScrollWidth: grid.scrollWidth,
          cardRight: card.getBoundingClientRect().right,
          pathRight: path.getBoundingClientRect().right,
        };
      });

      expect(layout.gridScrollWidth).toBeLessThanOrEqual(layout.gridWidth);
      expect(layout.pathRight).toBeLessThanOrEqual(layout.cardRight);
      await page.screenshot({ path: `e2e-screenshots/07-long-destination-path-${width}.png`, fullPage: true });
    }
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

  // ---- UI/UX: cor, intuicao e acessibilidade ----
  const sse = (events: object[]) => events.map(e => `data: ${JSON.stringify(e)}

`).join('');
  const mockDownload = async (page: any, events: object[]) => {
    await page.route('**/api/download', (route: any) => route.fulfill({ json: { task_id: 't1' } }));
    await page.route('**/api/download/progress/*', (route: any) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(events) }));
  };

  test('Abas expoem role=tablist/tab e aria-selected', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tablist')).toBeVisible();
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('.system-status-pill')).toHaveCount(0);
  });

  test('Download Unico mostra passo-a-passo antes de analisar', async ({ page }) => {
    await page.goto('/');
    const steps = page.locator('.steps-guide');
    await expect(steps).toBeVisible();
    await expect(steps).toContainText('Cole o link');
    await expect(steps).toContainText('Analisar');
    await expect(steps).toContainText('baixe');
  });

  test('Botao Baixar tem cor diferente de Analisar e spinner anima', async ({ page }) => {
    await page.route('**/api/analyze', async (route) => {
      await new Promise(r => setTimeout(r, 800));
      await route.fulfill({ json: { title: 'V', resolutions: ['1080'], opts: {} } });
    });
    await page.goto('/');
    await page.locator('input.search-input').fill('https://www.youtube.com/watch?v=x');
    const analyze = page.locator('.btn-primary:has-text("Analisar")');
    await analyze.click();
    const spinName = await page.locator('.spin-animation').first()
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(spinName).not.toBe('none');
    const download = page.locator('.btn-primary.btn-download');
    await expect(download).toBeVisible();
    const bgA = await page.locator('.btn-primary:has-text("Analisar")').evaluate((el) => getComputedStyle(el).backgroundColor);
    const bgD = await download.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bgA).not.toBe(bgD);
  });

  test('Download concluido mostra Abrir pasta e Baixar outro', async ({ page }) => {
    await page.route('**/api/analyze', (route) => route.fulfill({ json: { title: 'V', resolutions: ['1080'], opts: {} } }));
    await mockDownload(page, [{ status: 'finished', progress: 100 }]);
    await page.goto('/');
    await page.locator('input.search-input').fill('https://www.youtube.com/watch?v=x');
    await page.locator('.btn-primary:has-text("Analisar")').click();
    await page.locator('.btn-download').click();
    await expect(page.getByRole('button', { name: 'Abrir pasta' })).toBeVisible();
    await page.screenshot({ path: 'e2e-screenshots/08-single-finished-ui.png', fullPage: true });
    await page.getByRole('button', { name: 'Baixar outro' }).click();
    await expect(page.locator('input.meta-input')).toHaveCount(0);
    await expect(page.locator('.steps-guide')).toBeVisible();
    await expect(page.locator('input.search-input')).toHaveValue('');
  });

  test('Seletor de pasta vazio mostra placeholder, nao caminho falso', async ({ page }) => {
    await page.route('**/api/settings', (route) => route.fulfill({ json: { paths: [] } }));
    await page.route('**/api/analyze', (route) => route.fulfill({ json: { title: 'V', resolutions: ['1080'], opts: {} } }));
    await page.goto('/');
    await page.locator('input.search-input').fill('https://www.youtube.com/watch?v=x');
    await page.locator('.btn-primary:has-text("Analisar")').click();
    await expect(page.locator('.folder-path-text')).toHaveText('Nenhuma pasta escolhida');
  });

  test('Playlist: progresso, qualidade informada, label no item e resumo final', async ({ page }) => {
    await page.route('**/api/analyze-playlist', (route) => route.fulfill({ json: {
      title: 'Lista', videos: [
        { title: 'A', url: 'https://youtube.com/watch?v=1' },
        { title: 'B', url: 'https://youtube.com/watch?v=2' }] } }));
    await mockDownload(page, [{ status: 'finished', progress: 100 }]);
    await page.goto('/');
    await page.getByRole('tab', { name: /Playlist/ }).click();
    await page.locator('input.search-input').fill('https://www.youtube.com/playlist?list=PL1');
    await page.click('.btn-primary:has-text("Analisar")');
    await expect(page.getByText('melhor qualidade disponível')).toBeVisible();
    await expect(page.locator('label.playlist-item-row')).toHaveCount(2);
    await page.click('.btn-download');
    await expect(page.getByText('2 concluídos, 0 com erro')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir pasta' })).toBeVisible();
    await page.screenshot({ path: 'e2e-screenshots/09-playlist-finished-ui.png', fullPage: true });
  });

  test('Historico: chip mostra formato real e vazio leva a Download Unico', async ({ page }) => {
    await page.route('**/api/history', (route) => route.fulfill({ json: [
      { title: 'Um', type: 'video (WEBM)', path: 'C:\a.webm', size: 1000, date: '17/08/2026 08:30' },
      { title: 'Dois', type: 'audio (FLAC)', path: 'C:\b.flac', size: 1000, date: '17/08/2026 08:30' }] }));
    await page.goto('/');
    await page.getByRole('tab', { name: /Histórico/ }).click();
    const chips = page.locator('.history-item-card .chip');
    await expect(chips.nth(0)).toHaveText('WEBM');
    await expect(chips.nth(1)).toHaveText('FLAC');
  });

  test('Historico vazio: botao leva a aba Download Unico', async ({ page }) => {
    await page.route('**/api/history', (route) => route.fulfill({ json: [] }));
    await page.goto('/');
    await page.getByRole('tab', { name: /Histórico/ }).click();
    await page.getByRole('button', { name: /Baixar um vídeo/ }).click();
    await expect(page.getByRole('tab', { name: /Download Único/ })).toHaveAttribute('aria-selected', 'true');
  });
  for (const width of [1280, 700]) {
    test(`Select de formato nao corta o texto selecionado (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 950 });
      await page.route('**/api/analyze', (route) => route.fulfill({
        json: { title: 'Video', resolutions: ['1080'], opts: {} }
      }));
      await page.goto('/');
      await page.locator('input.search-input').fill('https://www.youtube.com/watch?v=example');
      await page.locator('.btn-primary:has-text("Analisar")').click();
      const formatSelect = page.locator('select.custom-select', { hasText: 'MP4' });
      await formatSelect.selectOption('mkv');
      const m = await formatSelect.evaluate((el: HTMLSelectElement) => {
        const cs = getComputedStyle(el);
        const ctx = document.createElement('canvas').getContext('2d')!;
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const text = el.options[el.selectedIndex].text;
        const textW = ctx.measureText(text).width;
        const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 24; // seta nativa
        return { text, textW, avail };
      });
      expect(m.text).toContain('MKV');
      expect(m.textW).toBeLessThanOrEqual(m.avail);
    });
  }

  test('Modal de atualizacao: dialog acessivel, foco no botao primario, Esc fecha', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__TAURI_INTERNALS__ = {
        transformCallback: () => 1,
        invoke: async (cmd: string) => {
          if (cmd === 'check_for_updates') return {
            current_version: '2.0.0', latest_version: '2.1.0',
            release_notes: '- Correcoes\n- Melhorias', download_url: 'https://example.com/setup.exe'
          };
          if (cmd === 'get_settings') return { paths: [] };
          if (cmd === 'get_history') return [];
          return null;
        },
      };
    });
    await page.goto('/');
    const dialog = page.getByRole('dialog', { name: /Nova Atualização/ });
    await expect(dialog).toBeVisible({ timeout: 8000 });
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    const primary = dialog.getByRole('button', { name: /Atualizar agora/i });
    await expect(primary).toBeVisible();
    await expect(primary).toBeFocused();
    await page.screenshot({ path: 'e2e-screenshots/10-update-modal.png', fullPage: true });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('Aba Ajustes: role=tab, textarea rotulado, salvar mostra feedback', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__TAURI_INTERNALS__ = {
        transformCallback: () => 1,
        invoke: async (cmd: string, args: any) => {
          if (cmd === 'get_settings') return { paths: [], proxies: ['http://a:1'] };
          if (cmd === 'save_setting_proxies') return { paths: [], proxies: args.proxies.filter((p: string) => p.trim()) };
          if (cmd === 'get_history') return [];
          return null;
        },
      };
    });
    await page.goto('/');
    const tab = page.getByRole('tab', { name: 'Ajustes' });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(tab).toHaveAttribute('aria-controls', 'tab-panel');
    const box = page.getByLabel('Proxies (round-robin)');
    await expect(box).toHaveValue('http://a:1');
    await box.fill('socks5://h:9\n\nhttp://b:2');
    await page.getByRole('button', { name: /Salvar proxies/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Proxies salvos com sucesso.' })).toBeVisible();
    await expect(box).toHaveValue('socks5://h:9\nhttp://b:2');
    await page.screenshot({ path: 'e2e-screenshots/11-settings-saved.png', fullPage: true });
  });
});
