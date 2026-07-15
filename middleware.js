// middleware.js — a light login gate for the whole site.
//
// Runs on Vercel's Edge, BEFORE any file is served, so it protects every page
// (including direct URLs like /RBB-Level5-Notes.html and anything you'd see via
// "inspect"). Nothing is served until a valid session cookie is present.
//
// This is "light" protection for a personal site — one shared username/password.
// The password lives in Vercel Environment Variables, never in this repo, and the
// login cookie is signed (HMAC-SHA256) so it can't be forged.
//
// SET THESE in Vercel → Project → Settings → Environment Variables (see README):
//   AUTH_USER    the username you'll type
//   AUTH_PASS    the password you'll type
//   AUTH_SECRET  a long random string used to sign the login cookie
//
// After changing any of these, redeploy. To "log out" everywhere, change AUTH_SECRET.

import { next } from '@vercel/edge';

const COOKIE = 'memex_auth';
const MAX_AGE_SEC = 30 * 24 * 60 * 60; // stay logged in for 30 days

export const config = {
  // Protect everything. (No static assets are requested before login — the login
  // page below is fully self-contained, so nothing leaks through.)
  matcher: '/(.*)',
};

export default async function middleware(req) {
  const url = new URL(req.url);
  const USER = process.env.AUTH_USER;
  const PASS = process.env.AUTH_PASS;
  const SECRET = process.env.AUTH_SECRET;

  // Fail loudly (and safely) if the site owner hasn't configured credentials yet.
  if (!USER || !PASS || !SECRET) {
    return html(configHelpPage(), 500);
  }

  // --- Handle the login form submission ---
  if (req.method === 'POST' && url.pathname === '/login') {
    const form = await req.formData();
    const okUser = timingSafeEqual(str(form.get('username')), USER);
    const okPass = timingSafeEqual(str(form.get('password')), PASS);
    const dest = safeNext(str(form.get('next')));

    if (okUser && okPass) {
      const token = await sign(SECRET);
      const res = new Response(null, { status: 303, headers: { Location: dest } });
      res.headers.append(
        'Set-Cookie',
        `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SEC}`
      );
      return res;
    }
    // Wrong credentials → show the login page again with an error.
    return html(loginPage({ error: true, next: dest }), 401);
  }

  // --- Already logged in? ---
  const token = getCookie(req, COOKIE);
  if (token && (await verify(token, SECRET))) {
    return next();
  }

  // --- Not logged in → show the login page ---
  const wanted = url.pathname === '/login' ? '/' : url.pathname + url.search;
  return html(loginPage({ error: false, next: safeNext(wanted) }), 200);
}

/* ------------------------------ helpers ------------------------------ */

function str(v) {
  return typeof v === 'string' ? v : '';
}

