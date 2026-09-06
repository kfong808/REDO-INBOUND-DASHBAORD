/**
 * The staff pages, served inline from /admin.
 *
 * Two views: a login form, and the dashboard once a session cookie is set.
 */
export interface AdminState {
  head: number;
  issued: number;
  full: boolean;
  intervalSeconds: number;
  minSeconds: number;
  maxSeconds: number;
}

const SHELL_STYLES = `
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0;
    min-height: 100dvh;
    background: #10151b;
    color: #eef4fa;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 20px calc(24px + env(safe-area-inset-bottom));
    text-align: center;
  }
  main { width: 100%; max-width: 30rem; }
  h1 { font-size: 1rem; letter-spacing: 0.18em; text-transform: uppercase; color: #8fa5ba; margin: 0 0 1.5rem; }
  button {
    width: 100%;
    padding: 1.15rem 1.5rem;
    border: 0;
    border-radius: 999px;
    font-family: inherit;
    font-size: 1.3rem;
    font-weight: 700;
    color: #08121c;
    background: #6fe3a1;
  }
  button:active { transform: scale(0.98); }
  input {
    width: 100%;
    padding: 1rem 1.15rem;
    border: 2px solid #2c3a4a;
    border-radius: 1rem;
    background: #0b1016;
    color: #eef4fa;
    font-family: inherit;
    font-size: 1.3rem;
    text-align: center;
  }
  input:focus { outline: none; border-color: #6fe3a1; }
  label { display: block; font-size: 0.95rem; letter-spacing: 0.08em; text-transform: uppercase; color: #8fa5ba; margin: 0 0 0.5rem; }
  p.note { margin: 1.5rem 0 0; font-size: 1rem; color: #8fa5ba; line-height: 1.5; }
  p.note.bad { color: #ffab8f; }
  a.back { display: inline-block; margin-top: 1.5rem; color: #8fa5ba; font-size: 1rem; }
`;

export function renderLogin(failed: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Oven Queue &middot; Admin login</title>
<style>${SHELL_STYLES}
  form { display: grid; gap: 1rem; }
</style>
</head>
<body>
<main>
  <h1>Admin login</h1>
  <form method="post" action="/admin/login">
    <div>
      <label for="user">User</label>
      <input id="user" name="user" autocomplete="username" autocapitalize="none" autocorrect="off" required>
    </div>
    <div>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
    </div>
    <button type="submit">Log in</button>
  </form>
  ${failed ? '<p class="note bad">Wrong user or password.</p>' : ''}
  <a class="back" href="/">&larr; Back to the line</a>
</main>
</body>
</html>
`;
}

export function renderAdmin(state: AdminState, key: string | null): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Oven Queue &middot; Admin</title>
<style>${SHELL_STYLES}
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .stat { background: #1a2330; border-radius: 1.25rem; padding: 1.25rem 1rem; }
  .stat b { display: block; font-size: clamp(2.5rem, 14vw, 4rem); font-weight: 800; line-height: 1; }
  .stat span { display: block; margin-top: 0.5rem; font-size: 0.95rem; letter-spacing: 0.08em; text-transform: uppercase; color: #8fa5ba; }
  .panel { margin-top: 0.75rem; background: #1a2330; border-radius: 1.25rem; padding: 1.25rem 1rem; }
  .pace { display: grid; grid-template-columns: 1fr auto; gap: 0.6rem; }
  .pace button { width: auto; padding: 1rem 1.5rem; font-size: 1.1rem; }
  .presets { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
  .presets button {
    padding: 0.7rem 0.5rem;
    font-size: 1rem;
    font-weight: 600;
    color: #cfe0ef;
    background: #26323f;
  }
  button.advance { margin-top: 0.75rem; }
  button.reset { margin-top: 0.75rem; background: #33404f; color: #eef4fa; }
  form.logout { margin-top: 0.75rem; }
  form.logout button { background: none; color: #8fa5ba; font-size: 1rem; font-weight: 600; padding: 0.75rem; }
</style>
</head>
<body>
<main>
  <h1>Oven Queue admin</h1>
  <div class="grid">
    <div class="stat"><b id="head">${state.head}</b><span>Now serving</span></div>
    <div class="stat"><b id="issued">${state.issued}</b><span>Issued</span></div>
  </div>

  <div class="panel">
    <label for="seconds">Seconds per customer</label>
    <div class="pace">
      <input id="seconds" type="number" inputmode="numeric" min="${state.minSeconds}" max="${state.maxSeconds}"
             step="1" value="${state.intervalSeconds}">
      <button id="save" type="button">Save</button>
    </div>
    <div class="presets">
      <button type="button" data-seconds="30">30s</button>
      <button type="button" data-seconds="60">1 min</button>
      <button type="button" data-seconds="120">2 min</button>
      <button type="button" data-seconds="300">5 min</button>
    </div>
  </div>

  <button id="advance" class="advance" type="button">Advance head +1</button>
  <button id="reset" class="reset" type="button">Reset queue</button>
  <form class="logout" method="post" action="/admin/logout${key ? '?key=' + encodeURIComponent(key) : ''}">
    <button type="submit">Log out</button>
  </form>

  <p class="note" id="note"></p>
</main>
<script>
(function () {
  var KEY = ${JSON.stringify(key)};
  var note = document.getElementById('note');
  var seconds = document.getElementById('seconds');

  function url(path, params) {
    var query = new URLSearchParams(params || {});
    if (KEY) query.set('key', KEY);
    var qs = query.toString();
    return path + (qs ? '?' + qs : '');
  }

  function describe(state) {
    document.getElementById('head').textContent = state.head;
    document.getElementById('issued').textContent = state.issued;
    if (document.activeElement !== seconds) seconds.value = state.intervalSeconds;
    note.classList.toggle('bad', !!state.full);
    note.textContent = state.full
      ? 'Line is full - /join is returning 409.'
      : 'Head advances on its own, 1 every ' + state.intervalSeconds + 's.';
  }

  function post(path, params, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    fetch(url(path, params), { method: 'POST', credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 403) {
          window.location.href = '/admin';
          return null;
        }
        return r.json().then(function (body) {
          if (!r.ok) throw new Error(body.error || 'request failed: ' + r.status);
          return body;
        });
      })
      .then(function (state) {
        if (state) describe(state);
      })
      .catch(function (e) {
        note.classList.add('bad');
        note.textContent = String(e.message || e);
      });
  }

  function savePace(value) {
    seconds.value = value;
    post('/admin/pace', { seconds: value });
  }

  document.getElementById('save').addEventListener('click', function () {
    savePace(seconds.value);
  });
  seconds.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') savePace(seconds.value);
  });
  Array.prototype.forEach.call(document.querySelectorAll('.presets button'), function (b) {
    b.addEventListener('click', function () {
      savePace(b.getAttribute('data-seconds'));
    });
  });
  document.getElementById('advance').addEventListener('click', function () {
    post('/admin/advance');
  });
  document.getElementById('reset').addEventListener('click', function () {
    post('/admin/reset', null, 'Reset the queue? Everyone in line loses their spot.');
  });

  describe(${JSON.stringify({
    head: state.head,
    issued: state.issued,
    full: state.full,
    intervalSeconds: state.intervalSeconds,
  })});
})();
</script>
</body>
</html>
`;
}
