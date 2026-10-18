/* Small UI components drawn by the site itself (no native browser widgets). */
(function () {
  const App = window.App;
  const ui = (App.ui = {});
  let openSelect = null;

  const CHEVRON = `<svg class="sel-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const CHECK = `<svg class="sel-check" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.2 L5.8 10 L11 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  /**
   * Custom dropdown (listbox) with optional search.
   * options: [{value, label, html?, group?}]; returns {get, set, el}.
   */
  ui.select = function (host, { options, value = "", placeholder = "Select…", searchable = false, onChange, ariaLabel, keepLabel = false, minWidth }) {
    if (typeof host === "string") host = document.getElementById(host);
    host.classList.add("sel");
    const id = `sel-${Math.random().toString(36).slice(2, 8)}`;
    host.innerHTML = `
      <button type="button" class="sel-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-list" ${ariaLabel ? `aria-label="${App.esc(ariaLabel)}"` : ""}>
        <span class="sel-val"></span>${CHEVRON}
      </button>
      <div class="sel-pop" hidden>
        ${searchable ? `<div class="sel-search"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="6" cy="6" r="4.3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.3 9.3 L12.5 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input type="text" id="${id}-q" placeholder="Search" autocomplete="off" spellcheck="false" aria-label="Search options"></div>` : ""}
        <ul class="sel-list" role="listbox" id="${id}-list" tabindex="-1"></ul>
      </div>`;
    const btn = host.querySelector(".sel-btn"), pop = host.querySelector(".sel-pop");
    const list = host.querySelector(".sel-list"), q = host.querySelector(".sel-search input");
    const val = host.querySelector(".sel-val");
    if (minWidth) btn.style.minWidth = `${minWidth}px`;
    let current = value, active = -1, shown = [];

    const optHtml = (o) => o.html || App.esc(o.label);
    function paint() {
      const o = options.find((x) => x.value === current);
      val.innerHTML = o && (o.value !== "" || !keepLabel) ? optHtml(o) : `<span class="sel-ph">${App.esc(placeholder)}</span>`;
    }
    function renderList() {
      const term = (q ? q.value : "").trim().toLowerCase();
      shown = options.filter((o) => !term || o.label.toLowerCase().includes(term) || String(o.value).toLowerCase().includes(term));
      let lastGroup = null;
      list.innerHTML = shown.length ? shown.map((o, i) => {
        const head = o.group && o.group !== lastGroup ? `<li class="sel-group" role="presentation">${App.esc(o.group)}</li>` : "";
        lastGroup = o.group || lastGroup;
        return `${head}<li class="sel-opt${i === active ? " active" : ""}" role="option" id="${id}-o${i}" data-i="${i}" aria-selected="${o.value === current}">${optHtml(o)}${o.value === current ? CHECK : ""}</li>`;
      }).join("") : `<li class="sel-empty" role="presentation">No match</li>`;
      list.setAttribute("aria-activedescendant", active >= 0 ? `${id}-o${active}` : "");
    }
    function move(delta) {
      if (!shown.length) return;
      active = (active + delta + shown.length) % shown.length;
      renderList();
      const el = list.querySelector(`[data-i="${active}"]`);
      if (el) el.scrollIntoView({ block: "nearest" });
    }
    function open() {
      if (openSelect && openSelect !== api) openSelect.close();
      openSelect = api;
      pop.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      if (q) q.value = "";
      active = Math.max(0, options.findIndex((o) => o.value === current));
      renderList();
      // keep the panel on screen
      pop.classList.remove("right");
      const r = pop.getBoundingClientRect();
      if (r.right > window.innerWidth - 8) pop.classList.add("right");
      (q || list).focus({ preventScroll: true });
      const el = list.querySelector(`[data-i="${active}"]`);
      if (el) el.scrollIntoView({ block: "nearest" });
    }
    function close(focusBtn) {
      pop.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      if (openSelect === api) openSelect = null;
      if (focusBtn) btn.focus({ preventScroll: true });
    }
    function choose(i) {
      const o = shown[i];
      if (!o) return;
      const changed = o.value !== current;
      current = o.value;
      paint();
      close(true);
      if (changed && onChange) onChange(o.value, o);
    }
    btn.addEventListener("click", () => (pop.hidden ? open() : close()));
    btn.addEventListener("keydown", (e) => {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); open(); }
    });
    const onKey = (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") { e.preventDefault(); choose(active); }
      else if (e.key === "Escape") { e.preventDefault(); close(true); }
      else if (e.key === "Tab") close();
    };
    list.addEventListener("keydown", onKey);
    if (q) {
      q.addEventListener("keydown", onKey);
      q.addEventListener("input", () => { active = 0; renderList(); });
    }
    list.addEventListener("mousedown", (e) => e.preventDefault());
    list.addEventListener("click", (e) => {
      const li = e.target.closest(".sel-opt");
      if (li) choose(Number(li.dataset.i));
    });
    list.addEventListener("mousemove", (e) => {
      const li = e.target.closest(".sel-opt");
      if (li && Number(li.dataset.i) !== active) {
        list.querySelector(".sel-opt.active")?.classList.remove("active");
        li.classList.add("active");
        active = Number(li.dataset.i);
      }
    });

    const api = {
      el: host,
      get: () => current,
      set(v) { current = v; paint(); },
      close,
      contains: (node) => host.contains(node),
    };
    paint();
    return api;
  };

  document.addEventListener("mousedown", (e) => {
    if (openSelect && !openSelect.contains(e.target)) openSelect.close();
  });

  /** Team options with a kit-coloured badge, sorted by name. */
  ui.teamOptions = (extra = []) => extra.concat(App.teams.slice().sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({ value: t.id, label: t.name, html: `<span class="sel-team">${App.flag(t.id, 22)}<span>${App.esc(t.name)}</span></span>` })));

  /** Inline football: <svg><use href="#ball"></svg>. */
  ui.ball = (size = 18, cls = "") => `<svg class="ball ${cls}" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><use href="#ball" x="0" y="0" width="100" height="100"/></svg>`;
})();