// Only allow same-origin paths as a post-login redirect target.
function safeNext(n) {
  if (!n || !n.startsWith('/') || n.startsWith('//') || n.startsWith('/\\')) return '/';
  return n;
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function getCookie(req, name) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function b64url(bytesOrStr) {
  let bin;
  if (typeof bytesOrStr === 'string') {
    bin = bytesOrStr;
  } else {
    bin = '';
    const arr = new Uint8Array(bytesOrStr);
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  }
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function hmac(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return b64url(sig);
}

// Token = <base64url(issuedAt)>.<hmac>. The HMAC proves we issued it; the
// timestamp lets us expire it server-side even if the cookie lingers.
async function sign(secret) {
  const payload = b64url(String(Date.now()));
  const sig = await hmac(payload, secret);
  return `${payload}.${sig}`;
}

async function verify(token, secret) {
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(payload, secret);
  if (!timingSafeEqual(sig, expected)) return false;
  try {
    const issued = Number(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (!Number.isFinite(issued)) return false;
    if (Date.now() - issued > MAX_AGE_SEC * 1000) return false;
  } catch {
    return false;
  }
  return true;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ------------------------------ pages ------------------------------ */
// Self-contained (inline CSS, no external assets) so nothing loads before login.
// Palette mirrors index.html so the gate feels of a piece; fully responsive.

function loginPage({ error, next }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Sign in — memex</title>
<style>
  :root{
    --paper:#f4f3ef; --panel:#faf9f5; --ink:#23262b; --ink-2:#585650; --ink-3:#8c887e;
    --rule:#d9d5cb; --spot:#1f3d6e; --spot-2:#16305a; --on-spot:#ffffff; --bad:#a3341f;
    --serif:"Constantia","Cambria",Georgia,"Times New Roman",serif;
    --sans:"Segoe UI","Calibri",system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;
    --shadow:0 1px 2px rgba(31,45,61,.05), 0 10px 30px rgba(31,45,61,.07);
  }
  @media (prefers-color-scheme:dark){
    :root{
      --paper:#17191c; --panel:#1c1f22; --ink:#e8e5de; --ink-2:#aca89f; --ink-3:#7e7a72;
      --rule:#32353a; --spot:#8fb0e0; --spot-2:#a9c3ea; --on-spot:#12161f; --bad:#e08a72;
      --shadow:0 10px 30px rgba(0,0,0,.4);
    }
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  body{
    margin:0; background:var(--paper); color:var(--ink); font-family:var(--sans);
    -webkit-font-smoothing:antialiased;
    display:flex; align-items:center; justify-content:center;
    padding:24px; padding:max(24px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left));
  }
  .card{
    width:100%; max-width:380px; background:var(--panel); border:1px solid var(--rule);
    border-radius:14px; box-shadow:var(--shadow); padding:clamp(24px,6vw,36px);
  }
  .lock{ font-size:26px; line-height:1; }
  h1{
    font-family:var(--serif); font-weight:700; font-size:clamp(24px,7vw,30px);
    margin:14px 0 4px; letter-spacing:-.01em;
  }
  p.sub{ margin:0 0 22px; color:var(--ink-3); font-size:14px; }
  label{ display:block; font-size:12px; font-weight:600; letter-spacing:.04em;
    text-transform:uppercase; color:var(--ink-2); margin:0 0 6px; }
  .field{ margin-bottom:16px; }
  input{
    width:100%; font-size:16px; /* 16px avoids iOS zoom-on-focus */
    font-family:var(--sans); color:var(--ink); background:var(--paper);
    border:1px solid var(--rule); border-radius:9px; padding:13px 14px; outline:none;
    -webkit-appearance:none; appearance:none;
  }
  input:focus{ border-color:var(--spot); box-shadow:0 0 0 3px color-mix(in srgb, var(--spot) 22%, transparent); }
  button{
    width:100%; margin-top:6px; font-family:var(--sans); font-size:16px; font-weight:600;
    color:var(--on-spot); background:var(--spot); border:0; border-radius:9px;
    padding:14px 16px; cursor:pointer; min-height:48px; /* comfortable tap target */
  }
  button:hover{ background:var(--spot-2); }
  button:active{ transform:translateY(1px); }
  .error{ color:var(--bad); font-size:13.5px; margin:0 0 16px; font-weight:600; }
  @media (max-width:420px){
    .card{ border-radius:12px; }
  }
</style>
</head>
<body>
  <form class="card" method="POST" action="/login" autocomplete="on">
    <div class="lock" aria-hidden="true">🔒</div>
    <h1>memex</h1>
    <p class="sub">Private. Please sign in to continue.</p>
    ${error ? '<p class="error" role="alert">Wrong username or password.</p>' : ''}
    <input type="hidden" name="next" value="${escapeHtml(next)}">
    <div class="field">
      <label for="u">Username</label>
      <input id="u" name="username" type="text" autocapitalize="none" autocorrect="off"
             spellcheck="false" autocomplete="username" required autofocus>
    </div>
    <div class="field">
      <label for="p">Password</label>
      <input id="p" name="password" type="password" autocomplete="current-password" required>
    </div>
    <button type="submit">Log in</button>
  </form>
</body>
</html>`;
}

function configHelpPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Setup needed — memex</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#17191c;color:#e8e5de;font-family:system-ui,Segoe UI,Arial,sans-serif;padding:24px}
  .box{max-width:440px}
  h1{font-size:20px;margin:0 0 10px}
  p{color:#aca89f;line-height:1.5;font-size:14px}
  code{background:#23262b;padding:2px 6px;border-radius:5px;font-size:13px}
</style>
</head>
<body>
  <div class="box">
    <h1>🔧 Login isn't configured yet</h1>
    <p>Set <code>AUTH_USER</code>, <code>AUTH_PASS</code>, and <code>AUTH_SECRET</code> in
    Vercel → Project → Settings → Environment Variables, then redeploy. See the README.</p>
  </div>
</body>
</html>`;
}
