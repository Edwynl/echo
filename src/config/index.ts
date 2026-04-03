/**
 * Application Configuration
 * Centralized configuration management for all services
 */

/**
 * YouTube API Configuration
 */
export const YOUTUBE_CONFIG = {
  API_BASE: 'https://www.googleapis.com/youtube/v3',
  API_KEY: process.env.YOUTUBE_API_KEY,
  TIMEOUT: 10000,
  RETRY: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2
  },
  RATE_LIMITER: {
    MAX_TOKENS: 50,
    REFILL_RATE: 10
  }
}

/**
 * GitHub API Configuration
 */
export const GITHUB_CONFIG = {
  API_BASE: 'https://api.github.com',
  TOKEN: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
  TIMEOUT: 10000,
  RETRY: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2
  },
  RATE_LIMITER: {
    MAX_TOKENS: 30,
    REFILL_RATE: 2
  },
  USER_AGENT: 'Echo',
  API_VERSION: 'v3+json'
}

/**
 * MiniMax API Configuration
 */
export const MINIMAX_CONFIG = {
  API_BASE: process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1',
  API_KEY: process.env.MINIMAX_API_KEY,
  TIMEOUT: 60000,
  RETRY: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2
  }
}

/**
 * Web Scraper Configuration
 */
export const SCRAPER_CONFIG = {
  TIMEOUT: 30000,
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  MAX_CONCURRENT_REQUESTS: 5,
  RETRY: {
    maxRetries: 3,
    initialDelay: 500,
    maxDelay: 10000,
    backoffMultiplier: 2
  }
}

/**
 * Default fetch configuration
 */
export const FETCH_CONFIG = {
  DEFAULT_TIMEOUT: 10000,
  DEFAULT_HEADERS: {
    'Content-Type': 'application/json'
  }
} as const

/**
 * Pagination defaults
 */
export const PAGINATION_CONFIG = {
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100
} as const

/**
 * Get configuration value or default
 */
export function getConfigValue<T>(value: T | undefined, defaultValue: T): T {
  return value ?? defaultValue
}
