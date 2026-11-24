// The two public sources the demo reads, and the one data format they are turned into. Shared by the scheduled workflow (demo/scripts/fetch-activity.mjs) and the proxy (demo/worker), so there is one implementation.

/** GitHub's public contribution calendar (an HTML fragment that needs no token), oldest first. Every cell has `data-date` and a tooltip with the count ("2 contributions on November 16th.", "No contributions on ..."). */
export function parseGithubCalendar(html) {
  const tips = new Map();
  for (const m of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>\s*([^<]*?)\s*</g)) {
    const n = /^(\d[\d,]*)\s+contributions?\b/.exec(m[2]);
    tips.set(m[1], n ? Number(n[1].replace(/,/g, "")) : 0);
  }
  const days = [];
  for (const m of html.matchAll(/<td\b[^>]*>/g)) {
    const date = /\bdata-date="(\d{4}-\d{2}-\d{2})"/.exec(m[0])?.[1];
    const id = /\bid="([^"]+)"/.exec(m[0])?.[1];
    if (date && /\bdata-level="\d"/.test(m[0])) days.push({ date, value: (id && tips.get(id)) || 0 });
  }
  return days.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** WakaTime's public days (what a public profile page itself loads), in hours, oldest first. */
export function parseWakatimeDays(json) {
  const days = json?.data?.days;
  if (!Array.isArray(days)) throw new Error("wakatime: no days in the answer");
  return days.filter((d) => typeof d?.date === "string" && Number.isFinite(d?.total)).map((d) => ({ date: d.date, value: Math.round((d.total / 3600) * 100) / 100 })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export const githubUrl = (login) => `https://github.com/users/${encodeURIComponent(login)}/contributions`;
export const wakatimeUrl = (user) => `https://wakatime.com/api/v1/users/${encodeURIComponent(user)}/insights/days/public`;

/** A GitHub login (letters, digits, single hyphens; 39 at most) or a WakaTime username or public id (a uuid fits too). */
export const validGithubLogin = (s) => typeof s === "string" && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(s);
export const validWakatimeUser = (s) => typeof s === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(s);

/** The package's data format. A layer without days is the same dates at zero (one layer drawn, the other flat); at least one of the two has days. */
export function buildActivity(top, bottom, now = new Date()) {
  const zeros = (days) => days.map((d) => ({ date: d.date, value: 0 }));
  return {
    generatedAt: now.toISOString(),
    top: { label: "Contributions", unit: "contributions", days: top ?? zeros(bottom) },
    bottom: { label: "Coding time", unit: "h", days: bottom ?? zeros(top) },
  };
}
