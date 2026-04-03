// Error Handler Middleware
// Provides unified error handling and logging for API routes

import { NextResponse } from 'next/server'

// Custom error class for API errors
export class ApiError extends Error {
  public readonly statusCode: number
  public readonly code: string
  public readonly isOperational: boolean

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.code = code
    this.isOperational = isOperational

    // Maintains proper stack trace in V8 environments
    Error.captureStackTrace(this, this.constructor)
  }
}

// Predefined error factories for common scenarios
export const Errors = {
  // 400 Bad Request - Invalid input or parameters
  badRequest: (message: string = 'Invalid request parameters', code: string = 'BAD_REQUEST') =>
    new ApiError(message, 400, code),

  // 401 Unauthorized - Authentication required
  unauthorized: (message: string = 'Authentication required', code: string = 'UNAUTHORIZED') =>
    new ApiError(message, 401, code),

  // 403 Forbidden - Insufficient permissions
  forbidden: (message: string = 'Access denied', code: string = 'FORBIDDEN') =>
    new ApiError(message, 403, code),

  // 404 Not Found - Resource doesn't exist
  notFound: (resource: string = 'Resource', code: string = 'NOT_FOUND') =>
    new ApiError(`${resource} not found`, 404, code),

  // 409 Conflict - Resource already exists
  conflict: (message: string = 'Resource already exists', code: string = 'CONFLICT') =>
    new ApiError(message, 409, code),

  // 422 Unprocessable Entity - Validation failed
  validation: (message: string = 'Validation failed', code: string = 'VALIDATION_ERROR') =>
    new ApiError(message, 422, code),

  // 429 Too Many Requests - Rate limit exceeded
  rateLimited: (message: string = 'Too many requests', code: string = 'RATE_LIMITED') =>
    new ApiError(message, 429, code),

  // 500 Internal Server Error
  internal: (message: string = 'Internal server error', code: string = 'INTERNAL_ERROR') =>
    new ApiError(message, 500, code, false),

  // 503 Service Unavailable
  serviceUnavailable: (message: string = 'Service temporarily unavailable', code: string = 'SERVICE_UNAVAILABLE') =>
    new ApiError(message, 503, code),

  // External API errors
  externalApi: (service: string, message: string) =>
    new ApiError(`${service}: ${message}`, 502, `EXTERNAL_API_ERROR`),

  // Database errors
  database: (operation: string) =>
    new ApiError(`Database error during ${operation}`, 500, 'DATABASE_ERROR', false),
}

// Error response interface
export interface ErrorResponse {
  error: string
  code?: string
  details?: unknown
  timestamp: string
  requestId?: string
}

// Generate unique request ID
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

// Error logger interface
export interface ErrorLogger {
  logError(error: Error, context: {
    requestId: string
    method: string
    url: string
    userId?: string
    body?: unknown
  }): void
}

// Default console logger
export const consoleErrorLogger: ErrorLogger = {
  logError(error, context) {
    const logEntry = {
      level: 'error',
      requestId: context.requestId,
      method: context.method,
      url: context.url,
      userId: context.userId,
      error: {
        name: error.name,
        message: error.message,
        code: error instanceof ApiError ? error.code : undefined,
        stack: error.stack
      },
      timestamp: new Date().toISOString()
    }

    // Use structured logging for better observability
    console.error(JSON.stringify(logEntry, null, 2))
  }
}

// Format error to standard API response
function formatErrorResponse(
  error: Error,
  requestId: string,
  includeStack: boolean = false
): ErrorResponse {
  const response: ErrorResponse = {
    error: error.message || 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
    requestId
  }

  if (error instanceof ApiError) {
    response.code = error.code
    if (includeStack && !error.isOperational) {
      response.details = { stack: error.stack }
    }
  } else {
    response.code = 'INTERNAL_ERROR'
  }

  return response
}

// Main error handler function
export function handleApiError(
  error: unknown,
  context: {
    method: string
    url: string
    userId?: string
    body?: unknown
  },
  logger: ErrorLogger = consoleErrorLogger,
  includeStack: boolean = false
): NextResponse {
  const requestId = generateRequestId()

  // Normalize error
  let normalizedError: Error
  if (error instanceof Error) {
    normalizedError = error
  } else {
    normalizedError = new ApiError(String(error))
  }

  // Log the error
  logger.logError(normalizedError, {
    requestId,
    method: context.method,
    url: context.url,
    userId: context.userId,
    body: context.body
  })

  // Determine status code
  let statusCode = 500
  if (normalizedError instanceof ApiError) {
    statusCode = normalizedError.statusCode
  } else if (normalizedError.name === 'SyntaxError') {
    // JSON parse errors
    statusCode = 400
  }

  // Create response
  const errorResponse = formatErrorResponse(normalizedError, requestId, includeStack)

  return NextResponse.json(errorResponse, { status: statusCode })
}

// Async wrapper for route handlers
export function withErrorHandler<
  T extends (request: Request, ...args: unknown[]) => Promise<NextResponse>
>(
  handler: T,
  options: {
    logger?: ErrorLogger
    includeStack?: boolean
  } = {}
) {
  return async function(
    request: Request,
    ...args: unknown[]
  ): Promise<NextResponse> {
    try {
      return await handler(request, ...args)
    } catch (error) {
      const url = request.url
      const method = request.method

      return handleApiError(
        error,
        { method, url },
        options.logger,
        options.includeStack
      )
    }
  }
}

// Sync wrapper for route handlers
export function withErrorHandlerSync<
  T extends (request: Request, ...args: unknown[]) => NextResponse
>(
  handler: T,
  options: {
    logger?: ErrorLogger
    includeStack?: boolean
  } = {}
) {
  return function(
    request: Request,
    ...args: unknown[]
  ): NextResponse {
    try {
      return handler(request, ...args)
    } catch (error) {
      const url = request.url
      const method = request.method

      return handleApiError(
        error,
        { method, url },
        options.logger,
        options.includeStack
      )
    }
  }
}

// Utility to safely extract error message
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'An unexpected error occurred'
}

// Utility to check if error is operational (expected) vs programmer error
export function isOperationalError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.isOperational
  }
  return false
}

export default {
  ApiError,
  Errors,
  handleApiError,
  withErrorHandler,
  withErrorHandlerSync,
  consoleErrorLogger
}
