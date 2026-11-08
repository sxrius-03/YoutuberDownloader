# Design System — Youtube Downloader

Tema escuro OKLCH, registro "product / Operate". Regra central: **uma ação primária por tela, e a cor diz qual é**.

## Color Tokens (OKLCH)

Fonte da verdade: `frontend/src/index.css` (`:root`).

```css
:root {
  /* Superfícies */
  --bg-app: oklch(0.12 0.015 260);
  --bg-surface: oklch(0.16 0.018 260);
  --bg-surface-elevated: oklch(0.20 0.022 260);
  --bg-surface-hover: oklch(0.24 0.025 260);
  --bg-input: oklch(0.14 0.015 260);

  /* Bordas */
  --border-subtle: oklch(0.24 0.02 260);
  --border-medium: oklch(0.32 0.025 260);
  --border-focus: oklch(0.60 0.20 250);

  /* Marca (vermilion): SOMENTE badge da marca, chip de vídeo e erro */
  --accent-primary: oklch(0.60 0.22 25);

  /* Azul: navegação, ícones e ações de preparar */
  --accent-blue: oklch(0.60 0.19 250);
  --accent-blue-hover: oklch(0.65 0.20 250);
  --accent-blue-bg: oklch(0.22 0.06 250);

  /* Ação de preparar (Analisar, Baixar um vídeo): azul sólido, texto branco >= 4.5:1 */
  --accent-action: oklch(0.52 0.19 255);
  --accent-action-hover: oklch(0.56 0.19 255);
  --accent-action-active: oklch(0.46 0.18 255);

  /* Ação final (Baixar): verde sólido, texto branco >= 4.5:1 */
  --accent-download: oklch(0.50 0.14 150);
  --accent-download-hover: oklch(0.54 0.14 150);
  --accent-download-active: oklch(0.44 0.13 150);

  /* Status */
  --success: oklch(0.70 0.17 145);  --success-bg: oklch(0.22 0.06 145);
  --warning: oklch(0.75 0.16 85);   --warning-bg: oklch(0.24 0.06 85);
  --error: oklch(0.62 0.22 25);     --error-bg: oklch(0.22 0.07 25);

  /* Texto */
  --text-primary: oklch(0.96 0.005 260);
  --text-secondary: oklch(0.75 0.015 260);
  --text-muted: oklch(0.62 0.015 260);
}
```

### Hierarquia de botões

| Nível | Classe | Aparência |
| --- | --- | --- |
| Final (1 por tela) | `.btn-primary.btn-download` | Verde sólido (`--accent-download*`), largura total, 48px |
| Preparar | `.btn-primary` | Azul sólido (`--accent-action*`) |
| Secundário | `.btn-icon-action` | Fantasma com borda neutra; ícone e borda de hover azuis |
| Desabilitado | `:disabled` | Superfície elevada + texto muted |

O progresso (`.hud-progress-fill`) vai de azul para verde. Vermelho nunca aparece em aba ativa nem em botão.

## Tipografia

- **Interface:** Inter. **Dados (velocidade, ETA, tamanho, caminho):** JetBrains Mono.
- Título de seção (`.section-title`) 1.05rem/700; rótulo de campo (`.meta-label`) 0.8rem/600, sem caixa alta; corpo 0.875rem; legenda 0.75rem.

## Componentes

1. **Cabeçalho:** badge da marca (vermilion), título e "Desktop Native vX.Y.Z". Sem pílula de status (não havia estado real por trás).
2. **Abas** (`role="tablist"`, `role="tab"`, `aria-selected`; classes `tab-btn` / `active`): linha inferior neutra; aba ativa = superfície elevada + indicador azul de 2px na base.
3. **Barra de URL:** campo com "Colar" (secundário) e "Analisar" (azul). Foco no contêiner via `:focus-within`.
4. **Passo-a-passo** (`.steps-guide`): três passos compactos, sem cards, exibido enquanto não há análise (Download Único e Playlist).
5. **Download Único:** miniatura + campos (nome, tipo, resolução, formato, pasta) + HUD de progresso + botão Baixar. Ao concluir: faixa de sucesso com "Abrir pasta" e "Baixar outro".
6. **Playlist:** linhas `<label>` com checkbox real, indicador de "melhor qualidade disponível", barra de progresso da fila (concluídos+erros / total) e resumo "N concluídos, M com erro" com "Abrir pasta".
7. **Histórico:** chip com o formato real (extraído de `tipo (FORMATO)`), tamanho, data como vem do backend, "Abrir Pasta". Estado vazio leva à aba Download Único.
8. **Seletor de pasta:** sem pasta mostra "Nenhuma pasta escolhida" em muted e botão "Escolher pasta"; erros aparecem inline.
9. **Faixas de feedback** (`Banner`, `.banner-error` / `.banner-success`): substituem `alert()` e estilos inline.
10. **Modal de atualização** (`UpdateChecker`, classes `.update-*`): `role="dialog"` `aria-modal` `aria-labelledby`, foco inicial em "Atualizar Agora" (`.btn-primary.btn-download`, verde: instalar), "Lembrar mais tarde" em `.btn-ghost`, Esc fecha (exceto durante a atualização), seta de versão com ícone lucide `ArrowRight`.
11. **Formatos de saída:** rótulos curtos (`MP4 (Universal)`, `MKV (Matroska)`...) em `frontend/src/containers.ts`, fonte única para Download Único e Playlist; teste e2e garante que o texto selecionado cabe no select.

## Acessibilidade e movimento

- `:focus-visible` com contorno de 2px (`--border-focus`) em todos os controles.
- `prefers-reduced-motion: reduce` desliga animações e transições.
- `@keyframes spin` e `modalSlideIn` vivem no `index.css`; spinners usam `.spin-animation`.
- Datas exibidas: `dd-mm-yyyy`. O campo `date` do histórico é mostrado como o backend o entrega.
