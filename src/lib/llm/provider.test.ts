import { afterEach, describe, expect, it } from "vitest";

import {
  getAzureProviderConfig,
  isAzureConfigured,
  normalizeAzureBaseURL,
} from "./provider";

describe("normalizeAzureBaseURL", () => {
  it("strips trailing slashes and /v1 suffixes", () => {
    expect(
      normalizeAzureBaseURL("https://example.openai.azure.com/openai/v1/"),
    ).toBe("https://example.openai.azure.com/openai");
    expect(
      normalizeAzureBaseURL("https://example.services.ai.azure.com/openai/v1"),
    ).toBe("https://example.services.ai.azure.com/openai");
  });
});

describe("getAzureProviderConfig", () => {
  const keys = [
    "AZURE_API_KEY",
    "AZURE_OPENAI_API_KEY",
    "AZURE_RESOURCE_NAME",
    "AZURE_BASE_URL",
    "AZURE_OPENAI_ENDPOINT",
  ] as const;

  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );

  afterEach(() => {
    for (const key of keys) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("returns null when credentials or endpoint are missing", () => {
    for (const key of keys) delete process.env[key];
    expect(getAzureProviderConfig()).toBeNull();
    expect(isAzureConfigured()).toBe(false);

    process.env.AZURE_API_KEY = "secret";
    expect(getAzureProviderConfig()).toBeNull();
  });

  it("accepts resource name + api key", () => {
    for (const key of keys) delete process.env[key];
    process.env.AZURE_API_KEY = "secret";
    process.env.AZURE_RESOURCE_NAME = "my-foundry";
    expect(getAzureProviderConfig()).toEqual({
      apiKey: "secret",
      resourceName: "my-foundry",
      baseURL: undefined,
    });
    expect(isAzureConfigured()).toBe(true);
  });

  it("accepts endpoint alias and normalizes it", () => {
    for (const key of keys) delete process.env[key];
    process.env.AZURE_OPENAI_API_KEY = "secret";
    process.env.AZURE_OPENAI_ENDPOINT =
      "https://my-foundry.openai.azure.com/openai/v1/";
    expect(getAzureProviderConfig()).toEqual({
      apiKey: "secret",
      resourceName: undefined,
      baseURL: "https://my-foundry.openai.azure.com/openai",
    });
  });
});
