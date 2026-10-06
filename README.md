# connie-js

**Let your users sign a contract without leaving your app.**

connie-js is [Connie](https://getconnie.com)'s browser SDK. It opens any of your
published SignPages as a modal inside your own web app, with one function call.

<!-- TODO: add docs/demo.gif (opening a SignPage, signing, the modal closing) and embed it here. -->

- **A SignPage in a modal**, in any web app and any framework. Accessible,
  full screen on phones, and styled without touching your CSP's `style-src`.
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

- `origin` is the `scheme://host[:port]` of the page that opens the modal.
  The SignPage can only be framed there. It must be `https`, except
  `http://localhost` and `http://127.0.0.1` for development.
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

const connie = await loadConnie();

connie.openSignPage({
  fetchUrl: async () => {
    const response = await fetch("/api/connie-session", { method: "POST" });
    const { url } = await response.json();
    return url;
  },
  onSigned: () => showThankYou(),
});
```

Or with a script tag:

```html
<script src="https://assets.getconnie.com/js/v1.js"></script>
<script>
  document.querySelector("#sign").addEventListener("click", () => {
    Connie.openSignPage({ url: sessionUrlFromYourBackend });
  });
</script>
```

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
  fetchUrl?: () => Promise<string>;    // a function that mints one
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
straight away when you pass neither or both, or a `url` that is not `https`.
Everything that goes wrong later is reported through `onError`.

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
| `invalid_url`  | `fetchUrl` resolved with something that is not an `https` URL.     |
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

connie-js is built to run under a strict CSP. Add:

```
script-src https://assets.getconnie.com;
frame-src  https://sign.page;
```

If your account signs on a custom domain, use that domain in `frame-src` instead
of `sign.page`. The Embed tab of each SignPage in Connie shows the exact lines
for your account.

- **No `style-src` change.** connie-js styles itself only through CSSOM (a
  constructed stylesheet and `element.style`). It never adds a `<style>`
  element or a `style` attribute, so neither `'unsafe-inline'` nor a hash is
  needed.
- **No `connect-src` or `img-src` change.** Everything the SignPage loads is
  governed by Connie's CSP, not yours.
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

The modal follows the WAI-ARIA dialog pattern: it is a labelled
`role="dialog"` with `aria-modal="true"`, focus moves into it when it opens and
stays there, Esc closes it, and focus returns to where it was when it closes.
The page behind it does not scroll. Below 640px wide it fills the screen.

## Browser support

The latest two versions of Chrome, Edge, Firefox and Safari (macOS and iOS),
including with third-party cookies blocked: the embedded SignPage uses no
cookies. The hosted script is under 10 kB gzipped, the npm loader under 1 kB.

## Documentation

<!-- TODO: replace with the "Embedding a SignPage" page once it is published. -->

The full guide, including the API reference for embed sessions, lives at
[docs.getconnie.com](https://docs.getconnie.com).

## Developing

```sh
npm install
npm test          # builds, then runs the tests (including the size budgets)
npm run example   # serves examples/ at http://localhost:5173/examples/
```

The example page runs under a strict CSP and comes with a mock SignPage on a
second origin, so you can try every event without a Connie account.

## License

[MIT](LICENSE), copyright Connie ApS.
