import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { MiniMaxService } from '@/services/minimax'

export const dynamic = 'force-dynamic'

const minimaxService = new MiniMaxService()

// Get LLM service based on provider setting
function getLLMService() {
  const provider = process.env.LLM_PROVIDER
  // Currently only MiniMax is implemented
  // Local LLM support can be added later
  return minimaxService
}

export async function GET() {
  try {
    const blogs = await prisma.blogPost.findMany({
      select: {
        id: true,
        title: true,
        content: true
      }
    })

    console.log(`[Admin] Starting batch update for ${blogs.length} blogs...`)
    const llmService = await getLLMService()
    const results = []

    for (const blog of blogs) {
      try {
        console.log(`[Admin] Updating excerpt for: ${blog.title}`)
        const oneSentenceSummary = await llmService.generateOneSentenceSummary(blog.content)
        
        await prisma.blogPost.update({
          where: { id: blog.id },
          data: { excerpt: oneSentenceSummary }
        })
        
        results.push({ id: blog.id, title: blog.title, status: 'success' })
        
        // Brief delay to avoid aggressive rate limiting
        await new Promise(resolve => setTimeout(resolve, 500))
      } catch (err) {
        console.error(`[Admin] Failed to update blog ${blog.id}:`, err)
        results.push({ id: blog.id, title: blog.title, status: 'failed', error: String(err) })
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      details: results
    })
  } catch (error) {
    console.error('[Admin] Batch update error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
