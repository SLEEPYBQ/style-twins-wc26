# Visual interactions in Style Twins

The workspace opens on the tournament, with no team pinned. The investigation starts with a team, a measured indicator, or a region of the map. Explore, Compare and Explain share the same team selection. A single team has a profile and supporting match records. A pair adds signed indicator differences and an outcome waterfall.

## Interaction contract

| Analytical task | Trigger and response | Encoding and trade-off | Acceptance check |
| --- | --- | --- | --- |
| Find teams with related styles | Focus or hover a point to locate its heatmap row. Pin A to reveal its five nearest teams. Preview a candidate against A, then click or press Enter to pin B. | Linked position, labels and outlines preserve the wider distribution. The map projects the selected dimensions into two axes and can put visually close points far apart in the ranking. | The five marked teams equal the first five from the full-dimensional in-scope ranking. Hover leaves the URL and B intact. |
| Inspect a shared pattern | Drag on empty map space to preview a cohort in the matrix and collection. Release to commit. Esc cancels the active drag or clears the committed region. | Brushing restricts the records on display. Previously pinned teams retain their identities outside the cohort. | The preview and committed rows agree. Clearing recovers the other active filters. A brush does not recompute the similarity population. |
| Compare indicators | Pin two teams, switch between their absolute profiles and signed differences, and sort by magnitude. Inspect a row or column for original units and standardized values. | Common scales support direct comparison. A zero difference can mean both teams are high, average, or low, so the absolute view remains available. | Each of the ten signed differences equals the in-scope mean z-score of A minus B. Swapping teams reverses signs. Excluded dimensions remain identifiable. |
| Explain an outcome gap | Inspect a step of the outcome waterfall and the underlying match evidence for the selected scope. | Sequential endpoints show offsetting contributions in goals per match. Component meanings come from the fixed tournament model. The observed total has a separate mark. | Check signed step start/end positions, the goal-difference total and the rounding residual; repeat with A and B swapped, with a zero gap, and in knockout scope. |
| Discover candidate pairs | In Team pairs, inspect individual points or brush the high-similarity, large-gap corner. Open a pair from the candidate list. | A point encodes a scope-relative similarity percentile and an **absolute** result gap. The labeled guide is an exploratory choice. Pair comparison restores direction by assigning A and B. | Changing indicators updates percentiles. Changing teams in view updates the candidates. The same scoped guide and brush can be reopened through the URL. |

## Data, focus and motion

- The unit of observation is a team in one match. Scope selects team-match records. Style profiles use the shipped tournament standardization; changing scope changes the records being averaged.
- Similarity uses distances in the selected indicator space. Its percentile is the share of eligible, unordered team pairs whose distance is at least as large. The candidate preview reports the largest difference among those selected indicators. The Difference Lens ranks all ten measured indicators and marks the ones excluded from similarity.
- Blue identifies A, orange B and teal the nearest neighbors. Use labels, outlines, signed numbers and a zero line so interpretation is possible without identifying the colors. Preserve the heatmap’s quantitative fill when marking a selection.
- Hover, keyboard focus and an unfinished brush are temporary. Pinning, swapping and committing a filter use browser history. On coarse pointers, arming Brush distinguishes region selection from scrolling.
- Changing the PCA inputs can change its basis. Replace the projected geometry without tweening from the old coordinates. Keep position fixed for a change in observed color. Prefer short, interruptible emphasis changes and disable discretionary motion under reduced motion.
- Cumulative model contributions come from the six fields in each record’s decomposition. Scope averages those stored terms; indicator selection controls similarity. Goals minus xG and xGA minus goals conceded include variation from a small number of matches. Neither term identifies individual player skill or a causal effect.

## Workspace navigation

The mode is part of the shareable URL. Explore is the default for existing links. Compare and Explain keep the pinned teams, indicator selection, scope, filters and highlighted match. Switching modes leaves the distance ranking and PCA basis intact. A browser Back step restores the previous mode with its selections.

On desktop the header, team pickers and current mode stay in view. Explore places map and matrix side by side. Compare places profile differences beside the ranking, and Explain places the waterfall beside match evidence or outcome benchmarks. The Team Table opens on demand. A shorter or narrower screen uses a single-column flow with document scrolling. The layout regression measures CSS viewport dimensions at normal browser zoom. [Measurements and screenshots](../review/viewport-workspace/README.md)
