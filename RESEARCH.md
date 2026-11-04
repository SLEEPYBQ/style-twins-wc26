# Style Twins: design and source notes

Updated 4 November 2026.

The project serves football fans who already understand basic match statistics and want to investigate why similar tactical profiles can accompany different chances and scorelines. The central workflow is: find a comparison, inspect the underlying matches, then challenge the comparison’s sensitivity.

## What changed in the analytical design

The new workspaces connect an overview to specific evidence. A selected player has the same meaning in the directed passing network, the adjacency matrix and the counterpart list. A selected minute range filters timed event evidence. A selected team pair retains its style definition when the robustness audit reruns it. Counts, units, direction and sample sizes remain visible.

The visual language combines a quiet cream reading surface with dark navy analysis panels, cyan for passing evidence and lime for sensitivity results. Data diagrams supply the visual interest. The homepage previews are generated from actual England–Croatia passing records and Netherlands–Croatia omission results, rather than illustrative chart shapes.

The interface uses English by default, with bundled catalogs for eleven additional languages: Simplified Chinese (`zh-Hans`), Traditional Chinese (`zh-Hant`), Spanish, French, Portuguese, German, Italian, Arabic, Japanese, Korean and Hindi (`hi`). Language preference is stored locally; Arabic uses right-to-left layout. Both Chinese scripts use the same analytical records and retain the original numbers, player names and source identifiers. Localized team search resolves translated country labels to canonical team IDs.

## Original pipeline and live analysis

The original feature and model implementations are available in `pipeline/features.py` and `pipeline/build_data.py`. Raw inputs are retained in `data/raw/`, while generated browser data is written to `web/data/`.

### Feature engineering and original model

`pipeline/features.py` constructs one row per team–match and ten style indicators. It normalizes overlapping phase measures within the in-possession and out-of-possession groups. These derived shares are normalized profiles, not independently measured, mutually exclusive percentages of playing time. Crosses are scaled by the team's possession share, and pressures by the opponent's possession share.

`pipeline/build_data.py` standardizes the ten indicators over all team–match records using population standard deviations. For each performance it averages xG and xG conceded over the 20 nearest other-team performances. This original neighbour calculation excludes the same team, but does not explicitly exclude the opposite side of the same match. Opponent reference values average that opponent's other matches, excluding the current match.

The script fits two ordinary linear regressions on the full tournament: observed xG from the style-neighbour xG and opponent-concession reference, and observed xG conceded from the corresponding defensive references. It then splits goal difference into six additive terms: style, opponents, chance-creation residual, chance-prevention residual, goals minus xG, and xG conceded minus goals conceded. The code asserts that the six terms sum to observed goal difference before output rounding. This is an accounting identity, not a causal identification strategy. The original labels for finishing and goalkeeping do not isolate individual player ability or luck.

The original archetypes use five-cluster K-means on the standardized team averages (`random_state=7`, `n_init=200`), with cluster names assigned by matching centroids to specified archetype profiles. The script also compares group-stage and knockout residual aggregates for teams present in both phases, using 4,000 paired bootstrap resamples to report 90% correlation intervals. This retrospective calculation is not held-out validation of the fitted regressions: the regressions and style reference features use the full tournament, including knockout observations.

### Browser comparisons and sensitivity

The current interactive calculations in `web/js/analysis.js` and the robustness workspace are separate from that preprocessing model. They recompute similarity using the user's selected indicators and match scope, while retaining the full-tournament standardization reference. Interactive single-performance neighbours exclude both the same team and the same match.

An indicator-omission scenario removes one selected dimension. A match-omission scenario changes one compared team's aggregate by removing one of its records. The system then recomputes candidate distances and ranks in that scenario; it does not refit the original regressions or regenerate the five original archetypes. Aggregating stored decomposition values over a selected scope also does not retrain the model. Scenario rank ranges describe this finite sensitivity analysis, not sampling uncertainty or evidence that two teams have identical tactics.

## Primary references and adaptations

### FIFA: football definitions

