import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import {
  AiProviderError,
  AiProviderQuotaError,
  AiProviderTimeoutError,
  type AiGateway,
  type AiGenerationRequest,
  type AiGenerationResponse,
} from "../gateway/ai-gateway";
import { contextHashPrefix } from "../cache/context-hash";
import { readAiConfigFromEnv } from "../shared/ai-config";
import { logAiError, logAiEvent } from "../shared/logger";
import { sharedProviderHealth } from "../shared/provider-health";

// This is the only file in the codebase allowed to import @google/genai.
// Everything else depends on the AiGateway interface.

const PROVIDER_NAME = "gemini";
// Defaults for a directly-constructed GeminiProvider (mainly tests) that
// don't go through createGeminiProviderFromEnv — sourced from the same
// AiConfig defaults so there's exactly one place these values are decided.
const {
  temperature: DEFAULT_TEMPERATURE,
  maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
  timeoutMs: DEFAULT_TIMEOUT_MS,
} = readAiConfigFromEnv({});

export interface GeminiProviderConfig {
  apiKey: string;
  /** Never hardcoded — read from the AI_COACH_MODEL env var by createGeminiProviderFromEnv. */
  model: string;
  timeoutMs?: number;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * The only AiGateway implementation for Gemini. Zero automatic retries —
 * per the spec, any failure (timeout, quota, malformed JSON, network) falls
 * back immediately rather than retrying, so a flaky provider never adds
 * user-visible latency on top of its own timeout.
 */
export class GeminiProvider implements AiGateway {
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly temperature: number;
  private readonly maxOutputTokens: number;

  constructor(config: GeminiProviderConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.temperature = config.temperature ?? DEFAULT_TEMPERATURE;
    this.maxOutputTokens = config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  }

  async generate(request: AiGenerationRequest): Promise<AiGenerationResponse> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();

    try {
      const result = await this.client.models.generateContent({
        model: this.model,
        contents: request.userPrompt,
        config: {
          systemInstruction: request.systemPrompt,
          temperature: this.temperature,
          maxOutputTokens: this.maxOutputTokens,
          responseMimeType: "application/json",
          responseSchema: request.responseSchema,
          abortSignal: controller.signal,
        },
      });

      const durationMs = Date.now() - startedAt;
      const text = result.text;

      if (!text) {
        // Thrown inside this try block on purpose — the surrounding catch
        // is what logs/records it, exactly once, via its generic
        // `AiProviderError` handling below.
        throw new AiProviderError("Gemini returned an empty response");
      }

      this.logResult(request, durationMs, "success");
      sharedProviderHealth.recordSuccess(durationMs);
      return {
        raw: text,
        provider: PROVIDER_NAME,
        model: this.model,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      this.logResult(request, durationMs, "error");
      const isTimeout = error instanceof Error && error.name === "AbortError";
      sharedProviderHealth.recordFailure(durationMs, isTimeout);

      if (isTimeout) {
        throw new AiProviderTimeoutError(
          `Gemini request exceeded ${this.timeoutMs}ms`,
          error,
        );
      }
      if (error instanceof ApiError && error.status === 429) {
        throw new AiProviderQuotaError("Gemini quota exceeded (429)", error);
      }
      if (error instanceof AiProviderError) {
        throw error;
      }
      throw new AiProviderError("Gemini request failed", error);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private logResult(
    request: AiGenerationRequest,
    durationMs: number,
    status: "success" | "error",
  ): void {
    const fields = {
      provider: PROVIDER_NAME,
      model: this.model,
      durationMs,
      cacheHit: false,
      contextHashPrefix: contextHashPrefix(request.contextHash),
      audience: request.audience,
      resultSource: "ai" as const,
      status,
    };
    if (status === "error") {
      logAiError("ai_provider_generate", fields);
    } else {
      logAiEvent("ai_provider_generate", fields);
    }
  }
}

/** Builds a GeminiProvider from shared/ai-config.ts plus GEMINI_API_KEY — the model is never hardcoded elsewhere. */
export function createGeminiProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
): GeminiProvider {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AiProviderError("GEMINI_API_KEY is not set");
  }

  const config = readAiConfigFromEnv(env);
  if (!config.model) {
    throw new AiProviderError("AI_COACH_MODEL is not set");
  }

  return new GeminiProvider({
    apiKey,
    model: config.model,
    temperature: config.temperature,
    maxOutputTokens: config.maxOutputTokens,
    timeoutMs: config.timeoutMs,
  });
}
