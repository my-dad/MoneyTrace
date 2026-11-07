import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(import.meta.dirname, "tokens.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`, "m").exec(css);
  if (match?.[1] === undefined) throw new Error(`no CSS rule for ${selector}`);
  return match[1];
}

function declared(selector: string, property: string): string {
  const match = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+);`).exec(rule(selector));
  if (match?.[1] === undefined) throw new Error(`${selector} does not set ${property}`);
  return match[1].trim();
}

function token(name: string): string {
  return declared(":root", `--mt-${name}`);
}

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG 2 relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("design tokens", () => {
  it.each([
    ["ground", "#F6F4EF"],
    ["surface", "#FFFFFF"],
    ["ink", "#1E2320"],
    ["caption", "#5F635E"],
    ["accent", "#B4541A"],
    ["accent-tint", "#FBEADC"],
  ])("%s is %s, as on the design's Components page", (name, hex) => {
    expect(token(name)).toBe(hex);
  });

  it("uses Plus Jakarta Sans with tabular figures", () => {
    expect(declared(":root", "--mt-font")).toContain("'Plus Jakarta Sans'");
    expect(declared(".mt-money", "font-variant-numeric")).toBe("tabular-nums");
  });

  it("gives Bangla text Hind Siliguri at line-height 1.55 or more", () => {
    expect(declared(":lang(bn)", "font-family")).toContain("'Hind Siliguri'");
    expect(Number(declared(":lang(bn)", "line-height"))).toBeGreaterThanOrEqual(1.55);
  });
});

describe("contrast, which axe cannot measure in jsdom", () => {
  it.each([
    ["ink", "ground"],
    ["ink", "surface"],
    ["caption", "ground"],
    ["caption", "surface"],
    ["caption", "surface-soft"],
    ["body", "surface-soft"],
    ["surface", "accent"],
    ["accent-text", "surface"],
    ["accent-text", "accent-tint"],
    ["verified-text", "verified-tint"],
    ["pending-text", "pending-tint"],
    ["needs-answer-text", "needs-answer-tint"],
    ["failed-text", "failed-tint"],
    ["failed-text", "surface"],
  ])("%s on %s is at least 4.5:1", (text, background) => {
    expect(contrast(token(text), token(background))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("unexplained cash", () => {
  it.each([".mt-money--unexplained", ".mt-card--unexplained"])(
    "%s is dashed-or-neutral and has no red",
    (selector) => {
      const body = rule(selector);
      expect(body).not.toMatch(/failed|red/i);
      const resolved = body.replace(/var\(--mt-([a-z-]+)\)/g, (_, name: string) => token(name));
      const hexes = resolved.match(/#[0-9A-Fa-f]{6}/g) ?? [];
      expect(hexes.length).toBeGreaterThan(0);
      for (const hex of hexes) {
        const [r, g, b] = channels(hex);
        expect(r - Math.max(g, b)).toBeLessThanOrEqual(30);
      }
    },
  );

  it("the unexplained card has a dashed border", () => {
    expect(declared(".mt-card--unexplained", "border")).toContain("dashed");
  });
});

describe("touch targets", () => {
  it.each([".mt-button", ".mt-chip"])("%s is at least 44px tall", (selector) => {
    expect(Number.parseInt(declared(selector, "min-height"), 10)).toBeGreaterThanOrEqual(44);
  });

  it("the send button is at least 44px square", () => {
    expect(Number.parseInt(declared(".mt-icon-button", "width"), 10)).toBeGreaterThanOrEqual(44);
    expect(Number.parseInt(declared(".mt-icon-button", "height"), 10)).toBeGreaterThanOrEqual(44);
  });
});
