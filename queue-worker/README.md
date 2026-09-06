# Oven Queue

A single Cloudflare Worker that runs a virtual line for a bakery with two ovens.
Customers scan a QR code, get a ticket, and see their spot in line and which
oven to walk to. One Durable Object (`Queue`) holds the whole line, so there is
one authoritative answer no matter which edge location a phone hits.

```
queue-worker/
├── src/
│   ├── index.ts   Worker entry + the Queue Durable Object (all the logic)
│   ├── page.ts    the customer page (inline HTML/CSS/JS)
│   └── admin.ts   the staff page (inline HTML/CSS/JS)
├── wrangler.toml
└── README.md
```

## How the line works

State inside the Durable Object:

| field         | meaning                                                            |
| ------------- | ------------------------------------------------------------------ |
| `issued`      | how many tickets have gone out (the highest ticket number)         |
| `head`        | the ticket being served right now                                  |
| `lastAdvance` | when `head` last moved                                             |
| `ovens`       | a map of `ticket -> oven`                                          |
| `intervalMs`  | how long one ticket takes; 60000 by default, adjustable in `/admin` |
| `sessions`    | live admin login tokens                                            |

On **every** request the Worker first moves the line forward by
`floor((now - lastAdvance) / intervalMs)` — one ticket per whole interval
elapsed — capped at `issued`, then updates `lastAdvance`. So the line drains on
its own at one customer per minute without needing a cron or an alarm. When
`head` catches up to `issued`, `lastAdvance` is reset to now rather than banking
credit, so the next person to join doesn't get instantly skipped.

**Pace:** staff can change the seconds-per-customer from the admin page
(5 s – 3600 s). Changing it re-times the clock from that moment, so it never
retroactively jumps the line. A reset keeps the pace you dialled in.

**Oven assignment:** odd tickets → `front`, even tickets → `back`. The mapping
is also stored per ticket, so a ticket keeps the oven it was given.

**Cap:** 200 tickets. After that `POST /join` returns `409`.

## Routes

| Route                        | Response                                                                 |
| ---------------------------- | ------------------------------------------------------------------------ |
| `GET /`                      | the customer page (inline HTML)                                          |
| `POST /join`                 | `{ticket, oven}` — or `409 {error, full: true}` when `issued >= 200`     |
| `GET /status?ticket=N`       | `{ticket, head, position, oven, full}` — `404` if the ticket isn't issued |
| `GET /admin`                 | staff dashboard, or the login form when there's no session               |
| `POST /admin/login`          | form post (`user`, `password`) → session cookie                          |
| `POST /admin/logout`         | clears the session cookie                                                |
| `POST /admin/advance`        | moves `head` forward by 1 (capped at `issued`)                           |
| `POST /admin/reset`          | clears the line back to zero                                             |
| `POST /admin/pace?seconds=N` | sets seconds per customer (5–3600)                                       |

`position` is `max(0, ticket - head)`; `0` means it's your turn. `/status` also
returns `intervalSeconds` and `waitSeconds` so the page can show an estimate. A
`404` from `/status` is what the page uses to notice a reset and grab a fresh
ticket. The three admin POSTs return `{head, issued, full, intervalSeconds,
minSeconds, maxSeconds}`, or `403` without a session. Advancing `head` by hand
also restarts the interval clock.

The customer page reads its ticket from `localStorage` (or calls `/join` if it
has none), shows **"You are #N in line"** and **"Go to the FRONT/BACK oven"**,
polls `/status` every 5 seconds, and shows a Venmo button. There's an **Admin**
button in the top-right corner. Text is sized for phones.

## Admin access

`GET /admin` shows a login form. The default credentials are user `me`,
password `me` — fine for a bake sale, but anyone who finds the URL can reset
your line, so override them before you use this anywhere that matters:

```sh
npx wrangler secret put ADMIN_USER
npx wrangler secret put ADMIN_PASSWORD
```

A successful login sets an `HttpOnly` session cookie that lasts 12 hours;
sessions are stored in the Durable Object and cleared by **Log out**.

If you'd rather use a bookmarkable link than a login, set `ADMIN_KEY` as well
and `/admin?key=SECRET` works without logging in (`ADMIN_KEY` is ignored when
unset).

## Configuration

