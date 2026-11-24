#!/usr/bin/env node
// Fetches a person's PUBLIC activity (no token) and writes `activity.json` in the package's data format:
//   { generatedAt, top: { label, unit, days: [{ date, value }] }, bottom: { ... } }
// top = GitHub's contribution calendar, bottom = WakaTime's public days, in hours.
//
//   GITHUB_LOGIN=octocat WAKATIME_USER=<public uuid> node demo/scripts/fetch-activity.mjs out.json
//
// A failed fetch exits non-zero and writes nothing, so the last good file stays in place.
import { writeFile } from "node:fs/promises";
import { buildActivity, githubUrl, parseGithubCalendar, parseWakatimeDays, wakatimeUrl } from "../shared/activity.mjs";

export { parseGithubCalendar, parseWakatimeDays };

async function get(url) {
  const res = await fetch(url, { headers: { "user-agent": "neon-activity-graph-demo" } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { GITHUB_LOGIN, WAKATIME_USER } = process.env;
  if (!GITHUB_LOGIN || !WAKATIME_USER) throw new Error("set GITHUB_LOGIN and WAKATIME_USER");
  const top = parseGithubCalendar(await (await get(githubUrl(GITHUB_LOGIN))).text());
  const bottom = parseWakatimeDays(await (await get(wakatimeUrl(WAKATIME_USER))).json());
  if (top.length < 300) throw new Error(`github: only ${top.length} days, did the page change?`);
  if (bottom.length < 300) throw new Error(`wakatime: only ${bottom.length} days`);
  const out = process.argv[2] ?? "activity.json";
  await writeFile(out, `${JSON.stringify(buildActivity(top, bottom))}\n`);
  console.log(`${out}: ${top.length} GitHub days, ${bottom.length} WakaTime days`);
}
