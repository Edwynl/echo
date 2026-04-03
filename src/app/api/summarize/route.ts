// API endpoint: POST /api/summarize
// Accepts a URL, scrapes the content, and returns AI-generated summary

import { NextRequest, NextResponse } from 'next/server'
import { webScraperService } from '@/services/web-scraper'
import { minimaxService } from '@/services/minimax'

export const runtime = 'nodejs'

interface SummarizeRequest {
  url: string
  language?: 'zh' | 'en'
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SummarizeRequest
    const { url, language = 'zh' } = body

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    // Validate URL
    if (!webScraperService.isValidUrl(url)) {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    console.log(`[Summarize] Scraping URL: ${url}`)

    // Scrape the webpage
    const scraped = await webScraperService.scrape(url)

    if (!scraped) {
      return NextResponse.json(
        { error: 'Failed to scrape the webpage. The site may be blocking requests or the URL is invalid.' },
        { status: 422 }
      )
    }

    if (!scraped.content || scraped.content.length < 100) {
      return NextResponse.json(
        { error: 'Not enough content to summarize. Try a different URL with more text content.' },
        { status: 422 }
      )
    }

    console.log(`[Summarize] Scraped ${scraped.content.length} chars, generating summary...`)

    // Generate summary using MiniMax
    const summary = await minimaxService.summarizeWebContent(
      scraped.content,
      url
    )

    return NextResponse.json({
      success: true,
      data: {
        url,
        title: scraped.title || 'Untitled',
        siteName: scraped.siteName,
        description: scraped.description,
        summary,
        wordCount: scraped.content.split(/\s+/).length,
        scrapedAt: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('[Summarize] Error:', error)

    if (error instanceof Error) {
      if (error.message.includes('timeout') || error.message.includes('AbortError')) {
        return NextResponse.json(
          { error: 'Request timed out. The webpage took too long to respond.' },
          { status: 504 }
        )
      }
    }

    return NextResponse.json(
      { error: 'Internal server error while processing the request.' },
      { status: 500 }
    )
  }
}

// GET endpoint for simple URL parameter testing
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json(
      { error: 'URL parameter is required. Example: /api/summarize?url=https://example.com' },
      { status: 400 }
    )
  }

  const body: SummarizeRequest = { url }
  return POST(new NextRequest(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }))
}
