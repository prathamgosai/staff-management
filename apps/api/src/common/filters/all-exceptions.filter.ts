import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { formatError } from "../utils/format-error";

/**
 * Global exception filter. Two jobs:
 *
 *   1. Map raw Postgres driver errors (which otherwise surface as opaque 500s) to the
 *      right HTTP status — e.g. a duplicate upload (23505) becomes 409, a malformed
 *      UUID path param (22P02) becomes 400, a divisor CHECK violation (23514) becomes 400.
 *      Before this, a bad id param produced a raw pg 500 with a leaked SQL string.
 *   2. Stamp every response (success handlers included would need middleware; here we
 *      cover errors) with a request id echoed in the `x-request-id` header and the body,
 *      so a user-reported error can be found in the logs. Honors an inbound x-request-id.
 *
 * HttpExceptions (incl. ValidationPipe 400s, Forbidden from the guards, NotFound) pass
 * through with their own status/message. Unknown errors log at error level and return a
 * generic 500 — internal detail is never sent to the client.
 */
type PgError = { code: string; detail?: string; constraint?: string; column?: string };

const PG_STATUS: Record<string, { status: number; message: string }> = {
  "23505": { status: HttpStatus.CONFLICT, message: "A record with these values already exists." },
  "23503": { status: HttpStatus.CONFLICT, message: "Related record not found, or it is still referenced." },
  "23502": { status: HttpStatus.BAD_REQUEST, message: "A required field is missing." },
  "23514": { status: HttpStatus.BAD_REQUEST, message: "A value is outside the allowed range." },
  "22P02": { status: HttpStatus.BAD_REQUEST, message: "A value in the request is malformed." },
  "22003": { status: HttpStatus.BAD_REQUEST, message: "A number in the request is out of range." },
  "23P01": { status: HttpStatus.CONFLICT, message: "That change conflicts with an existing record." },
  "40001": { status: HttpStatus.CONFLICT, message: "The request conflicted with a concurrent change; please retry." },
  "40P01": { status: HttpStatus.CONFLICT, message: "The request conflicted with a concurrent change; please retry." },
};

function isPgError(e: unknown): e is PgError {
  if (!e || typeof e !== "object") return false;
  const code = (e as { code?: unknown }).code;
  return (
    typeof code === "string" &&
    code.length === 5 &&
    ("severity" in e || "routine" in e || "schema" in e || "table" in e || "constraint" in e)
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const inbound = req.headers["x-request-id"];
    const requestId =
      (typeof inbound === "string" && inbound.slice(0, 100)) || randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: string | object = "Internal server error";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      body = exception.getResponse();
    } else if (isPgError(exception)) {
      const mapped = PG_STATUS[exception.code];
      if (mapped) {
        status = mapped.status;
        body = mapped.message;
      }
      // Unmapped pg error → falls through as 500 (logged below); never leak SQL detail.
    }

    // Log anything the client shouldn't see the internals of (5xx) or that we couldn't map.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${requestId}] ${req.method} ${req.url} -> ${status}: ${formatError(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const payload =
      typeof body === "string" ? { statusCode: status, message: body } : { statusCode: status, ...body };

    res.setHeader("x-request-id", requestId);
    res.status(status).json({
      ...payload,
      requestId,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
