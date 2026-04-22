import {
  AIProviderError,
  type AIProvider,
  type ChatRequest,
  type ChatResponse,
} from "@/ai/provider.js";

interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements AIProvider {
  readonly name = "ollama" as const;
  readonly defaultModel: string;
  private readonly host: string;

  constructor(host: string, defaultModel = "llama3.2") {
    if (!host) {
      throw new AIProviderError("ollama", "Ollama host URL is required");
    }
    this.host = host.replace(/\/+$/, "");
    this.defaultModel = defaultModel;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: req.model ?? this.defaultModel,
      messages: req.messages,
      stream: false,
      options: {
        temperature: req.temperature ?? 0,
        ...(req.maxTokens != null ? { num_predict: req.maxTokens } : {}),
      },
    };
    if (req.responseFormat === "json") {
      body.format = "json";
    }

    let response: Response;
    try {
      response = await fetch(`${this.host}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AIProviderError("ollama", `request failed: ${msg}`, {
        cause: err,
      });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const suffix = text ? `: ${text.slice(0, 200)}` : "";
      throw new AIProviderError(
        "ollama",
        `HTTP ${response.status}${suffix}`,
      );
    }

    let payload: OllamaChatResponse;
    try {
      payload = (await response.json()) as OllamaChatResponse;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AIProviderError("ollama", `invalid JSON response: ${msg}`, {
        cause: err,
      });
    }

    return {
      content: payload.message?.content ?? "",
      model: payload.model,
      inputTokens: payload.prompt_eval_count,
      outputTokens: payload.eval_count,
      costEstimateUSD: null,
    };
  }
}
