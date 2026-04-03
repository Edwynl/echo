import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

/**
 * Generate a URL-safe slug from text.
 * - Handles Chinese characters
 * - Truncates to 50 chars
 * - Use this everywhere slugs are generated (was previously duplicated in 11 places)
 */
export function slugify(text: string): string {
  return decodeHtmlEntities(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

/**
 * Generate a unique slug by appending a timestamp suffix.
 * Use when you need guaranteed uniqueness (e.g., blog posts, imports).
 */
export function uniqueSlug(text: string): string {
  return `${slugify(text)}-${Date.now()}`
}

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return text.slice(0, length) + '...'
}

export function cleanExcerpt(text: string): string {
  if (!text) return ''
  
  // 1. Remove markers and tags
  let cleaned = text
    .replace(/\[SUMMARY_START\]/gi, '')
    .replace(/\[SUMMARY_END\]/gi, '')
    .replace(/tags:?\s*\[.*?\]/gi, '')
  
  // 2. Remove URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '')
  
  // 3. Remove common YouTube boilerplate & AI Disclaimers
  const patterns = [
    /ALL Systems/gi,
    /FREE.*?Prompts/gi,
    /Check out our/gi,
    /Join the.*?community/gi,
    /運用AI工具?[創创]業[賺赚]錢/g,
    /运用AI工具?[創创]业[赚赚]钱/g,
    /並運用.*?[創创]業[賺赚]錢/g,
    /并运用.*?[創创]业[赚赚]钱/g,
    /此博文[總总][結结]自[視视][頻频]内容/g,
    /加入.*?社群/g,
    /加入我的/g,
    /訂閱我的頻道/g,
    /订阅我的频道/g,
    /Li Harry/gi,
    /李哈利/g,
    /Subscribe/gi,
    /Follow me/gi,
    /Check out/gi,
    /Skool/gi,
    /Discord/gi,
    /Telegram/gi
  ]
  
  patterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '')
  })
  
  // 4. Clean up punctuation artifacts (e.g., lone colons or dashes left after removals)
  cleaned = cleaned
    .replace(/^[\：\:\-\|\s]+/, '') // Start
    .replace(/[\：\:\-\|\s]+$/, '') // End
    .replace(/\s+/g, ' ')
    .trim()
  
  // 5. Final fallback: if it's too skeletal (like just a separator), return empty or original cleaned
  if (cleaned.length < 2 && text.length > 5) {
     return text.slice(0, 160).replace(/\[.*?\]/g, '').trim()
  }
  
  return cleaned
}

// 4. Decode HTML Entities
export function decodeHtmlEntities(text: string): string {
  if (!text) return ''
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '—')
}

// 5. Process Blog Content (Extract Summary & Clean Marks)
export function processBlogContent(content: string) {
  if (!content) return { content: '', excerpt: '' }

  let excerpt = ''
  let cleaned = content

  // Match [SUMMARY_START]...[SUMMARY_END] with various possible surrounding characters
  // Like # [SUMMARY_START] or **[SUMMARY_START]**
  const summaryRegex = /(?:#+\s*|\*\*|__)?\[SUMMARY_START\]([\s\S]*?)\[SUMMARY_END\](?:\*\*|__)?/i
  const match = cleaned.match(summaryRegex)

  if (match) {
    excerpt = match[1].trim()
    // Remove the entire matched block
    cleaned = cleaned.replace(summaryRegex, '').trim()
  }

  // Robustly remove legacy or duplicate patterns
  const patternsToRemove = [
    /\[SUMMARY_START\]/gi,
    /\[SUMMARY_END\]/gi,
    /---ENGLISH_SECTION---[\s\S]*/gi,
    /SUMMARY_START/g,
    /SUMMARY_END/g
  ]

  patternsToRemove.forEach(p => {
    cleaned = cleaned.replace(p, '')
  })

  // Fix duplicate "总结" or "Summary" headers that often happen at the end
  const conclusionPatterns = [/^#+\s*总结\s*$/gm, /^#+\s*Conclusion\s*$/gm]
  conclusionPatterns.forEach(p => {
    const matches = cleaned.match(p)
    if (matches && matches.length > 1) {
      cleaned = cleaned.replace(/(#+\s*总结\s*)\s*$/g, '')
    }
  })

  return {
    content: cleaned.trim(),
    excerpt: excerpt.trim()
  }
}
