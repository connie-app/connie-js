/**
 * Why an embed could not be shown or finished.
 *
 * - `expired`: the session is unknown, expired or already used.
 * - `unavailable`: the SignPage is no longer published or active.
 * - `no_credits`: the account behind the SignPage has no signing credits left.
 * - `invalid_url`: `fetchUrl` resolved with something that is not a Connie session URL.
 * - `fetch_failed`: `fetchUrl` rejected or threw.
 *
 * The hosted script is evergreen and may add codes, so treat unknown codes as a
 * generic failure.
 */
export type ConnieEmbedErrorCode =
  "expired" | "unavailable" | "no_credits" | "invalid_url" | "fetch_failed" | (string & {});

export interface ConnieEmbedError {
  code: ConnieEmbedErrorCode;
  message: string;
}

export interface OpenSignPageOptions {
  /** A session URL your backend minted. Pass exactly one of `url` and `fetchUrl`. */
  url?: string;
  /** Mints a session URL on demand, typically by calling your backend. */
  fetchUrl?: () => Promise<string>;
  /** The SignPage is loaded and interactive. */
  onReady?: () => void;
  /** The signer signed. A UI signal only: the `contract.signed` webhook is the record. */
  onSigned?: () => void;
  /** The modal is gone. Called exactly once per embed, whatever closed it. */
  onClose?: () => void;
  /** The embed failed. The modal closes right after, and `onClose` follows. */
  onError?: (error: ConnieEmbedError) => void;
}

export interface SignPageEmbed {
  /** Closes the modal. Calls `onClose` unless the embed was already closed. */
  close(): void;
}

export interface ConnieJs {
  openSignPage(options: OpenSignPageOptions): SignPageEmbed;
  /** The version of the hosted script that is running. */
  readonly version: string;
}

declare global {
  interface Window {
    Connie?: ConnieJs;
  }
}
