# connie-js

**Let your users sign a contract without leaving your app.**

connie-js is [Connie](https://getconnie.com)'s browser SDK. It opens any of your
published SignPages as a modal inside your own web app, with one function call.

<!-- TODO: add docs/demo.gif (opening a SignPage, signing, the modal closing) and embed it here. -->

- **A SignPage in a modal**, in any web app and any framework. Accessible,
  full screen on phones, sealed off from your page's CSS in a Shadow DOM, and
  styled without touching your CSP's `style-src`.
- **Your data on the contract.** Attach metadata (your user id, an order id) when
  you open it, and get it back on the contract and in the `contract.signed`
  webhook.
- **Prefill and lock.** Fill in the signer's name, email, phone and SmartTags
  from what you already know, and lock the ones they must not change.
- **eID works.** MitID and other eIDs cannot run inside a frame, so when the
  signer submits with one, the whole page moves to the eID flow and comes back to
  your `return_url` afterwards.

## How it works

1. Your **backend** mints a short-lived embed session with your secret API key,
   declaring the origin it will be shown on, the metadata and the prefill. Connie
   answers with a session `url`.
2. Your **frontend** passes that `url` (or a function that fetches one) to
   `openSignPage`. connie-js shows the SignPage in a modal and tells you when it
   is ready, signed or closed.
3. Connie sends the `contract.signed` **webhook**, with your metadata. That
   webhook is the record of what was signed.

## How it fits together

The modal is connie-js's and the page inside it is the SignPage's. They split
the work like this, and talk only through `postMessage`.

**The overlay** lives in a closed Shadow DOM on a single `<div>` that connie-js
appends to `document.body`. Your page's stylesheets cannot reach inside it, and
the host element itself is styled inline with `all: initial` and `!important`,
so rules like `* { all: unset }`, `div { … !important }` or `iframe { display:
none !important }` leave it alone. Inside, a native `<dialog>` opened with
`showModal()` holds the SignPage's `<iframe>`, a skeleton of the SignPage while
it loads, and the close button.

**The top layer.** `showModal()` puts the dialog in the browser's top layer,
above everything on your page whatever its `z-index`, so a cookie banner at
`2147483647` cannot cover it. The top layer is sized by the viewport, so a
`transform`, `filter`, `perspective`, `contain` or `will-change` on `html`,
`body` or any other ancestor does not move or resize it, and the rest of your
page is inert while it is open. Because the dialog is inside the shadow root,
rules like `dialog { display: none !important }`, `[open]`, `:modal` or
`dialog::backdrop` on your page do not match it; connie-js draws its own
backdrop. A `zoom` on `html` or `body` is undone on the host, so the modal keeps
its size. In a browser without `showModal()` the host itself is the fixed,
full-viewport overlay instead.

**The header band.** The SignPage's first 56px are its header band: a fixed,
non-scrolling row with the title on the left and 16px of side padding, white,
with a 1px bottom border inside the 56px. When connie-js frames it (the URL
carries `embed_id`), the band's right 56px stay empty. The SignPage never draws
a close button of its own.

**The close button** is connie-js's, and the only one, from the moment the
modal opens until it is gone: a 40×40 button 8px from the dialog's top and
right edges, so it sits centred in the empty end of the header band, with a
20px X. It never moves when the SignPage loads. Clicking it closes the modal
exactly as `embed.close()` does.

**Loading.** Until the SignPage says it is `ready`, a skeleton of it covers the
frame, laid out as the SignPage is so nothing moves when it appears: the header
band with a placeholder title, then on the canvas the SignPage's title and
subtitle, and the document's paper with placeholder lines. The paper sits where
the SignPage's own does, by the frame's width rather than the page's: 24px from
the sides below a 48px top margin, or 16px and 32px when the frame is narrower
than 640px. On `ready` the frame fades in under the skeleton as the
skeleton fades out, over 200ms, or at once when the signer prefers reduced
motion. The dialog is `aria-busy` until then.

**Esc.** connie-js closes the modal on Esc while focus is on your page or its
close button. While focus is inside the SignPage, the SignPage handles Esc: it
closes its own popovers first, and otherwise asks connie-js to close. Any other
close request the browser sends the dialog, such as Android's back gesture,
closes it the same way, and `onClose` fires once.

**Messages.** The SignPage posts
`{ source: "connie-js", v: 1, embedId, type, payload }` to your page's origin.
connie-js accepts a message only from the frame's origin, from the frame's own
window, and with that embed's `embedId`:

| `type`     | `payload`           | connie-js                                                   |
| ---------- | ------------------- | ----------------------------------------------------------- |
| `ready`    | `{ title }`         | Labels the dialog with `title`, shows the frame, `onReady`. |
| `signed`   |                     | `onSigned`. The modal stays open.                           |
| `close`    |                     | Closes the modal, `onClose`.                                |
| `error`    | `{ code, message }` | Closes the modal, `onError`, then `onClose`.                |
| `navigate` | `{ url }`           | Moves your page to the eID handoff at `url` (see below).    |

`navigate` is followed only when `url` is on the frame's own origin, is `https`
(or `http` on a loopback host), carries no credentials, and its path starts with
`/openid/authorize/`, which is where the eID flow begins. Any other `navigate` is
ignored, so a SignPage can never send your page anywhere else.

## No code: a link that opens in a modal

To collect signatures on a SignPage from a website, exactly as its public link
does, you need no API key, no backend and no npm. Paste two lines:

```html
<script src="https://assets.getconnie.com/js/v1.js" defer></script>
<a href="https://sign.page/EA0990" data-connie-signpage>Sign the agreement</a>
```

- **Allow your website first.** In Connie, open the SignPage and choose
  **Embed on your website**, then enter your website's address. Connie shows the
  SignPage only on the websites listed there, and removing one stops it at once.
  The snippet shown there carries your SignPage's own link.
- **Only Connie's sign hosts.** A link opens in the modal only when it points
  at `https://sign.page/<PIN>`. If your account signs on its own domain, list
  that host on the script tag:
  `<script src="https://assets.getconnie.com/js/v1.js" data-connie-hosts="sign.customer.com" defer></script>`
  (several hosts separated by spaces or commas, a port where there is one).
  Any other link is an ordinary link.
- **Without JavaScript it is an ordinary link** to the SignPage. With connie-js,
  a click opens the same modal as `openSignPage`. A click with Ctrl, Cmd, Shift
  or Alt, a middle click, and a link with `target="_blank"` open the link as
  usual. Links added to the page later work too.
- **eID** leaves your page at the submit step, as below, and "Back to" on the
  signed page returns to your website's home page.
- **If the SignPage can't be shown** (your website is not on its list, or the
  SignPage is not accepting signatures), the visitor goes to the SignPage's own
  page instead.
