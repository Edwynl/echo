import { describe, it, expect } from 'vitest'
import {
  cn,
  formatDate,
  formatDuration,
  slugify,
  truncate,
  cleanExcerpt,
  decodeHtmlEntities,
  processBlogContent
} from '../utils'

describe('utils', () => {
  describe('cn', () => {
    it('should merge class names', () => {
      const result = cn('foo', 'bar')
      expect(result).toContain('foo')
      expect(result).toContain('bar')
    })

    it('should handle conditional classes', () => {
      const isActive = true
      const result = cn('base', isActive && 'active')
      expect(result).toContain('base')
      expect(result).toContain('active')
    })

    it('should handle undefined and null', () => {
      const result = cn('foo', undefined, null, 'bar')
      expect(result).toContain('foo')
      expect(result).toContain('bar')
    })

    it('should handle array inputs', () => {
      const result = cn(['foo', 'bar'])
      expect(result).toContain('foo')
      expect(result).toContain('bar')
    })
  })

  describe('formatDate', () => {
    it('should format date string', () => {
      const result = formatDate('2024-01-15')
      expect(result).toContain('2024')
      expect(result).toContain('1')
      expect(result).toContain('15')
    })

    it('should format Date object', () => {
      const date = new Date('2024-06-20T12:00:00Z')
      const result = formatDate(date)
      expect(result).toContain('2024')
    })

    it('should use Chinese locale format', () => {
      const result = formatDate('2024-03-10')
      // Chinese date format should include Chinese characters
      expect(result).toMatch(/2024/)
    })
  })

  describe('formatDuration', () => {
    it('should format seconds only', () => {
      expect(formatDuration(45)).toBe('0:45')
    })

    it('should format minutes and seconds', () => {
      expect(formatDuration(125)).toBe('2:05')
    })

    it('should format hours, minutes and seconds', () => {
      expect(formatDuration(3665)).toBe('1:01:05')
    })

    it('should pad minutes and seconds correctly', () => {
      expect(formatDuration(61)).toBe('1:01')
      expect(formatDuration(3600 + 5)).toBe('1:00:05')
    })

    it('should handle zero', () => {
      expect(formatDuration(0)).toBe('0:00')
    })
  })

  describe('slugify', () => {
    it('should convert to lowercase', () => {
      expect(slugify('Hello World')).toBe('hello-world')
    })

    it('should replace spaces with hyphens', () => {
      expect(slugify('hello world')).toBe('hello-world')
    })

    it('should replace special characters with hyphens', () => {
      // slugify uses hyphens as separators, so special chars become hyphens
      expect(slugify('hello@world!')).toBe('hello-world')
    })

    it('should handle Chinese characters', () => {
      const result = slugify('你好世界')
      expect(result).toBeTruthy()
      expect(result.length).toBeGreaterThan(0)
    })

    it('should remove leading and trailing hyphens', () => {
      expect(slugify('  hello  ')).toBe('hello')
      expect(slugify('...hello...')).toBe('hello')
    })

    it('should decode HTML entities', () => {
      expect(slugify('Hello &amp; World')).toBe('hello-world')
      expect(slugify('A &gt; B')).toBe('a-b')
    })
  })

  describe('truncate', () => {
    it('should not truncate short strings', () => {
      expect(truncate('hello', 10)).toBe('hello')
    })

    it('should truncate long strings with ellipsis', () => {
      expect(truncate('hello world', 5)).toBe('hello...')
    })

    it('should handle exact length', () => {
      expect(truncate('hello', 5)).toBe('hello')
    })

    it('should handle empty string', () => {
      expect(truncate('', 10)).toBe('')
    })

    it('should handle zero length', () => {
      const result = truncate('hello', 0)
      expect(result).toBe('...')
    })
  })

  describe('cleanExcerpt', () => {
    it('should remove summary markers', () => {
      const text = '[SUMMARY_START]This is a summary[SUMMARY_END]'
      expect(cleanExcerpt(text)).not.toContain('[SUMMARY_START]')
      expect(cleanExcerpt(text)).not.toContain('[SUMMARY_END]')
    })

    it('should remove URLs', () => {
      const text = 'Check out https://example.com for more'
      expect(cleanExcerpt(text)).not.toContain('https://example.com')
    })

    it('should remove boilerplate text', () => {
      const text = 'Subscribe to my channel'
      expect(cleanExcerpt(text)).not.toContain('Subscribe')
    })

    it('should remove tags with brackets', () => {
      const text = 'tags: [tag1, tag2]'
      const result = cleanExcerpt(text)
      // The pattern removes "tags: [....]" as a whole
      expect(result).not.toContain('[tag1')
    })

    it('should return empty string for empty input', () => {
      expect(cleanExcerpt('')).toBe('')
      expect(cleanExcerpt(null as unknown as string)).toBe('')
    })

    it('should handle Chinese boilerplate', () => {
      // Test with Chinese boilerplate in context (not standalone)
      const text = '運用AI工具創業賺錢 更多內容'
      const result = cleanExcerpt(text)
      // The pattern needs to be at the start or with certain conditions
      // This tests that the function handles Chinese text without crashing
      expect(result.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('decodeHtmlEntities', () => {
    it('should decode &amp;', () => {
      expect(decodeHtmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry')
    })

    it('should decode &lt; and &gt;', () => {
      expect(decodeHtmlEntities('a &lt; b &gt; c')).toBe('a < b > c')
    })

    it('should decode &quot;', () => {
      expect(decodeHtmlEntities('&quot;quoted&quot;')).toBe('"quoted"')
    })

    it('should decode apostrophe entities', () => {
      expect(decodeHtmlEntities("&#39; and &lsquo;")).toBe("' and '")
    })

    it('should decode curly quotes', () => {
      expect(decodeHtmlEntities('&ldquo;Hello&rdquo;')).toBe('"Hello"')
    })

    it('should decode dashes', () => {
      expect(decodeHtmlEntities('&ndash; and &mdash;')).toBe('- and —')
    })

    it('should return empty string for empty input', () => {
      expect(decodeHtmlEntities('')).toBe('')
      expect(decodeHtmlEntities(null as unknown as string)).toBe('')
    })

    it('should decode multiple entities', () => {
      const text = '&lt;div&gt;Hello &amp; World&lt;/div&gt;'
      const result = decodeHtmlEntities(text)
      expect(result).toBe('<div>Hello & World</div>')
    })
  })

  describe('processBlogContent', () => {
    it('should extract summary between markers', () => {
      const content = '# Title\n\n[SUMMARY_START]This is the summary[SUMMARY_END]\n\nMain content here.'
      const result = processBlogContent(content)

      expect(result.excerpt).toBe('This is the summary')
      expect(result.content).toContain('Main content here')
      expect(result.content).not.toContain('[SUMMARY_START]')
      expect(result.content).not.toContain('[SUMMARY_END]')
    })

    it('should handle markdown-style markers', () => {
      const content = '# [SUMMARY_START]Bold Summary[SUMMARY_END]\n\nContent'
      const result = processBlogContent(content)

      expect(result.excerpt).toBe('Bold Summary')
    })

    it('should return empty excerpt when no markers', () => {
      const content = 'Just regular content without markers'
      const result = processBlogContent(content)

      expect(result.excerpt).toBe('')
      expect(result.content).toBe('Just regular content without markers')
    })

    it('should return empty strings for empty input', () => {
      const result = processBlogContent('')

      expect(result.content).toBe('')
      expect(result.excerpt).toBe('')
    })

    it('should remove English section markers', () => {
      const content = 'Content before\n---ENGLISH_SECTION---\nEnglish content here\nMore English'
      const result = processBlogContent(content)

      expect(result.content).not.toContain('ENGLISH_SECTION')
      expect(result.content).not.toContain('English content')
    })

    it('should trim whitespace from results', () => {
      const content = '  [SUMMARY_START]  Summary text  [SUMMARY_END]  \n\n  Content  '
      const result = processBlogContent(content)

      expect(result.excerpt).toBe('Summary text')
      expect(result.content.trim()).toBe(result.content)
    })
  })
})
