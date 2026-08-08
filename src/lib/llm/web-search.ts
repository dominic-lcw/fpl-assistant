import type { AzureOpenAIProvider } from "@ai-sdk/azure";

/** Azure Responses API web search tool name. */
export const AZURE_WEB_SEARCH = "web_search";

/**
 * Azure Foundry / Azure OpenAI built-in web search (Responses API).
 * Runs server-side via Grounding with Bing — no separate search API key.
 *
 * @see https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/web-search
 */
export function createAzureWebSearchTool(azure: AzureOpenAIProvider) {
  return {
    [AZURE_WEB_SEARCH]: azure.tools.webSearch({
      searchContextSize: "medium",
    }),
  };
}
