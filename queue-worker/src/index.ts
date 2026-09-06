/**
 * Oven Queue - a one-file virtual line for a bakery with two ovens.
 *
 * Everything lives in a single Durable Object ("Queue") so there is exactly one
 * authoritative line, no matter which edge location a customer hits.
 */
import { renderAdmin, renderLogin } from './admin';
import { renderPage } from './page';

export interface Env {
  QUEUE: DurableObjectNamespace;
  /** Public Venmo link rendered as a button on the customer page. */
  VENMO_URL: string;
  /** Admin login name. Defaults to "me". */
  ADMIN_USER?: string;
  /** Admin password. Defaults to "me" - override it with a real secret. */
  ADMIN_PASSWORD?: string;
  /** Optional shared key so /admin?key=… keeps working without logging in. */
  ADMIN_KEY?: string;
}

/** Tickets stop being issued once this many have gone out. */
const MAX_TICKETS = 200;
/** Out of the box the head of the line moves forward one ticket per minute. */
const DEFAULT_INTERVAL_MS = 60_000;
/** Bounds for the admin-adjustable pace: 5 seconds to 1 hour per ticket. */
const MIN_INTERVAL_MS = 5_000;
const MAX_INTERVAL_MS = 3_600_000;
/** Single named instance - one bakery, one line. */
const QUEUE_INSTANCE = 'global';
/** Admin login defaults, used when the env vars aren't set. */
const DEFAULT_ADMIN_USER = 'me';
const DEFAULT_ADMIN_PASSWORD = 'me';
/** Admin session cookie, and how long a login lasts. */
const SESSION_COOKIE = 'oq_admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type Oven = 'front' | 'back';

/** Odd tickets bake at the front oven, even tickets at the back. */
function ovenFor(ticket: number): Oven {
  return ticket % 2 === 1 ? 'front' : 'back';
}

export class Queue implements DurableObject {
  /** How many tickets have been handed out; the highest ticket number. */
  private issued = 0;
  /** The ticket being served right now. Customers wait while ticket > head. */
  private head = 0;
  /** When head last moved, used to derive the elapsed whole intervals. */
  private lastAdvance = Date.now();
  /** How long one ticket takes. Adjustable from /admin. */
  private intervalMs = DEFAULT_INTERVAL_MS;
  /** ticket -> oven, so a ticket keeps its oven even if the rule ever changes. */
  private ovens = new Map<number, Oven>();
  /** Live admin sessions: opaque token -> expiry timestamp. */
  private sessions = new Map<string, number>();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    // No request is delivered until this finishes, so handlers can read state directly.
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<unknown>([
        'issued',
        'head',
        'lastAdvance',
        'intervalMs',
        'ovens',
        'sessions',
      ]);
      this.issued = (stored.get('issued') as number) ?? 0;
      this.head = (stored.get('head') as number) ?? 0;
      this.lastAdvance = (stored.get('lastAdvance') as number) ?? Date.now();
      this.intervalMs = (stored.get('intervalMs') as number) ?? DEFAULT_INTERVAL_MS;
      const ovens = (stored.get('ovens') as Record<string, Oven> | undefined) ?? {};
      this.ovens = new Map(Object.entries(ovens).map(([ticket, oven]) => [Number(ticket), oven]));
      const sessions = (stored.get('sessions') as Record<string, number> | undefined) ?? {};
      this.sessions = new Map(Object.entries(sessions));
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Every request first catches the line up to wall-clock time.
    await this.advanceHead();

