/* Coordinated visual-analysis workbench. All measures use the delivered records. */
(function () {
  "use strict";
  const App = window.App, A = App.analysis;
  const INK = "#29323d", MUTED = "#616c77", GRID = "#e7e9ec", COLORS = ["#2864b7", "#b65a26"];
  const tasks = [["twins", "Find similar teams"], ["results", "Compare results"], ["matches", "Inspect match variation"]];
  const measures = [
    {id:"xgd",label:"xG difference",unit:"per match"}, {id:"gd",label:"Goal difference",unit:"per match"},
    {id:"xg",label:"Expected goals",unit:"per match"}, {id:"xga",label:"Expected conceded",unit:"per match"},
    {id:"goals",label:"Goals scored",unit:"per match"}, {id:"conceded",label:"Goals conceded",unit:"per match"},
    {id:"shots",label:"Attempts",unit:"per match"}, {id:"poss",label:"Possession",unit:"%"},
    ...App.dials.map((d,i)=>({id:`dial${i}`,label:d,unit:App.dialInfo[d].unit||"per adjusted possession"})),
  ];
  const metricById=Object.fromEntries(measures.map(m=>[m.id,m]));
  const recordByKey=Object.fromEntries(A.records.map(r=>[r.key,r]));
  const fmt=(v,n=2)=>Number.isFinite(v)?App.fix(Number(v.toFixed(n)),n):"–";
  const options=(items,value)=>items.map(([id,label])=>`<option value="${id}"${id===value?" selected":""}>${App.esc(label)}</option>`).join("");
  const teamOptions=()=>options(App.teams.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(t=>[t.id,t.name]));
  const finiteParam=v=>v!=null&&v!==""&&Number.isFinite(+v)?+v:null;
  const color=id=>id===currentState?.team?COLORS[0]:id===currentState?.compare?COLORS[1]:"#8c959e";
  let currentState=null;

  function stateFrom(p) {
    const dials=A.readDials(p),scope=["group","knockout"].includes(p.scope)?p.scope:"all";
    const team=App.team[p.team]?p.team:"NED";
    const near=A.twinTable(A.space(dials,scope)).near[team]||[];
    let compare=App.team[p.compare]?p.compare:near[0]?.id||"CRO";
    if(compare===team)compare=App.teams.find(t=>t.id!==team).id;
    const task=tasks.some(t=>t[0]===p.task)?p.task:"twins";
    return {team,compare,dials,scope,task,arch:App.arch[p.arch]?p.arch:"",search:p.search||"",
      view:p.view==="custom"||(!p.view&&task==="results")?"custom":"pca",x:metricById[p.x]?p.x:"xgd",y:metricById[p.y]?p.y:"gd",
      cohort:p.cohort?[...new Set(p.cohort.split(",").filter(id=>App.team[id]))]:null,
      filter:metricById[p.filter]?p.filter:"gd",lo:finiteParam(p.lo),hi:finiteParam(p.hi),
      sort:["name","distance","n","xgd","gd"].includes(p.sort)?p.sort:"distance",desc:p.desc==="1",
      match:App.tm[p.match]?p.match:null};
  }
  function stateUrl(s) {
    return `#/styles${A.query(s.dials,{team:s.team,compare:s.compare,task:s.task,scope:s.scope,
      arch:s.arch,search:s.search,view:s.view,x:s.x,y:s.y,cohort:s.cohort?s.cohort.join(",")||"none":null,
      filter:s.filter,lo:s.lo,hi:s.hi,sort:s.sort,desc:s.desc?"1":null,match:s.match})}`;
  }
  function interactive(sel,fn) {
    sel.attr("tabindex",0).attr("role","button").style("cursor","pointer").on("click",fn)
      .on("keydown",(e,d)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();fn(e,d);}});
  }
  function svgFor(host,label,minHeight=80) {
    host.replaceChildren();
    const W=Math.max(230,host.clientWidth),H=Math.max(minHeight,host.clientHeight);
    return {W,H,svg:d3.select(host).append("svg").attr("viewBox",`0 0 ${W} ${H}`).attr("role","group").attr("aria-label",label)};
  }

  function workspace(root,params) {
    let state=stateFrom(params),space,summaries,profiles,visibleIds=[],hover=null,brushing=false;
    let mapMode=state.view;
    let resizeFrame=null;
    const q=s=>root.querySelector(s);
    root.innerHTML=`<div class="va-workbench">
      <aside class="va-controls" aria-label="Analysis controls">
        <section class="va-control-section"><h2>Analysis</h2>
          <label>Task<select id="va-task">${options(tasks,state.task)}</select></label>
          <label class="va-team-a">Team A<select id="va-a">${teamOptions()}</select></label>
          <label class="va-team-b">Team B<select id="va-b">${teamOptions()}</select></label>
          <button type="button" id="va-swap">Swap A / B</button>
        </section>
        <section class="va-control-section"><h2>Filters</h2>
          <label>Search teams<input id="va-search" type="search" placeholder="Team name or code"></label>
          <label>Match scope<select id="va-scope">${options([["all","Full tournament"],["group","Group stage"],["knockout","Knockout stage"]])}</select></label>
          <label>Original style group<select id="va-group">${options([["","All groups"],...App.data.archetypes.map(a=>[a.id,a.name.replace("The ","")])])}</select></label>
          <label>Numeric filter<select id="va-filter">${options(measures.map(m=>[m.id,m.label]))}</select></label>
          <div class="va-range"><label>Minimum<input id="va-min" type="number" step="any" placeholder="Any"></label><label>Maximum<input id="va-max" type="number" step="any" placeholder="Any"></label></div>
          <button type="button" id="va-reset">Reset filters</button>
        </section>
        <section class="va-control-section"><h2>Map encoding</h2>
          <label>Projection<select id="va-view">${options([["pca","Style PCA"],["custom","Choose X and Y"]])}</select></label>
          <div id="va-axis-controls"><label>X axis<select id="va-x">${options(measures.map(m=>[m.id,m.label]))}</select></label><label>Y axis<select id="va-y">${options(measures.map(m=>[m.id,m.label]))}</select></label></div>
        </section>
        <section class="va-control-section va-indicators"><h2>Similarity indicators <span id="va-dial-count"></span></h2>
          <div id="va-dials">${App.dials.map((d,i)=>`<label title="${App.esc(App.dialInfo[d].help)}"><input type="checkbox" value="${i}"><span>${d}</span></label>`).join("")}</div>
          <button type="button" id="va-dials-reset">Select all indicators</button>
        </section>
      </aside>
      <div class="va-gutter" id="va-gutter-left" role="separator" tabindex="0" aria-label="Resize controls" aria-orientation="vertical" aria-valuemin="185" aria-valuemax="320" aria-valuenow="216"></div>
      <div class="va-center">
        <section class="va-panel va-map-panel"><header class="va-panel-head"><h2 id="va-map-title">Team map</h2><div class="va-inline-controls"><button type="button" id="va-brush" aria-pressed="false">Brush</button><button type="button" id="va-clear-region" hidden>Clear region</button><button type="button" id="va-reset-map">Reset axes</button></div></header>
          <div class="va-map-meta"><span id="va-projection"></span><div class="va-key" id="va-key"></div></div>
          <div id="va-map" class="va-chart"></div><div id="va-hover-detail" class="va-map-detail" aria-live="polite">Click a point to set B. Shift-click to set A.</div>
        </section>
        <div class="va-row-gutter" role="separator" tabindex="0" aria-label="Resize map and table" aria-orientation="horizontal" aria-valuemin="35" aria-valuemax="80" aria-valuenow="61"></div>
        <section class="va-panel va-collection"><header class="va-panel-head"><h2>Team collection <span id="va-row-count"></span></h2><div class="va-inline-controls"><button type="button" id="va-clear-selection" hidden>Clear region</button><button type="button" id="va-export">Export rows</button></div></header>
          <div class="va-table-scroll"><table id="va-team-table"><thead><tr><th scope="col">Select</th>${[["name","Team"],["n","Matches"],["distance","Style distance"],["xgd","xG diff."],["gd","Goal diff."]].map(([id,label])=>`<th scope="col"><button type="button" data-sort="${id}">${label}<span aria-hidden="true"></span></button></th>`).join("")}</tr></thead><tbody></tbody></table></div>
        </section>
      </div>
      <div class="va-gutter" id="va-gutter-right" role="separator" tabindex="0" aria-label="Resize comparison panels" aria-orientation="vertical" aria-valuemin="290" aria-valuemax="540" aria-valuenow="370"></div>
      <div class="va-right">
        <section class="va-panel va-fingerprint"><header class="va-panel-head"><h2>Style comparison</h2><span class="va-unit">Standard deviations</span></header><div class="va-chart" id="va-profile"></div></section>
        <section class="va-panel va-results"><header class="va-panel-head"><h2>Outcomes / match</h2><select id="va-outcome-view" aria-label="Outcome chart">${options([["pair","A / B means"],["distribution","Filtered distribution"]])}</select></header><div class="va-chart" id="va-outcomes"></div></section>
        <section class="va-panel va-evidence"><header class="va-panel-head"><h2>Match evidence</h2><a id="va-detail" href="#/twins">Pair detail ↗</a></header><div id="va-match-selection" class="va-match-selection"></div><div class="va-table-scroll"><table id="va-matches"><thead><tr><th>Team</th><th>Opponent</th><th>Stage</th><th>Score</th><th>xG diff.</th></tr></thead><tbody></tbody></table></div><div id="va-match-links" class="va-evidence-links"></div></section>
      </div>
    </div>`;

    const change=(patch,{replace=false}={})=>{App.tip.hide();App.go(stateUrl({...state,...patch}),{replace});};
    const choose=(id,side="B")=>change(side==="A"?{team:id,compare:id===state.compare?state.team:state.compare,match:null}:{compare:id,team:id===state.team?state.compare:state.team,match:null});
    const noRegion=()=>{brushing=false;change({cohort:null});drawMap();};
    q("#va-a").onchange=e=>choose(e.target.value,"A");q("#va-b").onchange=e=>choose(e.target.value);
    q("#va-swap").onclick=()=>change({team:state.compare,compare:state.team,match:null});
    q("#va-task").onchange=e=>{const task=e.target.value;mapMode=task==="results"?"custom":"pca";change({task,view:mapMode,x:"xgd",y:"gd",cohort:null});};
    q("#va-scope").onchange=e=>change({scope:e.target.value,cohort:null,match:null});
    q("#va-group").onchange=e=>change({arch:e.target.value,cohort:null});
    let searchTimer,rangeTimer;
    q("#va-search").oninput=e=>{const text=e.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>change({search:text},{replace:true}),180);};
    q("#va-filter").onchange=e=>change({filter:e.target.value,lo:null,hi:null});
    [ ["#va-min","lo"], ["#va-max","hi"] ].forEach(([id,key])=>{
      const input=q(id),apply=()=>{clearTimeout(rangeTimer);change({[key]:finiteParam(input.value)},{replace:true});};
      input.oninput=()=>{clearTimeout(rangeTimer);rangeTimer=setTimeout(apply,300);};
      input.onchange=apply;input.onkeydown=e=>{if(e.key==="Enter")apply();};
    });
    q("#va-reset").onclick=()=>{brushing=false;change({arch:"",search:"",scope:"all",cohort:null,lo:null,hi:null,match:null});};
    q("#va-view").onchange=e=>{mapMode=e.target.value;change({view:mapMode,cohort:null});};
    q("#va-x").onchange=e=>change({x:e.target.value,cohort:null});q("#va-y").onchange=e=>change({y:e.target.value,cohort:null});
    q("#va-brush").onclick=()=>{brushing=!brushing;drawMap();};q("#va-clear-region").onclick=noRegion;q("#va-clear-selection").onclick=noRegion;
    q("#va-reset-map").onclick=()=>{mapMode="pca";brushing=false;change({view:"pca",cohort:null});drawMap();};
    q("#va-dials-reset").onclick=()=>change({dials:App.dials.slice(),cohort:null});
    q("#va-dials").onchange=e=>{const inputs=[...q("#va-dials").querySelectorAll("input")],selected=inputs.filter(i=>i.checked);if(selected.length<2){e.target.checked=true;return;}change({dials:selected.map(i=>App.dials[+i.value]),cohort:null});};
    root.querySelectorAll("[data-sort]").forEach(b=>b.onclick=()=>change({sort:b.dataset.sort,desc:b.dataset.sort===state.sort?!state.desc:false}));
    q("#va-export").onclick=()=>{
      const rows=[["team","matches","style_distance_from_A","xg_difference_per_match","goal_difference_per_match"],...visibleIds.map(id=>[App.team[id].name,summaries[id].n,distance(id),summaries[id].xgd,summaries[id].gd])];
      const csv=rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
      const href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");link.href=href;link.download="style-twins-filtered-teams.csv";link.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
    };
    q("#va-outcome-view").onchange=drawOutcomes;
    function metric(id,key) {if(key.startsWith("dial"))return profiles[id]?.[+key.slice(4)]??null;return summaries[id]?.[key]??null;}
    function recordMetric(row,key) {if(key.startsWith("dial"))return row.dials[+key.slice(4)];if(key==="conceded")return row.goals_opp;return A.metric(row,key);}
    function distance(id) {return space.team[state.team]&&space.team[id]?App.dist(space.team[state.team],space.team[id]):null;}
    function matchingIds() {
      const needle=state.search.toLocaleLowerCase();
      return Object.keys(space.team).filter(id=>{
        const t=App.team[id],v=metric(id,state.filter),name=App.i18n?.t(t.name)||t.name;
        return (!state.arch||t.archetype===state.arch)&&(!state.cohort||state.cohort.includes(id))
          &&(!needle||`${t.name} ${name} ${id}`.toLocaleLowerCase().includes(needle))
          &&(state.lo===null||(Number.isFinite(v)&&v>=state.lo))&&(state.hi===null||(Number.isFinite(v)&&v<=state.hi));
      });
    }
    function focusedRecord(){return state.match?recordByKey[state.match]:null;}
    function highlight(id,{reveal=false}={}) {
      hover=id;
      root.querySelectorAll("[data-team-mark]").forEach(el=>el.classList.toggle("va-hover",el.dataset.teamMark===id));
      if(reveal&&id){const row=q(`#va-team-table tr[data-team-mark="${id}"]`),scroller=q(".va-collection .va-table-scroll");if(row){const r=row.getBoundingClientRect(),s=scroller.getBoundingClientRect();if(r.top<s.top+30)scroller.scrollTop-=s.top+30-r.top;else if(r.bottom>s.bottom)scroller.scrollTop+=r.bottom-s.bottom;}}
      if(id){const t=App.team[id];q("#va-hover-detail").textContent=`${t.name} · ${summaries[id].n} matches · xG diff. ${fmt(summaries[id].xgd)} · goal diff. ${fmt(summaries[id].gd)}`;}
      else q("#va-hover-detail").textContent=focusedRecord()?`${App.team[focusedRecord().team_id].name} vs ${App.team[focusedRecord().opp_id].name} · match selected`:"Click a point to set B. Shift-click to set A.";
      drawProfile();
    }
    function updateControls() {
      [["#va-a",state.team],["#va-b",state.compare],["#va-task",state.task],["#va-scope",state.scope],["#va-group",state.arch],["#va-view",mapMode],["#va-x",state.x],["#va-y",state.y],["#va-filter",state.filter]].forEach(([id,value])=>q(id).value=value);
      if(document.activeElement!==q("#va-search"))q("#va-search").value=state.search;
      q("#va-min").value=state.lo??"";q("#va-max").value=state.hi??"";
      q("#va-min").setCustomValidity(state.lo!==null&&state.hi!==null&&state.lo>state.hi?"Minimum exceeds maximum":"");
      q("#va-axis-controls").hidden=mapMode!=="custom";
      q("#va-dial-count").textContent=`(${state.dials.length}/10)`;
      q("#va-dials").querySelectorAll("input").forEach(i=>{i.checked=state.dials.includes(App.dials[+i.value]);i.disabled=i.checked&&state.dials.length===2;});
      q("#va-key").innerHTML=`<span class="va-key-a">● A · ${App.team[state.team].name}</span><span class="va-key-b">● B · ${App.team[state.compare].name}</span>`;
      q("#va-detail").href=`#/twins/${state.team}/${state.compare}${A.query(state.dials,{scope:state.scope,return:stateUrl(state)})}`;
    }
    function render() {
      currentState=state;hover=null;
      space=A.space(state.dials,state.scope);
      summaries=Object.fromEntries(App.teams.map(t=>[t.id,A.summary(A.rows(t.id,state.scope))]));
      profiles=Object.fromEntries(App.teams.map(t=>[t.id,App.dials.map((_,i)=>d3.mean(A.rows(t.id,state.scope),r=>r.dials[i]))]));
      visibleIds=matchingIds();updateControls();drawTable();drawMap();drawProfile();drawOutcomes();drawMatches();
    }
    function drawTable() {
      const ids=[...visibleIds];
      ids.sort((a,b)=>{
        let cmp;
        if(state.sort==="name")cmp=App.team[a].name.localeCompare(App.team[b].name);
        else {const x=state.sort==="distance"?distance(a):summaries[a][state.sort],y=state.sort==="distance"?distance(b):summaries[b][state.sort];cmp=x==null?(y==null?0:1):y==null?-1:x-y;}
        return (state.desc?-cmp:cmp)||a.localeCompare(b);
      });
      // Pins keep the explicit comparison visible, without adding it to the filtered set.
      const pins=[state.team,state.compare].filter(id=>!visibleIds.includes(id));
      const display=[...pins,...ids],cohortSet=new Set(visibleIds);
      q("#va-row-count").textContent=`${visibleIds.length} / ${Object.keys(space.team).length}`;
      root.querySelectorAll("[data-sort]").forEach(b=>{b.parentElement.setAttribute("aria-sort",b.dataset.sort===state.sort?(state.desc?"descending":"ascending"):"none");b.querySelector("span").textContent=b.dataset.sort===state.sort?(state.desc?" ↓":" ↑"):"";});
      q("#va-team-table tbody").innerHTML=display.map(id=>{
        const t=App.team[id],s=summaries[id],selected=id===state.team?"a":id===state.compare?"b":"";
        return `<tr data-team-mark="${id}" class="${selected?`va-selected-${selected}`:""}${cohortSet.has(id)?"":" va-pinned"}" tabindex="0" aria-label="${App.esc(t.name)}, select as Team B">
          <td class="va-select-cell"><button type="button" data-pick="A" aria-label="Set ${App.esc(t.name)} as Team A" aria-pressed="${id===state.team}">A</button><button type="button" data-pick="B" aria-label="Set ${App.esc(t.name)} as Team B" aria-pressed="${id===state.compare}">B</button></td>
          <th scope="row">${App.flag(id,18)}<span>${t.name}</span>${cohortSet.has(id)?"":'<span class="va-pin" title="Kept as selected comparison; outside the current filter">Pinned</span>'}</th><td>${s.n}</td><td>${id===state.team?"—":fmt(distance(id))}</td><td>${fmt(s.xgd)}</td><td>${fmt(s.gd)}</td></tr>`;
      }).join("");
      q("#va-team-table tbody").querySelectorAll("tr").forEach(row=>{
        const id=row.dataset.teamMark;
        row.onclick=e=>choose(id,e.target.closest("[data-pick]")?.dataset.pick||"B");
        row.onkeydown=e=>{if((e.key==="Enter"||e.key===" ")&&e.target===row){e.preventDefault();choose(id,e.shiftKey?"A":"B");}};
        row.onmouseenter=()=>highlight(id);row.onmouseleave=()=>highlight(null);
      });
    }
    function drawMap() {
      const {svg,W,H}=svgFor(q("#va-map"),"Team map with linked selection");
      const m={l:43,r:16,t:16,b:38},pca=App.pca2(space),ids=Object.keys(space.team);
      const pos=Object.fromEntries(ids.map(id=>[id,mapMode==="pca"?pca.project(space.team[id]):[metric(id,state.x),metric(id,state.y)]]).filter(([,v])=>v.every(Number.isFinite)));
      const focus=focusedRecord();let focusPos=focus?(mapMode==="pca"?pca.project(space.match[focus.key]):[recordMetric(focus,state.x),recordMetric(focus,state.y)]):null;
      if(focusPos&&!focusPos.every(Number.isFinite))focusPos=null;
      const plotted=Object.keys(pos),positions=Object.values(pos).concat(focusPos?[focusPos]:[]),scales=[0,1].map(i=>{let [lo,hi]=d3.extent(positions,p=>p[i]);if(lo==null){lo=-1;hi=1;}if(lo===hi){lo-=1;hi+=1;}const pad=(hi-lo)*.09;return d3.scaleLinear().domain([lo-pad,hi+pad]).nice().range(i?[H-m.b,m.t]:[m.l,W-m.r]);}),[x,y]=scales;
      q("#va-map-title").textContent=mapMode==="pca"?"Style space":"Team measures";
      q("#va-projection").textContent=mapMode==="pca"?`PCA · ${Math.round(d3.sum(pca.vars)*100)}% variation`:"Team means in the selected match scope";
      q("#va-brush").setAttribute("aria-pressed",brushing);
      q("#va-clear-region").hidden=state.cohort===null;q("#va-clear-selection").hidden=state.cohort===null;
      svg.append("g").attr("transform",`translate(0,${H-m.b})`).call(d3.axisBottom(x).ticks(6).tickSize(-(H-m.t-m.b))).call(g=>g.select(".domain").remove());
      svg.append("g").attr("transform",`translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W-m.l-m.r))).call(g=>g.select(".domain").remove());
      svg.selectAll(".tick line").attr("stroke",GRID);svg.selectAll(".tick text").attr("fill",MUTED).attr("font-size",12);
      svg.append("text").attr("x",W-m.r).attr("y",H-6).attr("text-anchor","end").attr("fill",MUTED).text(mapMode==="pca"?"Style axis 1":`${metricById[state.x].label} (${metricById[state.x].unit})`);
      svg.append("text").attr("x",m.l+5).attr("y",12).attr("fill",MUTED).text(mapMode==="pca"?"Style axis 2":`${metricById[state.y].label} (${metricById[state.y].unit})`);
      if(mapMode==="custom"&&state.x==="xgd"&&state.y==="gd"){
        const lo=Math.max(x.domain()[0],y.domain()[0]),hi=Math.min(x.domain()[1],y.domain()[1]);
        svg.append("line").attr("x1",x(lo)).attr("x2",x(hi)).attr("y1",y(lo)).attr("y2",y(hi)).attr("stroke","#9ca4ad").attr("stroke-dasharray","4 4");
      }
      const visible=new Set(visibleIds);
      if(pos[state.team]&&pos[state.compare])svg.append("line").attr("x1",x(pos[state.team][0])).attr("y1",y(pos[state.team][1])).attr("x2",x(pos[state.compare][0])).attr("y2",y(pos[state.compare][1])).attr("stroke",INK).attr("stroke-dasharray","3 4").attr("opacity",.35);
      const marks=svg.append("g").selectAll("g").data(plotted).join("g").attr("class","va-map-mark").attr("data-team-mark",id=>id).attr("transform",id=>`translate(${x(pos[id][0])},${y(pos[id][1])})`).attr("opacity",id=>visible.has(id)||[state.team,state.compare].includes(id)?1:.16).attr("aria-label",id=>`${App.team[id].name}, select as Team B`);
      marks.append("circle").attr("class","va-halo").attr("r",12).attr("fill","none").attr("stroke",INK).attr("stroke-width",1.8);
      marks.append("circle").attr("r",id=>[state.team,state.compare].includes(id)?7:4.5).attr("fill",color).attr("stroke","white").attr("stroke-width",1.2);
      marks.filter(id=>[state.team,state.compare].includes(id)).raise();
      interactive(marks,(e,id)=>choose(id,e.shiftKey?"A":"B"));
      marks.on("mouseenter",(e,id)=>highlight(id,{reveal:true})).on("mouseleave",()=>highlight(null));
      const labeled=plotted.filter(id=>[state.team,state.compare].includes(id));
      const labels=labeled.map(id=>({id,x:x(pos[id][0]),y:y(pos[id][1])-13,ax:x(pos[id][0]),ay:y(pos[id][1])-13}));
      const sim=d3.forceSimulation(labels).force("x",d3.forceX(d=>d.ax).strength(.5)).force("y",d3.forceY(d=>d.ay).strength(.7)).force("collide",d3.forceCollide(17)).stop();for(let i=0;i<60;i++)sim.tick();
      svg.append("g").attr("pointer-events","none").selectAll("text").data(labels).join("text").attr("x",d=>Math.max(m.l,Math.min(W-m.r,d.x))).attr("y",d=>Math.max(23,Math.min(H-m.b-8,d.y))).attr("text-anchor","middle").attr("fill",d=>color(d.id)).attr("font-weight",700).attr("paint-order","stroke").attr("stroke","white").attr("stroke-width",3).text(d=>d.id);
      if(focusPos){
        const [px,py]=[x(focusPos[0]),y(focusPos[1])];
        if(pos[focus.team_id])svg.append("line").attr("x1",px).attr("y1",py).attr("x2",x(pos[focus.team_id][0])).attr("y2",y(pos[focus.team_id][1])).attr("stroke",INK).attr("stroke-dasharray","2 3");
        svg.append("path").attr("d",d3.symbol(d3.symbolDiamond,110)()).attr("transform",`translate(${px},${py})`).attr("fill","white").attr("stroke",INK).attr("stroke-width",2);
        svg.append("text").attr("x",px+10).attr("y",Math.min(H-m.b-6,py+24)).attr("fill",INK).text(`${focus.team_id} · M${focus.number}`);
      }
      if(!plotted.length)svg.append("text").attr("x",m.l+10).attr("y",H/2).text("No profiles in this match scope");
      if(brushing)svg.append("g").attr("class","va-brush-layer").call(d3.brush().extent([[m.l,m.t],[W-m.r,H-m.b]]).on("end",e=>{
        if(!e.sourceEvent)return;const box=e.selection;
        const cohort=box?plotted.filter(id=>{const px=x(pos[id][0]),py=y(pos[id][1]);return px>=box[0][0]&&px<=box[1][0]&&py>=box[0][1]&&py<=box[1][1];}):null;
        brushing=false;change({cohort});
      }));
    }
    function drawProfile() {
      const {svg,W,H}=svgFor(q("#va-profile"),"Style profiles of A, B and the focused record",238);
      const m={l:122,r:16,t:16,b:25},focus=focusedRecord(),extra=focus?{id:focus.team_id,vector:space.match[focus.key],match:true}:hover&&![state.team,state.compare].includes(hover)?{id:hover,vector:space.team[hover],match:false}:null;
      const vectors=[space.team[state.team],space.team[state.compare],extra?.vector].filter(Boolean);
      const extent=Math.max(2,d3.max(vectors,v=>d3.max(v,x=>Math.abs(x)))||2);
      const x=d3.scaleLinear().domain([-extent,extent]).range([m.l,W-m.r]),y=d3.scalePoint().domain(state.dials).range([m.t,H-m.b]).padding(.35);
      [-extent,0,extent].forEach(v=>svg.append("line").attr("x1",x(v)).attr("x2",x(v)).attr("y1",7).attr("y2",H-m.b+4).attr("stroke",v===0?"#a0a7af":GRID).attr("stroke-dasharray",v===0?null:"2 3"));
      state.dials.forEach((dial,i)=>{
        svg.append("text").attr("x",m.l-10).attr("y",y(dial)+4).attr("text-anchor","end").text(dial);
        const a=space.team[state.team]?.[i],b=space.team[state.compare]?.[i];
        if(Number.isFinite(a)&&Number.isFinite(b))svg.append("line").attr("x1",x(a)).attr("x2",x(b)).attr("y1",y(dial)).attr("y2",y(dial)).attr("stroke","#c2c8ce").attr("stroke-width",2);
        [state.team,state.compare].forEach(id=>{const v=space.team[id]?.[i];if(!Number.isFinite(v))return;const g=svg.append("g").attr("data-team-mark",id);g.append("circle").attr("cx",x(v)).attr("cy",y(dial)).attr("r",4).attr("fill",color(id));g.append("title").text(`${App.team[id].name} · ${dial}: ${fmt(v)} σ`);});
        if(extra?.vector){const v=extra.vector[i];if(Number.isFinite(v))svg.append("path").attr("d",d3.symbol(extra.match?d3.symbolDiamond:d3.symbolCircle,35)()).attr("transform",`translate(${x(v)},${y(dial)})`).attr("stroke",INK).attr("fill","white").append("title").text(`${extra.id} · ${extra.match?`M${focus.number}`:"hovered"}: ${fmt(v)} σ`);}
      });
      svg.append("text").attr("x",x(0)).attr("y",H-5).attr("text-anchor","middle").attr("fill",MUTED).text("0 = tournament average");
      [-extent,extent].forEach(v=>svg.append("text").attr("x",x(v)).attr("y",H-5).attr("text-anchor","middle").attr("fill",MUTED).text(`${fmt(v,1)}σ`));
    }
    function drawOutcomes() {
      if(q("#va-outcome-view").value==="distribution"){drawDistribution();return;}
      const {svg,W,H}=svgFor(q("#va-outcomes"),"Observed team averages per match");
      const metrics=[["xg","xG"],["goals","Goals"],["xga","xG against"],["conceded","Conceded"]],m={l:83,r:35,t:8,b:21};
      const max=Math.max(1,d3.max([state.team,state.compare],id=>d3.max(metrics,([key])=>summaries[id][key]))||1),x=d3.scaleLinear().domain([0,max*1.18]).nice().range([m.l,W-m.r]),y=d3.scaleBand().domain(metrics.map(m=>m[0])).range([m.t,H-m.b]).padding(.22);
      svg.append("g").attr("transform",`translate(0,${H-m.b})`).call(d3.axisBottom(x).ticks(4).tickSize(-(H-m.t-m.b))).call(g=>g.select(".domain").remove());svg.selectAll(".tick line").attr("stroke",GRID);
      metrics.forEach(([key,label])=>{
        svg.append("text").attr("x",m.l-9).attr("y",y(key)+y.bandwidth()/2+4).attr("text-anchor","end").text(label);
        [state.team,state.compare].forEach((id,i)=>{const v=summaries[id][key],yy=y(key)+i*y.bandwidth()/2,valid=Number.isFinite(v),g=svg.append("g").attr("data-team-mark",id);
          g.append("rect").attr("x",m.l).attr("y",yy).attr("width",valid?Math.max(0,x(v)-m.l):0).attr("height",Math.max(3,y.bandwidth()/2-2)).attr("fill",color(id));
          g.append("text").attr("x",valid?x(v)+4:m.l+4).attr("y",yy+y.bandwidth()/4+4).attr("fill",color(id)).text(fmt(v));
          g.on("mouseenter",()=>highlight(id)).on("mouseleave",()=>highlight(null));
        });
      });
    }
    function drawDistribution() {
      const {svg,W,H}=svgFor(q("#va-outcomes"),"Distribution of filtered teams' goal differences");
      const m={l:29,r:13,t:22,b:27},all=Object.keys(space.team).map(id=>({id,value:summaries[id].gd})).filter(d=>Number.isFinite(d.value));
      let [lo,hi]=d3.extent(all,d=>d.value);if(lo==null){lo=-1;hi=1;}if(lo===hi){lo-=1;hi+=1;}
      const x=d3.scaleLinear().domain([lo-.1,hi+.1]).nice().range([m.l,W-m.r]),bins=d3.bin().value(d=>d.value).domain(x.domain()).thresholds(9)(all),visible=new Set(visibleIds);
      const y=d3.scaleLinear().domain([0,d3.max(bins,b=>b.length)||1]).range([H-m.b,m.t]);
      bins.forEach(b=>{const xx=x(b.x0)+1,w=Math.max(1,x(b.x1)-x(b.x0)-2),count=b.filter(d=>visible.has(d.id)).length;
        svg.append("rect").attr("x",xx).attr("y",y(b.length)).attr("width",w).attr("height",H-m.b-y(b.length)).attr("fill","#e3e6e9");
        svg.append("rect").attr("x",xx).attr("y",y(count)).attr("width",w).attr("height",H-m.b-y(count)).attr("fill","#7d8995").append("title").text(`${fmt(b.x0,1)} to ${fmt(b.x1,1)}: ${count} filtered / ${b.length} teams`);
      });
      [state.team,state.compare].forEach(id=>{const v=summaries[id].gd;if(!Number.isFinite(v))return;svg.append("line").attr("x1",x(v)).attr("x2",x(v)).attr("y1",m.t-3).attr("y2",H-m.b).attr("stroke",color(id)).attr("stroke-width",2);svg.append("text").attr("x",x(v)).attr("y",13).attr("text-anchor","middle").attr("fill",color(id)).text(id);});
      svg.append("g").attr("transform",`translate(0,${H-m.b})`).call(d3.axisBottom(x).ticks(5));
      svg.append("text").attr("x",W-m.r).attr("y",H-3).attr("text-anchor","end").attr("fill",MUTED).text("Goal difference / match");
    }
    function drawMatches() {
      const rows=[state.team,state.compare].flatMap(id=>A.rows(id,state.scope)).sort((a,b)=>a.number-b.number||a.team_id.localeCompare(b.team_id));
      const focus=focusedRecord();
      q("#va-match-selection").textContent=focus?`${focus.team_id} ${focus.goals}–${focus.goals_opp} ${focus.opp_id} · M${focus.number}`:`A: ${summaries[state.team].n} matches · B: ${summaries[state.compare].n} matches`;
      q("#va-matches tbody").innerHTML=rows.map(r=>`<tr data-match="${r.key}" data-team-mark="${r.team_id}" tabindex="0" aria-selected="${r.key===state.match}" aria-label="Inspect ${r.team_id} against ${r.opp_id}, match ${r.number}"><th scope="row" style="color:${color(r.team_id)}">${r.team_id}</th><td>${r.opp_id}</td><td>${App.stageShort(r.stage)}</td><td>${r.goals}–${r.goals_opp}</td><td>${fmt(A.metric(r,"xgd"))}</td></tr>`).join("")||'<tr><td colspan="5">No matches in this scope</td></tr>';
      q("#va-matches tbody").querySelectorAll("tr[data-match]").forEach(row=>{const select=()=>change({match:row.dataset.match===state.match?null:row.dataset.match});row.onclick=select;row.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();select();}};row.onmouseenter=()=>highlight(row.dataset.teamMark);row.onmouseleave=()=>highlight(null);});
      q("#va-match-links").innerHTML=focus?`<span>◇ Selected match</span><a href="#/match/${focus.match_id}${App.esc(A.query(state.dials,{return:stateUrl(state)}))}">Replay ↗</a><a href="#/lab/${focus.match_id}${App.esc(A.query(state.dials,{team:focus.team_id,return:stateUrl(state)}))}">Match Lab ↗</a><button type="button" id="va-clear-match">Clear</button>`:'<span>Select a match to locate its performance in the map and profile.</span>';
      q("#va-clear-match")?.addEventListener("click",()=>change({match:null}));
    }
    function drawCharts(){if(!root.isConnected)return;drawMap();drawProfile();drawOutcomes();}
    function scheduleCharts(){cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(drawCharts);}
    // Splitters change panel allocation; selections and data remain intact.
    const work=q(".va-workbench");
    function splitter(el,kind) {
      const adjust=delta=>{
        if(kind==="left"){const v=Math.max(185,Math.min(320,(parseFloat(getComputedStyle(work).getPropertyValue("--va-left"))||216)+delta));work.style.setProperty("--va-left",`${v}px`);el.setAttribute("aria-valuenow",Math.round(v));}
        else if(kind==="right"){const v=Math.max(290,Math.min(540,(parseFloat(getComputedStyle(work).getPropertyValue("--va-right"))||370)-delta));work.style.setProperty("--va-right",`${v}px`);el.setAttribute("aria-valuenow",Math.round(v));}
        else {const center=q(".va-center"),v=Math.max(35,Math.min(80,(parseFloat(center.style.getPropertyValue("--va-map-share"))||61)+delta/center.clientHeight*100));center.style.setProperty("--va-map-share",v);el.setAttribute("aria-valuenow",Math.round(v));}
        scheduleCharts();
      };
      el.onpointerdown=e=>{if(window.innerWidth<1000)return;el.setPointerCapture(e.pointerId);let last=kind==="row"?e.clientY:e.clientX;
        el.onpointermove=ev=>{const now=kind==="row"?ev.clientY:ev.clientX;adjust(now-last);last=now;};
        el.onpointerup=el.onpointercancel=()=>{el.onpointermove=null;};};
      el.onkeydown=e=>{const keys=kind==="row"?["ArrowUp","ArrowDown"]:["ArrowLeft","ArrowRight"];if(keys.includes(e.key)){e.preventDefault();adjust(e.key===keys[0]?-15:15);}};
    }
    splitter(q("#va-gutter-left"),"left");splitter(q("#va-gutter-right"),"right");splitter(q(".va-row-gutter"),"row");
    render();App.onViewport(scheduleCharts);App.onResize(q("#va-map"),scheduleCharts);
    const languageChange=()=>{visibleIds=matchingIds();drawTable();drawCharts();};window.addEventListener("languagechange",languageChange);
    App._stop=()=>{clearTimeout(searchTimer);clearTimeout(rangeTimer);cancelAnimationFrame(resizeFrame);window.removeEventListener("languagechange",languageChange);};
    return {update(p){state=stateFrom(p);mapMode=state.view;render();}};
  }
  App.views.story=workspace;
  App.views.styles=workspace;
})();
