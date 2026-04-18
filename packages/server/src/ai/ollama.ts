import { AIProviderError, type AIProvider, type ChatRequest, type ChatResponse } from "@/ai/provider.js";

/**
 * Ollama provider stub. Interface-compliant, but actual HTTP calls to the
 * local Ollama daemon are deferred until we need them. When we do, the
 * implementation is straightforward: POST to `${OLLAMA_HOST}/api/chat`
 * with {model, messages, stream:false} and read `message.content`.
 */
export class OllamaProvider implements AIProvider {
  readonly name = "ollama" as const;
  readonly defaultModel = "llama3.2";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_host: string, _defaultModel?: string) {
    // placeholder
  }
  async chat(_req: ChatRequest): Promise<ChatResponse> {
    throw new AIProviderError(
      "ollama",
      "Ollama provider not yet implemented. Install the model and swap this class for a real impl when needed.",
    );
  }
}