- **What Connie learns.** The frame's URL carries your page's origin only:
  never its path, query or fragment.
- No metadata, prefill or locks: those need an embed session, below.

## Quick start

### 1. Mint a session on your backend

```sh
curl https://api.getconnie.com/v1/sign_pages/$SIGN_PAGE_ID/embed_sessions \
  -H "Authorization: Bearer $CONNIE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "origin": "https://app.example.com",
    "return_url": "https://app.example.com/onboarding",
    "metadata": { "user_id": "4711" },
    "signer": {
      "name": "Jane Doe",
      "email": "jane@example.com",
      "locked": ["email"]
    }
  }'
```

```json
{ "url": "https://sign.page/embed/…", "expires_at": "2026-10-06T15:00:00Z" }
```

- `origin` is the `scheme://host[:port]` of the page that opens the modal,
  with no path. The SignPage can only be framed there. It must be `https`,
  except on a loopback host during development: `localhost`, any
  `*.localhost`, `127.0.0.1` or `[::1]`.
- `return_url` is where an eID signer lands afterwards. It must be on `origin`,
  and it is required when the SignPage offers an eID.
- `metadata` is up to 20 string keys with string values of up to 500
  characters. It ends up on the contract and in the webhook.
- `signer` prefills `name`, `email`, `phone` and `smart_tags` (keyed by the tag
  ids `GET /v1/sign_pages/:id` returns). `locked` lists the fields the signer
  cannot change.
- A session lasts an hour and signs one contract. Mint a new one each time you
  open the modal; `fetchUrl` below makes that easy.

