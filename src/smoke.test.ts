// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

describe("app build smoke test", () => {
  it("imports App component", async () => {
    const mod = await import("./App");
    expect(mod.default).toBeTruthy();
  });
});
