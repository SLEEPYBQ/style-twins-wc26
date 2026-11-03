/* Measurement definitions and the limits of each layer of evidence. */
(function () {
  const App = window.App;

  App.views.method = function (root) {
    const model = App.data.meta.model;
    const carry = App.data.story.carry;
    const interval = (values) => `${values[0].toFixed(2)} to ${values[1].toFixed(2)}`;
    const count = Object.keys(App.tm).length;
    const dialDescription = {
      "Patient build-up": "Combined build-up measures as a share of normalized attacking-phase measures.",
      "Direct play": "Long-ball and counter-attack measures as a share of normalized attacking-phase measures.",
      "Transition attacks": "Attacking-transition measure within the normalized attacking-phase profile.",
      "Final-third camp": "Final-third measure within the normalized attacking-phase profile.",
      "High press": "High-press and high-block measures within the normalized defensive-phase profile.",
      "Deep block": "Low-block and low-press measures within the normalized defensive-phase profile.",
      "Counter-press": "Counter-press measure within the normalized defensive-phase profile.",
    };
    root.innerHTML = `
      <article class="review-method">
        <header class="review-method-header">
          <div class="review-eyebrow">A guide to reading the evidence</div>
          <h1>What the numbers can tell you</h1>
          <p>Style Twins helps football fans compare similar approaches and investigate different opportunities and scorelines. Each view has a specific unit, calculation and interpretation.</p>
          <div class="review-sources"><a href="https://github.com/Alamyy/Worldcup26" target="_blank" rel="noopener">Explore the source dataset ↗</a><a href="#/styles">Start with the style map →</a></div>
        </header>
        <nav class="review-method-nav" aria-label="Method sections">
          <a href="#method-evidence">Evidence</a><a href="#method-style">Style similarity</a><a href="#method-results">Results</a><a href="#method-lab">Match lab</a><a href="#method-audit">Robustness lab</a><a href="#method-model">Model estimates</a><a href="#method-references">Sources</a>
        </nav>

        <section id="method-evidence">
          <h2>Three layers of evidence</h2>
          <div class="review-method-grid">
            <div class="card"><span class="review-method-tag">Reported</span><h3>What the reports record</h3><p>Scores, shots, passing totals, phases of play and event times come from the source tables. Expected goals (xG) is the source provider's estimate of chance quality.</p></div>
            <div class="card"><span class="review-method-tag">Calculated</span><h3>What we derive</h3><p>Per-match averages, xG per shot, standardized style distances, nearest neighbours and opponent summaries combine the reported values. Optional result decomposition adds a fitted model.</p></div>
            <div class="card"><span class="review-method-tag">Illustrative</span><h3>What the pitch shows</h3><p>Player positions and animated shot paths are schematic. Events follow recorded minutes. Passing links describe full-match totals between players.</p></div>
          </div>
          <p class="review-method-note">The main analytical unit is one team in one match. ${App.data.matches.length} matches therefore provide ${count} team-match records. The two records from the same fixture share its context.</p>
          <p>The public Worldcup26 dataset organizes FIFA Training Centre reports into match, team and player tables. This site uses 48 teams and all 104 matches. Source report URLs are available in the dataset's matches table.</p>
          <div class="review-sources"><a href="https://github.com/Alamyy/Worldcup26/blob/main/docs/data_dictionary.md" target="_blank" rel="noopener">Data dictionary ↗</a><a href="https://github.com/Alamyy/Worldcup26/blob/main/data/csv/matches.csv" target="_blank" rel="noopener">Match records and report links ↗</a></div>
        </section>

        <section id="method-style">
          <h2>Deciding what similar football means</h2>
          <p>Choose at least two style dimensions. Each selected value is standardized using the mean and population standard deviation across all ${count} team-match records. The selected dimensions receive equal weight. Goals, shots and xG are reserved for outcome comparison.</p>
          <div class="formula">Standardized value = (reported or transformed value − tournament mean) / tournament standard deviation</div>
          <p>A team's profile is the average of its match profiles within the selected scope. Distances use all selected dimensions. The map projects those profiles onto two principal components, so the visible spacing is an approximation of the full comparison.</p>
          <div class="review-method-table-wrap"><table class="review-method-table"><caption>The ten available dimensions</caption><thead><tr><th scope="col">Dimension</th><th scope="col">Measure</th><th scope="col">Reading it</th></tr></thead><tbody>
            ${App.data.dials.map((dial) => `<tr><td>${App.esc(dial.id)}</td><td>${App.esc(dial.label.replace("attacking time", "normalized attacking profile"))}</td><td>${App.esc(dialDescription[dial.id] || dial.help)}</td></tr>`).join("")}
          </tbody></table></div>
          <p class="review-method-note">Several source phase measures overlap. Rescaling them to sum to 100% creates a relative phase profile. The normalized values describe the balance among recorded phase measures, rather than mutually exclusive fractions of playing time.</p>
          <p>Team similarity is a percentile among the available team pairings. A value of 92 means the pair is closer than about 92% of pairings under the selected dimensions and scope. It expresses a relative ranking. Inspect the individual dimensions to understand the actual resemblance.</p>
          <p>Single-match comparisons show the root mean square distance across selected standardized dimensions. A lower distance means a closer profile. Candidate matches from the same team or the same fixture are excluded from the new match-comparison search.</p>
          <details><summary>How the five style groups relate to your selection</summary><p>The original groups use k-means with five clusters fitted to all ten dimensions and each team's full-tournament average. Their names summarize prominent features. Group colours stay fixed as you change dimensions, while the map and similarity calculations update. This lets you inspect how the original groups appear under a different definition of style.</p></details>
        </section>

        <section id="method-results">
          <h2>Comparing outcomes and match context</h2>
          <div class="review-method-table-wrap"><table class="review-method-table"><thead><tr><th scope="col">Measure</th><th scope="col">Calculation</th><th scope="col">Question it helps answer</th></tr></thead><tbody>
            <tr><td>Goal difference</td><td>Goals scored − goals conceded</td><td>How did the scorelines balance across the selected matches?</td></tr>
            <tr><td>xG difference</td><td>xG created − xG allowed</td><td>How did the estimated quality of chances balance?</td></tr>
            <tr><td>Shot volume</td><td>Shots per selected match</td><td>How often did the team shoot?</td></tr>
            <tr><td>xG per shot</td><td>Total xG / total shots</td><td>How much estimated chance quality did each shot carry on average?</td></tr>
            <tr><td>Scoring relative to xG</td><td>Goals scored − xG</td><td>How far did scoring finish above or below reported chance quality?</td></tr>
            <tr><td>Conceding relative to xG</td><td>xG allowed − goals conceded</td><td>How far did actual conceding fall below or above reported chance quality?</td></tr>
          </tbody></table></div>
          <p>Team-level counts and totals are shown per selected match unless labelled otherwise. xG per shot divides the aggregate xG by aggregate shots, so every shot has equal weight. A match with zero shots has no defined xG-per-shot value.</p>
          <p>Goal difference, wins and tournament progression answer different questions. For example, the Netherlands and Croatia both reached the round of 32, while their per-match goal differences differ. A positive gap in one metric establishes a difference in that metric.</p>
          <p>Opponent context summarizes each opponent's xG created and allowed in its other tournament matches, excluding the fixture being inspected. The sample count appears with the estimate. This is retrospective schedule context and can include games played after the selected match.</p>
          <p class="review-method-note">Teams played three to eight matches. Averages can be driven by one large result. Inspect the individual matches, opponents and stage before extending a tournament pattern into a claim about lasting team ability. Extra-time games contain more playing time than regulation games, and these per-match measures include that extra time.</p>
          <details><summary>Reading the style matchup matrix</summary><p>Rows and columns use each team's fixed full-tournament style group. Each off-diagonal cell averages the selected metric for the row-group team in the relevant fixtures. A fixture appears once within a given off-diagonal cell. Diagonal cells link to games between teams in the same group. Their signed average would cancel by construction, so they display the match count.</p><p>The cells combine different teams and schedules. Selecting a cell reveals its actual matches, which helps you judge whether a broad group comparison describes a useful pattern.</p></details>
        </section>

        <section id="method-lab">
          <h2>Match lab: connections, line breaks and events</h2>
          <p>Three linked views let you inspect one match from different angles. The selected team remains in view as you change panels. Each panel retains the granularity of its source: whole-match passing and line-break totals, or individual recorded events.</p>
          <div class="review-method-table-wrap"><table class="review-method-table"><thead><tr><th scope="col">View</th><th scope="col">Calculation and visual encoding</th><th scope="col">Interpretation</th></tr></thead><tbody>
            <tr><td>Directed passing network</td><td>Edge A → B = recorded pass count from player A to player B. Node size is square-root scaled by incoming + outgoing counts.</td><td>Inspect which players exchange the ball and which connections account for the recorded volume. The circular, role-based layout is schematic.</td></tr>
            <tr><td>Passing matrix</td><td>Row = passer; column = recipient. Each cell contains the same directed count as the network. The minimum-pass setting filters visible connections.</td><td>A matrix makes individual pair counts easier to compare when a network becomes crowded. Selecting a player reveals incoming and outgoing counterparts.</td></tr>
            <tr><td>Player involvement</td><td>(Incoming network passes + outgoing network passes) / (2 × all recorded network passes).</td><td>Every directed pass involves a sender and recipient. Player totals use all network edges, including edges hidden by the display threshold.</td></tr>
            <tr><td>Line-breaking routes</td><td>Reported attempted line breaks through, around and over a defensive unit. Target-unit totals are displayed separately.</td><td>The source provides route and unit marginals. A specific route × unit combination cannot be recovered from these totals.</td></tr>
            <tr><td>Completion rate</td><td>Completed line breaks / attempted line breaks.</td><td>Completions are available overall; the data does not establish a separate success rate for every route or target unit.</td></tr>
            <tr><td>Match pulse</td><td>A step increases by one for each shot record, including goals with shot details. The time brush selects attempts inside the displayed range.</td><td>Shows the timing and count of recorded attempts. Supplemental score-only goals and own goals provide score context without adding a shot. No per-shot xG or observed shot location is available.</td></tr>
          </tbody></table></div>
          <p class="review-method-note">Recorded network passes are the sum of the supplied directed edge counts. They need not equal a separate team passing statistic. Time selections in Match pulse apply to timed events; full-match networks and phase measures have no equivalent event-level time stamps.</p>
          <p>Match pulse places explicit stoppage-time labels at the end of their stated period, before the next restart. Bare minute labels are assigned to the usual period; their period cannot always be established independently. The small gaps between periods are schematic, and order within a recorded minute is not precise. Extra time is retained, and the view shows counts rather than time-normalized rates.</p>
          <p>A coverage check compares recorded attempts with reported shot totals. Score events are counted separately, with own goals credited to the opposing team and penalty shoot-outs excluded. An incomplete event list should not be interpreted as the complete attacking record.</p>
          <p>FIFA defines a line break by movement of the ball beyond an opposition unit. The lab follows that football vocabulary, while preserving the separate aggregate counts available in this dataset. The passing view combines a visual overview with exact counterpart counts, following the analysis principle illustrated by Hudl Statsbomb’s public network explainer.</p>
          <div class="review-sources"><a href="#/lab/2026-M022-ENG-CRO?pane=network">Explore a passing network →</a><a href="#/lab/2026-M022-ENG-CRO?pane=breaks">Inspect line-breaking attempts →</a><a href="#/lab/2026-M022-ENG-CRO?pane=pulse">Follow recorded attempts →</a></div>
        </section>

        <section id="method-audit">
          <h2>Robustness lab: how much does the answer depend on one input?</h2>
          <p>A close neighbour can move when the definition of style changes or when a single match is removed. The lab automatically reruns the comparison under those alternatives, keeping the selected stage and candidate teams fixed.</p>
          <div class="review-method-grid">
            <div class="card"><span class="review-method-tag">Baseline</span><h3>Your current comparison</h3><p>All selected indicators and all matches in the chosen scope. The two directional ranks show where each team falls among the other’s neighbours.</p></div>
            <div class="card"><span class="review-method-tag">Indicator omission</span><h3>One indicator removed</h3><p>Remove each selected indicator in turn, recompute team profiles in the remaining dimensions, and rerank the same candidate teams. This probe needs at least three selected indicators.</p></div>
            <div class="card"><span class="review-method-tag">Match omission</span><h3>One observation removed</h3><p>Remove one team-match from either compared team, recompute that team’s average, and rerank. Other team profiles stay fixed. A team needs at least two matches for this probe.</p></div>
          </div>
          <div class="formula">Distance = √[ mean over selected indicators of (standardized profile A − standardized profile B)² ]</div>
          <p>All scenarios retain the original tournament standardization. An indicator’s displayed share of squared distance is its squared profile gap divided by the sum of squared gaps. This identifies what contributes to the current distance; it does not measure that indicator’s causal effect on a result.</p>
          <p class="review-method-note">These are deterministic sensitivity checks. The range of ranks is a range across the displayed omissions, rather than a confidence interval or a probability that the comparison is correct. Stable ranks can still reflect correlated indicators, a short tournament and shared match context.</p>
          <p>Statsbomb’s style research motivates separating style from strength and checking how a style model behaves under different evidence. Its published model uses event locations and a separate validation procedure. This site’s aggregate-data omission audit is an original, simpler check suited to the available records.</p>
          <div class="review-sources"><a href="#/robustness/NED/CRO">Audit Netherlands & Croatia →</a></div>
        </section>

        <section id="method-model">
          <h2>Reading the optional model decomposition</h2>
          <p>The original project supplies a six-part, additive decomposition for each team-match. It remains an additional interpretation alongside the reported outcomes. Its estimates use the original ten-dimension model and remain fixed when you explore another definition of similarity.</p>
          <div class="formula">Goal difference = style baseline + opponent term + creation residual + prevention residual + scoring relative to xG + conceding relative to xG</div>
          <div class="review-method-table-wrap"><table class="review-method-table"><thead><tr><th scope="col">Component</th><th scope="col">Basis</th><th scope="col">Interpretation</th></tr></thead><tbody>
            <tr><td>Style baseline</td><td>The model averages xG for and against from ${App.data.meta.twin_k} nearest standardized team-match profiles by other teams, then applies fitted coefficients to the centered averages.</td><td>A fitted baseline associated with the recorded style.</td></tr>
            <tr><td>Opponent term</td><td>Opponent xG for and against in its other matches, combined with the fitted coefficients.</td><td>The model's allocation to the opponent summary.</td></tr>
            <tr><td>Creation residual</td><td>Actual xG created − fitted xG created.</td><td>Chance creation above or below the model estimate.</td></tr>
            <tr><td>Prevention residual</td><td>Fitted xG allowed − actual xG allowed.</td><td>Chance prevention above or below the model estimate.</td></tr>
            <tr><td>Scoring relative to xG</td><td>Goals scored − xG created.</td><td>A conversion difference affected by finishing, chance variation and the xG model.</td></tr>
            <tr><td>Conceding relative to xG</td><td>xG allowed − actual goals conceded.</td><td>A conversion difference affected by the opposing finishers, goalkeeping, chance variation and the xG model.</td></tr>
          </tbody></table></div>
          <p class="review-method-note">The residual definitions make the six terms add to goal difference. That accounting identity alone establishes neither causal contributions nor separate estimates of player ability. The available preparation script fits the attack and defence regressions on all ${count} tournament records and calculates predictions on those same records. It does not report held-out or out-of-sample evaluation.</p>
          <details><summary>How the supplied model is fitted</summary><p>The source preparation script uses ordinary least squares with two inputs per regression: the nearest-neighbour style average and the opponent's average from its other matches. Neighbour searches exclude the same team, but can include the opponent's record from the same fixture. Opponent averages exclude that fixture and may include later matches. These are retrospective, in-sample estimates; they should not be presented as validated forecasts.</p></details>
          <details><summary>Original model coefficients and variance allocation</summary>
            <p>The supplied attack estimate uses ${model.attack.style} × style xG + ${model.attack.opponent} × opponent xG allowed ${App.signed(model.attack.intercept, 3)}. The defence estimate uses ${model.defence.style} × style xG allowed + ${model.defence.opponent} × opponent xG created ${App.signed(model.defence.intercept, 3)}.</p>
            <p>The original percentage allocation uses Cov(component, goal difference) / Var(goal difference) over all ${count} team-match records. The percentages sum to 100% because the components sum to goal difference. They depend on this particular decomposition and should be read as covariance shares within it.</p>
          </details>
        </section>

        <section id="method-match">
          <h2>Reading the match view</h2>
          <p>The pitch combines recorded event times with schematic player positions. Players are placed by listed position, with horizontal ordering informed by passing relationships. Substitutions replace players and red cards remove them. Animated shot paths illustrate an event because the source has no shot or tracking coordinates.</p>
          <p>Passing edges contain full-match pass totals. Their weight and player connectivity help describe how possession was distributed. They do not encode the sequence of passes leading to a particular shot.</p>
          <p>Line breaks count passes or carries beyond an opponent's defensive line. The visualization combines the source's four-line, three-line and two-line defensive descriptions into forward, midfield and back-line categories. Attempts are available by line, while completions are available only in total.</p>
          <details><summary>Event timing and player illustrations</summary><p>Shot minutes are recorded as elapsed minutes and displayed in the following numbered minute, so 105:xx appears as 106′. First-half stoppage time shares the axis with the early second half. Player avatars are stylized illustrations from the original project, with credits available in the player detail. A shirt number represents players without an illustration.</p></details>
        </section>

        <section id="method-stability">
          <h2>What continued into the knockout stage?</h2>
          <p>The original analysis compares group-stage and knockout-stage averages for the 32 teams that advanced. The table below reports the supplied correlation estimates and 90% bootstrap intervals from 4,000 resamples of teams.</p>
          <div class="review-method-table-wrap"><table class="review-method-table"><thead><tr><th scope="col">Combined measure</th><th scope="col">Correlation</th><th scope="col">90% interval</th></tr></thead><tbody>
            <tr><td>Creation and prevention residuals</td><td>${carry.exec.r.toFixed(2)}</td><td>${interval(carry.exec.ci90)}</td></tr>
            <tr><td>Scoring and conceding relative to xG</td><td>${carry.luck.r.toFixed(2)}</td><td>${interval(carry.luck.ci90)}</td></tr>
          </tbody></table></div>
          <p>The first estimate is positive in this sample. The second is near zero with an interval spanning negative and positive associations. Knockout samples contain one to five games per team and different opponents, so this comparison provides limited evidence about stability across stages. Longer-term ability and luck require further evidence.</p>
        </section>
        <section id="method-references">
          <h2>Definitions and design references</h2>
          <p>These primary sources informed the football vocabulary and analysis workflow. The figures in this site are generated from the supplied tournament dataset. No professional platform’s model or unavailable tracking data is reproduced.</p>
          <div class="review-reference-list">
            <article><a href="https://www.fifatrainingcentre.com/en/fwc2022/efi-metrics/efi-metric--line-breaks.php" target="_blank" rel="noopener">FIFA · Line breaks ↗</a><p>Defines crossing an opposition unit. The lab separates direction and target-unit summaries because only their aggregate marginals are available.</p></article>
            <article><a href="https://www.fifatrainingcentre.com/en/fwc2022/efi-metrics/efi-metric--phases-of-play.php" target="_blank" rel="noopener">FIFA · Phases of play ↗</a><p>Connects phase categories to tactical behaviour in and out of possession. Our normalized style profiles are transformations of the supplied measures.</p></article>
            <article><a href="https://blogarchive.statsbomb.com/articles/soccer/explaining-xgchain-passing-networks/" target="_blank" rel="noopener">Statsbomb · Reading passing networks ↗</a><p>Pairs visual connections with individual and combination counts. Our network uses recorded pass volume; xGChain requires possession sequences that this dataset does not provide.</p></article>
            <article><a href="https://www.hudl.com/products/statsbomb/platform" target="_blank" rel="noopener">Hudl Statsbomb · Analysis workflow ↗</a><p>Demonstrates linked filters, comparison tools and contextual evidence. This project links its available source reports and match records.</p></article>
            <article><a href="https://blogarchive.statsbomb.com/articles/soccer/modelling-team-playing-style/" target="_blank" rel="noopener">Statsbomb · Modelling team playing style ↗</a><p>Discusses metric selection, strength bias and model stability. These ideas motivate the transparent, explicitly limited sensitivity checks in Robustness lab.</p></article>
            <article><a href="https://theanalyst.com/articles/introducing-opta-radars-compare-players" target="_blank" rel="noopener">Opta Analyst · Context for comparisons ↗</a><p>Explains percentile benchmarks and concise metric groups. Here, percentile claims always identify their tournament comparison set.</p></article>
          </div>
          <div class="review-sources"><a href="https://github.com/SLEEPYBQ/style-twins-wc26/blob/main/RESEARCH.md" target="_blank" rel="noopener">Read design and source notes ↗</a><a href="https://www.fifatrainingcentre.com/media/native/world-cup-2022/Enhanced%20Football%20Intelligence%20EN.pdf" target="_blank" rel="noopener">FIFA EFI explanation document ↗</a></div>
        </section>
        <div class="review-sources"><a href="#/twins">Compare teams →</a><a href="#/matches">Inspect individual matches →</a><a href="https://github.com/Alamyy/Worldcup26" target="_blank" rel="noopener">Worldcup26 · CC BY 4.0 ↗</a></div>
      </article>`;
    root.querySelectorAll('.review-method-nav a').forEach((link) => link.addEventListener("click", (event) => {
      event.preventDefault();
      root.querySelector(link.getAttribute("href")).scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  };
})();
