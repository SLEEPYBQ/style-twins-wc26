# Viewport-fitted workspace review

Start in **Explore** with all 48 teams. Brushing restricts the heatmap while the map retains the tournament context. Pinning Ecuador reveals its five closest teams. Choosing the United States gives a similarity percentile of 99.7 and an observed goal-difference gap of −1.10 goals per match (Ecuador minus United States). **Compare** locates the differences on the ten measured indicators. **Explain** traces the outcome gap to six model components and the matches included in each team’s average. [Classroom walkthrough](../../docs/visual-interaction-demo.md)

## Browser measurements

The starting revision was `6eabeb1`. With Ecuador and the United States pinned, the full tournament selected and all ten indicators active, the original workspace stacked the exploration, comparison and evidence panels in one document. These measurements use CSS pixels at normal browser zoom. Each row compares that document with the three task modes at the same usable browser viewport.

| Viewport | Previous document height | Explore height | Compare height | Explain height |
| --- | ---: | ---: | ---: | ---: |
| 1920 × 1080 | 2,308 | 1,080 | 1,080 | 1,080 |
| 1440 × 900 | 2,218 | 900 | 900 | 900 |
| 1366 × 768 | 2,156 | 768 | 768 | 768 |
| 1280 × 800 | 2,192 | 800 | 800 | 800 |

The layout regression recorded 49 states. In all four desktop viewports the document stayed at scroll position zero across the tested modes and selections. Neither dimension overflowed the viewport. The 48-team matrix and the team table have internal scroll areas that reach the last row. On a 390 × 844 touch-emulated phone, the active mode scrolls vertically and the document is 390 pixels wide. The matrix can be panned within its own panel.

## Rendered screens

| View | Screenshot |
| --- | --- |
| Explore, all teams | [1920 × 1080](explore-1920x1080.png) · [1440 × 900](explore-1440x900.png) |
| Compare, Ecuador and United States | [Signed differences and ranked neighbors at 1440 × 900](compare-1440x900.png) |
| Explain, Ecuador and United States | [Finishing contribution and nine match records at 1440 × 900](explain-1440x900.png) |
| Compact laptop | [Explore with both teams pinned at 1366 × 768](laptop-1366x768.png) |
| Phone | [Initial Explore viewport at 390 × 844](phone-390x844.png) |

The filterable team table, full credits and match contributions are available on demand. Shorter displays show fewer heatmap rows at once. The potential overlap of teams at similar PCA coordinates remains visible, and the linked matrix, nearest-team buttons and keyboard pickers provide access to those teams.

## Repeat the checks

Serve the site from the repository root with `python3 -m http.server 8642 --bind 127.0.0.1 --directory web`. With Node, Playwright and Chromium available, run the following from `web/`.

```bash
node scripts/verify-workspace-layout.cjs
node scripts/verify-workspace-browser.cjs
node scripts/verify-lens-browser.cjs
```

The layout regression writes the six viewport PNGs and a JSON report to the system temporary directory under `style-twins-viewport-qa`. Set `STYLE_TWINS_QA_OUTPUT` to choose the output directory and `STYLE_TWINS_BASE_URL` to change the server address. [Recorded measurements](viewport-checks.json)

The checks cover keyboard mode changes, browser history and reload, persistent selections, validated chart extents after resize, accessible popovers, internal scrolling, focus restoration, mobile touch and opening a match from the waterfall. The mode-switch probe counts calls that build the analysis space, rank neighbors or fit PCA. Switching Explore → Compare → Explain → Explore with the same inputs triggered zero calls to those functions. The existing analysis suite checked 2,752 pair-and-scope combinations. Its largest absolute gap between the waterfall sum and observed total was 0.002 goals per match. [Numerical checks and source definitions](../visual-interactions/README.md)

The existing language and export regression visited 14 routes in 12 languages, plus 96 mobile route/language combinations. It reported zero runtime errors and zero page-level overflows. A follow-up opened all three modes and closed the team table in all twelve languages. The Simplified and Traditional Chinese workspace passes recorded zero missing labels. Some secondary-route strings in the Spanish catalog still fall back to English.

Verification used Chromium 141 on Linux and an emulated touch viewport. Physical iPhone/Safari behavior and task completion by classroom participants remain unmeasured.
