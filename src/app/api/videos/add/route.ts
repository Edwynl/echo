import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { YouTubeService } from '@/services/youtube'

const youtubeService = new YouTubeService()

// POST /api/videos/add - Add a single video
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

    return NextResponse.json({
      video,
      channel,
      message: 'Video added successfully'
    }, { status: 201 })
  } catch (error) {
    console.error('Error adding video:', error)
    return NextResponse.json(
      { error: 'Failed to add video' },
      { status: 500 }
    )
  }
}
