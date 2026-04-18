import Anthropic from "@anthropic-ai/sdk";
import {
  AIProviderError,
  type AIProvider,
  type ChatRequest,
  type ChatResponse,
} from "@/ai/provider.js";

// Rough pricing as of 2026-04 for claude-sonnet-4-6:
//   input:  $3 per 1M tokens  → $0.000003 per token
//   output: $15 per 1M tokens → $0.000015 per token
// Updated loosely; estimates are for UX ("about $0.01"), not billing.
const PRICE_PER_INPUT_TOKEN_USD = 3e-6;
const PRICE_PER_OUTPUT_TOKEN_USD = 15e-6;

export class ClaudeProvider implements AIProvider {
  readonly name = "claude" as const;
  readonly defaultModel: string;
  private readonly client: Anthropic;

  constructor(apiKey: string, defaultModel = "claude-sonnet-4-6") {
    if (!apiKey) {
      throw new AIProviderError("claude", "API key is required");
    }
    this.client = new Anthropic({ apiKey });
    this.defaultModel = defaultModel;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    // Anthropic takes `system` as a separate top-level parameter, not a message.
    const systemText = req.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const conversation = req.messages.filter((m) => m.role !== "system") as {
      role: "user" | "assistant";
      content: string;
    }[];

    // When JSON is requested, nudge the model via a system suffix. Anthropic
    // does not have a native JSON mode flag the way OpenAI does, but the
    // model reliably returns clean JSON when the system prompt asks for it.
    const system =
      req.responseFormat === "json"
        ? `${systemText}\n\nRespond with a single JSON object. No prose, no markdown fences.`.trim()
        : systemText.length > 0
          ? systemText
          : undefined;

    let response: Anthropic.Messages.Message;
    try {
      response = await this.client.messages.create({
        model: req.model ?? this.defaultModel,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature ?? 0,
        system,
        messages: conversation,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AIProviderError("claude", msg, { cause: err });
    }

    const content = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costEstimateUSD =
      inputTokens * PRICE_PER_INPUT_TOKEN_USD +
      outputTokens * PRICE_PER_OUTPUT_TOKEN_USD;

    return {
      content,
      model: response.model,
      inputTokens,
      outputTokens,
      costEstimateUSD,
    };
  }
}
