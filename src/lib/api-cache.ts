/**
 * In-Memory API Cache
 * Simple in-memory caching for API responses with TTL support
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number // Time to live in milliseconds
}

interface CacheStats {
  hits: number
  misses: number
  size: number
}

/**
 * Simple in-memory cache with TTL support
 */
export class ApiCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map()
  private stats: CacheStats = { hits: 0, misses: 0, size: 0 }

  constructor(
    private name: string = 'cache',
    private defaultTtl: number = 60 * 1000, // 1 minute default
    private maxSize: number = 100 // Maximum number of cached entries
  ) {}

  /**
   * Get a value from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key)

    if (!entry) {
      this.stats.misses++
      return null
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      this.stats.misses++
      this.stats.size--
      return null
    }

    this.stats.hits++
    return entry.data
  }

  /**
   * Set a value in cache
   */
  set(key: string, data: T, ttl?: number): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest()
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTtl,
    })
    this.stats.size = this.cache.size
  }

  /**
   * Delete a specific key from cache
   */
  delete(key: string): boolean {
    const result = this.cache.delete(key)
    this.stats.size = this.cache.size
    return result
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
    this.stats.size = 0
    this.stats.hits = 0
    this.stats.misses = 0
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { hitRate: number } {
    const total = this.stats.hits + this.stats.misses
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    }
  }

  /**
   * Evict oldest entry (LRU)
   */
  private evictOldest(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }

  /**
   * Generate cache key from query parameters
   */
  static makeKey(prefix: string, params: Record<string, unknown>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        if (params[key] !== undefined && params[key] !== null) {
          acc[key] = params[key]
        }
        return acc
      }, {} as Record<string, unknown>)

    return `${prefix}:${JSON.stringify(sortedParams)}`
  }
}

// Global cache instances for different endpoints
export const blogListCache = new ApiCache<{
  blogs: unknown[]
  pagination: { total: number; page: number; pageSize: number }
}>('blogs', 30 * 1000, 50) // 30 seconds TTL, 50 entries

export const sourceListCache = new ApiCache<{
  sources: unknown[]
  total: number
}>('sources', 60 * 1000, 30) // 60 seconds TTL, 30 entries

export const channelListCache = new ApiCache<unknown[]>('channels', 60 * 1000, 20) // 60 seconds TTL, 20 entries

/**
 * Cache-aside pattern helper
 */
export async function withCache<T>(
  cache: ApiCache<T>,
  key: string,
  fetcher: () => Promise<T>,
  options: { ttl?: number; bypassCache?: boolean } = {}
): Promise<T> {
  if (!options.bypassCache) {
    const cached = cache.get(key)
    if (cached !== null) {
      console.log(`[Cache HIT] ${key}`)
      return cached
    }
  }

  console.log(`[Cache MISS] ${key}`)
  const data = await fetcher()
  cache.set(key, data, options.ttl)
  return data
}
