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
| `#/story` | The five-panel workspace, opening on all 48 teams, with the five-step presentation story |
| `#/styles` | The same workspace, with its state in a shareable URL |
| `#/team/ESP` | Team fingerprint, match records, style neighbours and the original result decomposition |
| `#/twins/NED/CRO` | Team comparison with match scope, outcome measures, match distributions, opponent context and omission sensitivity |
| `#/duel/<team-match-id>` | An anchored single-match performance compared with similar performances from other matches |
| `#/matches`, `#/match/<match-id>` | Match browsing and schematic replay with events, full-match passing links, phases and source reports |
| `#/lab/<match-id>` | Linked passing network, role PivotGraph and matrix, line-break explanation, and a brushable match-event workspace |
| `#/robustness/NED/CRO` | Recomputed similarity rankings after omitting an indicator or one team's match record |
| `#/method` | Definitions, calculations, model interpretation and data limitations |

Selections are retained in shareable analysis URLs and return links. Comparison tables and selected event records can be exported as CSV; the match-pulse chart can also be exported as a standalone SVG.

### The five-panel workspace

`#/story` and `#/styles` fill one 1920 × 1080 screen (the classroom projector) without page scrolling; English is the presentation language. The top bar holds the Story 1–5 stepper, the Team A and Team B pickers (B excludes A) with a swap button, the match scope (Full / Group / Knockout), CSV export, reset and the language menu. Below it, the playstyle spectrum runs from Deep & direct to Final-third pressure: selecting a playstyle selects its defining indicators, re-projects the map and outlines the group. Ten indicator chips show each indicator's distribution with A and B ticks.

| Panel | What it shows |
| --- | --- |
| **Style Map** | Team means projected 1:1 onto two principal components, with plain-language axis poles. Steer handles re-weight the indicators live, a loupe fans out dense clusters, and optional ★ links join style twins. Click a flag to set A, then another to set B; Shift-click sets A. |
| **Style twins with different fates** | With no team selected, the 53 ★ pairs: at least 90% similar in style and at least one goal per match apart. With A selected, it becomes **Closest twins to A**, ranking A's twins with their gap in goal difference. |
| **Style DNA** | All 48 teams × 10 indicators as z-scores in a fixed Own / Midfield / Opp column order, plus xGD and GD columns. Rows for A, B and A − B stay pinned on top; A − B is coloured by the side it favours. Rows can follow the playstyle spectrum, the map axes, an outcome or any indicator. Hover a column to colour the map by it; click to sort. |
| **Fate Quadrant** | All 1,128 team pairs by style-similarity percentile and goal gap, with the gold ★ corridor. Brush or zoom to narrow the pairs; labelled pairs carry their flags. |
| **Why did their fates differ?** | Without a pair, it compares twin pairs with pairs that play differently on a shared zero baseline, then lists every ★ pair's signed contributions. With A and B, it splits their goal gap into six parts (style baseline, opponent context, chance creation, chance prevention, finishing vs xG and conceding vs xG) and shows the match evidence by match or as a cumulative timeline. |

The style-similarity percentile is the share of all in-scope team pairs at least as far apart as that pair, including ties.

**Story mode.** The Story buttons step through five beats. Each beat sets the teams, picks the evidence view and its largest component, highlights the panels to look at, and shows a caption computed from the data:

1. **Meet the 48 styles:** mean goal difference by playstyle, from Deep & direct to Final-third pressure.
2. **Nobody plays like the champions:** the champion's closest twin compared with a typical team's.
3. **The runner-up beat its twin:** the runner-up against its closest style twin.
4. **Same playbook, opposite fates:** USA vs Ecuador, 99.7% alike but 1.10 goals per match apart.
5. **Why fates split:** what explains the goal gap for twin pairs and for pairs that play differently.

The champion and runner-up are read from the data. Closing the story caption keeps the current selection; leaving the story clears the overlays it switched on.

The URL keeps the workspace state: indicators and weights, teams, scope, playstyle, search, heatmap order, map colour, cohort, pair region, selected match and component, ★ links, Steer and story beat. For example, `#/styles?team=USA&compare=ECU&comp=c_finish` opens USA vs Ecuador with finishing vs xG selected.

### Professional analysis workspaces

- **Pass network:** select a player to connect directed passing links, a passing matrix, incoming/outgoing counts and counterpart details. The network can also be shown in four GK → DF → MF → FW bands, as a 4 × 4 role PivotGraph or as a seriated adjacency matrix. The display threshold updates every view live without changing the full-network statistics.
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

The workspace check runs with the same server and Playwright setup:

```bash
node scripts/verify-redesign.cjs
```

It checks the 1920 × 1080 bounds, every story caption and its focused panels, the comparative overview and its 53-pair list, visible negative contributions, Style DNA row fill in English and Simplified Chinese, Steer dragging, Team A/B exclusion, Match Lab, and Chinese text leaks. It writes screenshots to `STYLE_TWINS_OUT_DIR` or the system temporary directory. `verify-workspace-browser.cjs` and `verify-workspace-layout.cjs` test the earlier four-mode workbench and no longer apply to the current workspace.

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
