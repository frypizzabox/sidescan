import type { ProvidersConfig } from "@/config/schema.js";

export type ProviderName = ProvidersConfig["ai"];

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** Optional per-call model override. Provider picks sensible default otherwise. */
  model?: string;
  /** 0 = deterministic, 1 = creative. Defaults to 0 for our structured tasks. */
  temperature?: number;
  maxTokens?: number;
  /**
   * When set to "json", providers that support structured output will be
   * instructed to return a JSON object. Parsing is still the caller's job.
   */
  responseFormat?: "text" | "json";
}

export interface ChatResponse {
  content: string;
  /** Model actually used (provider may resolve the default). */
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Rough USD estimate. Null for Ollama (local = free). */
  costEstimateUSD?: number | null;
}

export interface AIProvider {
  name: ProviderName;
  defaultModel: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
}

/**
 * Lightweight error type so callers can distinguish AI failures from
 * other runtime errors without depending on provider-specific classes.
 */
export class AIProviderError extends Error {
  readonly code = "AI_PROVIDER_ERROR";
  constructor(
    public readonly provider: ProviderName,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(`[${provider}] ${message}`, options);
    this.name = "AIProviderError";
  }
}
