# Interface localization

The site defaults to English. Visitors can explicitly choose Spanish, French,
Portuguese, German, Italian, Arabic, Japanese or Korean. The preference is stored
locally under `style-twins-language`; unavailable storage does not prevent switching.

All translations ship with the site. Visitors' selections and match data are never
sent to a translation service. The catalogs use machine-assisted draft translations;
football terminology and prominent home-page copy have an additional editorial
override. This is not a claim of native-speaker review of every paragraph.

## Files and conventions

- `../js/i18n-catalogs.js`: shared English source phrases and translations for all
  eight non-English languages. Keep the same source-key set in every language.
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
and safe, reversible text updates. Browser checks additionally exercise routing,
search, lazy content, repeated language switching, SVG exports and mobile RTL layouts.