| name             | kind   | where                                                      |
| ---------------- | ------ | ---------------------------------------------------------- |
| `VENMO_URL`      | var    | `[vars]` in `wrangler.toml` — edit it to your Venmo link   |
| `ADMIN_USER`     | secret | `wrangler secret put ADMIN_USER` — defaults to `me`        |
| `ADMIN_PASSWORD` | secret | `wrangler secret put ADMIN_PASSWORD` — defaults to `me`    |
| `ADMIN_KEY`      | secret | optional shared key for `/admin?key=…`                     |

Never put the password or key in `wrangler.toml` — that file is committed.

## Run it locally

```sh
cd queue-worker
npm install
npm run dev
```

Open http://127.0.0.1:8787/ and hit **Admin** in the top-right corner; log in
with `me` / `me`. To try other credentials locally, put them in `.dev.vars`
(gitignored):

```
ADMIN_USER=baker
ADMIN_PASSWORD=hot-cross-buns
```

## Deploy from your laptop

```sh
npx wrangler login
npx wrangler secret put ADMIN_PASSWORD   # don't ship the default
npm run deploy
```

The Worker URL it prints looks like
`https://oven-queue.<your-subdomain>.workers.dev`.

## Connect the GitHub repo to Cloudflare for auto-deploy

This sets up Workers Builds, which redeploys on every push.

1. Push this directory to GitHub (it lives in the `queue-worker/` subdirectory
   of the repo).
2. In the [Cloudflare dashboard](https://dash.cloudflare.com), go to
   **Compute (Workers)** → **Workers & Pages**.
3. Click **Create** → **Workers** → **Import a repository**. (If the Worker
   already exists from a manual `wrangler deploy`, open it instead and go to
   **Settings** → **Build** → **Connect** / **Manage repository**.)
4. Click **Connect GitHub**, authorize the Cloudflare Workers & Pages app, and
   pick this repository. You can grant access to just this one repo.
5. Choose the branch to deploy — `main` for production. Cloudflare builds other
   branches as preview deployments.
6. Set the build configuration:
   - **Root directory / project directory:** `queue-worker`
   - **Build command:** `npm install` (or leave the default)
   - **Deploy command:** `npx wrangler deploy`
   Wrangler reads `wrangler.toml`, so the Durable Object binding and migration
   are applied automatically.
7. Click **Create and deploy** and wait for the first build to go green.
8. Add the secrets, which are *not* read from the repo: open the Worker →
   **Settings** → **Variables and Secrets** → **Add**, type **Secret**, and add
   `ADMIN_USER` and `ADMIN_PASSWORD`, then **Deploy**. (Equivalently:
   `npx wrangler secret put ADMIN_PASSWORD` once from your laptop — secrets
   survive later deploys.) Skip this and the admin page stays on `me` / `me`.
9. Confirm auto-deploy: push a commit that touches `queue-worker/`, and watch
   the new build appear under the Worker's **Deployments** tab.

Notes:

- The first deploy creates the Durable Object via the `[[migrations]]` block. Do
  not rename or delete the `Queue` class without adding a new migration tag, or
  the deploy will fail.
- Durable Objects here are SQLite-backed (`new_sqlite_classes`), which works on
  the Workers free plan.
- Only pushes that change files under the root directory trigger a build, so
  unrelated commits in this repo are skipped.

## Generate a QR code for the Worker URL

Point the QR code at the Worker's root URL, e.g.
`https://oven-queue.<your-subdomain>.workers.dev/`.

**With npx (no install):**

```sh
npx qrcode "https://oven-queue.<your-subdomain>.workers.dev/" -o queue-qr.png -w 1200
```

**With `qrencode`:**

```sh
brew install qrencode        # or: sudo apt install qrencode
qrencode -o queue-qr.png -s 12 -m 2 "https://oven-queue.<your-subdomain>.workers.dev/"
```

**Without a terminal:** paste the URL into any QR generator (Cloudflare's
dashboard doesn't make one) and download the PNG or SVG.

Printing tips:

- Print at least 2 in / 5 cm wide so phones lock focus from a step back.
- Test the printed code with both an iPhone and an Android camera before the
  doors open.
- Keep the URL short — a `workers.dev` subdomain or a custom domain both stay
  well inside the size where a low-density, easy-to-scan code is generated.
- Print the URL in text under the code as a fallback for anyone whose camera
  won't cooperate.
