# Style Twins — World Cup 2026 visual analytics (Group 6)

An interactive retrospective analysis of 48 teams and 104 matches. Style Twins helps football fans who understand basic match statistics investigate why similar playing styles can accompany different chances and scorelines. Explore all teams on the Style Map and Style DNA Heatmap, choose teams to compare, then inspect their match evidence.

Group 6: Chonghao Zhong, Zhixiang Zhang, Xuning Hu, Baiqiao Zhang.

[Original live deployment](https://baiqiaozhang.cc/style-twins/) · [Source dataset](https://github.com/Alamyy/Worldcup26) · [Design and source notes](RESEARCH.md)

## Run locally

From the repository root:

```bash
python -m http.server 8642 --bind 127.0.0.1 --directory web
```

Open [the local site](http://127.0.0.1:8642/). Use `python3` instead of `python` where appropriate. The frontend is plain HTML, CSS and JavaScript with no build step. D3, match data, flags and player avatars are included in `web/`. Google Fonts has system-font fallbacks; original reports and external reference links require an internet connection.

## Explore

| Route | What it supports |
| --- | --- |
| `#/story` | All-team map and heatmap overview with optional A/B selection |
| `#/styles` | The same linked workbench with shareable filters, encoding and match selections |
| `#/team/ESP` | Team fingerprint, match records, style neighbours and the original result decomposition |
| `#/twins/NED/CRO` | Team comparison with match scope, outcome measures, match distributions, opponent context and omission sensitivity |
| `#/duel/<team-match-id>` | An anchored single-match performance compared with similar performances from other matches |
| `#/matches`, `#/match/<match-id>` | Match browsing and schematic replay with events, full-match passing links, phases and source reports |
| `#/lab/<match-id>` | Linked passing network and matrix, line-break explanation, and a brushable match-event workspace |
| `#/robustness/NED/CRO` | Recomputed similarity rankings after omitting an indicator or one team's match record |
| `#/method` | Definitions, calculations, model interpretation and data limitations |

Selections are retained in shareable analysis URLs and return links. Comparison tables and selected event records can be exported as CSV; the match-pulse chart can also be exported as a standalone SVG.

### Linked analysis workbench

The site opens with all 48 teams. Map points and heatmap cells share a colour scale. The map initially shows possession in colour, and the heatmap lists teams from highest to lowest possession. Hover or focus a point or row to locate the same team in the other view. Click a team to set A, then another to set B. The searchable pickers also accept a team name or code. Shift-click sets A. Use **Clear comparison** in the B picker to return to one team, or **Reset view** to return to the full tournament.

- **Style Map** projects team means onto two principal components fitted to tournament team-match records using the selected indicators. Switch to X / Y for raw indicator means or per-match outcomes. Drag the divider to resize the two views. With a mouse or trackpad, drag from empty space in the plot. The heatmap and team count update as the rectangle changes. Release to keep the selection. On a touchscreen, tap **Brush** and drag, or tap **Brush** again to cancel. A normal swipe scrolls the page. Use the × on the map-region filter to clear the rectangle and keep A, B and the other filters.
- **Style DNA Heatmap** shows all ten team means in standard deviations from the full-tournament team-match average. Inspect a cell for its raw value and z-score. Arrow keys navigate rows and cells. Use **Row order** to group teams by original style or sort them by an outcome or distance from A. Filtering by an original style group adds its mean profile across the group’s teams in scope. Hollow circles on headings identify indicators omitted from the similarity calculation.
- Hover or focus a **heatmap column heading** to preview that indicator on the map. Select the heading or choose the indicator under **Map colour** to apply its colours and sort the heatmap. Team positions and similarity rankings stay fixed while you explore the colours.
- With **Team A** selected, inspect another team to see its rank by distance in PCA coordinates, its rank using the selected indicators, and its largest standardized indicator gap from A. The heatmap outlines the corresponding cells. Both rankings use all eligible teams in the match scope. X / Y mode displays the selected-indicator ranking.
- **Team pairs** shows each unordered combination of two visible teams once. Across all 48 teams there are 1,128 pairs. The horizontal axis uses the same similarity percentile as Similar teams, referenced to all pairs in the current match scope. The vertical axis is the absolute difference between the teams’ mean goal differences per match. Brush a region to narrow the pair list, then choose a dot or a listed pair to open its A/B comparison. The region is saved in the URL.
- **Similar teams** ranks teams against A using two or more selected indicators. Its percentile is the share of all in-scope team pairs at least as far apart as that pair, including ties. Search, group, outcome and brush filters restrict the overview cohort. The similarity ranking retains all eligible teams in the match scope.
- **Team Table** gives sortable outcomes and a CSV for the current filters. Pinned teams outside the filters remain identifiable in the table and map. The CSV contains just the filtered rows.
- **Style Profile** and **Match evidence** open with the first team. Select a second team to see **Outcomes**, order the profile by gap, or open the full pair report. Outcome benchmarks show the mean of A’s five closest team means and the average across team-match records in the chosen scope. Select a match performance to overlay it on the map and profile, then open its replay or Match Lab.

Both workspace routes preserve selections, match scope, indicators, filters, heatmap order and map encodings in the URL. For example, `#/styles?team=ECU&compare=USA&scope=group&heatSort=near` opens a group-stage comparison. The ten canonical indicator IDs, the fitted groups and the full-tournament standardization stay fixed across views.

### Professional analysis workspaces

- **Pass network:** select a player to connect directed passing links, a passing matrix, incoming/outgoing counts and counterpart details. The display threshold changes visible links without changing the full-network statistics.
- **Line breaks:** inspect through, around and over attempt counts, the targeted opposition units and overall completion. Route and target-unit counts remain separate distributions; the diagrams explain categories rather than reconstructing actual trajectories.
- **Match pulse:** select a half or brush a minute range to link cumulative attempts, delivery types, outcomes, body parts and individual events. The selected window applies to timed events, not to the full-match passing network.
- **Robustness lens:** omit one selected style indicator or one match record, recompute the candidate rankings, and inspect alternative neighbours and feature differences. The reference standardization stays fixed across scenarios. The audit supports both ranking directions and CSV export.

Try Netherlands–Croatia in the robustness lens and England–Croatia (`2026-M022-ENG-CRO`) in Match Lab. `web/examples/` contains exported audit and event examples.

### Languages

English is the default. The language menu supports twelve languages: English, Simplified Chinese (`zh-Hans`), Traditional Chinese (`zh-Hant`), Spanish, French, Portuguese, German, Italian, Arabic, Japanese, Korean and Hindi (`hi`). The selected language is stored locally, and Arabic uses a right-to-left interface. Translation catalogs are bundled with the site; no online translation service is required. Source identifiers, player names and external documents retain their original forms. See [localization notes](web/locales/README.md) for catalog maintenance and translation review scope.

## Data and interpretation

The [Worldcup26 dataset](https://github.com/Alamyy/Worldcup26) is distributed under CC BY 4.0; see `data/raw/LICENSE-Worldcup26`. The repository retains the original raw data, Python pipeline, proposal and asset credits.

- The analysis contains 208 team–match records. Live similarity uses selected, standardized style indicators; the standardization reference is the full tournament, while the selected scope controls which matches contribute to team averages.
- Outcome comparisons distinguish chance volume, total xG, xG per attempt and scorelines. Opponent context uses that opponent's other tournament matches, including later matches, so this is a retrospective tool.
- The original six-part result decomposition is generated by `pipeline/build_data.py`. Its estimates are fixed in the delivered data. Changing indicators or match scope in the browser does not retrain those regressions or regenerate the original archetypes.
- Omission ranges describe sensitivity to specific changes, not confidence intervals. Model residuals and additive accounting do not establish causation or isolate player ability.
- Passing edges are whole-match counts. The data does not provide tracking coordinates, individual-shot xG or timed passing sequences. Pitch layouts and illustrated trajectories are schematic.

The model implementation and the distinction between preprocessing and live analysis are described in [RESEARCH.md](RESEARCH.md).

## Frontend checks

Run these commands from `web/` with Node.js installed:

```bash
cd web
node scripts/verify-analysis.cjs
node scripts/verify-robustness.cjs
node scripts/verify-lab.cjs
node scripts/verify-pulse.cjs
node scripts/verify-i18n.cjs
```

The checks cover aggregation, comparison scope, nearest-neighbour exclusions, omission calculations, full-network counts, event coverage and event-time boundaries. The localization checks also cover placeholder preservation, persistent preferences, safe text updates and unchanged analytical data, including both Chinese scripts. Optional browser integration checks are available in `web/scripts/verify-i18n-browser.cjs` and require Playwright with Chromium available to Node.js. With the local server running on port 8642, run `node scripts/verify-i18n-browser.cjs` from `web/`. Set `STYLE_TWINS_BASE_URL` to use another address. The suite checks all twelve languages across the main routes, Spanish and Chinese team search, persistence, SVG/CSV exports and 390px layouts; artifacts go to the system temporary directory unless `STYLE_TWINS_QA_OUTPUT` is set. Missing-key reports distinguish Spanish, Simplified Chinese and Traditional Chinese coverage.

The workspace browser regression runs with the same server and Playwright setup:

```bash
node scripts/verify-workspace-browser.cjs
```

It checks all 480 heatmap values against the delivered records, linked selections, sorting, custom axis units, scoped outcome benchmarks, filtering, history and exports. For a slow SSH tunnel, either browser suite accepts a navigation timeout in milliseconds through `STYLE_TWINS_NAV_TIMEOUT_MS`. Desktop, laptop and phone screenshots are written to `STYLE_TWINS_QA_OUTPUT` or the system temporary directory.

## Rebuild the data

The generated frontend data is already included. To rebuild it from the raw CSVs, install Python with NumPy, pandas, SciPy and scikit-learn, then run from the repository root:

```bash
python -I pipeline/build_data.py
python -I pipeline/build_avatar_manifest.py
```

The first command writes `web/data/core.js` and `web/data/matches/*.js`; the second rebuilds `data/avatar_manifest.csv`. Rebuilding regenerates the original model and match serialization, so rerun the frontend checks against the output.

Optional asset/source refresh commands, run from `web/`:

```bash
node scripts/prepare-sources.cjs
node scripts/prepare-avatars.cjs
```

## Images and credits

- `web/img/gen/` contains the original generated hero image, archetype mascots and match illustrations. They were generated with the ChatGPT-desktop Codex CLI (`gpt-6.1-sol`, built-in image generation) through `pipeline/gen_image.sh`; prompts are in `pipeline/image_prompts/`, with the shared style in `STYLE.txt`.
- `web/img/avatars/` contains the original capsule-eye player avatars produced through `pipeline/gen_avatar.sh` and `pipeline/image_prompts/avatar_front_template.txt`. Reference photos come from freely licensed Wikimedia Commons images where available, otherwise from official or press sources used as drawing references. Reference photos remain in the ignored `data/ref_photos/` directory and are not deployed. Available credits are retained in `data/ref_photos/credits.csv`, `web/data/avatar_credits.js` and player details. Players without an illustration use a shirt-number badge.
- D3 retains its upstream copyright notice. Data and asset credits remain visible in the application. This is a non-commercial course project and is not affiliated with FIFA.

## Deploy

Deploy the contents of `web/` to a static host. The original `pipeline/deploy.sh` uses zsh, rsync and SSH to synchronize `web/` to a configured server. Set `DEPLOY_TARGET` and `DEPLOY_KEY` in the git-ignored `pipeline/deploy.env`, then run the script from an environment with those tools available. The script synchronizes deletions as well as additions; use the intended site directory as the target.

Pushing the repository does not itself publish the server deployment.

## Proposal

`proposal/GP-M3-6-revised.docx` and its PDF are the revised proposal, built on the original template by `proposal/build_revised_docx.py`.
