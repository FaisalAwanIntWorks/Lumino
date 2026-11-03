import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEATURES,
  FEATURE_KEYS,
  FEATURE_REGISTRY,
  CUSTOM_X_FEATURE_KEYS,
} from "./lib/feature-registry";

/**
 * Drift guard. If you add a module, add it to the registry — these tests point
 * at every surface that still needs wiring.
 */

const sources = import.meta.glob(
  [
    "../supabase/functions/_shared/feature-registry.ts",
    "./App.tsx",
    "./lib/client-nav-config.ts",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

function read(path: string) {
  const suffix = path.replace(/^src\//, "./").replace(/^supabase\//, "../supabase/");
  const key = Object.keys(sources).find((k) => k === suffix);
  if (!key) throw new Error(`source not loaded: ${path} (looked for ${suffix})`);
  return sources[key];
}

describe("feature registry", () => {
  it("has unique keys", () => {
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
  });

  it("defaults cover every registry key", () => {
    const defaults = DEFAULT_FEATURES as unknown as Record<string, boolean>;
    for (const key of FEATURE_KEYS) {
      expect(typeof defaults[key], `default missing for ${key}`).toBe("boolean");
    }
    expect(Object.keys(defaults).sort()).toEqual([...FEATURE_KEYS].sort());
  });

  it("backend mirror lists the same keys", () => {
    const src = read("supabase/functions/_shared/feature-registry.ts");
    const backendKeys = [...src.matchAll(/\{ key: "([a-z0-9_]+)"/g)].map((m) => m[1]);
    expect(backendKeys.sort()).toEqual([...FEATURE_KEYS].sort());
  });

  it("every module key referenced by a route guard exists in the registry", () => {
    const app = read("src/App.tsx");
    const guarded = [...app.matchAll(/FeatureGuard feature="([a-z0-9_]+)"/g)].map((m) => m[1]);
    expect(guarded.length).toBeGreaterThan(0);
    for (const key of guarded) {
      expect(FEATURE_KEYS, `route guard uses unknown feature "${key}"`).toContain(key);
    }
  });

  it("every Custom X module is covered by the shared forms route guard", () => {
    const customX = FEATURE_REGISTRY.filter((f) => f.group === "CustomX").map((f) => f.key);
    expect([...CUSTOM_X_FEATURE_KEYS].sort()).toEqual([...customX].sort());
  });

  it("sidebar nav only gates on known feature keys", () => {
    const nav = read("src/lib/client-nav-config.ts");
    const used = [...nav.matchAll(/features\.([a-z0-9_]+)/g)].map((m) => m[1]);
    for (const key of new Set(used)) {
      expect(FEATURE_KEYS, `nav config uses unknown feature "${key}"`).toContain(key);
    }
  });
});
