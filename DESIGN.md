# Design System — Youtube Downloader

## 🎨 Color Tokens (OKLCH)

```css
:root {
  /* Background & Surfaces */
  --bg-app: oklch(0.13 0.015 260);
  --bg-surface: oklch(0.17 0.015 260);
  --bg-surface-elevated: oklch(0.21 0.02 260);
  --bg-surface-hover: oklch(0.24 0.02 260);
  --bg-input: oklch(0.15 0.015 260);

  /* Borders */
  --border-subtle: oklch(0.25 0.02 260);
  --border-medium: oklch(0.32 0.025 260);
  --border-focus: oklch(0.60 0.20 250);

  /* Brand Accents */
  --accent-primary: oklch(0.62 0.23 27); /* YouTube Vermilion */
  --accent-primary-hover: oklch(0.67 0.24 27);
  --accent-secondary: oklch(0.60 0.19 250); /* Pro Blue */
  --accent-secondary-hover: oklch(0.66 0.20 250);

  /* Status Colors */
  --success: oklch(0.70 0.17 145);
  --success-bg: oklch(0.22 0.06 145);
  --warning: oklch(0.75 0.16 85);
  --error: oklch(0.65 0.22 27);
  --error-bg: oklch(0.22 0.08 27);

  /* Text & Ink */
  --text-primary: oklch(0.96 0.005 260);
  --text-secondary: oklch(0.74 0.015 260);
  --text-muted: oklch(0.52 0.015 260);

  /* Radii */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.25);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.35);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.45);
}
```

## 🔤 Typography

- **Interface:** `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Data / Metrics (Speed, ETA, Resolution):** `'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace`
- **Scale:**
  - `h1` (App Title): `1.25rem` (`20px`), weight `700`, letter-spacing `-0.02em`
  - `h2` (Section / Video Title): `1.05rem` (`17px`), weight `600`
  - `body`: `0.875rem` (`14px`), line-height `1.5`
  - `caption / badges`: `0.75rem` (`12px`), weight `600`

## 🧩 Components Architecture

1. **Header & Navigation:**
   - Unified app bar with compact logo badge, tab switch pills (`Vídeo`, `Playlist`, `Histórico`), and version tag.
2. **Search / URL Input Pill:**
   - Seamless input bar integrating clipboard "Colar" button and primary "Analisar" button with loading spinners.
3. **Media Card (Single Download):**
   - Compact 2-column card: left has thumbnail with duration pill; right has title, author channel, quality/format selector chips, save folder picker with "Explorar", and the primary Download button.
4. **Playlist Manager:**
   - Smart header with "Selecionar Tudo / Desmarcar", total items counter, scrollable list with custom checkboxes and thumbnail chips.
5. **Real-time Download HUD:**
   - Progress bar with percentage, speed (`MB/s`), downloaded size (`X MB / Y MB`), and estimated time remaining (`ETA`).
6. **History Explorer:**
   - Clean tabular/list layout with status badge, date (`dd-mm-yyyy`), format chip, and direct "Abrir Pasta" action.
