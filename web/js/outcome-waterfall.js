/* Signed accounting of observed A−B goal difference using stored team-match estimates. */
(function () {
  "use strict";
  const App = window.App, A = App.analysis, esc = App.esc;
  const scopeNames = { all: "Whole tournament", group: "Group stage", knockout: "Knockout stage" };
  const definitions = {
    c_style: "Fitted net xG contribution of style relative to the tournament mean, using the 20 closest performances by other teams.",
    c_opp: "Fitted contribution of the opposition, using their xG created and allowed in their other tournament matches.",
    c_create: "Actual xG created minus the model’s predicted xG created.",
    c_prevent: "Predicted xG against minus actual xG against.",
    c_finish: "Goals scored minus xG created. This residual combines conversion skill and variation across matches.",
    c_keep: "xG against minus goals conceded. This residual includes opposing finishing and goal prevention together.",
    gd: "Goals scored minus goals conceded, averaged separately for each team. The components account for the gap. Establishing causes requires other evidence.",
  };
  const fixedNote = "Scope selects the matches to average. Similarity indicators change the ranking. Model estimates always come from the full-tournament fit using all ten indicators.";
  const matchNote = "Each row shows the selected term for one match. Subtract the two team means to obtain this step.";
  const format = (v) => App.signed(v, Math.abs(v) > 1e-10 && Math.abs(v) < 0.005 ? 4 : 2);

  App.outcomeWaterfall = function (host, { a, b, scope, sums, inspectMatch }) {
    // Recolouring, comparing indicators and resizing do not change these data.
    const key = [a, b, scope].join("/");
    if (host.dataset.waterfall === key) return;
    host.dataset.waterfall = key;
    host.classList.add("wf");
    const model = A.outcomeGap(...sums);
    if (model.status !== "ok") {
      host.innerHTML = '<p class="wf-note"></p>';
      host.firstChild.textContent = model.status === "missing" ? "Both teams need match records in this scope."
        : "Stored components exceed the rounding tolerance for this comparison.";
      return;
    }
    const { steps } = model, teams = [a, b];
    const limits = d3.extent(steps.flatMap(step => [step.start, step.end]));
    const x = d3.scaleLinear().domain(limits[0] === limits[1] ? [-0.5, 0.5] : limits).nice(4).range([0, 100]);
    const tick = (v) => Number(v.toFixed(4)).toString().replace("-", "−");
    const teamKey = teams.map((id, i) => `<span class="wf-team"><b class="wf-role wf-${i ? "b" : "a"}" translate="no">${i ? "B" : "A"}</b>${App.flag(id,16)}<span>${esc(App.team[id].name)}</span><small>${sums[i].n} ${sums[i].n === 1 ? "match" : "matches"}</small></span>`).join('<span aria-hidden="true">−</span>');
    const bars = steps.map((step, i) => {
      const total = step.id === "gd";
      return `<button type="button" class="wf-row ${total ? "wf-total" : ""}" data-step="${step.id}" aria-pressed="${total}">
        <span class="wf-name">${total ? "Observed gap" : esc(step.label)}</span><span class="wf-track" aria-hidden="true">
          ${i ? `<i class="wf-from" style="left:${x(steps[i-1].end)}%"></i>` : ""}
          <i class="wf-bar ${total ? "wf-observed" : step.value < 0 ? "wf-negative" : "wf-positive"}" style="left:${x(Math.min(step.start,step.end))}%;width:${Math.abs(x(step.end)-x(step.start))}%"></i>
          <i class="wf-end" style="left:${x(step.end)}%"></i>${total ? "" : `<i class="wf-connector" style="left:${x(step.end)}%"></i>`}</span>
        <strong dir="ltr">${format(step.value)}</strong></button>`;
    }).join("");
    host.innerHTML = `<div class="wf-head">${teamKey}<span class="wf-scope">${scopeNames[scope]}</span></div>
      <div class="wf-grid"><div class="wf-plot" style="--zero:${x(0)}%" role="group" aria-label="Cumulative goal-difference contributions">
        <div class="wf-colheads"><span>Component</span><span>Running gap · goals per match</span><span>A − B</span></div>
        ${bars}<div class="wf-axis" aria-hidden="true"><div class="wf-ticks">${x.ticks(4).map(v => `<i style="left:${x(v)}%"><span>${tick(v)}</span></i>`).join("")}</div></div></div>
        <div class="wf-inspect"><div class="wf-detail" aria-live="polite"></div>
          <details class="wf-records"><summary>Inspect contributing matches</summary><div class="wf-record-data"></div></details>
        </div></div><p class="wf-note">${fixedNote}</p>`;
    const detail = host.querySelector(".wf-detail"), records = host.querySelector(".wf-records");
    const buttons = [...host.querySelectorAll("[data-step]")], byId = new Map(steps.map(step => [step.id, step]));
    let pinned = "gd", inspected = null;

    function show(id) {
      if (id === inspected) return;
      inspected = id;
      const step = byId.get(id);
      buttons.forEach(button => button.classList.toggle("wf-inspected", button.dataset.step === id));
      const direction = id === "gd" ? "Observed gap" : Math.abs(step.value) < 1e-10 ? "No change in the gap" : step.value > 0 ? "Increases A − B" : "Decreases A − B";
      detail.innerHTML = `<h3>${esc(step.label)}</h3><div class="wf-contribution"><b dir="ltr">${format(step.value)}</b><span>${direction}</span></div>
        <p>${definitions[id]}</p><div class="wf-means">${teams.map((team, i) => `<span><b translate="no">${team}</b> <span dir="ltr">${format(i ? step.right : step.left)}</span></span>`).join("")}</div>`;
      if (records.open) drawRecords();
    }
    function drawRecords() {
      const step = byId.get(inspected);
      host.querySelector(".wf-record-data").innerHTML = `<p>${matchNote}</p><div class="wf-record-teams">${teams.map(id => {
        const rows = A.rows(id, scope).sort((u, v) => u.number - v.number);
        return `<div><h4>${esc(App.team[id].name)}</h4>${rows.map(r => `<button type="button" data-record="${esc(r.key)}"><span><span translate="no">M${r.number}</span> · <span>${esc(App.team[r.opp_id].name)}</span></span><b dir="ltr">${format(A.metric(r, step.id))}</b></button>`).join("")}</div>`;
      }).join("")}</div>`;
    }
    buttons.forEach(button => {
      const id = button.dataset.step;
      button.onpointerenter = (event) => { if (event.pointerType !== "touch") show(id); };
      button.onpointerleave = () => show(host.querySelector(".wf-row:focus-visible")?.dataset.step || pinned);
      button.onfocus = () => show(id);
      button.onblur = () => show(pinned);
      button.onclick = () => {
        pinned = id;
        buttons.forEach(b => b.setAttribute("aria-pressed", String(b === button)));
        show(id);
      };
    });
    records.ontoggle = () => { if (records.open) drawRecords(); };
    records.onclick = (event) => {
      const button = event.target.closest("[data-record]");
      if (button) inspectMatch(button.dataset.record);
    };
    show(pinned);
  };

  const zh = {
    "Outcome gap waterfall": ["净胜球差距分解", "淨勝球差距分解"],
    "Cumulative goal-difference contributions": ["净胜球差距的累计贡献", "淨勝球差距的累計貢獻"],
    "Component": ["分解项", "分解項"],
    "Running gap · goals per match": ["累计差距 · 球／场", "累計差距 · 球／場"],
    "A − B": ["A − B", "A − B"],
    "Observed goal-difference gap": ["实际场均净胜球差距", "實際場均淨勝球差距"],
    "Observed gap": ["实际差距", "實際差距"],
    "Increases A − B": ["增加 A − B", "增加 A − B"],
    "Decreases A − B": ["减小 A − B", "減小 A − B"],
    "No change in the gap": ["差距不变", "差距不變"],
    "Inspect contributing matches": ["查看计算所用比赛", "查看計算所用比賽"],
    "Both teams need match records in this scope.": ["所选范围内两队都需要有比赛记录。", "所選範圍內兩隊都需要有比賽紀錄。"],
    "Stored components exceed the rounding tolerance for this comparison.": ["本次比较中分项加总的误差超出了舍入容差。", "本次比較中分項加總的誤差超出了捨入容差。"],
    [fixedNote]: ["范围决定取哪些比赛求均值。模型使用全部十项指标拟合一次，调整相似度指标时保留原模型的估计值。", "範圍決定取哪些比賽求均值。模型使用全部十項指標擬合一次，調整相似度指標時保留原模型的估計值。"],
    [matchNote]: ["每项为已保存的单场数值。两队各自求均值后相减，得到此步的贡献。", "每項為已儲存的單場數值。兩隊各自求平均後相減，得到此步的貢獻。"],
    [definitions.c_style]: ["参照赛事均值估算的打法净预期进球项，参考其他球队最相似的二十次单场表现。", "參照賽事平均估算的打法淨預期進球項，參考其他球隊最相似的二十次單場表現。"],
    [definitions.c_opp]: ["根据对手在本届赛事其他比赛中的预期进球和预期失球，估算对手项的贡献。", "根據對手在本屆賽事其他比賽中的預期進球和預期失球，估算對手項的貢獻。"],
    [definitions.c_create]: ["实际创造的预期进球减去模型预测的预期进球。", "實際創造的預期進球減去模型預測的預期進球。"],
    [definitions.c_prevent]: ["模型预测的预期失球减去实际的预期失球。", "模型預測的預期失球減去實際的預期失球。"],
    [definitions.c_finish]: ["实际进球减去预期进球。这一残差同时受到把握机会能力和单场波动的影响。", "實際進球減去預期進球。這一殘差同時受到把握機會能力和單場波動的影響。"],
    [definitions.c_keep]: ["预期失球减去实际失球。这一残差结合了对手的射门表现和本队阻止进球的表现。", "預期失球減去實際失球。這一殘差結合了對手的射門表現和本隊阻止進球的表現。"],
    [definitions.gd]: ["两队分别计算进球数减失球数的场均值。这些分项用于核算差距，判断因果关系需要其他证据。", "兩隊分別計算進球數減失球數的場均值。這些分項用於核算差距，判斷因果關係需要其他證據。"],
  };
  for (const [key, [hans, hant]] of Object.entries(zh)) {
    window.STYLE_TWINS_MESSAGES["zh-Hans"][key] = hans;
    window.STYLE_TWINS_MESSAGES["zh-Hant"][key] = hant;
  }
})();
