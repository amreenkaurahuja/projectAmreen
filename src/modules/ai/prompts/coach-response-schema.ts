/**
 * The JSON schema handed to the provider to constrain its output shape.
 * Deliberately a plain object, not typed against @google/genai's `Schema` —
 * only providers/gemini-provider.ts is allowed to import that SDK, and this
 * shape is structurally compatible with it (and with any future provider's
 * schema format) without depending on it. Shared by both audience prompt
 * builders so the two never drift out of sync with each other or with
 * coach.types.ts's CoachResponse.
 */
export const COACH_RESPONSE_JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    headline: {
      type: "STRING",
      description: "A short, upbeat one-line title. Plain text, no markdown.",
    },
    message: {
      type: "STRING",
      description: "The main coaching message. Plain text, no markdown.",
    },
    strengths: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Up to 3 short strengths, plain text.",
    },
    focusAreas: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Up to 3 short focus areas, plain text.",
    },
    nextSteps: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Up to 3 short next steps, plain text.",
    },
    disclaimer: {
      type: "STRING",
      nullable: true,
      description: "An optional short disclaimer, or null.",
    },
  },
  required: ["headline", "message", "strengths", "focusAreas", "nextSteps"],
} as const;
