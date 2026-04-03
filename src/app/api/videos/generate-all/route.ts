import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { MiniMaxService } from '@/services/minimax'
import { getTranscript } from '@/lib/youtube-transcript'
import { uniqueSlug } from '@/lib/utils'

const minimaxService = new MiniMaxService()

// POST /api/videos/generate-all - Generate blogs for all videos without blogs
export async function POST(request: NextRequest) {
  try {
    // Get all videos without blogs
    const videos = await prisma.video.findMany({
      where: {
        blogPosts: {
          none: {}
        }
      },
      include: {
        channel: true
      },
      orderBy: { publishedAt: 'desc' },
      take: 3 // Limit to 3 at a time to avoid timeout
    })

    if (videos.length === 0) {
      return NextResponse.json({
        message: 'No videos without blogs found'
      })
    }

    const results = []

    for (const video of videos) {
      console.log('Processing video:', video.title)

      // Get transcript
      let transcript = video.transcript || ''

      if (!transcript) {
        try {
          console.log('Fetching transcript for:', video.youtubeId)
          const transcriptData = await getTranscript(video.youtubeId)
          transcript = transcriptData.map(t => t.text).join(' ')
          transcript = transcript.slice(0, 20000)

          // Save transcript
          await prisma.video.update({
            where: { id: video.id },
            data: { hasTranscript: true, transcript }
          })
        } catch (e) {
          console.error('Error getting transcript:', e)
          transcript = video.description || ''
        }
      }

      if (!transcript) {
        results.push({ title: video.title, status: 'no_transcript' })
        continue
      }

      // Generate blog using MiniMax API
      const youtubeUrl = `https://www.youtube.com/watch?v=${video.youtubeId}`

      let blogContent: string

      try {
        console.log('Generating blog for:', video.title)

        blogContent = await minimaxService.generateBlogPost(
          video.title,
          video.description || '',
          transcript,
          video.channel.name,
          youtubeUrl,
          video.thumbnail || ''
        )

        const slug = uniqueSlug(video.title)

        await prisma.blogPost.create({
          data: {
            title: video.title,
            slug,
            content: blogContent,
            excerpt: video.description?.slice(0, 150) || video.title,
            coverImage: video.thumbnail,
            status: 'published',
            videoId: video.id,
            sourceUrl: youtubeUrl,
            publishedAt: video.publishedAt  // Use video's original release date
          }
        })

        results.push({ title: video.title, status: 'generated' })
        console.log('Blog generated for:', video.title)

        // Wait to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 3000))
      } catch (e) {
        console.error('Error generating blog:', e)
        results.push({ title: video.title, status: 'error', error: String(e) })
      }
    }

    return NextResponse.json({
      success: true,
      results,
      message: `Processed ${results.length} videos`
    })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    )
  }
}

// GET - Check how many videos need blogs
export async function GET() {
  const count = await prisma.video.count({
    where: {
      blogPosts: {
        none: {}
      }
    }
  })

  return NextResponse.json({
    videosWithoutBlogs: count
  })
}
