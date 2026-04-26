# Bundled fonts

Drop the following woff2 files here to enable the bundled-font path. When any
file is missing the browser falls back automatically to the platform stack
declared after each `@font-face`.

Required filenames (must match exactly):

| File                 | Family               | Used by                      |
| -------------------- | -------------------- | ---------------------------- |
| `Geist-Regular.woff2`| Geist (400)          | UI text in Popup / Options   |
| `Geist-Medium.woff2` | Geist (500)          | UI text                      |
| `Geist-Bold.woff2`   | Geist (700)          | Headings                     |
| `SourceSerif4-Regular.woff2` | Source Serif 4 (400) | Translated text in bubbles |
| `SourceSerif4-Italic.woff2`  | Source Serif 4 (400 italic) | Original text emphasis |
| `GeistMono-Regular.woff2`    | Geist Mono (400)    | API keys, status footer     |

Sources (all open source):

- Geist: https://github.com/vercel/geist-font (OFL-1.1)
- Source Serif 4: https://github.com/adobe-fonts/source-serif (OFL-1.1)
- Geist Mono: https://github.com/vercel/geist-font (OFL-1.1)

After placing the files, run `npm run build`. The manifest already exposes
`public/fonts/*.woff2` as web-accessible resources so the content script can
also load them.
