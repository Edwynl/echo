import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { MiniMaxService } from '@/services/minimax'
import { getTranscript } from '@/lib/youtube-transcript'
import { uniqueSlug } from '@/lib/utils'

const minimaxService = new MiniMaxService()

// POST /api/videos/generate - Generate blog for a specific video
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { videoId } = body

    if (!videoId) {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400 }
      )
    }

    // Get video with channel info
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { channel: true }
    })

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      )
    }

    // Check if blog already exists
    const existingBlog = await prisma.blogPost.findFirst({
      where: { videoId }
    })

    if (existingBlog) {
      return NextResponse.json(
        { error: 'Blog already exists', blog: existingBlog },
        { status: 409 }
      )
    }

    console.log('Generating blog for video:', video.title)

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
          where: { youtubeId: video.youtubeId },
          data: { hasTranscript: true, transcript }
        })
        console.log('Transcript fetched, length:', transcript.length)
      } catch (e) {
        console.error('Error getting transcript:', e)
        transcript = video.description || ''
      }
    }

    if (!transcript) {
      return NextResponse.json(
        { error: 'No transcript available for this video' },
        { status: 400 }
      )
    }

    // Generate blog using MiniMax API
    const youtubeUrl = `https://www.youtube.com/watch?v=${video.youtubeId}`

    console.log('Calling MiniMax API to generate blog...')
    const blogContent = await minimaxService.generateBlogPost(
      video.title,
      video.description || '',
      transcript,
      video.channel.name,
      youtubeUrl,
      video.thumbnail || ''
    )

    console.log('Blog generated, length:', blogContent.length)

    // Generate slug
    const slug = uniqueSlug(video.title)

    // Create blog post - use video's original publishedAt date
    const blog = await prisma.blogPost.create({
      data: {
        title: video.title,
        slug,
        content: blogContent,
        excerpt: video.description?.slice(0, 150) || video.title,
        coverImage: video.thumbnail,
        status: 'published',
        videoId,
        sourceUrl: youtubeUrl,
        publishedAt: video.publishedAt  // Use video's original release date
      }
    })

    console.log('Blog saved:', blog.id)
    return NextResponse.json(blog, { status: 201 })
  } catch (error) {
    console.error('Error generating blog:', error)
    return NextResponse.json(
      { error: `Failed to generate blog: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}

// GET /api/videos/generate - List videos without blogs
export async function GET(request: NextRequest) {
  try {
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
      take: 20
    })

    return NextResponse.json(videos)
  } catch (error) {
    console.error('Error fetching videos:', error)
    return NextResponse.json(
      { error: 'Failed to fetch videos' },
      { status: 500 }
    )
  }
}
