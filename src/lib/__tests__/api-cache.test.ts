import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApiCache, withCache } from '../api-cache'

describe('ApiCache', () => {
  let cache: ApiCache<string>

  beforeEach(() => {
    cache = new ApiCache<string>('test', 1000, 10) // 1s TTL, 10 max size
  })

  describe('get and set', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1')
      const result = cache.get('key1')

      expect(result).toBe('value1')
    })

    it('should return null for non-existent keys', () => {
      const result = cache.get('nonexistent')

      expect(result).toBeNull()
    })

    it('should return null for expired entries', async () => {
      const shortCache = new ApiCache<string>('test', 50, 10) // 50ms TTL
      shortCache.set('key1', 'value1')

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100))

      const result = shortCache.get('key1')
      expect(result).toBeNull()
    })
  })

  describe('delete', () => {
    it('should remove a key', () => {
      cache.set('key1', 'value1')
      const deleted = cache.delete('key1')

      expect(deleted).toBe(true)
      expect(cache.get('key1')).toBeNull()
    })

    it('should return false for non-existent key', () => {
      const deleted = cache.delete('nonexistent')

      expect(deleted).toBe(false)
    })
  })

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      cache.clear()

      expect(cache.get('key1')).toBeNull()
      expect(cache.get('key2')).toBeNull()
    })
  })

  describe('LRU eviction', () => {
    it('should evict oldest entry when at capacity', async () => {
      const smallCache = new ApiCache<string>('test', 1000, 3)
      smallCache.set('key1', 'value1')
      smallCache.set('key2', 'value2')
      smallCache.set('key3', 'value3')
      smallCache.set('key4', 'value4') // Should evict key1

      expect(smallCache.get('key1')).toBeNull()
      expect(smallCache.get('key2')).toBe('value2')
      expect(smallCache.get('key3')).toBe('value3')
      expect(smallCache.get('key4')).toBe('value4')
    })
  })

  describe('stats', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 'value1')

      cache.get('key1') // Hit
      cache.get('key2') // Miss
      cache.get('key1') // Hit

      const stats = cache.getStats()

      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBeCloseTo(0.667, 2)
    })
  })

  describe('makeKey', () => {
    it('should generate consistent keys', () => {
      const key1 = ApiCache.makeKey('blogs', { page: 1, limit: 10 })
      const key2 = ApiCache.makeKey('blogs', { page: 1, limit: 10 })
      const key3 = ApiCache.makeKey('blogs', { limit: 10, page: 1 }) // Different order

      expect(key1).toBe(key2)
      // Note: keys should be the same regardless of param order
      expect(key1).toBe(key3)
    })

    it('should ignore undefined/null values', () => {
      const key1 = ApiCache.makeKey('test', { a: 'value', b: undefined, c: null })
      const key2 = ApiCache.makeKey('test', { a: 'value' })

      expect(key1).toBe(key2)
    })
  })
})

describe('withCache', () => {
  it('should return cached value when available', async () => {
    const cache = new ApiCache<{ data: string }>('test', 1000, 10)
    cache.set('key1', { data: 'cached' })

    const fetcher = vi.fn().mockResolvedValue({ data: 'fresh' })

    const result = await withCache(cache, 'key1', fetcher)

    expect(result).toEqual({ data: 'cached' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('should fetch and cache when not in cache', async () => {
    const cache = new ApiCache<{ data: string }>('test', 1000, 10)
    const fetcher = vi.fn().mockResolvedValue({ data: 'fresh' })

    const result = await withCache(cache, 'key1', fetcher)

    expect(result).toEqual({ data: 'fresh' })
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Verify it's now cached
    const cached = cache.get('key1')
    expect(cached).toEqual({ data: 'fresh' })
  })

  it('should bypass cache when option is set', async () => {
    const cache = new ApiCache<{ data: string }>('test', 1000, 10)
    cache.set('key1', { data: 'cached' })

    const fetcher = vi.fn().mockResolvedValue({ data: 'fresh' })

    const result = await withCache(cache, 'key1', fetcher, { bypassCache: true })

    expect(result).toEqual({ data: 'fresh' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('should use custom TTL', async () => {
    const cache = new ApiCache<{ data: string }>('test', 1000, 10)
    const fetcher = vi.fn().mockResolvedValue({ data: 'test' })

    await withCache(cache, 'key1', fetcher, { ttl: 5000 })

    const stats = cache.getStats()
    expect(stats.size).toBe(1)
  })
})
