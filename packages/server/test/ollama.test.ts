import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { OllamaProvider } from "@/ai/ollama.js";
import { AIProviderError } from "@/ai/provider.js";

const HOST = "http://localhost:11434";

function stubFetch(
  handler: (
    url: string,
    init: RequestInit | undefined,
  ) => Response | Promise<Response>,
) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, init);
  }) as typeof fetch;
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("OllamaProvider", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts to /api/chat and returns a normalized response", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> = {};
    stubFetch((url, init) => {
      capturedUrl = url;
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return okResponse({
        model: "llama3.2",
        message: { role: "assistant", content: "hello" },
        prompt_eval_count: 10,
        eval_count: 5,
      });
    });

    const result = await new OllamaProvider(HOST).chat({
      messages: [{ role: "user", content: "hi" }],
    });

    expect(capturedUrl).toBe("http://localhost:11434/api/chat");
    expect(capturedBody.model).toBe("llama3.2");
    expect(capturedBody.stream).toBe(false);
    expect(capturedBody.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(result).toEqual({
      content: "hello",
      model: "llama3.2",
      inputTokens: 10,
      outputTokens: 5,
      costEstimateUSD: null,
    });
  });

  it("passes temperature and maxTokens as Ollama options", async () => {
    let capturedBody: Record<string, unknown> = {};
    stubFetch((_url, init) => {
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return okResponse({
        model: "llama3.2",
        message: { role: "assistant", content: "" },
      });
    });

    await new OllamaProvider(HOST).chat({
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.7,
      maxTokens: 1024,
    });

    const opts = capturedBody.options as Record<string, unknown>;
    expect(opts.temperature).toBe(0.7);
    expect(opts.num_predict).toBe(1024);
  });

  it("defaults temperature to 0 when not provided", async () => {
    let capturedBody: Record<string, unknown> = {};
    stubFetch((_url, init) => {
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return okResponse({
        model: "llama3.2",
        message: { role: "assistant", content: "" },
      });
    });

    await new OllamaProvider(HOST).chat({
      messages: [{ role: "user", content: "hi" }],
    });

    expect((capturedBody.options as Record<string, unknown>).temperature).toBe(
      0,
    );
  });

  it("sets format:json when responseFormat is json", async () => {
    let capturedBody: Record<string, unknown> = {};
    stubFetch((_url, init) => {
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return okResponse({
        model: "llama3.2",
        message: { role: "assistant", content: "{}" },
      });
    });

    await new OllamaProvider(HOST).chat({
      messages: [{ role: "user", content: "hi" }],
      responseFormat: "json",
    });

    expect(capturedBody.format).toBe("json");
  });

  it("does not include format field when responseFormat is text", async () => {
    let capturedBody: Record<string, unknown> = {};
    stubFetch((_url, init) => {
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return okResponse({
        model: "llama3.2",
        message: { role: "assistant", content: "" },
      });
    });

    await new OllamaProvider(HOST).chat({
      messages: [{ role: "user", content: "hi" }],
      responseFormat: "text",
    });

    expect(capturedBody.format).toBeUndefined();
  });

  it("honors per-call model override", async () => {
    let capturedBody: Record<string, unknown> = {};
    stubFetch((_url, init) => {
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return okResponse({
        model: "mistral",
        message: { role: "assistant", content: "" },
      });
    });

    await new OllamaProvider(HOST).chat({
      messages: [{ role: "user", content: "hi" }],
      model: "mistral",
    });

    expect(capturedBody.model).toBe("mistral");
  });

  it("passes system messages through without transformation", async () => {
    let capturedBody: Record<string, unknown> = {};
    stubFetch((_url, init) => {
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return okResponse({
        model: "llama3.2",
        message: { role: "assistant", content: "" },
      });
    });

    await new OllamaProvider(HOST).chat({
      messages: [
        { role: "system", content: "Be brief" },
        { role: "user", content: "hi" },
      ],
    });

    expect(capturedBody.messages).toEqual([
      { role: "system", content: "Be brief" },
      { role: "user", content: "hi" },
    ]);
  });

  it("trims trailing slash from host when building the URL", async () => {
    let capturedUrl = "";
    stubFetch((url) => {
      capturedUrl = url;
      return okResponse({
        model: "llama3.2",
        message: { role: "assistant", content: "" },
      });
    });

    await new OllamaProvider("http://localhost:11434/").chat({
      messages: [{ role: "user", content: "hi" }],
    });

    expect(capturedUrl).toBe("http://localhost:11434/api/chat");
  });

  it("wraps fetch errors in AIProviderError", async () => {
    stubFetch(() => {
      throw new Error("ECONNREFUSED");
    });

    await expect(
      new OllamaProvider(HOST).chat({
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow(AIProviderError);
  });

  it("throws AIProviderError with status on non-2xx responses", async () => {
    stubFetch(() => new Response("model 'llama3.2' not found", { status: 404 }));

    await expect(
      new OllamaProvider(HOST).chat({
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it("returns costEstimateUSD as null (local inference is free)", async () => {
    stubFetch(() =>
      okResponse({
        model: "llama3.2",
        message: { role: "assistant", content: "x" },
        prompt_eval_count: 1,
        eval_count: 1,
      }),
    );

    const result = await new OllamaProvider(HOST).chat({
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.costEstimateUSD).toBeNull();
  });

  it("requires a host URL", () => {
    expect(() => new OllamaProvider("")).toThrow(AIProviderError);
  });
});
