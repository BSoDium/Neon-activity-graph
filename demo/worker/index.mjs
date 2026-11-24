// The demo's proxy (a Cloudflare Worker): GitHub's contribution calendar and WakaTime's public days send no CORS headers, so a page on another origin cannot read them. This reads them server-side, with the same parsers as the
// scheduled workflow, and answers in the package's data format, to the demo's origin only.
//
//   GET /?github=<login>&wakatime=<user>  (either, or both; at least one)  ->  200 activity.json | 400 bad or missing name | 404 unknown GitHub user, or a WakaTime profile that is private or missing when it is the only source | 502 upstream failed | 429 rate-limited
//   With both names, a WakaTime failure is not an error: GitHub is drawn alone (`wakatime: "unavailable"`). With WakaTime alone it is one. The demo asks for each source in its own request, so each has its own state.
//
// Public data only; nothing is stored or logged by this code. Answers are cached an hour at the edge (one upstream call per name and hour): the Cache API below on a custom domain or route, and the upstream
// fetches' own edge cache (`cacheEverything`) everywhere, `*.workers.dev` included, where the Cache API does nothing.
import { buildActivity, githubUrl, parseGithubCalendar, parseWakatimeDays, validGithubLogin, validWakatimeUser, wakatimeUrl } from "../shared/activity.mjs";

const DEFAULT_ORIGINS = ["https://neon.bsodium.fr", "http://localhost:5189"];
const TTL = 3600;
const TIMEOUT_MS = 6000;

const json = (body, status, origin, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": origin ?? "null", vary: "Origin", "access-control-expose-headers": "retry-after", ...extra },
  });

async function upstream(url) {
  return fetch(url, { headers: { "user-agent": "neon-activity-graph-demo" }, signal: AbortSignal.timeout(TIMEOUT_MS), cf: { cacheTtl: TTL, cacheEverything: true } });
}

/** WakaTime's days, or null (private, missing, unreadable or slow). `status` tells which, for a WakaTime-only answer. */
async function wakatimeDays(user) {
  try {
    const res = await upstream(wakatimeUrl(user));
    if (res.status === 401 || res.status === 403 || res.status === 404) return { days: null, status: 404 };
    if (!res.ok) return { days: null, status: 502 };
    const days = parseWakatimeDays(await res.json());
    return days.length > 30 ? { days } : { days: null, status: 404 };
  } catch {
    return { days: null, status: 502 };
  }
}

/** At least one of `github` and `wakatime`. With both, a WakaTime failure leaves GitHub drawn alone (`wakatime: "unavailable"` in the answer says so); WakaTime alone is an error when it fails. */
export async function activityFor(github, wakatime) {
  if (!github) {
    const { days, status } = await wakatimeDays(wakatime);
    if (!days) return { status, body: { error: status === 404 ? "wakatime profile is private or missing" : "wakatime not readable" } };
    return { status: 200, body: buildActivity(null, days) };
  }
  const gh = await upstream(githubUrl(github));
  if (gh.status === 404) return { status: 404, body: { error: "github user not found" } };
  if (!gh.ok) return { status: 502, body: { error: `github answered ${gh.status}` } };
  const top = parseGithubCalendar(await gh.text());
  if (top.length < 300) return { status: 502, body: { error: "github calendar not readable" } };

  const bottom = wakatime ? (await wakatimeDays(wakatime)).days : null;
  const body = buildActivity(top, bottom);
  if (wakatime && !bottom) body.wakatime = "unavailable";
  return { status: 200, body };
}

export default {
  async fetch(request, env, ctx) {
    const allowed = (env?.ALLOWED_ORIGINS ? String(env.ALLOWED_ORIGINS).split(",").map((s) => s.trim()) : DEFAULT_ORIGINS);
    const origin = request.headers.get("origin");
    const ok = origin && allowed.includes(origin) ? origin : null;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": ok ?? "null", "access-control-allow-methods": "GET", "access-control-max-age": "86400", vary: "Origin" } });
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405, ok);
    if (!ok) return json({ error: "origin not allowed" }, 403, null);

    const url = new URL(request.url);
    const github = url.searchParams.get("github")?.trim() || null;
    const wakatime = url.searchParams.get("wakatime")?.trim() || null;
    if (!github && !wakatime) return json({ error: "give a github or a wakatime username" }, 400, ok);
    if ((github && !validGithubLogin(github)) || (wakatime && !validWakatimeUser(wakatime))) return json({ error: "invalid username" }, 400, ok);

    // (per-IP limit, if the deployment binds one: see wrangler.toml)
    if (env?.LIMITER) {
      const { success } = await env.LIMITER.limit({ key: request.headers.get("cf-connecting-ip") ?? "anon" });
      if (!success) return json({ error: "rate limited, try again in a minute" }, 429, ok, { "retry-after": "60" });
    }

    // (the cache key has no Origin in it: the answer is the same for everybody, the CORS header is set on the way out)
    const cache = globalThis.caches?.default;
    const key = new Request(`https://cache.invalid/?github=${(github ?? "").toLowerCase()}&wakatime=${(wakatime ?? "").toLowerCase()}`);
    const hit = await cache?.match(key);
    if (hit) return json(await hit.json(), 200, ok, { "cache-control": `public, max-age=${TTL}` });

    let result;
    try {
      result = await activityFor(github, wakatime);
    } catch {
      return json({ error: "could not reach the data sources" }, 502, ok);
    }
    if (result.status === 200 && cache) ctx.waitUntil(cache.put(key, new Response(JSON.stringify(result.body), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${TTL}` } })));
    return json(result.body, result.status, ok, result.status === 200 ? { "cache-control": `public, max-age=${TTL}` } : {});
  },
};
