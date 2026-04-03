import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { minimaxService } from '@/services/minimax'
import { processWithRateLimit, summarizeResults } from '@/lib/concurrency'

export const dynamic = 'force-dynamic'

// Blog type for processing
interface BlogToProcess {
  id: string
  title: string
  excerpt: string | null
  video: {
    id: string
    youtubeId: string
    title: string
    description: string | null
    thumbnail: string | null
    transcript: string | null
    channel: {
      name: string
    }
  } | null
}

// Process a single blog to rebuild it
async function processBlogRebuild(blog: BlogToProcess): Promise<{ id: string; title: string; status: string; reason?: string; error?: string }> {
  if (!blog.video || !blog.video.transcript) {
    return { id: blog.id, title: blog.title, status: 'skipped', reason: 'No video or transcript' }
  }

  try {
    console.log(`[rebuild-blogs] Rebuilding: ${blog.title} (${blog.id})`)

    const newContent = await minimaxService.generateBlogPost(
      blog.video.title,
      blog.video.description || '',
      blog.video.transcript,
      blog.video.channel.name,
      `https://youtube.com/watch?v=${blog.video.youtubeId}`,
      blog.video.thumbnail || ''
    )

    // Parse summary from the end of content
    let excerpt = blog.excerpt || ''
    const summaryMatch = newContent.match(/\[SUMMARY_START\]([\s\S]*?)\[SUMMARY_END\]/)
    if (summaryMatch) {
      excerpt = summaryMatch[1].trim()
    }

    // Strip markers
    const clearContent = newContent
      .replace(/\[SUMMARY_START\][\s\S]*?\[SUMMARY_END\]/, '')
      .trim()

    await prisma.blogPost.update({
      where: { id: blog.id },
      data: {
        content: clearContent,
        excerpt: excerpt,
        updatedAt: new Date()
      }
    })

    return { id: blog.id, title: blog.title, status: 'success' }
  } catch (err: any) {
    console.error(`[rebuild-blogs] Failed to rebuild ${blog.id}:`, err)
    return { id: blog.id, title: blog.title, status: 'failed', error: err.message }
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100
    const force = searchParams.get('force') === 'true'

    // Get all blog posts that have associated videos
    const blogs = await prisma.blogPost.findMany({
      include: {
        video: {
          include: {
            channel: true
          }
        }
      },
      take: limit,
      orderBy: { generatedAt: 'desc' }
    })

    if (blogs.length === 0) {
      return NextResponse.json({
        message: 'No blogs found to rebuild',
        results: []
      })
    }

    console.log(`[rebuild-blogs] Starting rebuild for ${blogs.length} blogs with concurrency control...`)

    // Process blogs with concurrency control (3 concurrent, 2s delay between API calls)
    const results = await processWithRateLimit(blogs, async (blog, index) => {
      return processBlogRebuild(blog)
    }, {
      concurrency: 3,
      delayMs: 2000,
      onProgress: (completed, total) => {
        console.log(`[rebuild-blogs] Progress: ${completed}/${total}`)
      }
    })

    // Format results
    const formattedResults = results.map(r => r.data as { id: string; title: string; status: string; reason?: string; error?: string })
    const summary = summarizeResults(results)

    return NextResponse.json({
      message: `Processed ${blogs.length} blogs`,
      results: formattedResults,
      summary: {
        total: summary.total,
        successful: summary.successful,
        skipped: formattedResults.filter(r => r.status === 'skipped').length,
        failed: summary.failed,
        successRate: `${summary.successRate}%`,
        errors: summary.errors.map(e => ({ id: (e.item as BlogToProcess).id, title: (e.item as BlogToProcess).title, error: e.error }))
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
