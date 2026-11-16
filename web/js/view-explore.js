/* A task-led entry and one coordinated workspace. All aggregates use analysis.js. */
(function () {
  "use strict";
  const App = window.App, A = App.analysis;
  const BLUE = "#2859c5", ORANGE = "#b95824", INK = "#263247", MUTED = "#657186", GRID = "#e6e9ed";
  const tasks = [
    { id: "twins", title: "Find style twins", question: "Who plays like my team?", detail: "Explore the style map and closest teams." },
    { id: "results", title: "Compare results", question: "Similar style. Different results?", detail: "Compare chances created and actual scorelines." },
    { id: "matches", title: "Inspect matches", question: "Which matches make the difference?", detail: "Follow the individual games behind the averages." },
  ];
  const teamOptions = () => App.teams.slice().sort((a, b) => a.name.localeCompare(b.name))
    .map(t => `<option value="${t.id}">${App.esc(t.name)}</option>`).join("");
  const url = s => `#/styles${A.query(s.dials, { team: s.team, compare: s.compare, task: s.task, scope: s.scope, arch: s.arch, cohort: s.cohort ? s.cohort.join(",") || "none" : null })}`;
  const validTeam = (id, fallback) => App.team[id] ? id : fallback;
  const nearest = (team, dials = App.dials, scope = "all") => A.twinTable(A.space(dials, scope)).near[team] || [];
  const fmt = (n, digits = 2) => Number.isFinite(n) ? App.fix(Number(n.toFixed(digits)), digits) : "–";
  function activate(selection, action) {
    selection.attr("tabindex", 0).attr("role", "button").style("cursor", "pointer")
      .on("click", action).on("keydown", (event, d) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); action(event, d); }
      });
  }
  function chart(host, label) {
    host.innerHTML = "";
    const W = Math.max(host.clientWidth, 300), H = Math.max(host.clientHeight, host.id === "ex-profile" ? 215 : 80);
    const svg = d3.select(host).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "group").attr("aria-label", label);
    return { svg, W, H };
  }
  function profilePreview(host, left, right) {
    const {svg, W, H} = chart(host, "Selected teams' style profiles");
    const space = A.space(App.dials), m = {l: 155, r: 25, t: 20, b: 34};
    const x = d3.scaleLinear().domain([-2.5, 2.5]).range([m.l, W - m.r]);
    const y = d3.scalePoint().domain(App.dials).range([m.t, H - m.b]).padding(.5);
    [-2, -1, 0, 1, 2].forEach(v => svg.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", 8).attr("y2", H-m.b).attr("stroke", v === 0 ? "#adb6c5" : GRID).attr("stroke-dasharray", v === 0 ? null : "3 4"));
    App.dials.forEach((dial, i) => {
      const a = space.team[left][i], b = space.team[right][i];
      svg.append("text").attr("x", m.l-16).attr("y", y(dial)+5).attr("text-anchor", "end").text(dial);
      svg.append("line").attr("x1", x(a)).attr("x2", x(b)).attr("y1", y(dial)).attr("y2", y(dial)).attr("stroke", "#bbc3d1").attr("stroke-width", 3);
      [a,b].forEach((v,j) => svg.append("circle").attr("cx",x(v)).attr("cy",y(dial)).attr("r",6).attr("fill",j ? ORANGE : BLUE).attr("stroke","white").attr("stroke-width",1.5));
    });
    svg.append("text").attr("x",m.l).attr("y",H-7).attr("fill",MUTED).text("Below average");
    svg.append("text").attr("x",W-m.r).attr("y",H-7).attr("text-anchor","end").attr("fill",MUTED).text("Above average");
  }
  function resultPreview(host, left, right, task) {
    const {svg,W,H}=chart(host,task==="matches"?"Match goal differences for selected teams":"Expected and actual goal differences per match");
    const ids=[left,right], matchMode=task==="matches";
    const values=ids.flatMap(id=>matchMode?A.rows(id).slice().sort((a,b)=>a.number-b.number).slice(-4).map(r=>({id,label:`M${r.number} · ${r.opp_id}`,value:A.metric(r,"gd")})):[{id,label:"xG difference",value:A.summary(A.rows(id)).xgd},{id,label:"Goal difference",value:A.summary(A.rows(id)).gd}]);
    const extent=d3.extent(values,d=>d.value),lo=Math.min(0,extent[0]),hi=Math.max(0,extent[1]);
    const x=d3.scaleLinear().domain([lo-.3,hi+.4]).nice().range([145,W-40]);
    const y=d3.scaleBand().domain(values.map((d,i)=>i)).range([15,H-35]).padding(.3);
    svg.append("line").attr("x1",x(0)).attr("x2",x(0)).attr("y1",10).attr("y2",H-35).attr("stroke","#adb6c5");
    values.forEach((d,i)=>{
      const color=d.id===left?BLUE:ORANGE;
      svg.append("text").attr("x",130).attr("y",y(i)+y.bandwidth()/2+4).attr("text-anchor","end").text(d.label);
      svg.append("rect").attr("x",x(Math.min(0,d.value))).attr("y",y(i)).attr("height",y.bandwidth()).attr("width",Math.abs(x(d.value)-x(0))).attr("rx",3).attr("fill",color);
      svg.append("text").attr("x",x(d.value)+(d.value>=0?6:-6)).attr("y",y(i)+y.bandwidth()/2+4).attr("text-anchor",d.value>=0?"start":"end").attr("fill",color).text(fmt(d.value));
    });
    svg.append("text").attr("x",W-40).attr("y",H-7).attr("text-anchor","end").attr("fill",MUTED).text(matchMode?"Latest four matches / team · goal difference":"Difference per match");
  }

  App.views.story = function(root, params) {
    let team = validTeam(params.team, "NED"), task = tasks.some(t=>t.id===params.task) ? params.task : "twins";
    root.innerHTML = `<div class="ex-home">
      <div class="ex-intro"><span class="ex-eyebrow">WORLD CUP 2026 · STYLE TWINS</span><h1>Same style.<br>Different story.</h1><p>Choose a question. Start with your team.</p></div>
      <div class="ex-start"><section class="ex-setup" aria-label="Choose your analysis">
        <h2>What do you want to explore?</h2><div class="ex-task-list">${tasks.map((t,i)=>`<button type="button" data-task="${t.id}" aria-pressed="${task===t.id}"><span class="ex-task-num">0${i+1}</span><span><b>${t.question}</b><span>${t.detail}</span></span><span aria-hidden="true">↗</span></button>`).join("")}</div>
        <label class="ex-field">Your team<select id="ex-home-team">${teamOptions()}</select></label>
        <a class="ex-primary" id="ex-open" href="#/styles">Explore my team <span aria-hidden="true">→</span></a>
      </section><section class="ex-preview"><div class="ex-panel-head"><div><span class="ex-eyebrow">YOUR STARTING COMPARISON</span><h2 id="ex-preview-title"></h2></div><span class="ex-live">From match data</span></div>
        <div class="ex-team-key" id="ex-preview-key"></div><div id="ex-home-chart" class="ex-home-chart"></div><div class="ex-preview-stats" id="ex-preview-stats"></div>
      </section></div><div class="ex-home-bottom"><span>48 teams · 104 matches · 10 style indicators</span><span>One workspace. Every panel connected.</span><a href="#/method">Data & method ↗</a></div>
    </div>`;
    const select = root.querySelector("#ex-home-team"); select.value = team;
    select.addEventListener("change",()=> {team=select.value; render();});
    root.querySelectorAll("[data-task]").forEach(button=>button.addEventListener("click",()=> {task=button.dataset.task; render();}));
    function render() {
      const n = nearest(team)[0], other = n.id;
      root.querySelectorAll("[data-task]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.task===task));
      root.querySelector("#ex-preview-title").textContent = `${App.team[team].name} & ${App.team[other].name}`;
      root.querySelector("#ex-preview-key").innerHTML = `<span class="ex-key-a">● ${App.flag(team,22)} ${App.team[team].name}</span><span class="ex-key-b">● ${App.flag(other,22)} ${App.team[other].name}</span>`;
      if(task==="twins") profilePreview(root.querySelector("#ex-home-chart"),team,other);
      else resultPreview(root.querySelector("#ex-home-chart"),team,other,task);
      const a = A.summary(A.rows(team)), b = A.summary(A.rows(other));
      root.querySelector("#ex-preview-stats").innerHTML = `<div><b>${Math.round(n.sim*100)}<span>/100</span></b><span>Style similarity percentile</span></div><div><b>${fmt(a.gd-b.gd)}</b><span>Goal difference gap / match</span></div>`;
      root.querySelector("#ex-open").href = url({team,compare:other,task,dials:App.dials,scope:"all"});
      history.replaceState(null,"",`#/story?team=${team}&task=${task}`);
    }
    render(); App.onResize(root.querySelector("#ex-home-chart"),render);
  };

  App.views.styles = function(root, params) {
    let state, space, table, summaries;
    const read = p => {
      const scope = ["group","knockout"].includes(p.scope) ? p.scope : "all";
      const dials = A.readDials(p), team = validTeam(p.team,"NED");
      const close = nearest(team,dials,scope);
      let compare = validTeam(p.compare,close[0]?.id || (team==="CRO" ? "NED" : "CRO"));
      if(compare===team) compare=close[0]?.id || App.teams.find(t=>t.id!==team).id;
      return {team,compare,dials,scope,task:tasks.some(t=>t.id===p.task)?p.task:"twins",arch:App.arch[p.arch]?p.arch:null,
        cohort:p.cohort ? [...new Set(p.cohort.split(",").filter(id=>App.team[id]))] : null};
    };
    state=read(params);
    root.innerHTML = `<div class="ex-workspace">
      <div class="ex-work-top"><h1>Play alike. Compare the difference.</h1><div class="ex-task-tabs" role="group" aria-label="Analysis task">${tasks.map(t=>`<button type="button" data-mode="${t.id}">${t.title}</button>`).join("")}</div></div>
      <div class="ex-toolbar"><label class="ex-field ex-a">Team A<select id="ex-team-a">${teamOptions()}</select></label><button class="ex-swap" type="button" aria-label="Swap teams">⇄</button><label class="ex-field ex-b">Team B<select id="ex-team-b">${teamOptions()}</select></label>
        <label class="ex-field">Match scope<select id="ex-scope"><option value="all">Full tournament</option><option value="group">Group stage</option><option value="knockout">Knockout stage</option></select></label>
        <details class="ex-settings"><summary id="ex-indicator-label">Style indicators</summary><div class="ex-settings-pop"><b>Choose at least two indicators</b><div id="ex-dials">${App.dials.map((d,i)=>`<label><input type="checkbox" value="${i}">${d}</label>`).join("")}</div><button type="button" id="ex-reset-dials">Reset indicators</button></div></details>
        <button type="button" class="ex-reset" id="ex-clear">Reset filters</button>
      </div>
      <div class="ex-context" aria-live="polite" id="ex-context"></div>
      <div class="ex-grid">
        <section class="ex-panel ex-map-panel"><div class="ex-panel-head"><div><h2 id="ex-map-title">Style map</h2><span id="ex-map-sub"></span></div><div class="ex-map-actions"><button type="button" id="ex-brush" aria-pressed="false">Select region</button><select id="ex-arch" aria-label="Filter original style group"><option value="">All style groups</option>${App.data.archetypes.map(a=>`<option value="${a.id}">${a.name.replace("The ","")}</option>`).join("")}</select></div></div><div class="ex-viz" id="ex-map"></div><div class="ex-panel-caption" id="ex-map-caption"></div></section>
        <section class="ex-panel ex-near-panel"><div class="ex-panel-head"><div><h2>Closest styles</h2><span id="ex-near-sub"></span></div><span class="ex-unit" title="Euclidean distance across the selected standardized indicators. Lower means closer.">Distance ↓</span></div><div id="ex-near" class="ex-near"></div></section>
        <section class="ex-panel ex-profile-panel"><div class="ex-panel-head"><div><h2>Style fingerprint</h2><span>Selected teams + closest candidates</span></div><div class="ex-heat-legend"><span>Lower</span><i></i><span>Higher</span></div></div><div class="ex-viz" id="ex-profile"></div><div class="ex-panel-caption">Standardized indicators · 0 = tournament average · values shown in σ</div></section>
        <section class="ex-panel ex-outcomes-panel"><div class="ex-panel-head"><div><h2 id="ex-evidence-title">Chances & results</h2><span id="ex-outcome-sub"></span></div><a id="ex-detail" href="#/twins">Open detail ↗</a></div><div class="ex-viz" id="ex-outcomes"></div><div class="ex-panel-caption" id="ex-outcome-caption"></div></section>
      </div><div class="ex-desk-foot"><div class="ex-team-key" id="ex-key"></div><a id="ex-audit" href="#/robustness">Test this comparison ↗</a><a href="#/method">Data & method ↗</a></div>
    </div>`;
    let brushing = false;
    const q = selector=>root.querySelector(selector);
    function change(patch) { App.tip.hide(); App.go(url({...state,...patch})); }
    q("#ex-team-a").addEventListener("change",e=>change({team:e.target.value,compare:e.target.value===state.compare?state.team:state.compare}));
    q("#ex-team-b").addEventListener("change",e=>change({compare:e.target.value,team:e.target.value===state.team?state.compare:state.team}));
    q(".ex-swap").addEventListener("click",()=>change({team:state.compare,compare:state.team}));
    q("#ex-scope").addEventListener("change",e=>change({scope:e.target.value,cohort:null}));
    q("#ex-arch").addEventListener("change",e=>change({arch:e.target.value||null,cohort:null}));
    q("#ex-clear").addEventListener("click",()=>{brushing=false; change({arch:null,cohort:null,scope:"all",dials:App.dials.slice()}); render();});
    q("#ex-brush").addEventListener("click",()=>{brushing=!brushing; drawMap();});
    q("#ex-reset-dials").addEventListener("click",()=>change({dials:App.dials.slice(),cohort:null}));
    q("#ex-dials").addEventListener("change",e=>{
      const inputs=[...q("#ex-dials").querySelectorAll("input")], selected=inputs.filter(i=>i.checked);
      if(selected.length<2) {e.target.checked=true; return;}
      change({dials:selected.map(i=>App.dials[+i.value]),cohort:null});
    });
    root.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>change({task:b.dataset.mode,cohort:null})));
    function candidates() {return Object.keys(space.team).filter(id=>(!state.arch||App.team[id].archetype===state.arch)&&(!state.cohort||state.cohort.includes(id)));}
    function neighbors() {const ids=new Set(candidates());return (table.near[state.team]||[]).filter(n=>ids.has(n.id));}
    function selectedColor(id) {return id===state.team?BLUE:id===state.compare?ORANGE:"#a6afbe";}
    function highlight(id) {
      root.querySelectorAll("[data-team-mark]").forEach(el=>el.classList.toggle("ex-hover",el.dataset.teamMark===id));
    }
    function bindMark(selection, idOf) {
      selection.attr("data-team-mark",idOf)
        .on("mouseenter",(e,d)=>highlight(idOf(d))).on("mouseleave",()=>{highlight(null);App.tip.hide();});
    }
    function render() {
      const grid=q(".ex-grid");
      grid.style.height=window.innerWidth>1150?`${Math.max(400,window.innerHeight-grid.getBoundingClientRect().top-48)}px`:"";
      space=A.space(state.dials,state.scope);table=A.twinTable(space);
      summaries=Object.fromEntries(App.teams.map(t=>[t.id,A.summary(A.rows(t.id,state.scope))]));
      q("#ex-team-a").value=state.team; q("#ex-team-b").value=state.compare;q("#ex-scope").value=state.scope;q("#ex-arch").value=state.arch||"";
      q("#ex-indicator-label").textContent=`Style indicators (${state.dials.length})`;
      q("#ex-dials").querySelectorAll("input").forEach(input=>{input.checked=state.dials.includes(App.dials[+input.value]);input.disabled=input.checked&&state.dials.length<=2;});
      root.querySelectorAll("[data-mode]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.mode===state.task));
      const a=summaries[state.team],b=summaries[state.compare],n=(table.near[state.team]||[]).find(n=>n.id===state.compare);
      q("#ex-context").innerHTML=`<b>${App.team[state.team].name} & ${App.team[state.compare].name}</b><span>${n?`Similarity percentile: ${Math.round(n.sim*100)}/100`:"No comparable profile in this scope"}</span><span>${a.n} + ${b.n} matches</span><span>${candidates().length} teams in view</span>${state.cohort?'<button type="button" id="ex-clear-region">Clear region ×</button>':""}`;
      q("#ex-clear-region")?.addEventListener("click",()=>change({cohort:null}));
      q("#ex-key").innerHTML=`<span class="ex-key-a">● A · ${App.team[state.team].name}</span><span class="ex-key-b">● B · ${App.team[state.compare].name}</span>`;
      q("#ex-detail").href=`#/twins/${state.team}/${state.compare}${A.query(state.dials,{scope:state.scope,return:url(state)})}`;
      q("#ex-audit").href=`#/robustness/${state.team}/${state.compare}${A.query(state.dials,{scope:state.scope,return:url(state)})}`;
      drawMap();drawNeighbors();drawProfile();drawOutcomes();
    }
    function drawMap() {
      const {svg,W,H}=chart(q("#ex-map"),state.task==="results"?"Chance and goal differences by team":"Team playing-style map");
      const m={l:48,r:26,t:20,b:H<180?32:42}, resultMode=state.task==="results";
      const ids=Object.keys(space.team), pca=App.pca2(space), positions=Object.fromEntries(ids.map(id=>[id,resultMode?[summaries[id].xgd,summaries[id].gd]:pca.project(space.team[id])]));
      const scale=axis=> {const vals=Object.values(positions).map(p=>p[axis]);let [lo,hi]=d3.extent(vals); if(lo===hi){lo-=1;hi+=1;} const pad=(hi-lo)*.12;return d3.scaleLinear().domain([lo-pad,hi+pad]).nice().range(axis?[H-m.b,m.t]:[m.l,W-m.r]);};
      q("#ex-map-title").textContent=resultMode?"Chances vs scorelines":"Style map";
      q("#ex-map-sub").textContent=resultMode?"One dot per team · averages per match":`PCA projection · ${Math.round(d3.sum(pca.vars)*100)}% of style variation shown`;
      q("#ex-brush").setAttribute("aria-pressed",brushing);
      q("#ex-map-caption").textContent=brushing?"Drag a region to filter candidates across panels. A and B stay pinned.":"Click a team to set B · Shift-click to set A · Hover to link panels";
      if(!ids.length) {svg.append("text").attr("x",25).attr("y",50).text("No teams in this scope");return;}
      const x=scale(0),y=scale(1);
      svg.append("g").attr("transform",`translate(0,${H-m.b})`).call(d3.axisBottom(x).ticks(5).tickSize(-(H-m.t-m.b))).call(g=>g.select(".domain").remove());
      svg.append("g").attr("transform",`translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W-m.l-m.r))).call(g=>g.select(".domain").remove());
      svg.selectAll(".tick line").attr("stroke",GRID); svg.selectAll(".tick text").attr("fill",MUTED).attr("font-size",13);
      svg.append("text").attr("x",W-m.r).attr("y",H-8).attr("text-anchor","end").attr("fill",MUTED).text(resultMode?"xG difference / match →":"Style axis 1 →");
      svg.append("text").attr("x",m.l).attr("y",16).attr("fill",MUTED).text(resultMode?"Goal difference / match ↑":"Style axis 2 ↑");
      if(resultMode){const lo=Math.max(x.domain()[0],y.domain()[0]),hi=Math.min(x.domain()[1],y.domain()[1]);svg.append("line").attr("x1",x(lo)).attr("y1",y(lo)).attr("x2",x(hi)).attr("y2",y(hi)).attr("stroke","#9ba6b8").attr("stroke-dasharray","5 5");}
      const visible=new Set(candidates()), near=new Set(neighbors().slice(0,4).map(n=>n.id));
      if(positions[state.team]&&positions[state.compare]) svg.append("line").attr("x1",x(positions[state.team][0])).attr("y1",y(positions[state.team][1])).attr("x2",x(positions[state.compare][0])).attr("y2",y(positions[state.compare][1])).attr("stroke",INK).attr("stroke-dasharray","4 4").attr("stroke-opacity",.4);
      const marks=svg.append("g").selectAll("g").data(ids).join("g").attr("class","ex-map-mark").attr("transform",id=>`translate(${x(positions[id][0])},${y(positions[id][1])})`).attr("opacity",id=>visible.has(id)||id===state.team||id===state.compare?1:.18).attr("aria-label",id=>`${App.team[id].name}: select as Team B`);
      marks.append("circle").attr("class","ex-mark-halo").attr("r",13).attr("fill","none").attr("stroke",INK).attr("stroke-width",2).attr("opacity",0);
      marks.append("circle").attr("r",id=>id===state.team||id===state.compare?8:5.5).attr("fill",selectedColor).attr("stroke","white").attr("stroke-width",1.7);
      marks.filter(id=>id===state.team||id===state.compare).raise();
      // Label placement adjusts labels only; projected dots remain at their exact positions.
      const labelIds=ids.filter(id=>id===state.team||id===state.compare||near.has(id));
      const labels=labelIds.map(id=>({id,x:x(positions[id][0]),y:y(positions[id][1])-14,ax:x(positions[id][0]),ay:y(positions[id][1])-14}));
      const simulation=d3.forceSimulation(labels).force("x",d3.forceX(d=>d.ax).strength(.5)).force("y",d3.forceY(d=>d.ay).strength(.7)).force("collision",d3.forceCollide(15)).stop();
      for(let i=0;i<70;i++)simulation.tick();
      const labelGroup=svg.append("g").attr("pointer-events","none");
      labelGroup.selectAll("line").data(labels.filter(d=>Math.hypot(d.x-d.ax,d.y-d.ay)>8)).join("line").attr("x1",d=>d.ax).attr("y1",d=>d.ay+10).attr("x2",d=>Math.max(18,Math.min(W-18,d.x))).attr("y2",d=>Math.max(32,Math.min(H-m.b-10,d.y))).attr("stroke","#c6cdd7");
      labelGroup.selectAll("text").data(labels).join("text").attr("x",d=>Math.max(18,Math.min(W-18,d.x))).attr("y",d=>Math.max(32,Math.min(H-m.b-10,d.y))).attr("text-anchor","middle").attr("font-size",13).attr("font-weight",d=>d.id===state.team||d.id===state.compare?800:500).attr("fill",d=>selectedColor(d.id)=== "#a6afbe"?INK:selectedColor(d.id)).attr("paint-order","stroke").attr("stroke","white").attr("stroke-width",3).text(d=>d.id);
      activate(marks,(e,id)=>change(e.shiftKey?{team:id,compare:id===state.compare?state.team:state.compare}:{compare:id,team:id===state.team?state.compare:state.team}));
      bindMark(marks,id=>id);
      marks.on("mousemove",(e,id)=>App.tip.show(`<b>${App.team[id].name}</b>${App.ttRows([["xG difference / match",fmt(summaries[id].xgd)],["Goal difference / match",fmt(summaries[id].gd)],["Matches",summaries[id].n]])}`,e));
      if(brushing) svg.append("g").attr("class","ex-brush-layer").call(d3.brush().extent([[m.l,m.t],[W-m.r,H-m.b]]).on("end",e=>{
        if(!e.sourceEvent)return;
        const box=e.selection;
        const cohort=box?ids.filter(id=>{const px=x(positions[id][0]),py=y(positions[id][1]);return px>=box[0][0]&&px<=box[1][0]&&py>=box[0][1]&&py<=box[1][1];}):null;
        brushing=false;change({cohort});
      }));
    }
    function drawNeighbors() {
      const rows=neighbors().slice(0,4), max= d3.max(rows,n=>n.d)||1;
      q("#ex-near-sub").textContent=`For ${App.team[state.team].name} · click to set B`;
      q("#ex-near").innerHTML=rows.length?rows.map((n,i)=>`<button type="button" data-neighbor="${n.id}" data-team-mark="${n.id}" aria-pressed="${n.id===state.compare}"><span class="ex-rank">${i+1}</span>${App.flag(n.id,25)}<span class="ex-neighbor-name">${App.team[n.id].name}<span class="ex-distance-track"><i style="width:${n.d/max*100}%"></i></span></span><b>${fmt(n.d)}</b></button>`).join(""):`<div class="ex-empty">No candidates in this selection.<br>Change the scope or reset filters.</div>`;
      q("#ex-near").querySelectorAll("button").forEach(button=>{
        button.addEventListener("click",()=>change({compare:button.dataset.neighbor}));
        button.addEventListener("mouseenter",()=>highlight(button.dataset.neighbor));button.addEventListener("mouseleave",()=>highlight(null));
      });
    }
    function drawProfile() {
      const {svg,W,H}=chart(q("#ex-profile"),"Standardized style indicators for selected teams and closest candidates");
      const ids=[...new Set([state.team,state.compare,...neighbors().slice(0,4).map(n=>n.id)])];
      const m={l:154,r:12,t:29,b:6},x=d3.scaleBand().domain(ids).range([m.l,W-m.r]).padding(.1), y=d3.scaleBand().domain(state.dials).range([m.t,H-m.b]).padding(.12);
      const color=d3.scaleSequential(d3.interpolatePurples).domain([-2.5,2.5]).clamp(true);
      const heads=svg.selectAll("g.ex-heat-head").data(ids).join("g").attr("class","ex-heat-head").attr("aria-label",id=>`Select ${App.team[id].name} as Team B`);
      heads.append("text").attr("x",id=>x(id)+x.bandwidth()/2).attr("y",18).attr("text-anchor","middle").attr("fill",id=>id===state.team||id===state.compare?selectedColor(id):INK).attr("font-weight",700).text(id=>`${id===state.team?"A · ":id===state.compare?"B · ":""}${id}`);
      activate(heads,(e,id)=>change({compare:id,team:id===state.team?state.compare:state.team}));bindMark(heads,id=>id);
      state.dials.forEach((dial,j)=>{
        svg.append("text").attr("x",m.l-12).attr("y",y(dial)+y.bandwidth()/2+4).attr("text-anchor","end").text(dial);
        const cells=svg.append("g").selectAll("g").data(ids).join("g").attr("aria-label",id=>`${App.team[id].name}, ${dial}: ${fmt(space.team[id]?.[j],1)} standard deviations`);
        cells.append("rect").attr("x",id=>x(id)).attr("y",y(dial)).attr("width",x.bandwidth()).attr("height",y.bandwidth()).attr("rx",3).attr("fill",id=>space.team[id]?color(space.team[id][j]):"#eceff3");
        cells.append("text").attr("x",id=>x(id)+x.bandwidth()/2).attr("y",y(dial)+y.bandwidth()/2+4).attr("text-anchor","middle").attr("fill",id=>space.team[id]&&App.luminance(color(space.team[id][j]))<.18?"#fff":"#000").text(id=>fmt(space.team[id]?.[j],1));
        activate(cells,(e,id)=>change({compare:id,team:id===state.team?state.compare:state.team}));bindMark(cells,id=>id);
        cells.on("mousemove",(e,id)=>App.tip.show(`<b>${App.team[id].name} · ${dial}</b><div>${fmt(space.team[id]?.[j],2)} σ</div><div>${App.dialInfo[dial].help}</div>`,e));
      });
    }
    function drawOutcomes() {
      const matches=state.task==="matches";
      q("#ex-evidence-title").textContent=matches?"Match evidence":"Chances & results";
      q("#ex-outcome-sub").textContent=matches?"Each dot is a match · click to inspect":"Averages per match · same selected scope";
      q("#ex-outcome-caption").textContent=matches?"Goal difference by match · dashed line = team average":"Per-match averages · xG = expected goals";
      if(matches) {drawMatches();return;}
      const {svg,W,H}=chart(q("#ex-outcomes"),"Selected teams' chances and results per match");
      const metrics=[["xg","Expected goals"],["goals","Goals scored"],["xga","Expected conceded"],["conceded","Goals conceded"]];
      const m={l:155,r:38,t:12,b:30}, max=Math.max(1,d3.max([state.team,state.compare],id=>d3.max(metrics,([key])=>summaries[id][key]))||1);
      const x=d3.scaleLinear().domain([0,max*1.2]).nice().range([m.l,W-m.r]), y=d3.scaleBand().domain(metrics.map(m=>m[0])).range([m.t,H-m.b]).padding(.28);
      svg.append("g").attr("transform",`translate(0,${H-m.b})`).call(d3.axisBottom(x).ticks(4).tickSize(-(H-m.t-m.b))).call(g=>g.select(".domain").remove());svg.selectAll(".tick line").attr("stroke",GRID);
      metrics.forEach(([key,label])=>{
        svg.append("text").attr("x",m.l-12).attr("y",y(key)+y.bandwidth()/2+4).attr("text-anchor","end").text(label);
        [state.team,state.compare].forEach((id,i)=>{
          const yy=y(key)+i*y.bandwidth()/2,v=summaries[id][key], valid=Number.isFinite(v);
          const g=svg.append("g").attr("data-team-mark",id);
          g.append("rect").attr("x",m.l).attr("y",yy).attr("width",valid?Math.max(0,x(v)-m.l):0).attr("height",Math.max(5,y.bandwidth()/2-2)).attr("rx",2).attr("fill",selectedColor(id));
          g.append("text").attr("x",valid?x(v)+5:m.l+6).attr("y",yy+y.bandwidth()/4+4).attr("fill",selectedColor(id)).attr("font-weight",650).text(fmt(v));
          g.on("mouseenter",()=>highlight(id)).on("mouseleave",()=>highlight(null));
        });
      });
    }
    function drawMatches() {
      const {svg,W,H}=chart(q("#ex-outcomes"),"Each selected team's match goal differences");
      const ids=[state.team,state.compare],rows=ids.flatMap(id=>A.rows(id,state.scope));
      const m={l:62,r:24,t:24,b:35},extent=d3.extent(rows,r=>A.metric(r,"gd")), max=Math.max(1,Math.abs(extent[0]||0),Math.abs(extent[1]||0));
      const x=d3.scalePoint().domain(d3.range(d3.max(ids,id=>A.rows(id,state.scope).length)||1)).range([m.l,W-m.r]).padding(.4),y=d3.scaleLinear().domain([-max-1,max+1]).range([H-m.b,m.t]);
      svg.append("g").attr("transform",`translate(${m.l-14},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W-m.l-m.r+14))).call(g=>g.select(".domain").remove());svg.selectAll(".tick line").attr("stroke",GRID);
      svg.append("text").attr("x",m.l).attr("y",15).attr("fill",MUTED).text("Goal difference");
      ids.forEach((id,k)=>{
        const teamRows=A.rows(id,state.scope).slice().sort((a,b)=>a.number-b.number),mean=summaries[id].gd;
        if(!teamRows.length)return;
        svg.append("line").attr("x1",m.l).attr("x2",W-m.r).attr("y1",y(mean)).attr("y2",y(mean)).attr("stroke",selectedColor(id)).attr("stroke-dasharray","5 5");
        const points=svg.append("g").selectAll("g").data(teamRows).join("g").attr("transform",(r,i)=>`translate(${x(i)+(k?5:-5)},${y(A.metric(r,"gd"))})`).attr("aria-label",r=>`${App.team[id].name} against ${App.team[r.opp_id].name}, ${r.goals}–${r.goals_opp}, open match`);
        points.append("circle").attr("r",8).attr("fill",selectedColor(id)).attr("stroke","white").attr("stroke-width",2);
        points.append("text").attr("y",k?24:-15).attr("text-anchor","middle").attr("fill",selectedColor(id)).text(r=>r.opp_id);
        activate(points,(e,r)=>App.go(`#/match/${r.match_id}${A.query(state.dials,{return:url(state)})}`));bindMark(points,()=>id);
        points.on("mousemove",(e,r)=>App.tip.show(`<b>${App.team[id].name} ${r.goals}–${r.goals_opp} ${App.team[r.opp_id].name}</b><div>${App.stageShort(r.stage)} · xG ${fmt(r.xg)}–${fmt(r.xga)}</div>`,e));
      });
      svg.append("text").attr("x",W-m.r).attr("y",H-7).attr("text-anchor","end").attr("fill",MUTED).text("Matches in chronological order →");
      if(!rows.length)svg.append("text").attr("x",m.l).attr("y",H/2).text("No matches in this scope");
    }
    render();App.onViewport(render);
    return {update(p){state=read(p);render();}};
  };
})();
