/* Local, reversible interface translation. Canonical data and route state stay in English. */
(function (global) {
  "use strict";
  const App = global.App || (global.App = {});
  const locales = Object.freeze(["en", "zh-Hans", "zh-Hant", "es", "fr", "pt", "de", "it", "ar", "ja", "ko", "hi"]);
  const storageKey = "style-twins-language";
  const doc = typeof document === "undefined" ? null : document;
  const missing = new Set();
  const textState = new WeakMap();
  const attributeState = new WeakMap();
  const boundSelects = new WeakSet();
  const displayNames = new Map();
  const attributes = ["title", "aria-label", "placeholder", "alt"];
  const skipSelector = 'script,style,code,pre,textarea,[translate="no" i],[data-i18n-skip],[contenteditable]';
  const numberToken = String.raw`\{\d+\}|(?<=\bM)\d+(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])[-+−]?\d+(?:[.,]\d+)*(?:%|′)?(?![\p{L}\p{N}_])`;
  const hasLetters = /\p{L}/u;
  const iso = {
    ALG: "DZ", ARG: "AR", AUS: "AU", AUT: "AT", BEL: "BE", BIH: "BA", BRA: "BR", CAN: "CA", CIV: "CI", COD: "CD", COL: "CO", CPV: "CV",
    CRO: "HR", CUW: "CW", CZE: "CZ", ECU: "EC", EGY: "EG", ENG: "GB-ENG", ESP: "ES", FRA: "FR", GER: "DE", GHA: "GH", HAI: "HT", IRN: "IR",
    IRQ: "IQ", JOR: "JO", JPN: "JP", KOR: "KR", KSA: "SA", MAR: "MA", MEX: "MX", NED: "NL", NOR: "NO", NZL: "NZ", PAN: "PA", PAR: "PY",
    POR: "PT", QAT: "QA", RSA: "ZA", SCO: "GB-SCT", SEN: "SN", SUI: "CH", SWE: "SE", TUN: "TN", TUR: "TR", URU: "UY", USA: "US", UZB: "UZ"
  };
  let locale = "en";
  let observer = null;
  let processing = false;
  let teamSource = null;
  let playerSource = null;
  let matchSignature = null;
  let nameToTeam = new Map();
  let teamIds = new Set();
  let playerNames = new Set();
  let tokens = new RegExp(numberToken, "gu");

  try {
    const stored = global.localStorage && global.localStorage.getItem(storageKey);
    if (locales.includes(stored)) locale = stored;
  } catch (_) { /* Private/file contexts may disable local storage. */ }

  const normalize = (text) => String(text == null ? "" : text).trim().replace(/\s+/gu, " ");
  const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const owns = (object, key) => object != null && Object.prototype.hasOwnProperty.call(object, key);

  function refreshTeams() {
    const teams = App.teams || [];
    const explicitPlayers = App._localizationPlayerNames || null;
    const matches = global.WC_MATCH || {};
    const signature = Object.keys(matches).sort().join("|");
    if (teamSource === teams && playerSource === explicitPlayers && matchSignature === signature) return;
    teamSource = teams;
    playerSource = explicitPlayers;
    matchSignature = signature;
    nameToTeam = new Map(teams.filter((team) => team.name).flatMap((team) => [[team.name, team], [team.name.toUpperCase(), team]]));
    teamIds = new Set(teams.map((team) => team.id));
    playerNames = new Set(Array.isArray(explicitPlayers) ? explicitPlayers.filter((name) => typeof name === "string" && name) : []);
    for (const team of teams) if (team.hub?.name) playerNames.add(team.hub.name);
    for (const match of Object.values(matches)) for (const team of match.teams || []) for (const player of team.players || []) {
      if (player.name) playerNames.add(player.name);
      if (player.short) playerNames.add(player.short);
    }
    const names = [...new Set([...nameToTeam.keys(), ...teamIds, ...playerNames])].filter(Boolean).sort((a, b) => b.length - a.length);
    const named = names.length ? `(?<![\\p{L}\\p{N}_])(?:${names.map(escapeRegex).join("|")})(?![\\p{L}\\p{N}_])|` : "";
    tokens = new RegExp(named + numberToken, "gu");
  }

  /** Normalize whitespace, then tokenize names, IDs, placeholders and numbers in encounter order. */
  function template(text) {
    refreshTeams();
    const values = [];
    const key = normalize(text).replace(tokens, (value) => {
      values.push(value);
      return `{${values.length - 1}}`;
    });
    return { key, values };
  }

  function dictionaryValue(key) {
    const messages = (global.STYLE_TWINS_MESSAGES || {})[locale];
    const glossary = (global.STYLE_TWINS_GLOSSARY || {})[locale];
    if (owns(glossary, key) && typeof glossary[key] === "string") return glossary[key];
    if (owns(messages, key) && typeof messages[key] === "string") return messages[key];
    return null;
  }

  function localTeamName(value) {
    const team = nameToTeam.get(value);
    if (!team || locale === "en") return value;
    const explicit = dictionaryValue(team.name) ?? dictionaryValue(value);
    if (explicit !== null) return explicit;
    const code = iso[team.id];
    if (!code || code.includes("-")) {
      missing.add(value);
      return value;
    }
    try {
      if (!displayNames.has(locale)) displayNames.set(locale, new Intl.DisplayNames([locale], { type: "region" }));
      return displayNames.get(locale).of(code) || value;
    } catch (_) {
      missing.add(value);
      return value;
    }
  }

  function expand(text, values) {
    return text.replace(/\{(\d+)\}/g, (whole, index) => Number(index) < values.length ? localTeamName(values[Number(index)]) : whole);
  }

  function lookup(core) {
    const normalized = normalize(core);
    const parsed = template(normalized);
    if (teamIds.has(normalized) || /^(?:M\d+|R16|R32|QF|SF|GK|DF|MF|FW|W|D|L|W-D-L|i)$/.test(normalized) || (playerNames.has(normalized) && !nameToTeam.has(normalized))) return { text: core, complete: true };
    // URLs and canonical source paths must not be interpreted as translatable prose.
    if (/^(?:https?:\/\/|mailto:|#\/|(?:[\w.-]+\/)+[\w.-]+$)/i.test(normalized)) return { text: core, complete: true };
    for (const key of [...new Set([core, normalized, parsed.key])]) {
      const value = dictionaryValue(key);
      if (value !== null) return { text: expand(value, parsed.values), complete: true };
    }
    if (nameToTeam.has(normalized)) return { text: localTeamName(normalized), complete: true };
    if (teamIds.has(normalized) || playerNames.has(normalized) || !hasLetters.test(normalized)) return { text: core, complete: true };
    // Names and numbers separated only by punctuation need no translated sentence structure.
    if (!hasLetters.test(parsed.key.replace(/\{\d+\}/g, ""))) return { text: expand(parsed.key, parsed.values), complete: true };
    return { text: core, complete: false };
  }

  function t(text) {
    const source = String(text == null ? "" : text);
    if (locale === "en" || !source.trim()) return source;
    const leading = source.match(/^\s*/u)[0];
    const trailing = source.match(/\s*$/u)[0];
    const core = source.slice(leading.length, source.length - trailing.length);
    const direct = lookup(core);
    if (direct.complete) return leading + direct.text + trailing;

    // Translate complete segments only. Do not replace arbitrary substrings inside prose or names.
    const pieces = core.split(/(\s*[·|•]\s*|\s+[—–]\s+|\s*[→↔←]\s*|[():]\s*)/u);
    let complete = pieces.length > 1;
    const output = pieces.map((piece, index) => {
      if (index % 2 || !piece.trim()) return piece;
      const before = piece.match(/^\s*/u)[0], after = piece.match(/\s*$/u)[0];
      const middle = piece.slice(before.length, piece.length - after.length);
      const found = lookup(middle);
      if (!found.complete) complete = false;
      return before + found.text + after;
    }).join("");
    if (!complete) missing.add(template(core).key);
    return leading + output + trailing;
  }

  function skipped(node) {
    const element = node.nodeType === 1 ? node : node.parentElement;
    return !!(element && element.closest && element.closest(skipSelector));
  }

  function translateText(node) {
    if (skipped(node)) return;
    const current = node.nodeValue || "";
    let state = textState.get(node);
    if (!state && !hasLetters.test(current)) return;
    if (!state || current !== state.output) state = { source: current, output: current };
    const output = t(state.source);
    if (current !== output) node.nodeValue = output;
    state.output = output;
    textState.set(node, state);
  }

  function translateAttributes(element) {
    let states = attributeState.get(element);
    for (const name of attributes) {
      const current = element.getAttribute(name);
      if (current === null) { if (states) states.delete(name); continue; }
      if (!states) { states = new Map(); attributeState.set(element, states); }
      let state = states.get(name);
      if (!state || current !== state.output) state = { source: current, output: current };
      const output = t(state.source);
      if (current !== output) element.setAttribute(name, output);
      state.output = output;
      states.set(name, state);
    }
  }

  function bindSelect(element) {
    if (!element || element.id !== "language-select") return;
    if (element.value !== locale) element.value = locale;
    if (boundSelects.has(element)) return;
    element.addEventListener("change", () => setLocale(element.value));
    boundSelects.add(element);
  }

  function visit(node) {
    if (!node) return;
    if (node.nodeType === 3) { translateText(node); return; }
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
    if (node.nodeType === 1) {
      bindSelect(node);
      if (skipped(node)) return;
      if (node.localName === "svg" && node.getAttribute("dir") !== "ltr") node.setAttribute("dir", "ltr");
      translateAttributes(node);
    }
    for (const child of Array.from(node.childNodes || [])) visit(child);
  }

  function recordRoots(records) {
    const roots = [];
    for (const record of records) {
      if (record.type === "childList") roots.push(...Array.from(record.addedNodes).filter((node) => node.nodeType !== 3 || hasLetters.test(node.nodeValue || "") || textState.has(node)));
      else if (record.type === "attributes") roots.push(record.target);
      else if (record.type === "characterData" && (hasLetters.test(record.target.nodeValue || "") || textState.has(record.target))) roots.push(record.target);
    }
    return roots;
  }

  function observe() {
    if (observer && locale !== "en" && doc.documentElement) observer.observe(doc.documentElement, {
      subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes
    });
  }

  function process(roots) {
    if (!doc || processing || !roots.length) return;
    processing = true;
    if (observer) {
      roots = roots.concat(recordRoots(observer.takeRecords()));
      observer.disconnect();
    }
    try {
      const unique = [...new Set(roots)].filter(Boolean);
      for (const node of unique) {
        if (!unique.some((other) => other !== node && other.contains && other.contains(node))) visit(node);
      }
    } finally {
      processing = false;
      observe();
    }
  }

  function translate(root) { process([root || (doc && doc.documentElement)]); }

  function setLocale(code) {
    if (!locales.includes(code)) return false;
    const changed = locale !== code;
    locale = code;
    missing.clear();
    try { if (global.localStorage) global.localStorage.setItem(storageKey, locale); } catch (_) { /* Optional preference persistence. */ }
    if (doc && doc.documentElement) {
      doc.documentElement.lang = locale;
      doc.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
      translate(doc.documentElement);
      if (changed && typeof global.dispatchEvent === "function") {
        const event = typeof global.CustomEvent === "function" ? new global.CustomEvent("languagechange", { detail: { locale } }) : new global.Event("languagechange");
        global.dispatchEvent(event);
      }
    }
    return true;
  }

  App.i18n = { get locale() { return locale; }, locales, missing, setLocale, t, translate, template, source: (node) => textState.get(node)?.source ?? node.nodeValue };
  refreshTeams();
  if (doc) {
    const start = () => {
      if (typeof global.MutationObserver === "function") observer = new global.MutationObserver((records) => process(recordRoots(records)));
      setLocale(locale);
      observe();
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(typeof window === "undefined" ? globalThis : window);
