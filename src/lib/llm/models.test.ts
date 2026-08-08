import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_LLM_MODEL_ID,
  isLlmModelId,
  resolveAzureDeploymentName,
  resolveLlmModelId,
} from "./models";

describe("isLlmModelId", () => {
  it("accepts gpt-5.6 luna/terra/sol", () => {
    expect(isLlmModelId("gpt-5.6-luna")).toBe(true);
    expect(isLlmModelId("gpt-5.6-terra")).toBe(true);
    expect(isLlmModelId("gpt-5.6-sol")).toBe(true);
  });

  it("rejects unknown ids", () => {
    expect(isLlmModelId("kimi-k3")).toBe(false);
    expect(isLlmModelId("gpt-5.5")).toBe(false);
    expect(isLlmModelId(undefined)).toBe(false);
  });
});

describe("resolveLlmModelId", () => {
  const originalAzure = process.env.AZURE_MODEL;
  const originalLlm = process.env.LLM_MODEL;

  afterEach(() => {
    if (originalAzure === undefined) delete process.env.AZURE_MODEL;
    else process.env.AZURE_MODEL = originalAzure;
    if (originalLlm === undefined) delete process.env.LLM_MODEL;
    else process.env.LLM_MODEL = originalLlm;
  });

  it("prefers a valid requested model", () => {
    expect(resolveLlmModelId("gpt-5.6-sol")).toBe("gpt-5.6-sol");
  });

  it("falls back to AZURE_MODEL then default", () => {
    delete process.env.AZURE_MODEL;
    delete process.env.LLM_MODEL;
    expect(resolveLlmModelId("not-a-model")).toBe(DEFAULT_LLM_MODEL_ID);
    expect(resolveLlmModelId(undefined)).toBe(DEFAULT_LLM_MODEL_ID);

    process.env.AZURE_MODEL = "gpt-5.6-luna";
    expect(resolveLlmModelId(undefined)).toBe("gpt-5.6-luna");
  });
});

describe("resolveAzureDeploymentName", () => {
  const original = {
    luna: process.env.AZURE_DEPLOYMENT_LUNA,
    terra: process.env.AZURE_DEPLOYMENT_TERRA,
    sol: process.env.AZURE_DEPLOYMENT_SOL,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      const envKey =
        key === "luna"
          ? "AZURE_DEPLOYMENT_LUNA"
          : key === "terra"
            ? "AZURE_DEPLOYMENT_TERRA"
            : "AZURE_DEPLOYMENT_SOL";
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
  });

  it("defaults to the catalog model id", () => {
    delete process.env.AZURE_DEPLOYMENT_LUNA;
    expect(resolveAzureDeploymentName("gpt-5.6-luna")).toBe("gpt-5.6-luna");
  });

  it("uses deployment overrides when set", () => {
    process.env.AZURE_DEPLOYMENT_SOL = "my-sol-deploy";
    expect(resolveAzureDeploymentName("gpt-5.6-sol")).toBe("my-sol-deploy");
  });
});
