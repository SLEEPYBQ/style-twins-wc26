# Visual interaction review

The starting revision on `feat/chonghao-refine_11192026` was `f79f7c6`. The baseline screenshot includes the existing Escape shortcut, saved on the new branch as `61d7390`. The site uses its shipped dataset and a local static server.

## What changed

| View | Interaction and analytical purpose | Implementation |
| --- | --- | --- |
| Style Map and heatmap | Pin A to trace five full-dimensional nearest neighbors through the scatterplot, matrix and ranking. Hover or focus B to compare its ranking, projected distance rank and largest gap. Drag previews the same subset in the matrix and team table. | `view-workspace.js`, `workspace-heatmap.js`, `workspace.css`, `heatmap.css` |
| Style Profile | Switch from absolute standardized values to A minus B on a common zero-centered scale. All ten indicators remain visible and the three largest differences carry ranks. Focusing a row links its heatmap column and exposes raw units. | `workspace-lens.js`, `workspace-lens.css`, workspace state and translations |
| Outcome gap waterfall | Trace six model terms to an independently observed total. Inspect a step with a pointer or keyboard, open its contributing matches and follow an individual performance. The workspace and pair report use the same chart. | `analysis.js`, `outcome-waterfall.js`, `outcome-waterfall.css`, `view-investigate.js` |
| Team pairs | Discover pairs with similar style and different outcomes by brushing or selecting the labeled example region. Opening a result assigns A and B. The pair region survives a reload and leaves the team cohort intact. | `workspace-pairs.js`, `workspace-pairs.css`, `workspace-locales.js` |

The baseline map already supported brushing and shared a color encoding with the heatmap. Closely spaced labels competed for space, ranked neighbors were harder to locate in the matrix, and comparing signed indicator gaps or following cumulative outcome contributions required additional work. The new map labels selected and relevant teams, with hover and keyboard access to the rest. On phones, the matrix scrolls horizontally within its panel. Longer country names can still be abbreviated in a narrow column. Full names appear in the readout.

## Rendered screens

| Investigation | Screenshots |
| --- | --- |
| First entry | [Baseline](baseline-overview.png) · [Updated overview](overview.png) · [Laptop](laptop-overview.png) · [Phone](phone-overview.png) |
| Map and heatmap | [A and nearest neighbors](team-a.png) · [Candidate preview](candidate-preview.png) · [Pinned pair](comparison.png) · [Live brush](live-brush.png) |
| Indicator comparison | [Absolute profiles](absolute-profiles.png) · [Signed differences](signed-differences.png) · [Phone](phone-differences.png) · [简体中文](phone-differences-zh.png) |
| Outcome evidence | [Waterfall](waterfall.png) · [Contributing records](waterfall-records.png) · [Selected match](match-evidence.png) · [Phone](phone-waterfall.png) |
| Explore another pair | [Example region and pair list](team-pairs.png) |

The PNGs are actual Chromium viewports at 1440 × 900, 1280 × 800 and 390 × 844. On Linux, screenshot capture uses the site's local font fallback. Mobile checks use touch emulation. Hardware Safari, physical touch devices and a participant usability study were outside this evaluation.

## Quantitative checks

The analysis test reads the 208 team-match records. For every eligible unordered pair in each scope it computes an independent A-minus-B difference for each of the six fields, checks intermediate endpoints and compares the component sum with the observed difference in mean goals scored minus goals conceded.

| Scope | Pairs tested | Maximum absolute residual in goals per match |
| --- | ---: | ---: |
| Full tournament | 1,128 | 0.001167 |
| Group stage | 1,128 | 0.001667 |
| Knockout | 496 | 0.002000 |

With all ten indicators, the example Team pairs region contains 53 full-tournament pairs, 67 group-stage pairs and 25 knockout pairs. Selecting a different match scope also changes the reference distribution for the similarity percentile.

The source stores each component to three decimals. For two teams, six terms can accumulate up to `2 × 6 × 0.0005 = 0.006` goals per match of rounding error. The chart uses the observed value for its last bar and can show when data are unavailable or exceed that tolerance. Côte d’Ivoire and Senegal both average +0.25 goal difference. Their component gaps offset to a near-zero total despite summing to 3.57 in absolute magnitude. The Bosnia and Herzegovina versus Ghana opposition term also exercises the display of a nonzero −0.00005.

For Ecuador versus the United States, the signed difference view puts Long balls & counters first (+0.443 standard deviations). Their mean goal differences are −0.50 and +0.60 respectively. The finishing-residual contribution of −1.896 and conceding-residual contribution of +0.9135 have opposite signs. This accounting describes the tournament records. Small match counts limit interpretation. Similarity indicators affect distances and ranks, while the outcome components use the stored tournament-wide fit.

## Regression results

| Check | Recorded coverage |
| --- | --- |
| Analysis and robustness | 208 performances and 2,752 pair-and-scope comparisons. Independent distances, rank symmetry, indicator and match omissions, valid bounds and controller updates. |
| Match Lab and Pulse | 104 fixtures, 84,308 recorded passes and 2,571 shot attempts. Six supplementary scoring events are excluded from the shot-attempt timeline. |
| Workspace in Chromium | All 480 heatmap cells, full-space versus PCA rank, five neighbors, mouse and touch brushes, Esc, pinned teams, scales, indicator modes, sorting, match evidence, pair shortlist, history, resize and reduced motion. Waterfall step endpoints and bar lengths checked against data and axis coordinates within 0.2 CSS pixels. |
| Languages and exports | 168 desktop route/language visits and 96 mobile checks across 12 languages. The run checked localized search, persistence, CSV invariance and SVG export. It recorded zero page errors and zero page-level horizontal overflows. |
| Screenshot walkthrough | 1440 × 900, 1280 × 800 and 390 × 844. In the Ecuador to USA candidate preview, all 48 point centers stayed fixed and the relationship readout fit without scrolling. |

English and both Chinese scripts cover the new explanatory text. Some other locales use English fallback. Across the routes exercised by the language audit, the missing-key counts for Simplified and Traditional Chinese were zero. The Spanish catalog recorded 85 missing keys in the updated run and 73 in the baseline. Coverage counts apply to the exercised routes and controls.

## Reproduce

From the repository root, serve `web/` with `python3 -m http.server 8642 --bind 127.0.0.1 --directory web`. Run the following in `web/` with Node and, for the last three commands, Playwright and Chromium available.

```sh
node scripts/verify-analysis.cjs
node scripts/verify-robustness.cjs
node scripts/verify-lab.cjs
node scripts/verify-pulse.cjs
node scripts/verify-i18n.cjs
node scripts/verify-workspace-browser.cjs
node scripts/verify-i18n-browser.cjs
node scripts/capture-visual-interactions.cjs
```

`STYLE_TWINS_BASE_URL` overrides the server address and `STYLE_TWINS_QA_OUTPUT` overrides the image or report directory. The capture script uses local font fallbacks for reproducibility. For the two in-gesture and match-evidence images, the workspace regression writes `workspace-live-brush.png` and `workspace-ecuador-match.png`. To reproduce the baseline, run the workspace regression from a separate checkout of `61d7390`. The browser regressions cover keyboard and touch interaction, reduced motion, URL restoration, resize and computed marks. They supplement the independent numerical checks.

[Interaction specification](../../docs/visual-interaction-spec.md) · [Seven-minute classroom walkthrough](../../docs/visual-interaction-demo.md)
