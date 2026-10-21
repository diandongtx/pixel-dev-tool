# Changelog

## v0.2.0

- English is now the default interface across all nine pages, including generation metrics, quality preflight, import/export messages, and configuration editors.
- Added a Chinese language switch with a save-before-reload warning. Language links support `?lang=en` and `?lang=zh-CN`.
- Built-in theme display labels are translated while user names, IDs, and exported JSON remain unchanged.
- Generated review pages and local workspace diagnostics are in English.
- Updated bilingual walkthroughs and added actual English-interface screenshots.
- Added localization coverage, interpolation, language preference, and data compatibility tests: 326 tests pass. Production build passes; lint has no errors and 13 existing warnings.

Known limitations from v0.1.0 still apply to grid detection, gameplay validation, and the requirement to run the local development server. Switching languages reloads the page and discards unsaved edits after confirmation.

## v0.1.0

First public release of the local pixel-art and bead-puzzle level authoring tool.

- Image/grid import, pixel editing, bead previews, seeded starting-layout generation, and JSON configuration management.
- MIT-licensed code and original procedural examples; no private artwork, production levels, or internal Git history.
- English and Chinese setup/tryout guides, a screenshot walkthrough, and bug/tryout issue forms.
- Synthetic regression coverage and Windows/Linux CI.

### Known limitations

- The UI is primarily Chinese. Full workspace features require `npm run dev`.
- Automatic grid detection may choose the wrong cell size; the flower example uses 10 px.
- Generator pass status does not imply combined preflight approval or validated gameplay. The flower walkthrough still reports structure-retention and operation-band warnings.
- Local authoring data stays in ignored workspace directories.
