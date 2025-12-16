import { Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";
import {
  sanitizeInput,
  detectPromptInjection,
  DEFAULT_CONFIG,
} from "./guardrails.js";

class RateLimiter {
  private requests: Map<string, { count: number; resetTime: number }> =
    new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  check(identifier: string): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
  } {
    const now = Date.now();
    const record = this.requests.get(identifier);

    if (!record || now > record.resetTime) {
      // New window
      this.requests.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetTime: now + this.windowMs,
      };
    }

    if (record.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: record.resetTime,
      };
    }

    record.count++;
    const result = {
      allowed: true,
      remaining: this.maxRequests - record.count,
      resetTime: record.resetTime,
    };
    return result;
  }

  reset(identifier: string): void {
    this.requests.delete(identifier);
  }
}

// Create rate limiters for different endpoints
const chatRateLimiter = new RateLimiter(60000, 30); // 30 requests per minute
const ttsRateLimiter = new RateLimiter(60000, 20); // 20 requests per minute
const transcribeRateLimiter = new RateLimiter(60000, 10);

function getClientId(req: Request): string {
  // Use session ID if available, otherwise use IP
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (sessionId) {
    return `session:${sessionId}`;
  }
  return `ip:${req.ip || req.socket.remoteAddress || "unknown"}`;
}

export function rateLimitMiddleware(
  limiter: RateLimiter,
  endpointName: string,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientId = getClientId(req);
    const result = limiter.check(clientId);

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", limiter["maxRequests"]);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader(
      "X-RateLimit-Reset",
      new Date(result.resetTime).toISOString(),
    );

    if (!result.allowed) {
      logger.warn(
        {
          clientId,
          endpoint: endpointName,
          resetTime: new Date(result.resetTime).toISOString(),
        },
        "Rate limit exceeded",
      );
      res.status(429).json({
        error: "Rate limit exceeded",
        message: `Too many requests. Please try again after ${new Date(result.resetTime).toISOString()}`,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      });
      return;
    }

    next();
  };
}

/**
 * Validates and sanitizes user input at the request level.
 * This is the primary layer for detecting prompt injection attacks
 * on raw user input before it's incorporated into prompt templates.
 */
export function inputValidationMiddleware(
  maxLength: number = DEFAULT_CONFIG.maxInputLength,
  fieldName: string = "message",
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const input = req.body[fieldName];

    if (!input) {
      return next(); // Let route handler deal with missing input
    }

    if (typeof input !== "string") {
      res.status(400).json({
        error: "Invalid input",
        message: `${fieldName} must be a string`,
      });
      return;
    }

    // Check length
    if (input.length > maxLength) {
      logger.warn(
        {
          inputLength: input.length,
          maxLength,
          fieldName,
        },
        "Input exceeds maximum length",
      );
      res.status(400).json({
        error: "Input too long",
        message: `${fieldName} exceeds maximum length of ${maxLength} characters`,
        maxLength,
      });
      return;
    }

    // Check for prompt injection on USER INPUT ONLY
    // This validates the raw user input before it's inserted into prompt templates
    const injectionCheck = detectPromptInjection(input);
    if (injectionCheck.isInjection) {
      logger.warn(
        {
          input: input.substring(0, 100),
          detectedPatterns: injectionCheck.detectedPatterns,
          clientId: getClientId(req),
        },
        "Prompt injection detected in user input",
      );
      // Log but don't block - let guardrails handle it
      // In production, you might want to block here
    }

    // Sanitize input
    const sanitization = sanitizeInput(input);
    if (sanitization.warnings.length > 0) {
      logger.debug(
        {
          warnings: sanitization.warnings,
          fieldName,
        },
        "Input sanitization warnings",
      );
    }

    // Update request body with sanitized input
    req.body[fieldName] = sanitization.sanitized;

    next();
  };
}

export function requestSizeLimitMiddleware(maxSizeBytes: number = 1024 * 1024) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers["content-length"] || "0", 10);

    if (contentLength > maxSizeBytes) {
      logger.warn(
        {
          contentLength,
          maxSizeBytes,
          endpoint: req.path,
        },
        "Request size exceeds limit",
      );
      res.status(413).json({
        error: "Request too large",
        message: `Request body exceeds maximum size of ${maxSizeBytes} bytes`,
        maxSizeBytes,
      });
      return;
    }

    next();
  };
}

export function sessionValidationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const sessionId = req.headers["x-session-id"] as string | undefined;

  if (sessionId) {
    // Validate session ID format (basic validation)
    if (sessionId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      logger.warn(
        {
          sessionId: sessionId.substring(0, 20),
          endpoint: req.path,
        },
        "Invalid session ID format",
      );
      res.status(400).json({
        error: "Invalid session ID",
        message: "Session ID must be alphanumeric and less than 100 characters",
      });
      return;
    }
  }

  next();
}

export function securityHeadersMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Set security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Content Security Policy (adjust based on your needs)
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  );

  next();
}

// Export rate limiters for use in routes
export { chatRateLimiter, ttsRateLimiter, transcribeRateLimiter };
