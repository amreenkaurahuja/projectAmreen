import { afterEach, describe, expect, it, vi } from "vitest";

const generateContentMock = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
  ApiError: class extends Error {
    status: number;
    constructor(options: { message: string; status: number }) {
      super(options.message);
      this.status = options.status;
    }
  },
}));

async function loadProvider() {
  return import("@/modules/ai/providers/gemini-provider");
}

const baseRequest = {
  systemPrompt: "system",
  userPrompt: "user",
  responseSchema: { type: "OBJECT", properties: {} },
  audience: "parent" as const,
  promptVersion: "coach-v1",
  contextHash: "abcdef1234567890",
};

describe("GeminiProvider.generate", () => {
  afterEach(() => {
    vi.resetModules();
    generateContentMock.mockReset();
  });

  it("returns the raw JSON text on success", async () => {
    generateContentMock.mockResolvedValue({ text: '{"headline":"hi"}' });
    const { GeminiProvider } = await loadProvider();
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-2.5-flash",
    });

    const result = await provider.generate(baseRequest);

    expect(result.raw).toBe('{"headline":"hi"}');
    expect(result.provider).toBe("gemini");
    expect(result.model).toBe("gemini-2.5-flash");
  });

  it("passes temperature, max tokens, and the response schema to the SDK", async () => {
    generateContentMock.mockResolvedValue({ text: "{}" });
    const { GeminiProvider } = await loadProvider();
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-2.5-flash",
    });

    await provider.generate(baseRequest);

    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-2.5-flash",
        config: expect.objectContaining({
          temperature: 0.2,
          maxOutputTokens: 350,
          responseMimeType: "application/json",
          responseSchema: baseRequest.responseSchema,
        }),
      }),
    );
  });

  it("throws AiProviderError when the response has no text", async () => {
    generateContentMock.mockResolvedValue({ text: undefined });
    const { GeminiProvider } = await loadProvider();
    const { AiProviderError } = await import("@/modules/ai/gateway/ai-gateway");
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-2.5-flash",
    });

    await expect(provider.generate(baseRequest)).rejects.toThrow(
      AiProviderError,
    );
  });

  it("wraps a generic SDK failure in AiProviderError", async () => {
    generateContentMock.mockRejectedValue(new Error("network down"));
    const { GeminiProvider } = await loadProvider();
    const { AiProviderError } = await import("@/modules/ai/gateway/ai-gateway");
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-2.5-flash",
    });

    await expect(provider.generate(baseRequest)).rejects.toThrow(
      AiProviderError,
    );
  });

  it("wraps an aborted (timed-out) request in AiProviderTimeoutError", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    generateContentMock.mockRejectedValue(abortError);
    const { GeminiProvider } = await loadProvider();
    const { AiProviderTimeoutError } =
      await import("@/modules/ai/gateway/ai-gateway");
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-2.5-flash",
      timeoutMs: 5_000,
    });

    await expect(provider.generate(baseRequest)).rejects.toThrow(
      AiProviderTimeoutError,
    );
  });

  it("actually aborts the request once the real timeout elapses, not just when told AbortError happened", async () => {
    vi.useFakeTimers();
    generateContentMock.mockImplementation(
      (args: { config: { abortSignal: AbortSignal } }) =>
        new Promise((_resolve, reject) => {
          args.config.abortSignal.addEventListener("abort", () => {
            const abortError = new Error("aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        }),
    );
    const { GeminiProvider } = await loadProvider();
    const { AiProviderTimeoutError } =
      await import("@/modules/ai/gateway/ai-gateway");
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-2.5-flash",
      timeoutMs: 1_000,
    });

    const pending = expect(provider.generate(baseRequest)).rejects.toThrow(
      AiProviderTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await pending;

    vi.useRealTimers();
  });

  it("wraps a 429 response in AiProviderQuotaError", async () => {
    const { ApiError } = await import("@google/genai");
    generateContentMock.mockRejectedValue(
      new ApiError({ message: "Resource exhausted", status: 429 }),
    );
    const { GeminiProvider } = await loadProvider();
    const { AiProviderQuotaError } =
      await import("@/modules/ai/gateway/ai-gateway");
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-2.5-flash",
    });

    await expect(provider.generate(baseRequest)).rejects.toThrow(
      AiProviderQuotaError,
    );
  });

  it("does not retry automatically — generateContent is called exactly once", async () => {
    generateContentMock.mockRejectedValue(new Error("boom"));
    const { GeminiProvider } = await loadProvider();
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-2.5-flash",
    });

    await expect(provider.generate(baseRequest)).rejects.toThrow();
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it("records a success into the shared provider health tracker exactly once", async () => {
    generateContentMock.mockResolvedValue({ text: "{}" });
    const { GeminiProvider } = await loadProvider();
    const { sharedProviderHealth } =
      await import("@/modules/ai/shared/provider-health");
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-2.5-flash",
    });

    await provider.generate(baseRequest);

    const snapshot = sharedProviderHealth.getSnapshot();
    expect(snapshot.sampleSize).toBe(1);
    expect(snapshot.status).toBe("healthy");
    expect(snapshot.lastSuccessAt).not.toBeNull();
  });

  it("records exactly one failure (not two) when the response has no text", async () => {
    generateContentMock.mockResolvedValue({ text: undefined });
    const { GeminiProvider } = await loadProvider();
    const { sharedProviderHealth } =
      await import("@/modules/ai/shared/provider-health");
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-2.5-flash",
    });

    await expect(provider.generate(baseRequest)).rejects.toThrow();

    expect(sharedProviderHealth.getSnapshot().sampleSize).toBe(1);
  });

  it("records a timeout in the shared provider health tracker", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    generateContentMock.mockRejectedValue(abortError);
    const { GeminiProvider } = await loadProvider();
    const { sharedProviderHealth } =
      await import("@/modules/ai/shared/provider-health");
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-2.5-flash",
    });

    await expect(provider.generate(baseRequest)).rejects.toThrow();

    const snapshot = sharedProviderHealth.getSnapshot();
    expect(snapshot.timeoutRatePercent).toBe(100);
  });
});

describe("createGeminiProviderFromEnv", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("throws when GEMINI_API_KEY is missing", async () => {
    const { createGeminiProviderFromEnv } = await loadProvider();
    expect(() =>
      createGeminiProviderFromEnv({ AI_COACH_MODEL: "gemini-2.5-flash" }),
    ).toThrow(/GEMINI_API_KEY/);
  });

  it("throws when AI_COACH_MODEL is missing", async () => {
    const { createGeminiProviderFromEnv } = await loadProvider();
    expect(() =>
      createGeminiProviderFromEnv({ GEMINI_API_KEY: "key" }),
    ).toThrow(/AI_COACH_MODEL/);
  });

  it("builds a provider when both env vars are set", async () => {
    const { createGeminiProviderFromEnv, GeminiProvider } =
      await loadProvider();
    const provider = createGeminiProviderFromEnv({
      GEMINI_API_KEY: "key",
      AI_COACH_MODEL: "gemini-2.5-flash",
    });
    expect(provider).toBeInstanceOf(GeminiProvider);
  });
});
