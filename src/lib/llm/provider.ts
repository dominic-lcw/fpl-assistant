import {
  createAzure,
  type AzureOpenAIProvider,
} from "@ai-sdk/azure";

export type AzureProviderConfig = {
  apiKey: string;
  resourceName?: string;
  baseURL?: string;
};

/**
 * Normalize Foundry / Azure OpenAI endpoint strings for `@ai-sdk/azure`.
 * The SDK appends `/v1{path}` when the base looks like an Azure OpenAI prefix.
 */
export function normalizeAzureBaseURL(endpoint: string): string {
  let value = endpoint.trim().replace(/\/+$/, "");
  value = value.replace(/\/openai\/v1$/i, "/openai");
  value = value.replace(/\/v1$/i, "");
  return value;
}

export function getAzureProviderConfig(): AzureProviderConfig | null {
  const apiKey =
    process.env.AZURE_API_KEY?.trim() ||
    process.env.AZURE_OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const resourceName = process.env.AZURE_RESOURCE_NAME?.trim() || undefined;
  const rawBase =
    process.env.AZURE_BASE_URL?.trim() ||
    process.env.AZURE_OPENAI_ENDPOINT?.trim() ||
    undefined;
  const baseURL = rawBase ? normalizeAzureBaseURL(rawBase) : undefined;

  if (!resourceName && !baseURL) return null;

  return { apiKey, resourceName, baseURL };
}

export function isAzureConfigured(): boolean {
  return getAzureProviderConfig() !== null;
}

/** Azure AI Foundry / Azure OpenAI provider (Responses API by default). */
export function createAzureProvider(
  config: AzureProviderConfig = getAzureProviderConfig()!,
): AzureOpenAIProvider {
  if (config.baseURL) {
    return createAzure({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }

  return createAzure({
    apiKey: config.apiKey,
    resourceName: config.resourceName,
  });
}
