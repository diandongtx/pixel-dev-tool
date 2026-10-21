# Changelog

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
