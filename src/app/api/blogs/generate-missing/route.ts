import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { minimaxService } from '@/services/minimax'
import { processBlogContent, slugify } from '@/lib/utils'
import { processWithRateLimit, summarizeResults } from '@/lib/concurrency'
import { checkRateLimit, getClientId, getRateLimitHeaders } from '@/lib/rate-limit'

const ENDPOINT = '/api/blogs/generate-missing'

// Video type for processing
interface VideoToProcess {
  id: string
  youtubeId: string
  title: string
  description: string | null
  thumbnail: string | null
  transcript: string | null
  channel: {
    name: string
  }
}

// Process a single video to generate blog
async function processVideoForBlog(video: VideoToProcess): Promise<{ id: string; title: string; status: string; reason?: string; error?: string }> {
  try {
    console.log(`[generate-missing] Processing: ${video.title}`)

    // Ensure we have transcript
    let transcript = video.transcript
    if (!transcript && video.description) {
      transcript = video.description
    }

    if (!transcript) {
      return { id: video.id, title: video.title, status: 'skipped', reason: 'No transcript/description' }
    }

    const youtubeUrl = `https://youtube.com/watch?v=${video.youtubeId}`
    const blogContent = await minimaxService.generateBlogPost(
      video.title,
      video.description || '',
      transcript,
      video.channel.name,
      youtubeUrl,
      video.thumbnail || ''
    )

    // Process content (extract summary and clean marks)
    const { content: finalContent, excerpt: finalExcerpt } = processBlogContent(blogContent)

    const baseSlug = slugify(video.title)

    // Triple-check existence in loop for safety
    const existingBlog = await prisma.blogPost.findFirst({
      where: { videoId: video.id }
    })

    if (existingBlog) {
      await prisma.blogPost.update({
        where: { id: existingBlog.id },
        data: {
          title: video.title,
          content: finalContent,
          excerpt: finalExcerpt,
          coverImage: video.thumbnail,
          status: 'published'
        }
      })
    } else {
      await prisma.blogPost.create({
        data: {
          title: video.title,
          slug: `${baseSlug}-${Date.now()}`,
          content: finalContent,
          excerpt: finalExcerpt,
          coverImage: video.thumbnail,
          status: 'published',
          videoId: video.id,
          sourceUrl: youtubeUrl,
          publishedAt: new Date()
        }
      })
    }

    return { id: video.id, title: video.title, status: 'success' }
  } catch (err: any) {
    console.error(`[generate-missing] Failed to generate for ${video.id}:`, err)
    return { id: video.id, title: video.title, status: 'failed', error: err.message }
  }
}

export async function POST(request: Request) {
  try {
    // Rate limiting check
    const clientId = getClientId(request)
    const rateLimitResult = checkRateLimit(ENDPOINT, clientId)
    const headers = getRateLimitHeaders(rateLimitResult)

    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.', retryAfter },
        { status: 429, headers }
      )
    }

    // 1. Find all videos that DO NOT have a blog post
    const videosWithoutBlogs = await prisma.video.findMany({
      where: {
        blogPosts: {
          none: {}
        }
      },
      include: {
        channel: true
      },
      orderBy: {
        publishedAt: 'desc'
      }
    })

    if (videosWithoutBlogs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All videos already have blog posts.',
        generatedCount: 0
      }, { headers })
    }

    // 2. Process them with concurrency control
    const MAX_BATCH = 10
    const batch = videosWithoutBlogs.slice(0, MAX_BATCH)

    console.log(`[generate-missing] Found ${videosWithoutBlogs.length} videos missing blogs. Processing ${batch.length} with concurrency control...`)

    // Process videos with concurrency control (3 concurrent, 2s delay between API calls)
    const results = await processWithRateLimit(batch, async (video, index) => {
      return processVideoForBlog(video)
    }, {
      concurrency: 3,
      delayMs: 2000,
      onProgress: (completed, total) => {
        console.log(`[generate-missing] Progress: ${completed}/${total}`)
      }
    })

    // Format results
    const formattedResults = results.map(r => r.data as { id: string; title: string; status: string; reason?: string; error?: string })
    const summary = summarizeResults(results)

    return NextResponse.json({
      success: true,
      totalMissing: videosWithoutBlogs.length,
      generatedInThisBatch: summary.successful,
      results: formattedResults,
      summary: {
        total: summary.total,
        successful: summary.successful,
        failed: summary.failed,
        successRate: `${summary.successRate}%`,
        errors: summary.errors.map(e => ({ id: (e.item as VideoToProcess).id, title: (e.item as VideoToProcess).title, error: e.error }))
      }
    }, { headers })
  } catch (error: any) {
    console.error('[generate-missing] Error in generate-missing:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
