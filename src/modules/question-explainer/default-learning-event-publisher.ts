import {
  noOpLearningEventPublisher,
  type LearningEventPublisher,
} from "./explanation-event-publisher";
import { httpLearningEventPublisher } from "./http-learning-event-publisher";
import { isQuestionExplainerMetricsEnabled } from "./metrics-feature-flag";

/**
 * TDS-008 Stage 6.3C — the one place production publisher selection
 * happens. Resolved once at module load (the flag is baked into the
 * client bundle at build time via NEXT_PUBLIC_..., so it can't change
 * mid-session — there's nothing to gain from re-evaluating it per
 * render). question-explainer-flow.tsx uses this as its `publisher`
 * prop's default value; an explicitly supplied `publisher` (as every
 * existing Stage 6.1/6.3A/6.3B test does) always takes precedence over
 * this default — that's a property of default parameters, not something
 * this module has to implement.
 */
export const defaultLearningEventPublisher: LearningEventPublisher =
  isQuestionExplainerMetricsEnabled()
    ? httpLearningEventPublisher
    : noOpLearningEventPublisher;
