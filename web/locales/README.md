# Interface localization

The site defaults to English. Visitors can explicitly choose Simplified Chinese
(`zh-Hans`), Traditional Chinese (`zh-Hant`), Spanish, French, Portuguese, German,
Italian, Arabic, Japanese, Korean or Hindi: twelve languages including English. The
preference is stored locally under `style-twins-language`; unavailable storage does
not prevent switching. Browser language does not override the English default.

All translations ship with the site. Visitors' selections and match data are never
sent to a translation service. The catalogs use machine-assisted draft translations;
football terminology and prominent home-page copy have an additional editorial
override. This is not a claim of native-speaker review of every paragraph.
Hindi is machine-assisted against one football term sheet and has not had a
separate editorial pass.

## Files and conventions

- `../js/i18n-catalogs.js`: shared English source phrases and translations for all
  eleven non-English languages. Keep the same source-key set in every language.
- `../js/i18n-glossary.js`: reviewed football terms and key interface copy. Exact
  glossary entries take precedence over generated catalog entries.
- `../js/i18n.js`: language selection, reversible text/attribute translation and
  support for late-rendered chart labels, menus and tooltips.
- `../css/i18n.css`: language-control layout, text expansion and Arabic RTL chrome.

The renderer normalizes whitespace and replaces team names, team IDs, loaded player
names and numeric values with numbered placeholders. Translations may reorder
placeholders but must preserve their multiset. Proper player names, team IDs, routes,
source data, calculation keys and numeric strings remain unchanged. Country names
use `Intl.DisplayNames`, with explicit England and Scotland labels.

Translation modifies text nodes and a small attribute allowlist; it never inserts
translated HTML. `translate="no"` or `data-i18n-skip` protects names and literal text.
New UI copy without a translation falls back to English and is reported in
`App.i18n.missing` for development. Add corresponding entries before release.

Arabic mirrors the surrounding interface. Chart coordinates, directed matrices,
timelines and paired scores retain their original direction. CSV field names and
source-category values remain English for reproducible analysis. SVG exports include
localized visible labels and captions; match identifiers and numbers are retained.

## Verify

From `web/`, run `node scripts/verify-i18n.cjs`. It checks catalog parity,
placeholder preservation, glossary coverage, preference behavior, data invariance
and safe, reversible text updates. Both Chinese locales must provide actual Chinese
football labels, preserve signed numbers and percentages, persist an explicit
preference, and restore the original English text when switched back.

The optional `node scripts/verify-i18n-browser.cjs` suite requires Playwright with
Chromium and a running local server. It exercises all twelve languages on the main
routes and mobile layouts, Spanish and Chinese team search, lazy content, repeated
language switching, Traditional Chinese preference persistence, SVG exports and
unchanged CSV records. Chinese search uses Spain's localized name and verifies the
canonical `ESP` route. Missing keys are reported separately for Spanish, Simplified
Chinese and Traditional Chinese. See the root README for server and output options.
