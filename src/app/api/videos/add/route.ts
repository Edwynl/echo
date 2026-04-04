import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { YouTubeService } from '@/services/youtube'
import { MiniMaxService } from '@/services/minimax'
import { getTranscript } from '@/lib/youtube-transcript'
import { uniqueSlug, cleanExcerpt, truncate } from '@/lib/utils'

const youtubeService = new YouTubeService()
const minimaxService = new MiniMaxService()

// POST /api/videos/add - Add a single video and generate blog post
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { videoUrl } = body

    if (!videoUrl) {
      return NextResponse.json(
        { error: 'Video URL is required' },
        { status: 400 }
      )
    }

    // Extract video ID from URL
    const videoId = youtubeService.extractVideoId(videoUrl)

    if (!videoId) {
      return NextResponse.json(
        { error: 'Invalid YouTube video URL or video not found' },
        { status: 400 }
      )
    }

    // Check if video already exists
    const existingVideo = await prisma.video.findUnique({
      where: { youtubeId: videoId }
    })

    if (existingVideo) {
      return NextResponse.json(
        { error: 'Video already exists', video: existingVideo },
        { status: 409 }
      )
    }

    // Get video details from YouTube
    const videoDetails = await youtubeService.getVideo(videoId)

    if (!videoDetails) {
      return NextResponse.json(
        { error: 'Failed to fetch video details from YouTube' },
        { status: 400 }
      )
    }

    // Find or create channel
    let channel = await prisma.channel.findUnique({
      where: { youtubeId: videoDetails.channelId }
    })

    if (!channel) {
      // Create channel
      channel = await prisma.channel.create({
        data: {
          youtubeId: videoDetails.channelId,
          name: videoDetails.channelTitle,
          description: '',
          thumbnail: '',
          isActive: true
        }
      })
    }

    // Create video
    const video = await prisma.video.create({
      data: {
        youtubeId: videoDetails.youtubeId,
        channelId: channel.id,
        title: videoDetails.title,
        description: videoDetails.description,
        thumbnail: videoDetails.thumbnail,
        duration: videoDetails.duration || 0,
        publishedAt: new Date(videoDetails.publishedAt),
        viewCount: videoDetails.viewCount || 0,
        hasTranscript: false
      }
    })

    // ============================================================================
    // Generate blog post
    // ============================================================================
    let blogGenerated = false
    let blogPost = null
    let transcriptText = ''
    let transcriptError = null

    // Fetch transcript
    try {
      console.log(`[Videos Add] Fetching transcript for: ${videoId}`)
      const transcriptData = await getTranscript(videoId)
      transcriptText = transcriptData.map(t => t.text).join(' ').slice(0, 20000)
      console.log(`[Videos Add] Transcript length: ${transcriptText.length}`)
      if (transcriptText) {
        await prisma.video.update({
          where: { id: video.id },
          data: { hasTranscript: true, transcript: transcriptText }
        })
      }
    } catch (e) {
      console.error('[Videos Add] Transcript error:', e)
      transcriptError = e instanceof Error ? e.message : String(e)
      // Fallback to description if transcript unavailable
      transcriptText = videoDetails.description || ''
      console.log(`[Videos Add] Fallback to description, length: ${transcriptText.length}`)
    }

    // Generate blog post if we have content
    if (transcriptText) {
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`

      try {
        console.log(`[Videos Add] Generating blog for: ${videoDetails.title}`)
        const blogContent = await minimaxService.generateBlogPost(
          videoDetails.title,
          videoDetails.description || '',
          transcriptText,
          channel.name,
          youtubeUrl,
          videoDetails.thumbnail || ''
        )

        let finalExcerpt = truncate(cleanExcerpt(videoDetails.description || videoDetails.title), 160)
        let finalContent = blogContent
        const summaryMatch = blogContent.match(/\[SUMMARY_START\]([\s\S]*?)\[SUMMARY_END\]/)
        if (summaryMatch?.[1]) {
          finalExcerpt = summaryMatch[1].trim()
          finalContent = blogContent.replace(/\[SUMMARY_START\][\s\S]*?\[SUMMARY_END\]/, '').trim()
        }

        blogPost = await prisma.blogPost.create({
          data: {
            title: videoDetails.title,
            slug: uniqueSlug(videoDetails.title),
            content: finalContent,
            excerpt: finalExcerpt,
            coverImage: videoDetails.thumbnail,
            status: 'published',
            videoId: video.id,
            sourceUrl: youtubeUrl,
            publishedAt: new Date()
          }
        })
        blogGenerated = true
        console.log(`[Videos Add] Blog generated successfully: ${videoDetails.title}`)
      } catch (e) {
        console.error('[Videos Add] Blog generation error:', e)
      }
    } else {
      console.log(`[Videos Add] No transcript text, skipping blog generation`)
    }

    return NextResponse.json({
      video,
      channel,
      blogGenerated,
      transcriptAvailable: !!transcriptText,
      transcriptError,
      blogPost,
      message: blogGenerated ? 'Video added and blog post generated' : 'Video added successfully'
    }, { status: 201 })
  } catch (error) {
    console.error('Error adding video:', error)
    return NextResponse.json(
      { error: 'Failed to add video' },
      { status: 500 }
    )
  }
}
