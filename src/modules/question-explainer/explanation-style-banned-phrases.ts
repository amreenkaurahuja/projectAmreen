// Explanation-specific style phrases (PS-007 §6's "Avoid" list) — distinct
// from ai/validation/banned-phrases.ts's BANNED_PHRASES, which cover
// diagnostic/comparative/predictive/ranking language shared across every AI
// capability. These are tone/pedagogy rules specific to explaining a
// mistake, not safety rules, so they live here rather than being folded
// into the shared list.

export const EXPLANATION_STYLE_BANNED_PHRASES: readonly string[] = [
  "obviously",
  "you should know",
  "this is easy",
  "that's easy",
  "you're good at",
  "you're bad at",
  "you are good at",
  "you are bad at",
];