Keep your API key on your server. Never mint sessions from the browser.

### 2. Open it in the browser

With npm:

```sh
npm install @getconnie/connie-js
```

```js
import { loadConnie } from "@getconnie/connie-js";

document.querySelector("#sign").addEventListener("click", async () => {
  const connie = await loadConnie();
  if (!connie) return;

  connie.openSignPage({
    fetchUrl: () =>
      fetch("/your-endpoint", { method: "POST" })
        .then((response) => response.json())
        .then((session) => session.url),
    onSigned() {
      // Update your UI. The contract.signed webhook is the record.
    },
  });
});
```

`fetchUrl` is a function that asks your backend for a new session and returns a
Promise of its `url`, so every opening gets a fresh session.

Or with a script tag:

```html
<script src="https://assets.getconnie.com/js/v1.js"></script>
<button id="sign">Sign the agreement</button>
<script>
  document.querySelector("#sign").addEventListener("click", () => {
    Connie.openSignPage({
      fetchUrl: () =>
        fetch("/your-endpoint", { method: "POST" })
          .then((response) => response.json())
          .then((session) => session.url),
      onSigned() {
        // Update your UI. The contract.signed webhook is the record.
      },
    });
  });
</script>
```

Under a Content Security Policy, the inline `<script>` needs your nonce, or put
the call in a JavaScript file of your own.

The package is a thin loader: `loadConnie()` adds the hosted script to the page
once and resolves with `window.Connie`. It reuses a script tag that is already
there, and resolves with `null` during server-side rendering, so it is safe to
call from Next.js, Remix and the like.

## React

```tsx
import { useState } from "react";
import { loadConnie } from "@getconnie/connie-js";

async function fetchSessionUrl(): Promise<string> {
  const response = await fetch("/api/connie-session", { method: "POST" });
  if (!response.ok) throw new Error("Could not start signing");
  return (await response.json()).url;
}

export function SignButton() {
  const [status, setStatus] = useState<"idle" | "open" | "signed">("idle");

  async function open() {
    const connie = await loadConnie();
    if (!connie) return;
    setStatus("open");
    connie.openSignPage({
      fetchUrl: fetchSessionUrl,
      onSigned: () => setStatus("signed"),
      onClose: () => setStatus((s) => (s === "open" ? "idle" : s)),
      onError: (error) => console.warn("Signing failed:", error.code, error.message),
    });
  }

  if (status === "signed") {
    return <p>Thanks! We'll confirm as soon as the signed copy arrives.</p>;
  }

  return (
    <button onClick={open} disabled={status === "open"}>
      Review and sign
    </button>
  );
}
```

`openSignPage` returns an embed with a `close()` method, if you need to close
the modal yourself (when your component unmounts, for example).

## API

```ts
loadConnie(): Promise<ConnieJs | null>

connie.openSignPage(options: OpenSignPageOptions): SignPageEmbed
connie.version: string

interface OpenSignPageOptions {
  url?: string;                        // a session url your backend minted, or
  fetchUrl?: () => Promise<string>;    // a function that asks your backend for one
  onReady?: () => void;
  onSigned?: () => void;
  onClose?: () => void;
  onError?: (error: ConnieEmbedError) => void;
}

interface SignPageEmbed {
  close(): void;
}

interface ConnieEmbedError {
  code: "expired" | "unavailable" | "no_credits" | "invalid_url" | "fetch_failed" | string;
  message: string;
}
```

Pass exactly one of `url` and `fetchUrl`. `openSignPage` throws a `TypeError`
straight away when you pass neither or both, or a `url` that is not `https`
(`http` is accepted on `localhost`, any `*.localhost`, `127.0.0.1` and `[::1]`
for development). Everything that goes wrong later is reported through
`onError`.

All types are exported from the package: `ConnieJs`, `SignPageEmbed`,
`OpenSignPageOptions`, `ConnieEmbedError` and `ConnieEmbedErrorCode`.

### Events

| Callback   | When                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| `onReady`  | The SignPage has loaded and the signer can use it. Called once.                                                       |
| `onSigned` | The signer signed. Called once. The modal stays open on the SignPage's own confirmation until the signer closes it.   |
| `onClose`  | The modal is gone, whatever closed it: the signer, Esc, your `close()` or an error. Called once.                      |
| `onError`  | The embed failed. The modal closes, then `onClose` follows. Without an `onError`, the error is logged to the console. |

