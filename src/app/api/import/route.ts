import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { MiniMaxService } from '@/services/minimax'
import { cleanExcerpt, truncate, uniqueSlug } from '@/lib/utils'
import { WebScraperService } from '@/services/web-scraper'

const webScraper = new WebScraperService()
const minimaxService = new MiniMaxService()

// POST /api/import - Import content from MD file or URL
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, content, title, sourceUrl } = body

    if (!type || (!content && !sourceUrl)) {
      return NextResponse.json(
        { error: 'Type and either content or sourceUrl are required' },
        { status: 400 }
      )
    }

    let finalContentInput = content || ''
    let finalTitleInput = title || ''

    // If it's a web type and content is missing but sourceUrl is present, fetch it
    if (type === 'web' && !finalContentInput && sourceUrl) {
      try {
        const scraped = await webScraper.scrape(sourceUrl)
        if (scraped) {
          finalContentInput = scraped.content
          if (!finalTitleInput) finalTitleInput = scraped.title
        } else {
          return NextResponse.json(
            { error: 'Failed to fetch content from the provided URL' },
            { status: 400 }
          )
        }
      } catch (scrapeError) {
        console.error('Error scraping web content:', scrapeError)
        return NextResponse.json(
          { error: 'Error fetching web content' },
          { status: 500 }
        )
      }
    }

    if (type === 'md' && !finalTitleInput) {
      return NextResponse.json(
        { error: 'Title is required for MD import' },
        { status: 400 }
      )
    }

    if (!finalContentInput) {
       return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      )
    }

    // Generate blog using AI
    let blogContent = ''
    let finalTitle = finalTitleInput || ''
    const coverImage = ''

    try {
      if (type === 'md') {
        blogContent = await minimaxService.summarizeContent(
          finalContentInput,
          finalTitleInput,
          sourceUrl || ''
        )
      } else if (type === 'web') {
        // For web content, summarize and transform
        blogContent = await minimaxService.summarizeWebContent(
          finalContentInput,
          sourceUrl || ''
        )
        // Try to extract title from content if not provided
        if (!finalTitle && finalContentInput) {
          const lines = finalContentInput.split('\n').filter((l: string) => l.trim())
          if (lines.length > 0) {
            finalTitle = lines[0].slice(0, 100)
          }
        }
      }
    } catch (aiError) {
      console.error('Error generating blog content:', aiError)
      // Fallback: use original content if AI fails
      blogContent = finalContentInput
    }

    // Generate slug
    const slug = uniqueSlug(finalTitle)

    // Extract summary and clean content
    let finalExcerpt = truncate(cleanExcerpt(finalContentInput), 160)
    let finalContent = blogContent

    const summaryMatch = blogContent.match(/\[SUMMARY_START\]([\s\S]*?)\[SUMMARY_END\]/)
    if (summaryMatch && summaryMatch[1]) {
      finalExcerpt = summaryMatch[1].trim()
      finalContent = blogContent.replace(/\[SUMMARY_START\][\s\S]*?\[SUMMARY_END\]/, '').trim()
    }

    // Create blog post
    const blog = await prisma.blogPost.create({
      data: {
        title: finalTitle,
        slug,
        content: finalContent,
        excerpt: finalExcerpt,
        coverImage,
        status: 'published',
        sourceUrl: sourceUrl || null,
        publishedAt: new Date()
      }
    })

    return NextResponse.json(blog, { status: 201 })
  } catch (error) {
    console.error('Error importing content:', error)
    return NextResponse.json(
      { error: 'Failed to import content' },
      { status: 500 }
    )
  }
}
