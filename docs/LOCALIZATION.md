# Interface languages

English is the default. Use the header selector or `?lang=zh-CN` for Chinese. Explicit URL values take precedence over the saved browser preference. Switching languages asks for confirmation and reloads the page; save your edits first.

Messages use `t(source, ...values)` from `src/i18n`. The Chinese source is the fallback; English translations live in `src/i18n/en.ts`. Keep each complete message in one catalog entry, with numbered placeholders such as `{0}`. Do not translate user-entered names, JSON field names, identifiers, file paths, or imported data. Built-in theme names have separate display labels.

Module-level options are evaluated on page load, which is why switching reloads. Local server diagnostics and generated HTML review pages use English independently of the browser language.

Run `npm test` and `npm run build` after changes. Localization tests check catalog coverage, placeholder parity, preference precedence, storage fallback, cancellation, and configuration compatibility. Existing component regression tests run in Chinese, while the English interface is also checked in the browser.