To close the modal as soon as the signer signs, instead of leaving them on the
confirmation, close it from `onSigned`:

```js
const embed = connie.openSignPage({ url, onSigned: () => embed.close() });
```

Error codes:

| `code`         | Meaning                                                            |
| -------------- | ------------------------------------------------------------------ |
| `expired`      | The session is unknown, expired or already used. Mint a new one.   |
| `unavailable`  | The SignPage is no longer published or active.                     |
| `no_credits`   | The account has no signing credits left.                           |
| `invalid_url`  | `fetchUrl` resolved with something that is not an allowed URL.     |
| `fetch_failed` | `fetchUrl` rejected or threw. `message` carries its error message. |

The hosted script is updated in place, so new codes may appear. Treat a code you
do not know as a generic failure.

## The webhook is the record

`onSigned` is a signal for your UI, nothing more. It runs in the signer's
browser, where anyone can call it. Decide what was signed, by whom and for what
on your server, from the `contract.signed` webhook: it carries the contract,
the SignPage and the `metadata` you set when you minted the session. `GET
/v1/contracts/:id` returns the same.

A good pattern is the one Connie uses itself: `onSigned` shows a "pending"
state, and your server flips it to "done" when the webhook lands.

## Content Security Policy

connie-js is built to run under a strict CSP. Add each source below to the
directive of the same name in your policy. If your policy has no such directive
yet, start it from what your `default-src` allows, so nothing that loads today
stops loading.

```
script-src https://assets.getconnie.com/js/v1.js;
frame-src  https://sign.page;
```

`script-src` names the exact script rather than the whole host, because the
same host also serves files uploaded to Connie. If your account signs on a
custom domain, use that domain in `frame-src` instead of `sign.page`; the
origin of the session `url` the Connie API returns is exactly your sign host.

- **No `style-src` change.** connie-js needs nothing from your `style-src`:
  it sets its styles through the CSSOM (a constructed stylesheet adopted into
  its shadow root, and `element.style`), which CSP does not restrict, so
  neither `'unsafe-inline'` nor a hash is needed. The top layer is reached
  through `showModal()`, a DOM call, not markup.
- **No `connect-src` or `img-src` change.** Everything the SignPage loads is
  governed by Connie's CSP, not yours.
- **Trusted Types.** If your policy has `require-trusted-types-for 'script'`,
  `loadConnie()` assigns the script URL through a Trusted Types policy named
  `connie-js`, which passes only the exact URL it loads. Add the name to your
  `trusted-types` directive, if you have one: `trusted-types connie-js`
  (alongside your own policy names). A plain `<script>` tag needs nothing.
- **Nonces and `'strict-dynamic'`.** If your policy uses `'strict-dynamic'`,
  give the script tag (or the bundle that calls `loadConnie()`) your nonce;
  the script tag `loadConnie()` adds is then trusted too.
- **Camera.** When the SignPage asks for a photo of the signer, allow the camera
  for the frame if you send a `Permissions-Policy` header:
  `Permissions-Policy: camera=(self "https://sign.page")`.
- **Subresource Integrity is not possible.** The hosted script is evergreen, so
  fixes reach you without a redeploy, and its hash changes with them. Stripe.js
  works the same way. Load it from `https://assets.getconnie.com/js/v1.js` and
  nowhere else; a breaking change would get a new path (`v2.js`).
- **Cross-Origin-Opener-Policy:** any value works. eID is a navigation, not a
  popup.
- **Cross-Origin-Embedder-Policy: `require-corp` is not supported.** A page with
  it cannot frame the SignPage.

## Security

What connie-js trusts, and what it does not:

- **The session URL is the root of trust.** Pass `url` (or resolve `fetchUrl`
  with) exactly the `url` the Connie API returned when your backend minted the
  session, unchanged. connie-js frames whatever `https` URL it is given and
  then trusts messages from that URL's origin, so a URL taken from anywhere
  else (a query parameter, user input, a database field someone else can
  write) would let that origin talk to your page.
