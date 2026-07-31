import { afterEach, describe, expect, it } from "vitest";

import { resolveGeminiModelId } from "./gemini";

describe("resolveGeminiModelId", () => {
  afterEach(() => {
    delete process.env.GEMINI_MODEL;
  });

  it("defaults to gemini-2.5-flash", () => {
    expect(resolveGeminiModelId(undefined)).toBe("gemini-2.5-flash");
    expect(resolveGeminiModelId("")).toBe("gemini-2.5-flash");
    expect(resolveGeminiModelId("   ")).toBe("gemini-2.5-flash");
  });

  it("resolves flash and pro aliases", () => {
    expect(resolveGeminiModelId("flash")).toBe("gemini-2.5-flash");
    expect(resolveGeminiModelId("PRO")).toBe("gemini-2.5-pro");
    expect(resolveGeminiModelId("gemini-flash")).toBe("gemini-2.5-flash");
    expect(resolveGeminiModelId("gemini-pro")).toBe("gemini-2.5-pro");
  });

  it("passes through explicit model ids", () => {
    expect(resolveGeminiModelId("gemini-2.5-pro")).toBe("gemini-2.5-pro");
    expect(resolveGeminiModelId("gemini-3.5-flash")).toBe("gemini-3.5-flash");
  });

  it("reads GEMINI_MODEL from the environment", () => {
    process.env.GEMINI_MODEL = "pro";
    expect(resolveGeminiModelId()).toBe("gemini-2.5-pro");
  });
});
