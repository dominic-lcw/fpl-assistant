import { describe, expect, it } from "vitest";
import {
  DEFAULT_KIMI_MODEL_ID,
  isKimiModelId,
  resolveKimiModelId,
} from "./models";

describe("isKimiModelId", () => {
  it("accepts supported models", () => {
    expect(isKimiModelId("kimi-k3")).toBe(true);
    expect(isKimiModelId("kimi-k2.7-code")).toBe(true);
  });

  it("rejects unsupported values", () => {
    expect(isKimiModelId("kimi-k2.6")).toBe(false);
    expect(isKimiModelId("gpt-4o")).toBe(false);
    expect(isKimiModelId(undefined)).toBe(false);
  });
});

describe("resolveKimiModelId", () => {
  it("prefers a valid requested model", () => {
    expect(resolveKimiModelId("kimi-k2.7-code")).toBe("kimi-k2.7-code");
  });

  it("falls back to default for invalid requests", () => {
    expect(resolveKimiModelId("not-a-model")).toBe(DEFAULT_KIMI_MODEL_ID);
    expect(resolveKimiModelId(undefined)).toBe(DEFAULT_KIMI_MODEL_ID);
  });
});
