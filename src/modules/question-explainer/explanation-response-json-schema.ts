/**
 * The JSON schema handed to the provider to constrain its output shape —
 * PS-007 §5's response contract. Deliberately a plain object, matching
 * ai/prompts/coach-response-schema.ts's convention: only
 * ai/providers/gemini-provider.ts is allowed to import the provider SDK,
 * and this shape is structurally compatible with it (and any future
 * provider's schema format) without depending on it.
 */
export const QUESTION_EXPLANATION_RESPONSE_JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    acknowledgement: {
      type: "STRING",
      description:
        "A short, warm acknowledgement of the learner's effort. Plain text, no markdown.",
    },
    mistakeExplanation: {
      type: "STRING",
      description:
        "A clear explanation of the mistake, referencing the learner's answer and the correct answer. Plain text, no markdown.",
    },
    keyConcept: {
      type: "STRING",
      description:
        "The key concept needed to answer correctly, taught in one to two sentences. Plain text, no markdown.",
    },
    workedExample: {
      type: "OBJECT",
      properties: {
        problem: {
          type: "STRING",
          description:
            "A worked example problem using different values from the original question but demonstrating the same concept.",
        },
        steps: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Up to 5 short working steps, plain text.",
        },
        answer: {
          type: "STRING",
          description: "The worked example's final answer.",
        },
      },
      required: ["problem", "steps", "answer"],
    },
    nextAction: {
      type: "OBJECT",
      properties: {
        type: {
          type: "STRING",
          enum: ["linked-question", "review-skill"],
          description:
            '"linked-question" only if a follow-up question was supplied in the context; otherwise "review-skill".',
        },
        text: {
          type: "STRING",
          description:
            "One short, clear learning action. Plain text, no markdown.",
        },
      },
      required: ["type", "text"],
    },
  },
  required: [
    "acknowledgement",
    "mistakeExplanation",
    "keyConcept",
    "workedExample",
    "nextAction",
  ],
} as const;
