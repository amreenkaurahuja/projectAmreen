import * as Sentry from "@sentry/nextjs";
import { logger } from "./logger";

const REQUEST_ID_HEADER = "x-request-id";

type RouteHandler<Ctx> = (
  request: Request,
  context: Ctx,
  requestId: string,
) => Promise<Response>;

/**
 * Wraps a Route Handler so every request gets a request id (reused from an
 * incoming x-request-id header if the caller already set one, otherwise
 * generated), structured start/completion logs, and Sentry error tracking
 * for anything that escapes the handler's own error handling.
 *
 * The handler itself keeps returning its normal Response — known error
 * cases (400/401/403/404/...) are still the handler's own responsibility
 * and are not reported to Sentry, which is reserved for genuinely
 * unexpected failures.
 */
// Next.js's generated route type validator expects every Route Handler —
// even ones with no dynamic segments — to accept a context argument shaped
// like `{ params: Promise<{...}> }`, so that has to be the default here too.
export function withApiObservability<
  Ctx = { params: Promise<Record<string, never>> },
>(routeName: string, handler: RouteHandler<Ctx>) {
  return async (request: Request, context: Ctx): Promise<Response> => {
    const requestId =
      request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
    const startedAt = Date.now();

    logger.info("api.request.started", {
      requestId,
      route: routeName,
      method: request.method,
    });

    try {
      const response = await handler(request, context, requestId);
      response.headers.set(REQUEST_ID_HEADER, requestId);
      logger.info("api.request.completed", {
        requestId,
        route: routeName,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      Sentry.captureException(error, {
        tags: { request_id: requestId, route: routeName },
      });
      logger.error("api.request.failed", {
        requestId,
        route: routeName,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      return Response.json(
        { error: "Internal server error", requestId },
        { status: 500, headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    }
  };
}
