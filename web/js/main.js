/* Hash router: #/story, #/styles?team=ESP, #/team/ESP, #/twins/CRO/NED, #/matches, #/match/<id>, #/method
 * Views may return {update(params)}: then a change that only touches the query (?team=…) updates the
 * view in place, and every such change is a browser-history entry, so Back steps out of it. */
(function () {
  const App = window.App;
  const view = document.getElementById("view");

  App.ui.watchSelects(view);
  App.ui.enhanceSelect(document.getElementById("language-select"));

  const jump = App.ui.select("team-jump", {
    options: App.ui.teamOptions(), placeholder: "Jump to a team", searchable: true, ariaLabel: "Jump to a team",
    onChange: (v) => {
      const params = Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] || ""));
      App.go(`#/team/${v}${App.analysis.query(App.analysis.readDials(params), { return: location.hash })}`);
      jump.set("");
    },
  });

  function parse() {
    const h = location.hash || "#/story";
    if (!h.startsWith("#/")) return null; // plain in-page anchor: leave the current view alone
    const [path, query] = h.slice(2).split("?");
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    const params = Object.fromEntries(new URLSearchParams(query || ""));
    return { name: parts[0] || "story", args: parts.slice(1), params };
  }

  let currentKey = null, instance = null, lastHash = null;
  function route() {
    if (location.hash === lastHash) return;
    lastHash = location.hash;
    const r = parse();
    if (!r) return;
    const key = `${r.name}/${r.args.join("/")}`;
    if (key === currentKey && instance && typeof instance.update === "function") {
      instance.update(r.params);
      return;
    }
    currentKey = key;
    App.cleanup();
    const fn = App.views[r.name] || App.views.story;
    document.querySelectorAll(".tabs a").forEach((a) => {
      const tab = a.dataset.tab;
      a.classList.toggle("on", tab === r.name || (tab === "matches" && ["match", "duel"].includes(r.name)) || (tab === "styles" && r.name === "team") || (tab === "twins" && r.name === "robustness"));
    });
    view.innerHTML = "";
    view.classList.toggle("wide", r.name === "match");
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    try {
      instance = fn(view, r.params, ...r.args) || null;
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    } catch (err) {
      console.error(err);
      instance = null;
      view.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="note">${App.esc(err.message)}</p></div>`;
    }
  }

  /** Navigate inside the app. replace=true for transient state that should not get its own Back step. */
  App.go = (hash, { replace = false } = {}) => {
    if (hash === location.hash) return;
    history[replace ? "replaceState" : "pushState"](null, "", hash);
    route();
  };

  window.addEventListener("hashchange", route);
  window.addEventListener("popstate", route);
  route();
})();
