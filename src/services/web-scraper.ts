// Web Scraper Service
// Handles fetching and parsing web content from technical blogs and documentation

interface ScrapedContent {
  title: string
  description: string
  content: string
  author?: string
  publishedAt?: string
  url: string
  siteName?: string
  image?: string
}

export class WebScraperService {
  private timeout: number

  constructor(timeout: number = 30000) {
    this.timeout = timeout
  }

  // Check if URL is valid
  isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url)
      return ['http:', 'https:'].includes(parsed.protocol)
    } catch {
      return false
    }
  }

  // Extract text content from HTML
  private extractText(html: string): string {
    // Remove script and style tags
    let text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')

    // Replace block elements with newlines
    text = text.replace(/<\/(p|div|h[1-6]|li|tr|br)[^>]*>/gi, '\n')

    // Remove remaining HTML tags
    text = text.replace(/<[^>]+>/g, '')

    // Decode HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))

    // Clean up whitespace
    text = text.replace(/[\r\n]+/g, '\n')
    text = text.replace(/[ \t]+/g, ' ')
    text = text.trim()

    return text
  }

  // Extract title from HTML
  private extractTitle(html: string): string {
    // Try og:title first
    let match = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    if (match) return match[1]

    // Try regular title tag
    match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (match) return this.decodeHtml(match[1])

    // Try h1
    match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)
    if (match) return this.decodeHtml(match[1])

    return ''
  }

  // Extract description from HTML
  private extractDescription(html: string): string {
    // Try og:description first
    let match = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
    if (match) return match[1]

    // Try meta description
    match = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    if (match) return match[1]

    return ''
  }

  // Extract author from HTML
  private extractAuthor(html: string): string | undefined {
    // Try meta author
    let match = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i)
    if (match) return match[1]

    // Try common author class patterns
    match = html.match(/<[^>]*class=["'][^"']*author[^"']*["'][^>]*>([^<]+)<\/[^>]+>/i)
    if (match) return match[1].trim()

    return undefined
  }

  // Extract published date from HTML
  private extractPublishedAt(html: string): string | undefined {
    // Try article:published_time
    let match = html.match(/<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i)
    if (match) return match[1]

    // Try time element
    match = html.match(/<time[^>]*datetime=["']([^"']+)["']/i)
    if (match) return match[1]

    // Try datePublished
    match = html.match(/<meta[^>]*itemprop=["']datePublished["'][^>]*content=["']([^"']+)["']/i)
    if (match) return match[1]

    return undefined
  }

  // Extract site name from HTML
  private extractSiteName(html: string, url: string): string | undefined {
    // Try og:site_name
    let match = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)
    if (match) return match[1]

    // Fallback to domain name
    try {
      const parsed = new URL(url)
      return parsed.hostname.replace('www.', '')
    } catch {
      return undefined
    }
  }

  // Extract main image from HTML
  private extractImage(html: string): string | undefined {
    // Try og:image
    let match = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    if (match) return match[1]

    // Try twitter:image
    match = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
    if (match) return match[1]

    return undefined
  }

  // Decode HTML entities
  private decodeHtml(text: string): string {
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
  }

  // Make request with timeout
  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          ...options.headers
        }
      })
      return response
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // Main scrape function
  async scrape(url: string): Promise<ScrapedContent | null> {
    if (!this.isValidUrl(url)) {
      console.error('Invalid URL:', url)
      return null
    }

    try {
      const response = await this.fetchWithTimeout(url)

      if (!response.ok) {
        console.error(`HTTP error: ${response.status}`)
        return null
      }

      const html = await response.text()

      // Extract metadata
      const title = this.extractTitle(html)
      const description = this.extractDescription(html)
      const author = this.extractAuthor(html)
      const publishedAt = this.extractPublishedAt(html)
      const siteName = this.extractSiteName(html, url)
      const image = this.extractImage(html)

      // Extract main content
      const textContent = this.extractText(html)

      // Additional content extraction heuristics
      let mainContent = textContent

      // Try to find article/main content area
      const articleMatch = html.match(/<(article|main|div[^>]*class=["'][^"']*content[^"']*["'])[^>]*>([\s\S]*?)<\/\1>/i)
      if (articleMatch) {
        const articleContent = this.extractText(articleMatch[2])
        if (articleContent.length > mainContent.length * 0.5) {
          mainContent = articleContent
        }
      }

      // Limit content length for AI processing
      const maxLength = 50000
      if (mainContent.length > maxLength) {
        mainContent = mainContent.slice(0, maxLength) + '...'
      }

      return {
        title,
        description,
        content: mainContent,
        author,
        publishedAt,
        url,
        siteName,
        image
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Scraping error:', error.message)
      }
      return null
    }
  }

  // Batch scrape multiple URLs
  async scrapeMultiple(urls: string[]): Promise<ScrapedContent[]> {
    const results = await Promise.all(
      urls.map(url => this.scrape(url).catch(() => null))
    )

    return results.filter((r): r is ScrapedContent => r !== null)
  }
}

export const webScraperService = new WebScraperService()
