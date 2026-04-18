import { AIProviderError, type AIProvider, type ChatRequest, type ChatResponse } from "@/ai/provider.js";

/**
 * OpenAI provider stub. Interface-compliant so the factory can report it
 * as available, but actual SDK wiring is deferred until we first need it.
 * When we do, install `openai` and swap this for a real implementation.
 */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;
  readonly defaultModel = "gpt-4o-mini";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_apiKey: string, _defaultModel?: string) {
    // placeholder
  }
  async chat(_req: ChatRequest): Promise<ChatResponse> {
    throw new AIProviderError(
      "openai",
      "OpenAI provider not yet implemented. Install `openai` and swap this class for a real impl when needed.",
    );
  }
}
