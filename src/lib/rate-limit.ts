/**
 * Simple in-memory rate limiter for API routes
 * Note: In production, consider using Redis or a distributed rate limiter
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

// In-memory store for rate limiting
// Key: IP address or identifier
// Value: { count, resetTime }
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

// Default configurations
const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  '/api/sources/add': {
    maxRequests: 20,    // 20 requests
    windowMs: 60 * 60 * 1000, // per hour
  },
  '/api/blogs/generate-missing': {
    maxRequests: 10,    // 10 requests
    windowMs: 60 * 60 * 1000, // per hour
  },
  '/api/blogs': {
    maxRequests: 30,    // 30 requests
    windowMs: 60 * 60 * 1000, // per hour
  },
  // Default for any other endpoint
  default: {
    maxRequests: 100,
    windowMs: 60 * 60 * 1000,
  },
};

// Cleanup expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime <= now) {
      rateLimitStore.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

/**
 * Get client identifier from request
 * Uses x-forwarded-for header or falls back to a default for local development
 */
export function getClientId(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback for local development
  return '127.0.0.1';
}

/**
 * Check rate limit and return response headers
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
}

export function checkRateLimit(endpoint: string, clientId: string): RateLimitResult {
  const config = RATE_LIMIT_CONFIGS[endpoint] || RATE_LIMIT_CONFIGS.default;
  const now = Date.now();

  let entry = rateLimitStore.get(clientId);

  // If no entry or entry has expired, create new entry
  if (!entry || entry.resetTime <= now) {
    entry = {
      count: 0,
      resetTime: now + config.windowMs,
    };
    rateLimitStore.set(clientId, entry);
  }

  // Increment count
  entry.count++;

  // Check if over limit
  const allowed = entry.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - entry.count);

  return {
    allowed,
    remaining,
    resetTime: entry.resetTime,
    limit: config.maxRequests,
  };
}

/**
 * Create rate limit middleware for API routes
 */
export function withRateLimit(
  handler: (request: Request) => Promise<Response>,
  endpoint: string
) {
  return async (request: Request): Promise<Response> => {
    const clientId = getClientId(request);
    const rateLimitResult = checkRateLimit(endpoint, clientId);

    // Set rate limit headers
    const headers = new Headers();
    headers.set('X-RateLimit-Limit', rateLimitResult.limit.toString());
    headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    headers.set('X-RateLimit-Reset', rateLimitResult.resetTime.toString());

    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000);
      headers.set('Retry-After', retryAfter.toString());

      return new Response(
        JSON.stringify({
          error: 'Too many requests. Please try again later.',
          retryAfter,
        }),
        {
          status: 429,
          headers: {
            ...Object.fromEntries(headers),
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Execute the handler
    const response = await handler(request);

    // Add rate limit headers to successful responses
    if (response.headers) {
      for (const [key, value] of headers.entries()) {
        if (!response.headers.has(key)) {
          response.headers.set(key, value);
        }
      }
    }

    return response;
  };
}

/**
 * Helper to get rate limit status for a client
 */

/**
 * Build rate limit response headers from a check result.
 * Extracted to avoid duplication across API routes.
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.resetTime.toString(),
  }
}

/**
 * Helper to get rate limit status for a client without incrementing count
 */
export function getRateLimitStatus(endpoint: string, clientId: string): RateLimitResult {
  const config = RATE_LIMIT_CONFIGS[endpoint] || RATE_LIMIT_CONFIGS.default;
  const entry = rateLimitStore.get(clientId);
  const now = Date.now();

  if (!entry || entry.resetTime <= now) {
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetTime: now + config.windowMs,
      limit: config.maxRequests,
    };
  }

  return {
    allowed: entry.count < config.maxRequests,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetTime: entry.resetTime,
    limit: config.maxRequests,
  };
}
