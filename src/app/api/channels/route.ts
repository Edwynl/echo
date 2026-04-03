import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { YouTubeService } from '@/services/youtube'
import { channelListCache, withCache } from '@/lib/api-cache'

const youtubeService = new YouTubeService()

// GET /api/channels - List all channels
export async function GET() {
  try {
    const channels = await withCache(channelListCache, 'all', async () =>
      prisma.channel.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { videos: true }
          }
        }
      })
    )

    return NextResponse.json(channels)
  } catch (error) {
    console.error('Error fetching channels:', error)
    return NextResponse.json(
      { error: 'Failed to fetch channels' },
      { status: 500 }
    )
  }
}

// POST /api/channels - Add a new channel
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { channelUrl } = body

    if (!channelUrl) {
      return NextResponse.json(
        { error: 'Channel URL is required' },
        { status: 400 }
      )
    }

    // Resolve channel ID from URL
    const channelId = await youtubeService.resolveChannelId(channelUrl)

    if (!channelId) {
      return NextResponse.json(
        { error: 'Invalid YouTube channel URL or channel not found' },
        { status: 400 }
      )
    }

    // Check if channel already exists
    const existingChannel = await prisma.channel.findUnique({
      where: { youtubeId: channelId }
    })

    if (existingChannel) {
      return NextResponse.json(
        { error: 'Channel already exists', channel: existingChannel },
        { status: 409 }
      )
    }

    // Fetch channel details from YouTube
    const channelDetails = await youtubeService.getChannel(channelId)

    if (!channelDetails) {
      return NextResponse.json(
        { error: 'Failed to fetch channel details from YouTube' },
        { status: 400 }
      )
    }

    // Create channel in database
    const channel = await prisma.channel.create({
      data: {
        youtubeId: channelDetails.id,
        name: channelDetails.name,
        description: channelDetails.description,
        thumbnail: channelDetails.thumbnail,
        isActive: true
      }
    })

    return NextResponse.json(channel, { status: 201 })
  } catch (error) {
    console.error('Error adding channel:', error)
    return NextResponse.json(
      { error: 'Failed to add channel' },
      { status: 500 }
    )
  }
}

// DELETE /api/channels - Delete a channel
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Channel ID is required' },
        { status: 400 }
      )
    }

    await prisma.channel.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting channel:', error)
    return NextResponse.json(
      { error: 'Failed to delete channel' },
      { status: 500 }
    )
  }
}

// PATCH /api/channels - Update channel (toggle active)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, isActive } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Channel ID is required' },
        { status: 400 }
      )
    }

    const channel = await prisma.channel.update({
      where: { id },
      data: { isActive }
    })

    return NextResponse.json(channel)
  } catch (error) {
    console.error('Error updating channel:', error)
    return NextResponse.json(
      { error: 'Failed to update channel' },
      { status: 500 }
    )
  }
}