- **Messages** are accepted only from the frame's origin, from the frame's own
  window, and with the embed's random `embedId`. Their payloads are data: the
  `ready` title becomes text, never markup, and an error's `code` and `message`
  are handed to `onError` as strings.
- **Navigation.** The only way the SignPage can move your page is the eID
  handoff, a `navigate` to `/openid/authorize/…` on its own origin.
- **The frame** is sent your page's origin as its referrer, never its path or
  query (`referrerpolicy="strict-origin"`), so a token in your page's URL does
  not reach Connie. A `data-connie-signpage` link puts your page's origin in
  the frame's URL too, and nothing else of its address.
- **Links are framed only on Connie's sign hosts:** `sign.page`, and the hosts
  your own script tag lists in `data-connie-hosts`. Trust is never taken from
  a link, so markup someone else can write on your page (a comment, a
  profile) cannot have connie-js frame another site, hand it the camera
  (`allow="camera"`), or let it ask for a `navigate`. `openSignPage({url})` is
  not limited this way, because its URL comes from your own backend (see
  above).
- **`window.Connie`.** The hosted script defines it read-only. An element with
  `id="Connie"` on your page is never mistaken for it, by the script or by
  `loadConnie()`.
- **`onSigned` is not proof** of anything (see above). Act on the webhook.
- **Load the script only** from `https://assets.getconnie.com/js/v1.js`, or
  through `loadConnie()`, which does.

## eID

MitID and the other eIDs refuse to run inside a frame, so the modal cannot host
them. When the SignPage offers an eID, the signer still reads and fills in the
form in the modal. When they submit with an eID, connie-js moves your whole page
to the eID flow. Afterwards the signer lands on Connie's signed page, with a
**Back to** button to your `return_url`:

- `return_url?connie_embed_status=signed` after signing,
- `return_url?connie_embed_status=cancelled` if they gave up.

`connie_embed_status` is a hint for your UI. Act on the webhook.

Because the page navigates away, `onSigned` and `onClose` are not called on an
eID signature. Set `return_url` when you mint the session; it is required for a
SignPage that offers an eID.

If you frame the session URL with a bare `<iframe>` instead of connie-js,
nothing can move your page, so the SignPage offers a "Continue on sign.page"
link instead. Use connie-js for SignPages that offer an eID.

## Accessibility and mobile

The modal follows the WAI-ARIA dialog pattern: it is a labelled native modal
`<dialog>`, which assistive technology reads as one modal dialog, with
the rest of the page inert behind it (`role="dialog"` with `aria-modal="true"`
in a browser without `showModal()`). Focus moves into it when it opens and
stays there, Esc closes it, and focus returns to where it was when it closes.
The page behind it does not scroll. Below 640px wide it fills the screen, and
keeps clear of notches and home indicators (`env(safe-area-inset-*)`, when your
page sets `viewport-fit=cover`). Its height follows the dynamic viewport
(`100dvh`), so mobile browser bars never cover its bottom.

## Browser support

The latest two versions of Chrome, Edge, Firefox and Safari (macOS and iOS),
including with third-party cookies blocked: the embedded SignPage uses no
cookies. Safari 16.0 to 16.3, which cannot adopt a constructed stylesheet, gets
the same modal styled inline, full screen at every width. The hosted script is under 10 kB gzipped, the npm loader under 1 kB.

## Documentation

The full guide, including the API reference for embed sessions, is the
[Embedding SignPages](https://api.getconnie.com/v1/docs#description/embedding-signpages)
section of the Connie API docs.

## Developing

```sh
npm install
npm test          # builds, then runs the tests (including the size budgets)
npm run example   # serves examples/ at http://localhost:5173/examples/
```

The example page runs under a strict CSP and comes with a mock SignPage on a
second origin, so you can try every event without a Connie account. Open
`?hostile` to load an aggressive host stylesheet first, with a cookie banner at
the highest `z-index` and a transformed, filtered, contained page zoomed 2.25×
(`?hostile=zoom-out` zooms it 0.8× and `?hostile=no-zoom` not at all), and add
`?ready_after=<ms>` to change how long the mock holds back `ready`.

## License

[MIT](LICENSE), copyright Connie ApS.
