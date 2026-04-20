# Viewport UX Checklist

Use these four profiles when checking layout changes:

| Format | Suggested viewport | Primary input | UX expectation |
| --- | --- | --- | --- |
| 10 inch tablet | 1024 x 768 | Touch | Single-column content where needed, large controls, horizontal scroll only for dense tables. |
| 17 inch laptop | 1440 x 900 | Mouse / trackpad | Balanced page width, compact admin tables, no oversized controls. |
| 22 inch monitor | 1920 x 1080 | Mouse / keyboard | Wider dashboard grids, readable dense data, useful page width without excessive stretching. |
| 32 inch touch screen | 2560 x 1440 | Touch | Larger controls, wider drawer, larger table hit areas, readable dashboards at distance. |

Core checks:

- Banner title, menu button, and theme button do not overlap.
- Drawer buttons are large enough for touch and remain readable.
- Home dashboard cards form balanced rows without leaving very narrow cards.
- Admin forms keep related fields together and do not stretch text inputs absurdly wide.
- Dense tables remain horizontally scrollable when they cannot fit.
- Row action buttons fit their labels without clipping.
- Reporting and range graphs show labels and values without overlap.
- Modals fit inside the viewport and remain scrollable.
- Date pickers have enough space to render above table/content layers.