- [Line breaks](https://www.fifatrainingcentre.com/en/fwc2022/efi-metrics/efi-metric--line-breaks.php): movement beyond an opposition unit. Adaptation: preserve the difference between the route of an attempt and the unit it targets.
- [Phases of play](https://www.fifatrainingcentre.com/en/fwc2022/efi-metrics/efi-metric--phases-of-play.php): categories offer a vocabulary for tactical behaviour. Adaptation: explain the source phase measures separately from the normalized profiles used for similarity.
- [Enhanced Football Intelligence explanation document](https://www.fifatrainingcentre.com/media/native/world-cup-2022/Enhanced%20Football%20Intelligence%20EN.pdf): reference definitions and examples for EFI measures.
- [Goalkeeping: key distributions and line breaks](https://www.fifatrainingcentre.com/en/game/tournaments/olympic-football-tournament/2024/women/goalkeeping-key-distributions-and-line-breaks.php): combines aggregate comparisons with concrete match examples. Adaptation: connect a numerical observation to a player and match record. This project cannot reproduce the article’s video or spatial evidence.

### Hudl Statsbomb: coordinated evidence

- [Advanced football analytics platform](https://www.hudl.com/products/statsbomb/platform): linked visualizations, filters, comparison and supporting video illustrate a coherent analysis workflow. Adaptation: keep context and selections connected across the evidence available here; link to the original report.
- [Explaining xGChain passing networks](https://blogarchive.statsbomb.com/articles/soccer/explaining-xgchain-passing-networks/): a network overview gains specificity from individual and combination numbers. Adaptation: directed counts, a matrix and player counterpart lists share one source. The local data cannot support xGChain, which requires possession sequences and associated chance values.
- [Modelling team playing style](https://blogarchive.statsbomb.com/articles/soccer/modelling-team-playing-style/): discusses subjective feature selection, strength bias, possession-side differences and stability evaluation. Adaptation: expose the chosen indicators and rerun similarity after omitting one indicator or match. The published event-location model and its validation procedure are not reproduced here; the omission audit is a separate deterministic sensitivity analysis.

### Opta Analyst: readable comparison context

- [Introducing Opta player radars](https://theanalyst.com/articles/introducing-opta-radars-compare-players): explains benchmark populations, percentiles and compact metric grouping. Adaptation: pair a visual comparison with its reference set and original units; a style percentile is a relative comparison, not a percentage of identical football.
- [Analysing Premier League playing styles](https://theanalyst.com/articles/analysing-premier-league-playing-styles-2024-25): connects specific playing-style questions with several complementary metrics. Adaptation: organize exploration around football questions, with observed outcomes kept distinct from stylistic resemblance.

## Local data checks and limits

All 104 match files contain both teams’ passing edges, players, line-break marginals and phase measures: 208 team-match records. In England–Croatia, M22, England’s network contains 414 recorded passes. Its line-break totals are 82 completed from 116 attempts; route counts are 32 through, 48 around and 36 over. These are separate from target-unit counts of 35, 59 and 22.

- Passing edges are directed whole-match totals. Their sum is called **recorded network passes**, which is not assumed to equal another source table’s team passing total.
- Player involvement counts both endpoints of a pass. Its share divides incoming plus outgoing counts by twice the total network volume. A display threshold does not change this denominator.
- Route and target-unit counts are separate marginals. They cannot reconstruct a route-by-unit joint table or individual trajectories.
- The event records include minutes, shot outcomes, goals, cards and substitutions. There is no per-shot xG, shot coordinate or tracking stream. A cumulative attempt plot counts shot records, including goals with shot attributes. Supplemental score-only goals and own goals do not add attempts. Explicit stoppage labels are ordered before the next restart; bare-minute periods are inferred and period gaps are schematic. Counts are not converted into time-normalized rates.
- Network layouts and the original animated pitch use schematic positions. Whole-match pass counts cannot be filtered by an event-time brush.
- The robustness audit holds tournament standardization fixed. Indicator omissions rerun the remaining dimensions; match omissions change one compared team’s average at a time. Rank ranges describe those alternatives, not confidence intervals or proof of tactical equivalence.
- The existing fixed six-part model remains an optional interpretation. Its source is available in `pipeline/build_data.py`; the full-tournament fit and retrospective group/knockout calculation described above do not provide causal or out-of-sample validation.

No external platform’s graphical assets, proprietary model outputs or unavailable spatial data were copied into these workspaces.
