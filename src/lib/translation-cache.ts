/**
 * Translation Cache Module
 *
 * Provides in-memory caching for translation results with:
 * - MD5-based cache keys (content + targetLang)
 * - 24-hour expiration
 * - Maximum 1000 entries with LRU eviction
 */

import { createHash } from 'crypto';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

interface TitleCacheEntry {
  value: string;
  expiresAt: number;
}

interface BatchCacheEntry {
  content: string;
  title: string;
  expiresAt: number;
}

// Cache configuration
const CACHE_MAX_SIZE = 1000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory cache stores
const contentCache = new Map<string, CacheEntry>();
const titleCache = new Map<string, TitleCacheEntry>();
const batchCache = new Map<string, BatchCacheEntry>();

// Statistics for monitoring
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Generate MD5 hash for cache key
 */
function generateHash(content: string, targetLang: string): string {
  const data = `${content}:${targetLang}`;
  return createHash('md5').update(data).digest('hex');
}

/**
 * Check if cache entry is expired
 */
function isExpired(entry: { expiresAt: number }): boolean {
  return Date.now() > entry.expiresAt;
}

/**
 * Remove oldest entries when cache exceeds max size
 * Simple eviction: remove 10% of entries (approximately oldest)
 */
function evictOldEntries(): void {
  if (contentCache.size < CACHE_MAX_SIZE) return;

  const entriesToRemove = Math.floor(CACHE_MAX_SIZE * 0.1);
  const entries = Array.from(contentCache.entries());

  // Sort by expiration time (oldest first)
  entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);

  // Remove oldest entries
  for (let i = 0; i < entriesToRemove; i++) {
    contentCache.delete(entries[i][0]);
  }

  console.log(`[TranslationCache] Evicted ${entriesToRemove} entries, current size: ${contentCache.size}`);
}

/**
 * Get cached translation for content
 * @returns {string | null} Cached translation or null if not found/expired
 */
export function getCachedTranslation(content: string, targetLang: string): string | null {
  const key = generateHash(content, targetLang);
  const entry = contentCache.get(key);

  if (!entry) {
    cacheMisses++;
    return null;
  }

  if (isExpired(entry)) {
    contentCache.delete(key);
    cacheMisses++;
    return null;
  }

  cacheHits++;
  return entry.value;
}

/**
 * Store translation in cache
 */
export function setCachedTranslation(content: string, targetLang: string, translation: string): void {
  const key = generateHash(content, targetLang);

  // Evict old entries if needed
  evictOldEntries();

  contentCache.set(key, {
    value: translation,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

/**
 * Get cached translation for title
 * @returns {string | null} Cached title translation or null if not found/expired
 */
export function getCachedTitle(title: string, targetLang: string): string | null {
  const key = generateHash(title, targetLang);
  const entry = titleCache.get(key);

  if (!entry) {
    return null;
  }

  if (isExpired(entry)) {
    titleCache.delete(key);
    return null;
  }

  return entry.value;
}

/**
 * Store title translation in cache
 */
export function setCachedTitle(title: string, targetLang: string, translation: string): void {
  const key = generateHash(title, targetLang);

  titleCache.set(key, {
    value: translation,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

/**
 * Get cached batch translation result
 * @returns {{ content: string, title: string } | null}
 */
export function getCachedBatch(
  items: Array<{ content: string; title: string }>,
  targetLang: string
): Array<{ content: string; title: string }> | null {
  const key = generateHash(JSON.stringify(items), targetLang);
  const entry = batchCache.get(key);

  if (!entry) {
    return null;
  }

  if (isExpired(entry)) {
    batchCache.delete(key);
    return null;
  }

  // Parse stored data (split by ||| delimiter)
  const contents = entry.content.split('|||');
  const titles = entry.title.split('|||');

  return contents.map((c, i) => ({
    content: c,
    title: titles[i] || ''
  }));
}

/**
 * Store batch translation in cache
 */
export function setCachedBatch(
  items: Array<{ content: string; title: string }>,
  targetLang: string,
  results: Array<{ content: string; title: string }>
): void {
  const key = generateHash(JSON.stringify(items), targetLang);

  batchCache.set(key, {
    content: results.map(r => r.content).join('|||'),
    title: results.map(r => r.title).join('|||'),
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

/**
 * Clear all translation caches
 */
export function clearAllCaches(): void {
  contentCache.clear();
  titleCache.clear();
  batchCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  console.log('[TranslationCache] All caches cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  contentCacheSize: number;
  titleCacheSize: number;
  batchCacheSize: number;
  hits: number;
  misses: number;
  hitRate: number;
} {
  const total = cacheHits + cacheMisses;
  return {
    contentCacheSize: contentCache.size,
    titleCacheSize: titleCache.size,
    batchCacheSize: batchCache.size,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: total > 0 ? (cacheHits / total) * 100 : 0
  };
}

/**
 * Clean expired entries from all caches
 */
export function cleanExpiredEntries(): number {
  let cleaned = 0;
  const now = Date.now();

  // Clean content cache
  contentCache.forEach((entry, key) => {
    if (now > entry.expiresAt) {
      contentCache.delete(key);
      cleaned++;
    }
  });

  // Clean title cache
  titleCache.forEach((entry, key) => {
    if (now > entry.expiresAt) {
      titleCache.delete(key);
      cleaned++;
    }
  });

  // Clean batch cache
  batchCache.forEach((entry, key) => {
    if (now > entry.expiresAt) {
      batchCache.delete(key);
      cleaned++;
    }
  });

  if (cleaned > 0) {
    console.log(`[TranslationCache] Cleaned ${cleaned} expired entries`);
  }

  return cleaned;
}

// Export cache instance for direct access if needed
export const translationCache = {
  getContent: getCachedTranslation,
  setContent: setCachedTranslation,
  getTitle: getCachedTitle,
  setTitle: setCachedTitle,
  getBatch: getCachedBatch,
  setBatch: setCachedBatch,
  clearAll: clearAllCaches,
  getStats: getCacheStats,
  cleanExpired: cleanExpiredEntries
};

export default translationCache;
