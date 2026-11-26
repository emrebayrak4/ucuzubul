import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import type { ErrorCode, ErrorEnvelope } from "@pricora/contracts";
import type { Request, Response } from "express";
import { ZodError } from "zod";

export class ApiException extends HttpException {
  readonly code: ErrorCode;
  readonly details: unknown;
  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message, status);
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = "Resource") => new ApiException(404, "not_found", `${what} not found`);
export const badRequest = (message: string, details?: unknown) => new ApiException(400, "bad_request", message, details);
export const forbidden = (message = "You do not have access to this resource") => new ApiException(403, "forbidden", message);
export const unauthorized = (message = "Sign in required") => new ApiException(401, "unauthorized", message);
export const conflict = (message: string) => new ApiException(409, "conflict", message);
export const pendingConfiguration = (message: string, details?: unknown) =>
  new ApiException(503, "pending_configuration", message, details);

function statusCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 422:
      return "validation_failed";
    case 413:
      return "payload_too_large";
    case 415:
      return "unsupported_media_type";
    case 429:
      return "rate_limited";
    case 503:
      return "service_unavailable";
    default:
      return status >= 500 ? "internal_error" : "bad_request";
  }
}

interface PrismaLikeError {
  code: string;
  meta?: unknown;
}
const isPrismaError = (e: unknown): e is PrismaLikeError =>
  typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string" && /^P\d{4}$/.test((e as { code: string }).code);

/** Converts every error into the `{ error: { code, message, details? } }` envelope. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("Errors");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorEnvelope;

    if (exception instanceof ApiException) {
      status = exception.getStatus();
      body = { error: { code: exception.code, message: exception.message, ...(exception.details !== undefined ? { details: exception.details } : {}) } };
    } else if (exception instanceof ZodError) {
      status = 422;
      body = { error: { code: "validation_failed", message: "Request validation failed", details: exception.issues } };
    } else if (exception instanceof ThrottlerException) {
      status = 429;
      body = { error: { code: "rate_limited", message: "Too many requests — please slow down" } };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      const message = typeof r === "string" ? r : typeof r === "object" && r && "message" in r ? String((r as { message: unknown }).message) : exception.message;
      body = { error: { code: statusCode(status), message } };
    } else if (isPrismaError(exception) && exception.code === "P2025") {
      status = 404;
      body = { error: { code: "not_found", message: "Resource not found" } };
    } else if (isPrismaError(exception) && exception.code === "P2002") {
      status = 409;
      body = { error: { code: "conflict", message: "Resource already exists" } };
    } else {
      this.logger.error(`${req.method} ${req.url} failed`, exception instanceof Error ? exception.stack : String(exception));
      body = { error: { code: "internal_error", message: "Something went wrong" } };
    }
    if (status >= 500 && !(exception instanceof ApiException)) {
      this.logger.error(`${req.method} ${req.url} → ${status}`);
    }
    if (!res.headersSent) res.status(status).json(body);
  }
}
