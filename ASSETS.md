# Asset provenance

All PNG files in `examples/`, `resource/grid/`, and `public/beads/` are original procedural geometric samples created for this public release by `scripts/generate-samples.mjs`. That generator has no image input and no external service dependency. The example JSON is generated from the same geometric matrix.

These demo assets are distributed under the repository's MIT license. They are simple placeholders for learning and testing, not production art.

`docs/preview.png`, `docs/preview-en.png`, and `docs/demo/*.png` are screenshots of this application displaying the generated geometric examples. The release walkthrough video is assembled from these screenshots with step captions; it is not a continuous screen recording. The flower is also drawn procedurally, with no source image.

No images from the original development project's `resource/`, `psd_example/`, reference collections, or production level database were copied into this repository. Template filenames preserve the renderer's existing interface, not the original image contents.

When supplying your own bead catalog, use `COLOR_2.png`, `COLOR_3.png`, and `COLOR_4.png` groups in `resource/grid/`; six-digit RGB hex names are convenient for matching and previews. Ensure you have permission to distribute any artwork you contribute.
