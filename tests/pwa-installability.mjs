import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const manifestRaw = await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8');

/* ── Manifest ──────────────────────────────────────────────────────────── */

const manifest = JSON.parse(manifestRaw);

const redirectUri = html.match(/REDIRECT_URI:\s*'([^']+)'/)?.[1];
assert.ok(redirectUri, 'CONFIG.REDIRECT_URI should be present');

assert.equal(
  manifest.start_url, redirectUri,
  'start_url must equal CONFIG.REDIRECT_URI — the installed app has to open at a URI Entra accepts'
);
assert.equal(
  manifest.scope, redirectUri,
  'scope must equal CONFIG.REDIRECT_URI so the sign-in return leg stays inside the installed app'
);
assert.equal(manifest.display, 'standalone', 'display should be standalone');
assert.equal(manifest.theme_color, '#040605', 'theme_color should match the dark surface');
assert.equal(manifest.background_color, '#040605', 'background_color should match the dark surface');
assert.ok(manifest.name && manifest.short_name, 'name and short_name should both be set');

assert.ok(manifest.icons?.length >= 1, 'the manifest should declare at least one icon');
for (const icon of manifest.icons) {
  const file = new URL(`../${icon.src}`, import.meta.url);
  const info = await stat(file).catch(() => null);
  assert.ok(info?.isFile(), `manifest icon ${icon.src} should exist in the repo`);
}

/* ── Head metas ────────────────────────────────────────────────────────── */

const head = html.slice(0, html.indexOf('</head>'));

assert.match(head, /<link rel="manifest" href="manifest\.webmanifest">/,
  'the manifest should be linked from the head');
assert.match(head, /<meta name="apple-mobile-web-app-capable" content="yes">/,
  'apple-mobile-web-app-capable is what makes Add to Home Screen run standalone');
assert.match(head, /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">/,
  'black-translucent is what pairs the status bar with viewport-fit=cover');
// Asserted against the meta tag itself, not the file — "viewport-fit=cover"
// also appears in the comment above it and in the CSS notes further down.
const viewportMeta = head.match(/<meta name="viewport" content="([^"]*)">/)?.[1];
assert.ok(viewportMeta, 'a viewport meta should be present');
assert.match(viewportMeta, /viewport-fit=cover/,
  'black-translucent letterboxes without viewport-fit=cover — the two must ship together');

/* ── Sign-in flow switches on display mode ─────────────────────────────── */

const authBlock = html.match(
  /function isStandaloneDisplay\(\)[\s\S]*?\nasync function signOut\(\)[\s\S]*?\n}/
)?.[0];
assert.ok(authBlock, 'the standalone-aware auth block should be present');

// The predicate must read both signals: navigator.standalone is the only one
// iOS gives an installed app, display-mode covers every other platform.
const sandbox = {};
vm.runInNewContext(
  `${html.match(/function isStandaloneDisplay\(\)[\s\S]*?\n}/)[0]}
   globalThis.probe = isStandaloneDisplay;`,
  sandbox
);
const probe = sandbox.probe;

const asWindow = (navStandalone, displayMode) => ({
  navigator: { standalone: navStandalone },
  matchMedia: (q) => ({ matches: q.includes('display-mode: standalone') && displayMode })
});

sandbox.window = asWindow(true, false);
assert.equal(probe.call(sandbox), true, 'navigator.standalone alone should report standalone (iOS)');
sandbox.window = asWindow(undefined, true);
assert.equal(probe.call(sandbox), true, 'display-mode alone should report standalone (non-iOS)');
sandbox.window = asWindow(false, false);
assert.equal(probe.call(sandbox), false, 'a plain browser tab should not report standalone');

// Scoped to each function's own body. A file-wide search would pair the
// isStandaloneDisplay() in buildMsalConfig with a loginRedirect further down
// and pass even if the branch in signIn were gone.
const bodyOf = (name) =>
  html.match(new RegExp(`async function ${name}\\(\\)[\\s\\S]*?\\n}`))?.[0];

const signInBody = bodyOf('signIn');
const signOutBody = bodyOf('signOut');
assert.ok(signInBody, 'signIn() should be present');
assert.ok(signOutBody, 'signOut() should be present');

for (const [name, body, redirectFn, popupFn] of [
  ['signIn', signInBody, 'loginRedirect', 'loginPopup'],
  ['signOut', signOutBody, 'logoutRedirect', 'logoutPopup']
]) {
  const guard = body.match(
    new RegExp(`if \\(isStandaloneDisplay\\(\\)\\)[\\s\\S]*?${redirectFn}`)
  );
  assert.ok(guard,
    `${name} should call ${redirectFn} inside an isStandaloneDisplay() branch`);
  assert.match(body, new RegExp(popupFn),
    `${name} should keep ${popupFn} for browser tabs`);
}

assert.match(html, /storeAuthStateInCookie:\s*standalone/,
  'auth state should fall back to a cookie in standalone, where webview storage is partitioned');

/* ── Redirect results are collected at start-up ────────────────────────── */

const initBlock = html.match(/async function init\(\)[\s\S]*?\n}/)?.[0];
assert.ok(initBlock, 'init() should be present');
assert.match(initBlock, /handleRedirectPromise\(\)/,
  'init must collect the redirect result, or redirect sign-in never completes');
assert.ok(
  initBlock.indexOf('handleRedirectPromise') < initBlock.indexOf('getAllAccounts'),
  'handleRedirectPromise must run before the existing-account check'
);
assert.ok(
  !/redirectResult[\s\S]{0,400}?\n\s*return;/.test(initBlock),
  'the redirect branch must not return early — the sign-in button and responsive setup are wired after it'
);

console.log('PWA installability checks passed.');
