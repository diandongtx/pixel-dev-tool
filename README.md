# Pixel Dev Tool

[中文说明](README.zh-CN.md) · [Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)

A local web tool for turning pixel art into bead-puzzle levels. Inspect image grids, edit pixels, preview bead colors, generate starting layouts, and manage level JSON in one React + TypeScript application.

The interface is currently in Chinese. This is an early public release extracted from a working development tool. It includes original geometric demo assets; production artwork, game levels, credentials, and internal history are not included.

![Pixel Dev Tool running with the original geometric demo](docs/preview.png)

## Features

- Image grid detection, color sampling, subject extraction, and pixel editing.
- Bead previews, resource color matching, and layer debugging.
- Seeded layout generation, including structure-aware and region-recolor strategies.
- Pixel, theme, main-level, and daily-level configuration editors.
- Local drafts, JSON import/export, thumbnails, backups, and a generated level review page.

## Run locally

Install Node.js 22 or newer, then:

```sh
git clone https://github.com/diandongtx/pixel-dev-tool.git
cd pixel-dev-tool
npm ci --include=dev
npm run dev
```

Open the local URL printed by Vite (normally `http://127.0.0.1:5173`). No API key or external service is required. Workspace data is stored under `data/level-workspace/`, thumbnails under `resource/thumbnail/`, and generated review pages under `output/`. These directories are ignored by Git.

Use `npm run dev` for the complete application. The local filesystem API is provided by the Vite development plugin. `npm run build` checks and builds the frontend; `npm run preview` or static hosting does **not** supply the workspace API. Keep the development server on its default loopback address: this release is a single-user local tool without a multi-user authentication layer.

## Try the examples

1. On **像素化页面**, select `examples/geometric-mosaic.png`; its source cells are 10 × 10 pixels.
2. On **关卡工作台**, import `examples/geometric-mosaic-map.json` to try matching against the bundled six-color bead catalog.
3. On **像素图管理**, import `examples/pixelconfig.json`. On **主线关卡管理**, import `examples/levelconfig.json` to inspect the matching level. Use the page's save action when you want to persist imported data.

The sample is a geometric exercise, not a tuned game level. Layout generation reports quality metrics; a candidate may fail its quality criteria and need manual review.

The demo images, bead sprites, debug layers, and JSON can be regenerated deterministically:

```sh
npm run samples:generate
```

This command rewrites only the bundled demo files in `examples/`, `resource/grid/`, and `public/beads/`; it does not initialize or overwrite your workspace. See [asset provenance](ASSETS.md).

## Development

```sh
npm test
npm run build
npm run lint
```

Tests use synthetic examples and temporary workspaces. Private production-image regression fixtures are not part of this release; geometric cases cover conservation, background masks, deterministic generation, and splitting behavior. CI runs tests and builds on Windows and Linux.

```text
src/components/     Editors and preview pages
src/utils/          Image, grid, configuration and generation logic
src/beads/          Layer renderer and color transformations
tooling/            Local workspace API and review generation
examples/           Original geometric PNG and JSON examples
resource/grid/      Generated six-color bead catalog
public/beads/       Generated layer-debugging sprites
scripts/            Reproducible demo-asset generator
```

The standalone AI image-generation experiments from the development project are outside this public release. The main tool works without them.

## License

Project code and the generated demo assets are released under the [MIT license](LICENSE). Dependencies retain their own licenses. Imported user artwork is not covered by this project's license.
