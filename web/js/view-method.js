/* How it works: data, dials, clustering, the result recipe, and caveats. */
(function () {
  const App = window.App;
  App.views.method = function (root) {
    const m = App.data.meta.model;
    root.innerHTML = `
      <article class="method">
        <div class="kicker">Method</div>
        <h1 style="font-size:44px">How it works</h1>
        <p style="font-size:17px">Everything on this site is computed from the public <a href="https://github.com/Alamyy/Worldcup26" target="_blank" rel="noopener">Worldcup26</a> tables
          (FIFA Training Centre post-match reports): 104 matches, 48 teams, 208 team-match records. Every match is processed the same way; nothing is hand-picked.</p>

        <h2>1 · Ten style dials</h2>
        <p>FIFA's reports split each match into phases of play (build-up, progression, final third, high press, low block, …).
          We turn those shares, plus a few event counts, into ten dials that describe <i>how</i> a team plays, never <i>how well</i>:
          goals, xG and shots are deliberately left out so style and outcome stay separate.</p>
        <table class="dials"><thead><tr><th>Dial</th><th>Measured as</th><th>Meaning</th></tr></thead><tbody>
          ${App.data.dials.map((d) => `<tr><td><b>${d.id}</b></td><td>${d.label}</td><td>${d.help}</td></tr>`).join("")}
        </tbody></table>
        <p class="note">Phase percentages overlap in the source, so in-possession phases are rescaled to sum to 100% of a team's attacking time, and out-of-possession phases to 100% of its defending time.</p>

        <h2>2 · Clustering and the style map</h2>
        <p>Each dial is standardised (z-score over all 208 team-matches) with equal weight. A team's style is the average of its matches.
          <b>k-means (k = 5)</b> on those 48 team profiles gives the five playstyles; we named each cluster after its strongest dials.
          The map shows the first two <b>principal components</b> of the same ten dials. Turning dials off recomputes the map and the twins live in your browser, while archetype colours stay fixed, so you can see whether a cluster survives.</p>
        <p><b>Style twins</b> are nearest neighbours in the full dial space (not just the 2-D map). Similarity is reported as a percentile: "92%" means the pair is more alike than 92% of all 1,128 team pairs.</p>

        <h2>3 · The result recipe</h2>
        <p>For every team-match we ask: given the style it played and the opponent it faced, what result would we expect, and where did the actual result come from?</p>
        <div class="formula">Goal difference = Style + Opponents + Chance creation + Chance prevention + Finishing + Goalkeeping</div>
        <ul>
          <li><b>Style.</b> The average xG for and against of the ${App.data.meta.twin_k} most similar team-matches by <i>other</i> teams ("what this kind of football usually produces").</li>
          <li><b>Opponents.</b> The opponent's usual xG conceded and created in their <i>other</i> matches (leave-one-out).</li>
          <li>Two linear models turn these into expected xG: attack xG = ${m.attack.style} × style + ${m.attack.opponent} × opponent; defence xGA = ${m.defence.style} × style + ${m.defence.opponent} × opponent (plus intercepts).</li>
          <li><b>Chance creation / prevention</b> are what the team did beyond those expectations (actual xG − expected xG; expected xGA − actual xGA).</li>
          <li><b>Finishing</b> = goals − xG. <b>Goalkeeping</b> = xG faced − goals conceded.</li>
        </ul>
        <p>The six parts add up exactly to the goal difference, so every result is fully accounted for. The first two are "context" (what you chose and whom you met); the last four are the team's own execution, with finishing and goalkeeping also carrying luck.</p>

        <h2>4 · Match replay</h2>
        <p>The data has no tracking coordinates, so the replay is a <b>schematic reconstruction</b>: players stand on lines by listed position (GK/DF/MF/FW),
          and the left-to-right order within a line comes from who passes to whom (spectral ordering of the passing network). Substitutes take the place of the player they replaced, red cards remove a player.
          Shots, cards, goals and substitutions happen at their recorded minute; shot locations are not in the data, so shot paths are illustrative. Passing links are full-match totals.</p>
        <p class="note">Shot minutes are recorded as elapsed minutes and shown as the next minute (a shot at 105:xx is "106'"), matching the official goal times. First-half stoppage time shares the axis with the early second half.</p>

        <h2>5 · The statistics behind the story</h2>
        <ul>
          <li><b>Where results come from.</b> Each part's share is its covariance with goal difference divided by the variance of goal difference, over all 208 team-matches. Because the six parts add up to goal difference, the shares add up to 100%.</li>
          <li><b>Skill or luck.</b> For the 32 teams that reached the knockouts we correlate their group-stage average with their knockout average, separately for execution (chance creation + prevention) and conversion (finishing + goalkeeping). Intervals are 90% bootstrap intervals from 4,000 resamples of teams.</li>
          <li><b>Who beats whom.</b> Rows and columns use each team's tournament playstyle. Cells are average xG difference or goal difference per match for the row team; n is the number of matches.</li>
          <li><b>Twin stories.</b> A gap is labelled by its largest part: execution, conversion, opponents or style. Featured examples need both teams to have played at least four matches.</li>
        </ul>

        <h2>6 · Caveats</h2>
        <ul>
          <li>Teams played 3–8 matches. Finishing and goalkeeping swing a lot over so few games; per-match dots on every recipe show that spread.</li>
          <li>Style is partly a response to the opponent (nobody keeps the ball against Spain). The Opponents term absorbs some of this, the rest stays in Style.</li>
          <li>xG is FIFA's model as printed in the reports; we do not recompute it.</li>
          <li>Player avatars are stylised cartoons. The reference photo is a freely licensed Wikimedia Commons photo where one exists; otherwise a public photo from an official or press source was used only as a drawing reference and is not published here. Players without a reliable photo are shown with their shirt number.</li>
        </ul>
      </article>`;
  };
})();
