/* Guards against t("…") keys that don't exist in messages/en/skills.json —
   a missing key only surfaces at runtime, on the one screen that renders it. */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import messages from "../../../messages/en/skills.json";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

function has(path: string): boolean {
  let cur: unknown = messages;
  for (const part of path.split(".")) {
    if (typeof cur !== "object" || cur === null || !(part in cur)) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string";
}

describe("skills i18n keys", () => {
  it("every static t() key used under app/skills exists in skills.json", () => {
    const missing = sourceFiles(__dirname).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/\bt\(\s*["']([\w.]+)["']/g)]
        .map((m) => m[1]!)
        .filter((key) => !has(key))
        .map((key) => `${file.slice(__dirname.length + 1)}: ${key}`),
    );
    expect(missing).toEqual([]);
  });
});
