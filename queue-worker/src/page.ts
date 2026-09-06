/**
 * The customer-facing page, served inline from GET /.
 *
 * The only thing injected server-side is VENMO_URL, so the rest of this file
 * is a plain string and can be edited like normal HTML.
 */
export function renderPage(venmoUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1b1210">
<title>Oven Queue</title>
<style>
  :root {
    --bg: #1b1210;
    --card: #2a1d19;
    --ink: #fff6ef;
    --muted: #c8a99a;
    --front: #ffb703;
    --back: #7bd0ff;
    --venmo: #008cff;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin: 0; padding: 0; }
  body {
    min-height: 100dvh;
    background: var(--bg);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 20px calc(24px + env(safe-area-inset-bottom));
    text-align: center;
  }
  main { width: 100%; max-width: 34rem; }
  .eyebrow {
    font-size: 1rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 0 0 0.75rem;
  }
  .place {
    font-size: clamp(3rem, 18vw, 6.5rem);
    font-weight: 800;
    line-height: 1.02;
    margin: 0;
    letter-spacing: -0.02em;
  }
  .place small { display: block; font-size: 0.3em; font-weight: 600; letter-spacing: 0.06em; color: var(--muted); margin-top: 0.6em; }
  .oven {
    margin: 1.5rem 0 0;
    padding: 1.1rem 1rem;
    border-radius: 1.25rem;
    background: var(--card);
    font-size: clamp(1.5rem, 7vw, 2.25rem);
    font-weight: 700;
    line-height: 1.2;
  }
  .oven[data-oven="front"] { color: var(--front); }
  .oven[data-oven="back"] { color: var(--back); }
  .oven[hidden] { display: none; }
  .meta { margin: 1.25rem 0 0; font-size: 1.05rem; color: var(--muted); line-height: 1.5; }
  .venmo {
    display: block;
    margin: 2rem auto 0;
    padding: 1.15rem 1.5rem;
    border-radius: 999px;
    background: var(--venmo);
    color: #fff;
    font-size: 1.35rem;
    font-weight: 700;
    text-decoration: none;
  }
  .venmo:active { transform: scale(0.98); }
  .warn { color: #ff9b8a; }
  .admin {
    position: fixed;
    top: calc(0.75rem + env(safe-area-inset-top));
    right: calc(0.75rem + env(safe-area-inset-right));
    padding: 0.55rem 0.95rem;
    border: 1px solid rgba(255, 246, 239, 0.2);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.25);
    color: var(--muted);
    font-size: 0.95rem;
    font-weight: 600;
    text-decoration: none;
  }
  .admin:active { transform: scale(0.97); }
</style>
</head>
<body>
<a class="admin" href="/admin">Admin</a>
<main>
  <p class="eyebrow" id="eyebrow">Bread line</p>
  <h1 class="place" id="place">Getting your spot&hellip;</h1>
  <p class="oven" id="oven" hidden></p>
  <p class="meta" id="meta"></p>
  <a class="venmo" id="venmo" href="${escapeAttr(venmoUrl)}" rel="noopener">Pay with Venmo</a>
</main>
<script>
(function () {
  var STORAGE_KEY = 'oven-queue-ticket';
  var POLL_MS = 5000;
  var ticket = null;

  var eyebrow = document.getElementById('eyebrow');
  var place = document.getElementById('place');
  var oven = document.getElementById('oven');
  var meta = document.getElementById('meta');

  function render(s) {
    eyebrow.textContent = 'Ticket #' + s.ticket;
    if (s.position > 0) {
      place.innerHTML = 'You are #' + s.position + '<small>in line</small>';
    } else {
      place.innerHTML = "It's your turn!<small>ticket #" + s.ticket + '</small>';
    }
    oven.hidden = false;
    oven.setAttribute('data-oven', s.oven);
    oven.textContent = 'Go to the ' + s.oven.toUpperCase() + ' oven';
    meta.classList.remove('warn');
    meta.textContent = 'Now serving #' + s.head + '. ' + wait(s) + ' This page updates itself.';
  }

  function wait(s) {
    if (s.position <= 0) return 'Head to the counter.';
    if (typeof s.waitSeconds !== 'number') return '';
    if (s.waitSeconds < 60) return 'Less than a minute.';
    return 'About ' + Math.round(s.waitSeconds / 60) + ' min.';
  }

  function message(headline, note, isWarning) {
    place.textContent = headline;
    oven.hidden = true;
    meta.textContent = note || '';
    meta.classList.toggle('warn', !!isWarning);
  }

  function join() {
    return fetch('/join', { method: 'POST' }).then(function (r) {
      if (r.status === 409) {
        eyebrow.textContent = 'Bread line';
        message('Line is full', 'All 200 tickets are issued. Please check back later.', true);
        return null;
      }
      if (!r.ok) throw new Error('join failed: ' + r.status);
      return r.json().then(function (d) {
        ticket = d.ticket;
        try { localStorage.setItem(STORAGE_KEY, String(ticket)); } catch (e) {}
        return refresh();
      });
    });
  }

  function refresh() {
    // No ticket yet (first visit, or the line was full last time) - try to join.
    if (ticket === null) return join();
    return fetch('/status?ticket=' + ticket).then(function (r) {
      if (r.status === 404) {
        // The queue was reset (or this ticket was never issued) - get a new one.
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
        ticket = null;
        return join();
      }
      if (!r.ok) throw new Error('status failed: ' + r.status);
      return r.json().then(render);
    });
  }

  function boot() {
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored && /^[0-9]+$/.test(stored)) ticket = parseInt(stored, 10);
    refresh().catch(function () {
      message('Connection hiccup', 'Retrying in a few seconds\\u2026', true);
    });
    setInterval(function () {
      refresh().catch(function () {
        meta.classList.add('warn');
        meta.textContent = 'Offline - retrying\\u2026';
      });
    }, POLL_MS);
  }

  boot();
})();
</script>
</body>
</html>
`;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
