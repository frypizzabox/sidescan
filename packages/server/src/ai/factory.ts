import type { Config } from "@/config/schema.js";
import { resolveKeys } from "@/config/resolve-env.js";
import { ConfigError } from "@/lib/errors.js";
import { ClaudeProvider } from "@/ai/claude.js";
import { OpenAIProvider } from "@/ai/openai.js";
import { OllamaProvider } from "@/ai/ollama.js";
import type { AIProvider } from "@/ai/provider.js";

/**
 * Builds the AI provider selected in config.yaml, pulling keys from
 * process.env via resolveKeys(). Throws ConfigError with a one-line
 * remediation if required env vars are missing.
 */
export function createAIProvider(config: Config): AIProvider {
  const keys = resolveKeys(config);
  const modelOverride = config.providers.ai_model;

  switch (config.providers.ai) {
    case "claude": {
      if (!keys.aiKey) {
        throw new ConfigError(
          "ANTHROPIC_API_KEY is not set. Add it to .env or your shell.",
        );
      }
      return new ClaudeProvider(keys.aiKey, modelOverride);
    }
    case "openai": {
      if (!keys.aiKey) {
        throw new ConfigError(
          "OPENAI_API_KEY is not set. Add it to .env or your shell.",
        );
      }
      return new OpenAIProvider(keys.aiKey, modelOverride);
    }
    case "ollama": {
      return new OllamaProvider(
        keys.aiHost ?? "http://localhost:11434",
        modelOverride,
      );
    }
  }
}
