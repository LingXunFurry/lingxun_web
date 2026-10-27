# Local Font Sources

The website bundles only the font files used by the local `@font-face` rules.

- Source Han Serif SC: Adobe, `SIL Open Font License 1.1`, source `adobe-fonts/source-han-serif`.
- Source Han Sans SC: Adobe, `SIL Open Font License 1.1`, source `adobe-fonts/source-han-sans`.
- Cormorant: Catharsis Fonts, `SIL Open Font License 1.1`, source `CatharsisFonts/Cormorant`.
- IBM Plex Mono: IBM, `SIL Open Font License 1.1`, source `IBM/plex`.

License texts are stored in `public/fonts/licenses/`. No remote font request is required at runtime.

## Tavern Web Fonts (2026-10-26)

`scripts/optimize_fonts.py` generates WOFF2 assets from the existing Adobe OTF files.
The original files are unchanged. Derived font names are `Tavern Sans Core/Full` and
`Tavern Serif Core/Full`, avoiding Adobe's reserved font name `Source`.
The original copyright and SIL OFL 1.1 notices remain in the fonts and licenses folder.

Core subsets contain the site's current UI characters; the complete WOFF2 font is
the next font-family fallback for arbitrary characters added through the admin.
This preserves Chinese coverage without requesting the full font for ordinary UI.
The four core files total about 1.53 MiB, compared with 79.69 MiB for the four original
OTF files. See `tavern-fonts.json` for the exact filename mapping and byte counts.

Preparation tooling only: FontTools (MIT) with Brotli (MIT) and Zopfli (Apache-2.0).
These tools are not website runtime dependencies and are not part of the build command.
