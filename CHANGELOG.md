# Changelog

All notable changes to `@getconnie/connie-js` and the hosted script at
`https://assets.getconnie.com/js/v1.js` are recorded here. The project follows
[Semantic Versioning](https://semver.org/).

## 1.1.0

- The modal lives in a closed Shadow DOM on a single element appended to
  `document.body`, styled by a constructed stylesheet adopted into the shadow
  root. The host page's CSS, including `* { all: unset }` and `!important`
  rules on `div`, `button` or `iframe`, no longer reaches it. Safari 16.0 to
  16.3 falls back to inline CSSOM styles as before. Still no `style-src`
  change.
- One close button for the modal's whole life, in the same place before and
  after the SignPage loads: 40×40, 8px from the dialog's top right, centred in
  the right end of the SignPage's 56px header band, which the SignPage now
  leaves empty when connie-js frames it.
- A skeleton of the SignPage replaces the spinner while it loads, and
  cross-fades to the SignPage over 200ms on `ready`, or swaps at once under
  `prefers-reduced-motion`. It has the SignPage's layout, so nothing moves in
  the swap: the title and subtitle on the canvas and the paper in the same
  place and size, narrowing with the frame below 640px and leaving room for a
  scrollbar where the SignPage gets one.
- The dialog's height follows `100dvh` (falling back to `100vh`), so mobile
  browser bars do not hide its bottom, and full screen on phones keeps clear of
  safe-area insets.

## 1.0.0

First release.

- `Connie.openSignPage({ url | fetchUrl, onReady, onSigned, onClose, onError })`
  opens a SignPage embed session as an accessible modal: focus moves into it and
  returns afterwards, Esc closes it, the page behind it does not scroll, and it
  is full screen below 640px.
- `onSigned` fires once when the signer signs, and the modal stays open on the
  SignPage's own confirmation until the signer closes it. Call `embed.close()`
  from `onSigned` to close it at once. `onClose` fires once, whenever the modal
  is finally torn down.
- Styled through CSSOM only, so a host's Content Security Policy needs no
  `style-src` change.
- Messages from the SignPage are accepted only from its origin, its window and
  its own embed id.
- `loadConnie()` loads the hosted script once and resolves with `window.Connie`,
  or with `null` during server-side rendering.
