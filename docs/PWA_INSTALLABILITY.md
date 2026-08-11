# PWA installability

Status: **built, not verified.** The branch `feat/pwa-installability` is
complete and local. It must not be merged until the device test below has been
run and its result recorded here.

## Why this is gated

Installing the portal changes how sign-in works, and can only break it.

In a browser tab, `signIn()` calls `loginPopup()`. An installed iOS home-screen
app runs in a webview that hands `window.open()` to Safari, so the popup opens
as a separate tab and loses the opener relationship the MSAL handshake depends
on. The handshake then hangs or fails silently.

The redirect flow is not automatically safe either. An installed webview gets
its own storage jar, separate from Safari's. If the return leg from
`login.microsoftonline.com` lands in Safari rather than the app, the auth state
written before the redirect is not in the jar that reads it, and sign-in fails
with a state mismatch. iOS 16.4 improved this; it is not guaranteed.

So shipping the manifest without testing would turn a working sign-in into a
broken one for anyone who installs the app. That is the whole reason this is not
on `main`.

## What was built

- `manifest.webmanifest` — `start_url` and `scope` both equal
  `CONFIG.REDIRECT_URI`, reusing the committed `gecko-favicon.png` (64×64) and
  `apple-touch-icon.png` (180×180).
- Apple standalone metas in the head. `apple-mobile-web-app-status-bar-style` is
  `black-translucent`, which pairs with the `viewport-fit=cover` already on this
  branch — the shell paints under the status bar rather than letterboxing, and
  the `--safe-*` tokens pad it back out.
- `isStandaloneDisplay()` — reads `navigator.standalone` (the only signal iOS
  gives an installed app) and `display-mode: standalone` (everything else).
- `signIn()` / `signOut()` take redirect in standalone, popup in a browser tab.
- `init()` collects the result with `handleRedirectPromise()` before the
  existing-account check, reporting failure there distinctly from a generic
  start-up error.
- `storeAuthStateInCookie` is enabled in standalone only.

Android will not offer installation: Chrome wants 192px and 512px icons and
neither exists. Accepted — the target is iOS, which takes its icon from the
`apple-touch-icon` link and ignores manifest icons.

## What has been verified, and what has not

Verified locally, in the mock preview harness and `tests/pwa-installability.mjs`:

- Manifest parses, serves as `application/manifest+json`, and its icons resolve.
- Head metas present; `black-translucent` ships together with `viewport-fit=cover`.
- With a simulated 59px top inset, the top bar measures 117px with 59px of
  padding and the loading bar sits below it — the shell does not break.
- Browser tab routes to `loginPopup` / `logoutPopup`, cookie fallback off.
- Standalone routes to `loginRedirect` / `logoutRedirect`, cookie fallback on.
- `handleRedirectPromise()` runs before the account check in both modes.

**Not verified: any of the actual iOS behaviour this work exists to address.**
A desktop browser emulating `display-mode: standalone` proves the code routes
correctly. It cannot prove that iOS keeps the redirect inside the webview, or
that the storage jar survives it. Only a physical iPhone can.

## The device test

### 1. Register the preview redirect URI (Azure — must be done first)

In the Entra app registration for the portal, add this as a **SPA** redirect URI:

```
https://jackamo-8bit.github.io/gecko-intranet/preview/pwa/
```

Without it, sign-in fails with `AADSTS50011` and the test proves nothing.

### 2. Publish the preview

From `main`, with the feature branch's changes available:

```bash
node tools/build-preview.mjs && git add -f preview/pwa && git commit -m "chore: publish PWA preview build for device testing" && git push
```

`preview/` is gitignored precisely so this is a deliberate act. The live portal
at the repository root is untouched — only a new subdirectory is added.

### 3. Test on the iPhone

1. Open `https://jackamo-8bit.github.io/gecko-intranet/preview/pwa/` in Safari.
   Confirm the orange "PREVIEW BUILD" strip is visible, so you know which build
   you are on.
2. Share → Add to Home Screen. Confirm the Gecko icon and the name "Gecko Preview".
3. Launch from the home screen. Confirm it opens with no Safari address bar,
   and that the top bar clears the notch.
4. Tap sign in. **Record what happens**, and in particular:
   - Does the button change to "Redirecting to Microsoft…"? That confirms the
     standalone branch was taken. If it says "Opening Microsoft sign-in…", the
     app is not being detected as standalone, which is itself the finding.
   - Does Microsoft's page open inside the app, or does Safari come to the front?
   - After authenticating, do you land back in the installed app or in Safari?
   - If it fails, capture the exact toast text. "Sign-in did not complete: …"
     is the `handleRedirectPromise()` diagnostic and its wording identifies the
     failure.
5. If sign-in succeeds, confirm data loads (the Overview figures populate).
6. Force-quit the app (swipe up from the app switcher) and relaunch. Confirm it
   returns signed in without another sign-in.
7. Leave it overnight and relaunch once more.

### Pass criteria

Sign-in completes, and step 6 returns you signed in.

**Step 7 needing one more sign-in tap is a pass, not a failure.** `cacheLocation`
is `localStorage`, so the account persists, but silent renewal after roughly 24
hours needs iframe access to Microsoft cookies that ITP blocks in standalone.
`getToken()` already degrades through `markAuthExpired()` to the sign-in screen,
which is the designed behaviour. A clean landing on the sign-in screen is
correct; a hang, a blank screen, or a loop is not.

### 4. Clean up, whatever the result

```bash
git rm -r --cached preview && rm -rf preview && git commit -m "chore: remove PWA preview build" && git push
```

Then remove the preview redirect URI from the Entra app registration.

## Result

_Not yet run._ Record the outcome here — date, iOS version, which flow ran, and
the exact error text if it failed.

### If it works

Merge `feat/pwa-installability`. Note the iOS version tested, since the
behaviour this depends on is version-sensitive.

### If neither flow works

Revert the manifest and the standalone metas and leave the portal a browser-tab
app. This is an acceptable outcome — it is where the portal already is, and the
responsive pass made it a good tab app deliberately.

```bash
git rm manifest.webmanifest
# then remove the INSTALLABILITY meta block from the head of index.html
```

Keep `isStandaloneDisplay()` and the redirect plumbing only if it is inert in a
tab, which it is: with no manifest nothing can install, so the predicate is
always false and the popup path is what runs. Keeping it means a future attempt
does not start from nothing. Delete `tests/pwa-installability.mjs`, or trim it
to the parts that still apply.

Record the failure mode here in either case, so this is not reopened from
scratch. The previous deferral was recorded only in a design note, which is why
the question came back around.
