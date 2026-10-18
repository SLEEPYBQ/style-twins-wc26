# Style Twins — World Cup 2026 visual analytics (Group 6)

Interactive site that groups all 48 teams by playing style, explains why "style twins" got different
results, and replays any of the 104 matches from the event data.

Live: https://baiqiaozhang.cc/style-twins/

## Run it

```bash
python3 -m http.server 8642 --directory GP/web
```

Then open http://localhost:8642. The site is plain static files (no build step), so any static host works;
it needs internet only for D3 and the Google font.

Views (all linked, every URL is shareable):

| Route | What it shows |
| --- | --- |
| `#/story` | The guided story: five playstyles, where results come from, the skill-or-luck test, twin stories, style matchups, replays |
| `#/styles` | The style map (clustering + PCA, dial toggles, team trajectories) and the linked 48-team style DNA heatmap |
| `#/team/ESP` | Fingerprint vs. archetype, result recipe with per-match dots, style twins, every match |
| `#/twins`, `#/twins/NED/CRO` | Featured twin pairs; head-to-head verdict and recipe comparison |
| `#/matches`, `#/match/<id>` | All 104 matches; schematic replay with timeline, passing web, stats, phases, recipe |
| `#/method` | Data, dials, clustering and decomposition formulas, caveats |

## Rebuild the data

```bash
python3 -I GP/pipeline/build_data.py            # web/data/core.js + web/data/matches/*.js
python3 -I GP/pipeline/build_avatar_manifest.py # data/avatar_manifest.csv (avatar generation order)
```

`GP/data/raw/` holds the Worldcup26 CSVs (CC BY 4.0, see `LICENSE-Worldcup26`).

## Images

- `web/img/gen/` — hero, archetype mascots and match illustrations, generated with the ChatGPT-desktop
  Codex CLI (`gpt-6.1-sol`, built-in image generation) via `pipeline/gen_image.sh`; prompts in
  `pipeline/image_prompts/` (shared style in `STYLE.txt`).
- `web/img/avatars/` — capsule-eye player avatars from `pipeline/gen_avatar.sh` and the front-facing
  template `pipeline/image_prompts/avatar_front_template.txt`. Reference photos come from Wikimedia
  Commons (freely licensed) where available, otherwise from official or press sources used only as a
  drawing reference; they stay in `data/ref_photos/` and are never deployed. Credits are in
  `data/ref_photos/credits.csv` and on each player card. Players without a reliable photo keep a
  shirt-number badge.

## Deploy

`pipeline/deploy.sh` rsyncs `web/` to a server; put `DEPLOY_TARGET` and `DEPLOY_KEY` in
`pipeline/deploy.env` (git-ignored).

## Proposal

`GP/proposal/GP-M3-6-revised.docx` (+ PDF) is the revised proposal, built on the original template by
`proposal/build_revised_docx.py`.
