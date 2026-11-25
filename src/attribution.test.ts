import { describe, expect, it } from "vitest";
import { ATTRIBUTION_HREF, ATTRIBUTION_TEXT, attributionCss, resolveAttribution } from "./attribution";

describe("resolveAttribution", () => {
  it("is off unless asked for", () => {
    expect(resolveAttribution(undefined)).toBeNull();
    expect(resolveAttribution(false)).toBeNull();
  });
  it("fills in the defaults for `true`", () => {
    expect(resolveAttribution(true)).toEqual({ text: ATTRIBUTION_TEXT, href: ATTRIBUTION_HREF, target: "_blank" });
  });
  it("keeps the words, the link and the target it is given", () => {
    expect(resolveAttribution({ text: "Made with Neon", href: "https://example.com/neon", target: "_self" })).toEqual({ text: "Made with Neon", href: "https://example.com/neon", target: "_self" });
  });
  it("only links to the web: anything else falls back to the project's page", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "file:///etc/passwd"]) expect(resolveAttribution({ href })?.href).toBe(ATTRIBUTION_HREF);
    expect(resolveAttribution({ href: "/relative" })?.href).toBe("/relative");
  });
  it("ignores empty words", () => {
    expect(resolveAttribution({ text: "   " })?.text).toBe(ATTRIBUTION_TEXT);
  });
});

describe("attributionCss", () => {
  it("styles the link, its inner box, bold name, arrow, hover and focus, for the selector it is given, and sets nothing of the link's own display", () => {
    const css = attributionCss("#x");
    for (const rule of ["#x{border-radius", "#x .nag-in{display:inline-flex", "#x b{", "#x svg{", "#x:hover,#x:focus-visible{", "#x:hover .nag-w,#x:focus-visible .nag-w{text-decoration:underline", "#x:focus-visible{outline"]) expect(css).toContain(rule);
    expect(css).toContain("--nag-attribution-fg");
    expect(css.split("\n")[0]).not.toMatch(/display|position|margin/);
  });
});
