# Changelog

All notable changes to `@getconnie/connie-js` and the hosted script at
`https://assets.getconnie.com/js/v1.js` are recorded here. The project follows
[Semantic Versioning](https://semver.org/).

## 1.0.0

First release.

- `Connie.openSignPage({ url | fetchUrl, onReady, onSigned, onClose, onError })`
  opens a SignPage embed session as an accessible modal: focus moves into it and
  returns afterwards, Esc closes it, the page behind it does not scroll, and it
  is full screen below 640px.
- Styled through CSSOM only, so a host's Content Security Policy needs no
  `style-src` change.
- Messages from the SignPage are accepted only from its origin, its window and
  its own embed id.
- `loadConnie()` loads the hosted script once and resolves with `window.Connie`,
  or with `null` during server-side rendering.