    const path = url.pathname.replace(/\/+$/, '') || '/';
    switch (path) {
      case '/':
        return this.method(request, 'GET') ?? this.page();
      case '/join':
        return this.method(request, 'POST') ?? (await this.join());
      case '/status':
        return this.method(request, 'GET') ?? this.status(url.searchParams.get('ticket'));
      case '/admin':
        return this.method(request, 'GET') ?? this.admin(request, url);
      case '/admin/login':
        return this.method(request, 'POST') ?? (await this.login(request, url));
      case '/admin/logout':
        return this.method(request, 'POST') ?? (await this.logout(request, url));
      case '/admin/advance':
        return this.method(request, 'POST') ?? (await this.adminMutate(request, url, 'advance'));
      case '/admin/reset':
        return this.method(request, 'POST') ?? (await this.adminMutate(request, url, 'reset'));
      case '/admin/pace':
        return this.method(request, 'POST') ?? (await this.adminPace(request, url));
      default:
        return json({ error: 'not found' }, 404);
    }
  }

  /** Returns a 405 when the method is wrong, or null to let the handler run. */
  private method(request: Request, allowed: 'GET' | 'POST'): Response | null {
    if (request.method === allowed) return null;
    if (allowed === 'GET' && request.method === 'HEAD') return null;
    return json({ error: 'method not allowed' }, 405, { Allow: allowed });
  }

  /**
   * Move head forward by the whole intervals elapsed since it last moved,
   * capped at the number of tickets issued so the line never gets ahead of
   * itself.
   */
  private async advanceHead(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastAdvance;
    if (elapsed < this.intervalMs) return;

    const steps = Math.floor(elapsed / this.intervalMs);
    const next = Math.min(this.issued, this.head + steps);
    this.head = next;
    // When the line is fully caught up, restart the clock instead of banking
    // credit that would instantly skip whoever joins next.
    this.lastAdvance = next >= this.issued ? now : this.lastAdvance + steps * this.intervalMs;
    await this.state.storage.put({ head: this.head, lastAdvance: this.lastAdvance });
  }

  // --- customer routes -----------------------------------------------------

  private page(): Response {
    return new Response(renderPage(this.env.VENMO_URL ?? ''), {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  private async join(): Promise<Response> {
    if (this.issued >= MAX_TICKETS) {
      return json({ error: 'queue is full', full: true }, 409);
    }
    const ticket = this.issued + 1;
    const oven = ovenFor(ticket);
    this.issued = ticket;
    this.ovens.set(ticket, oven);
    await this.state.storage.put({ issued: this.issued, ovens: this.ovensRecord() });
    return json({ ticket, oven });
  }

  private status(raw: string | null): Response {
    const ticket = Number(raw);
    if (!raw || !Number.isInteger(ticket) || ticket < 1) {
      return json({ error: 'ticket must be a positive integer' }, 400);
    }
    const oven = this.ovens.get(ticket);
    if (!oven) {
      // Never issued, or wiped by a reset - the page treats this as "get a new ticket".
      return json({ error: 'unknown ticket', ticket }, 404);
    }
    const position = Math.max(0, ticket - this.head);
    return json({
      ticket,
      head: this.head,
      position,
      oven,
      full: this.issued >= MAX_TICKETS,
      // Extras the page uses for the wait estimate.
      intervalSeconds: this.intervalMs / 1000,
      waitSeconds: Math.round((position * this.intervalMs) / 1000),
    });
  }

  // --- admin ---------------------------------------------------------------

  private admin(request: Request, url: URL): Response {
    if (!this.authorized(request, url)) {
      return html(renderLogin(url.searchParams.get('error') === '1'), 401);
    }
    // Preserve ?key= mode so its buttons keep authenticating the same way.
    const key = this.keyFrom(url) ? url.searchParams.get('key') : null;
    return html(renderAdmin(this.adminState(), key));
  }

  private async login(request: Request, url: URL): Promise<Response> {
    const form = await request.formData().catch(() => null);
    const user = String(form?.get('user') ?? '');
    const password = String(form?.get('password') ?? '');
    const expectedUser = this.env.ADMIN_USER ?? DEFAULT_ADMIN_USER;
    const expectedPassword = this.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;

    if (!constantTimeEqual(user, expectedUser) || !constantTimeEqual(password, expectedPassword)) {
      return redirect(new URL('/admin?error=1', url), {});
    }

    const token = newToken();
    const now = Date.now();
    this.sessions.set(token, now + SESSION_TTL_MS);
    for (const [existing, expires] of this.sessions) {
      if (expires <= now) this.sessions.delete(existing);
    }
    await this.state.storage.put({ sessions: Object.fromEntries(this.sessions) });

    return redirect(new URL('/admin', url), {
      'set-cookie': cookie(token, url, SESSION_TTL_MS / 1000),
    });
  }

  private async logout(request: Request, url: URL): Promise<Response> {
    const token = readCookie(request, SESSION_COOKIE);
    if (token && this.sessions.delete(token)) {
      await this.state.storage.put({ sessions: Object.fromEntries(this.sessions) });
    }
    return redirect(new URL('/admin', url), { 'set-cookie': cookie('', url, 0) });
  }

  private async adminMutate(request: Request, url: URL, action: 'advance' | 'reset'): Promise<Response> {
    if (!this.authorized(request, url)) return json({ error: 'forbidden' }, 403);

    if (action === 'advance') {
      this.head = Math.min(this.issued, this.head + 1);
      // Serving someone by hand restarts the clock.
      this.lastAdvance = Date.now();
      await this.state.storage.put({ head: this.head, lastAdvance: this.lastAdvance });
    } else {
      // A reset clears the line but keeps the pace the staff dialled in.
      this.issued = 0;
      this.head = 0;
      this.lastAdvance = Date.now();
      this.ovens.clear();
      await this.state.storage.put({
        issued: 0,
        head: 0,
        lastAdvance: this.lastAdvance,
        ovens: {},
      });
    }
    return json(this.adminState());
  }

  /** POST /admin/pace?seconds=N - how long each ticket takes. */
  private async adminPace(request: Request, url: URL): Promise<Response> {
    if (!this.authorized(request, url)) return json({ error: 'forbidden' }, 403);

    const raw = url.searchParams.get('seconds');
    const seconds = Number(raw);
    if (!raw || !Number.isFinite(seconds)) {
      return json({ error: 'seconds must be a number' }, 400);
    }
    const ms = Math.round(seconds * 1000);
    if (ms < MIN_INTERVAL_MS || ms > MAX_INTERVAL_MS) {
      return json(
        { error: `seconds must be between ${MIN_INTERVAL_MS / 1000} and ${MAX_INTERVAL_MS / 1000}` },
        400,
      );
    }

    this.intervalMs = ms;
    // Time the new pace from now, so a change doesn't retroactively move head.
    this.lastAdvance = Date.now();
    await this.state.storage.put({ intervalMs: this.intervalMs, lastAdvance: this.lastAdvance });
    return json(this.adminState());
  }

  /** A valid session cookie, or the shared key when one is configured. */
  private authorized(request: Request, url: URL): boolean {
    if (this.keyFrom(url)) return true;
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) return false;
    const expires = this.sessions.get(token);
    return expires !== undefined && expires > Date.now();
  }

  private keyFrom(url: URL): boolean {
    const expected = this.env.ADMIN_KEY;
    const provided = url.searchParams.get('key');
    return !!expected && !!provided && constantTimeEqual(provided, expected);
  }

  private adminState() {
    return {
      head: this.head,
      issued: this.issued,
      full: this.issued >= MAX_TICKETS,
      intervalSeconds: this.intervalMs / 1000,
      minSeconds: MIN_INTERVAL_MS / 1000,
      maxSeconds: MAX_INTERVAL_MS / 1000,
    };
  }

  private ovensRecord(): Record<string, Oven> {
    const record: Record<string, Oven> = {};
    for (const [ticket, oven] of this.ovens) record[String(ticket)] = oven;
    return record;
  }
}

// --- helpers ---------------------------------------------------------------

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
}

function redirect(to: URL, headers: Record<string, string>): Response {
  return new Response(null, {
    status: 303,
    headers: { location: to.pathname + to.search, 'cache-control': 'no-store', ...headers },
  });
}

function cookie(token: string, url: URL, maxAgeSeconds: number): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeSeconds)}`,
  ];
  // Skip Secure on plain-http local dev so `wrangler dev` can log in too.
  if (url.protocol === 'https:') parts.push('Secure');
  return parts.join('; ');
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    if (pair.slice(0, eq).trim() === name) return pair.slice(eq + 1).trim();
  }
  return null;
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compares without leaking the answer through how long it took. */
function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    // One line for everyone, so every request goes to the same instance.
    const id = env.QUEUE.idFromName(QUEUE_INSTANCE);
    return env.QUEUE.get(id).fetch(request);
  },
} satisfies ExportedHandler<Env>;
