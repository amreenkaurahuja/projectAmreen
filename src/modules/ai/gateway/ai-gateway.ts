import type { Audience } from "../coach/coach.types";

export interface AiGenerationRequest {
  systemPrompt: string;
  userPrompt: string;
  /** Plain-object JSON schema (see prompts/coach-response-schema.ts) — provider-agnostic. */
  responseSchema: Record<string, unknown>;
  audience: Audience;
  promptVersion: string;
  /** Content hash of the DTO the prompt was built from — logged (as a prefix) and used as the future cache key. */
  contextHash: string;
}

export interface AiGenerationResponse {
  /** Raw JSON text from the provider — not yet parsed or validated. */
  raw: string;
  provider: string;
  model: string;
  durationMs: number;
}

/**
 * Everything the application depends on. No call site imports a provider
 * SDK directly — adding a second provider (OpenAI, Groq, Claude, Ollama)
 * means adding one providers/*-provider.ts implementing this interface,
 * with no change anywhere else.
 */
export interface AiGateway {
  generate(request: AiGenerationRequest): Promise<AiGenerationResponse>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export class AiProviderTimeoutError extends AiProviderError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "AiProviderTimeoutError";
  }
}

/** A 429/rate-limit/quota response from the provider — always falls back, same as any other provider error. */
export class AiProviderQuotaError extends AiProviderError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "AiProviderQuotaError";
  }
}
