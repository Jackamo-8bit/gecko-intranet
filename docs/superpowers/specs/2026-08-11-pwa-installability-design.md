# PWA installability

## Purpose

Let the portal be installed to an iPhone home screen and run as a standalone app, without breaking Microsoft sign-in for the people who install it.

Installability was deliberately deferred during the 2026-08-10 responsive pass. `theme-color` and `viewport-fit=cover` shipped; the manifest did not, because MSAL's popup sign-in is unreliable inside an installed iOS webview and the failure could not be verified without a real device.

This design adds the manifest and makes sign-in choose its flow at runtime, so a single device test can settle the question either way.

## Constraints

- The live portal at `https://jackamo-8bit.github.io/gecko-intranet/` must not change until the device test passes. GitHub Pages serves `main` at the repository root, so anything merged to `main` is live immediately.
- The device test cannot be automated. It needs a physical iPhone and real Microsoft credentials, so it is run by hand.
- The Entra app registration only accepts redirect URIs registered against it. Any test URL other than the production one requires an Entra change.

## Design

### Manifest and metas

`manifest.webmanifest` at the repository root, referencing the two icons already committed there (`gecko-favicon.png`, 64×64; `apple-touch-icon.png`, 180×180). `start_url` and `scope` both match `CONFIG.REDIRECT_URI`, so the installed app opens at the URI Entra already accepts.

The head gains `link rel=manifest` plus the Apple standalone metas. The status bar style is `black-translucent`, which is the choice that pays off the `viewport-fit=cover` already on this branch: the shell paints under the status bar instead of letterboxing, relying on the safe-area insets added in `ec65ede`.

Only 64px and 512px-class icons would satisfy Chrome's install criteria, and neither exists. Android will therefore not offer installation. This is accepted: the target is iOS, which takes its icon from the `apple-touch-icon` link and ignores manifest icons entirely.

### Sign-in flow

A single predicate decides the flow:

```
isStandaloneDisplay() = navigator.standalone === true
                      || matchMedia('(display-mode: standalone)').matches
```

`navigator.standalone` is the iOS signal; `display-mode` covers everything else.

Three call sites branch on it:

- `signIn()` uses `loginRedirect` in standalone and keeps `loginPopup` in a browser tab. The redirect path navigates away, so it must not run the cleanup that restores the button to idle.
- `signOut()` uses `logoutRedirect` in standalone and keeps `logoutPopup` otherwise. Not part of the original brief, but it carries the identical failure mode and fixing one without the other would leave sign-out broken in exactly the case this work exists to support.
- `buildMsalConfig()` sets `storeAuthStateInCookie` to the predicate rather than the current hardcoded `false`. The cookie fallback gives redirect state a second chance to survive partitioned webview storage.

`init()` calls `handleRedirectPromise()` immediately after `initialize()` and before the existing account detection. A returned account clears the re-auth flag and signs in; `null` falls through to the current logic unchanged. A thrown error gets its own message rather than the generic start-up failure, because that error text is the primary diagnostic the device test produces.

`getToken()` is unchanged. It already refuses to open popups during background refresh and degrades through `markAuthExpired()` to the sign-in screen, which is correct standalone behaviour.

### Test deployment

`tools/build-preview.mjs` generates `preview/pwa/` from the real `index.html`, rewriting `REDIRECT_URI`, the manifest `start_url` and `scope`, and the icon paths to `/gecko-intranet/preview/pwa/`. Generated rather than hand-copied because the auth work may need regenerating between test rounds.

Committing that directory to `main` publishes an installable test URL while leaving the live `index.html` byte-identical. It requires `https://jackamo-8bit.github.io/gecko-intranet/preview/pwa/` to be added as a SPA redirect URI in the Entra app registration first; without it sign-in fails with `AADSTS50011` and the test proves nothing.

## Risk

Both flows can genuinely fail, and the test must be able to tell the difference.

iOS gives an installed webview its own storage jar, separate from Safari's. Popup fails when iOS hands `window.open()` to Safari and the opener relationship breaks. Redirect fails when the return leg from `login.microsoftonline.com` lands in Safari rather than the webview — state written in one jar, read from the other, surfacing as a state mismatch. iOS 16.4 improved this; it is not guaranteed.

## Validation

Automated, before the device test:

- The manifest parses as JSON and its icon paths resolve to committed files.
- The head metas are present and the standalone flag pairs with `viewport-fit=cover`.
- `black-translucent` plus the existing safe-area insets do not break the shell, checked in the mock preview harness.
- The browser-tab popup path is unchanged.
- The existing test scripts still pass.

By hand, on a physical iPhone, against the preview URL:

- Add to Home Screen, launch, sign in. Record which flow ran and the exact error text if it fails.
- Force-quit and relaunch. Confirm the session is still live.

Passing means sign-in completes and the session survives a restart. A re-tap of sign-in after roughly 24 hours is a pass, not a failure: `cacheLocation` is `localStorage`, so the account persists, but silent renewal needs iframe access to Microsoft cookies that ITP blocks in standalone. The graceful landing on the sign-in screen is the designed behaviour.

## Outcome if neither flow works

Revert the manifest and the standalone metas, keep the portal a browser-tab app, and keep the auth refactor only if it is harmless in a tab. Record the finding in `docs/PWA_INSTALLABILITY.md` so the question is not reopened from scratch. This is an acceptable result.
