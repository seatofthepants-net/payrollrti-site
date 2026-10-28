# Design: payrollrti.uk

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule.

## System
- Genre: modern-minimal
- Shape of the first page: kept from the original site (hero, problem, what it does, install, questions, download band); `/releases/` and `/stats/` are Long Documents
- Theme: brand (the app icon: a deep green field and a gold £, on cream paper)
- Posture: committed; the green field carries the header, the hero and the closing band, and gold stays a signal (the primary button, the current nav item, the focus ring on green)

## Tokens
`src/tokens.css` is the source of truth; `scripts/build.mjs` inlines it with `src/base.css` into the one hashed stylesheet. The roles:
```css
:root {
  --color-paper: oklch(96.8% 0.014 89);       /* cream page */
  --color-paper-2: oklch(93.2% 0.023 87);     /* wells, notice strip, footer */
  --color-paper-raised: oklch(99.4% 0.007 89);/* alternate section band */
  --color-ink: oklch(23.4% 0.007 164);
  --color-muted: oklch(44.8% 0.013 158);
  --color-rule: oklch(88.7% 0.03 88);
  --color-field: oklch(29.8% 0.047 175);      /* the icon green */
  --color-on-field: oklch(96.8% 0.014 89);
  --color-accent: oklch(76.5% 0.139 78);      /* the icon gold */
  --color-accent-ink: var(--color-ink);
  --color-focus: oklch(42.3% 0.069 171);      /* on light paper; gold on the green field */
  --font-display: "Rethink Sans";             /* 800, tracking -0.015em */
  --font-body: "Public Sans";                 /* 400 and 700, 18px body */
  --font-outlier: Georgia;                    /* the £ mark only */
  --radius-card: 14px; --radius-control: 10px; --radius-inner: 8px;
}
```
Spacing is the `--space-*` scale only (2, 4, 8, 12, 16, 24, 40, 64, 96, 144). Fonts are self-hosted in `src/fonts/` (the CSP allows nothing else).

## Surfaces
- Whitespace, then a hairline (`--color-rule`), then a tinted well (`--color-paper` on the raised band), then a card: a 1px border, no fill, no shadow, kept for content of another kind (steps, releases, stats).
- One shadow recipe, `--shadow-card`, only on screenshots, the drawn install steps and the app icon.

## Controls
- Primary: gold fill, ink text, `--radius-control`, 52px (44px small), one per screen
- Secondary: outline in `--color-on-field-edge` on green, same radius and height
- Every control: hover is one colour step, `:active` drops 1px, focus is a 3px ring at 3:1 or better, instant

## Motion
- Character: still. Colour and border transitions at `--dur-short`, the FAQ plus turns at `--dur-short`; under reduced motion everything ends at once.

## Exports
`src/tokens.css` in this project. Tailwind, DTCG or shadcn blocks are added here on request, per `export-formats.md`.
