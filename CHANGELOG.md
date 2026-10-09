# Changelog

All notable changes to `@getconnie/connie-js` and the hosted script at
`https://assets.getconnie.com/js/v1.js` are recorded here. The project follows
[Semantic Versioning](https://semver.org/).

## 1.2.0

- A link marked `data-connie-signpage` to a SignPage's public link
  (`https://sign.page/EA0990`, or the account's own sign domain) opens that
  SignPage in the modal, with no API key, no backend and no code: load the
  hosted script and add the attribute. The SignPage is framed at
  `/<pin>/embed` on the link's host, and Connie shows it only on the websites
  the SignPage's owner has allowed. Only links to `sign.page`, or to a host the
  script tag lists in `data-connie-hosts` (a custom sign domain), are
  enhanced; trust is never taken from the link, so a link elsewhere is never
  framed, given the camera or allowed a `navigate`. When it refuses (`not_allowed`, or any other
  `error`), the visitor goes to the link's own page, as they would without the
  script.
- One `click` listener on `document` handles every such link, including links
  added later. A click with a modifier key, any button but the main one, a
  link with a `target` other than `_self`, a click the page already handled
  and a link that is not one path segment on an allowed `https` host (or
  `http` on a listed loopback host) are left to the browser, so they open the link as usual.
- Only a click the visitor makes is enhanced (`isTrusted`); a click a script
  dispatches, such as `link.click()`, opens the link as usual.
- The list of hosts is read from the `<script>` element actually running, so
  an `<img name="currentScript">` or `<form name="currentScript">` in the
  page's markup, which shadows `document.currentScript`, can neither add hosts
  nor take away the ones listed. Each listed host is normalised as a link's
  host is, so an internationalised domain matches its punycode form; an entry
  that is not a bare host is ignored. A second copy of the script whose tag
  lists other hosts than the copy in force warns in the console.
- `loadConnie({ hosts })` writes `data-connie-hosts` on the script tag it
  adds.
- When the embed fails, or the SignPage has not said it is `ready` within 15
  seconds (a `frame-src` that leaves out a custom sign host, for one), the
  modal closes and the visitor goes to the address the link had when it was
  clicked, not whatever its `href` has become since.
- The README's CSP and Security sections say what enforces the host list
  against injected markup: a `frame-src` naming only `https://sign.page` and
  your own sign hosts.
- For these links the frame's URL carries the page's origin and nothing else
  of its address; "Back to" after an eID returns to the website's home page.
  The frame's referrer stays the origin only.
- `openSignPage` is unchanged; the 15-second fallback applies only to links.

## 1.1.0

- The modal is a native `<dialog>` in the browser's top layer, opened with
  `showModal()` inside the closed shadow root. A cookie banner or any other
  element at the highest `z-index` no longer covers it, and a `transform`,
  `filter`, `perspective`, `contain` or `will-change` on `html`, `body` or any
  other ancestor no longer moves or resizes it. The page behind is inert while
  it is open. A `zoom` on `html` or `body` is undone, so the modal keeps its
  size. Browsers without `showModal()` keep the fixed overlay.
- The modal is announced as one native modal dialog, labelled with the
  SignPage's title. A close request from the browser, such as Android's back
  gesture, closes it like Esc.
- Focus goes back to where it was on close without scrolling the page.
- Closing leaves `<html>` and `<body>` with the inline styles they had: no
  empty `style=""` where there was no attribute, and inline styles the page
  set while the modal was open are kept.
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
- Security hardening:
  - A `navigate` message is followed only to the eID handoff: an `https` (or
    loopback `http`) URL on the frame's own origin whose path starts with
    `/openid/authorize/`. Every other `navigate` is ignored.
  - The frame is loaded with `referrerpolicy="strict-origin"`, so the SignPage
    is sent the host page's origin but never its path or query.
  - `window.Connie` counts as loaded only when it has an `openSignPage`
    function, so an element with `id="Connie"` (which browsers expose as
    `window.Connie`) no longer stops the hosted script from defining it, and
    `loadConnie()` never resolves with a DOM element. The hosted script defines
    `window.Connie` read-only and not enumerable.
  - Under Trusted Types (`require-trusted-types-for 'script'`), `loadConnie()`
    assigns the script URL through a policy named `connie-js` that passes only
    the exact URL it loads. Allow it with `trusted-types connie-js`.
  - `loadConnie()` can be called again after any failure, including one thrown
    while starting to load, not only a failed download.

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
