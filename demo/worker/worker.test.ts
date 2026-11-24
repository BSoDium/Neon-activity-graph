import { describe, expect, it, vi } from "vitest";
// @ts-expect-error (plain .mjs, no declarations)
import worker, { activityFor } from "./index.mjs";
// @ts-expect-error
import { buildActivity, parseGithubCalendar, parseWakatimeDays, validGithubLogin } from "../shared/activity.mjs";

const cal = (n: number) => {
  const cells = Array.from({ length: n }, (_, i) => {
    const date = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    return `<td id="c${i}" data-date="${date}" data-level="1"></td><tool-tip for="c${i}">${i % 3 === 0 ? "No" : i} contributions on x.</tool-tip>`;
  });
  return `<table>${cells.join("")}</table>`;
};
const origin = "https://neon.bsodium.fr";
const req = (qs: string, o: string | null = origin) => new Request(`https://p.example/?${qs}`, { headers: o ? { origin: o } : {} });

describe("shared parsers", () => {
  it("reads the calendar and the wakatime days", () => {
    const days = parseGithubCalendar(cal(10));
    expect(days).toHaveLength(10);
    expect(days[1].value).toBe(1);
    expect(parseWakatimeDays({ data: { days: [{ date: "2025-01-02", total: 7200 }, { date: "2025-01-01", total: 1800 }] } })).toEqual([{ date: "2025-01-01", value: 0.5 }, { date: "2025-01-02", value: 2 }]);
  });
  it("validates logins", () => {
    expect(validGithubLogin("BSoDium")).toBe(true);
    expect(validGithubLogin("a/b")).toBe(false);
    expect(validGithubLogin("-x")).toBe(false);
    expect(validGithubLogin("a".repeat(40))).toBe(false);
  });
  it("fills the lower layer with zeros when there is no wakatime", () => {
    const a = buildActivity([{ date: "2025-01-01", value: 3 }], null);
    expect(a.bottom.days).toEqual([{ date: "2025-01-01", value: 0 }]);
  });
});

describe("proxy", () => {
  it("rejects other origins and bad names", async () => {
    expect((await worker.fetch(req("github=x", "https://evil.example"), {}, {})).status).toBe(403);
    expect((await worker.fetch(req("github=a/b"), {}, {})).status).toBe(400);
    expect((await worker.fetch(req("github=ok&wakatime=a b"), {}, {})).status).toBe(400);
  });
  it("answers with CORS for the demo origin", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (u.includes("github.com") ? new Response(cal(320)) : new Response("nope", { status: 403 }))));
    const res = await worker.fetch(req("github=octocat&wakatime=someone"), {}, { waitUntil() {} });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(origin);
    const body = await res.json();
    expect(body.top.days).toHaveLength(320);
    expect(body.wakatime).toBe("unavailable");
    vi.unstubAllGlobals();
  });
  it("asks for at least one name", async () => {
    expect((await worker.fetch(req(""), {}, {})).status).toBe(400);
    expect((await worker.fetch(req("github=&wakatime="), {}, {})).status).toBe(400);
  });
  it("answers a WakaTime-only lookup with the top layer flat", async () => {
    const days = Array.from({ length: 40 }, (_, i) => ({ date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10), total: 3600 * (i % 4) }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { days } }))));
    const res = await worker.fetch(req("wakatime=someone"), {}, { waitUntil() {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bottom.days).toHaveLength(40);
    expect(body.bottom.days[3].value).toBe(3);
    expect(body.top.days.every((d: { value: number }) => d.value === 0)).toBe(true);
    expect(body.top.days.map((d: { date: string }) => d.date)).toEqual(body.bottom.days.map((d: { date: string }) => d.date));
    expect(body.wakatime).toBeUndefined();
    vi.unstubAllGlobals();
  });
  it("makes a WakaTime-only failure an error, not a fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));
    expect((await activityFor(null, "private")).status).toBe(404);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    expect((await activityFor(null, "broken")).status).toBe(502);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { days: [] } }))));
    expect((await activityFor(null, "empty")).status).toBe(404);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect((await activityFor(null, "slow")).status).toBe(502);
    vi.unstubAllGlobals();
  });
  it("404s an unknown GitHub user", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    expect((await activityFor("ghost", null)).status).toBe(404);
    vi.unstubAllGlobals();
  });
  it("rate-limits when the binding says so", async () => {
    const res = await worker.fetch(req("github=x"), { LIMITER: { limit: async () => ({ success: false }) } }, {});
    expect(res.status).toBe(429);
  });
});
