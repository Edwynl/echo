/**
 * Queue Add API
 * POST - Add a channel to the sync queue
 * DELETE - Remove an item from the queue
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { queueAddItem, queueGetStatus, queueRemoveItem, queueIsChannelInQueue } from '@/lib/queue-processor'
import type { QueueItem } from '@/lib/queue-types'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { channelId } = await request.json()

    if (!channelId) {
      return NextResponse.json({ success: false, error: 'Channel ID is required' }, { status: 400 })
    }

    const channel = await prisma.channel.findUnique({ where: { id: channelId } })
    if (!channel) {
      return NextResponse.json({ success: false, error: 'Channel not found' }, { status: 404 })
    }

    // Check if already in queue (and not completed) — from database
    if (await queueIsChannelInQueue(channelId)) {
      const status = await queueGetStatus()
      const existingItem = status.queue.find(item => item.channelId === channelId)

      return NextResponse.json({
        success: false,
        error: 'Channel is already in queue',
        queuePosition: existingItem ? status.queue.indexOf(existingItem) + 1 : undefined,
        status: existingItem?.status,
      }, { status: 409 })
    }

    // Build queue item
    const queueItem: QueueItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      channelId,
      channelName: channel.name,
      channelThumbnail: channel.thumbnail || '',
      status: 'pending',
      addedAt: new Date().toISOString(),
      progress: { current: 0, total: 5 },
    }

    // Persist to database
    await queueAddItem(queueItem)

    const status = await queueGetStatus()
    const queuePosition = status.queue.findIndex(i => i.id === queueItem.id) + 1

    return NextResponse.json({
      success: true,
      message: 'Channel added to queue. Sync will run via scheduled cron job.',
      queueId: queueItem.id,
      queuePosition,
      estimatedTime: queuePosition * 3,
      note: 'In serverless environment, queue is processed by Vercel Cron jobs.',
    })
  } catch (error) {
    console.error('Error adding to queue:', error)
    return NextResponse.json({ success: false, error: 'Failed to add channel to queue' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queueId = searchParams.get('queueId')

    if (!queueId) {
      return NextResponse.json({ success: false, error: 'Queue ID is required' }, { status: 400 })
    }

    const status = await queueGetStatus()
    const item = status.queue.find(i => i.id === queueId)

    if (!item) {
      return NextResponse.json({ success: false, error: 'Queue item not found' }, { status: 404 })
    }

    if (item.status === 'processing') {
      return NextResponse.json({ success: false, error: 'Cannot remove item currently being processed' }, { status: 400 })
    }

    await queueRemoveItem(queueId)

    return NextResponse.json({ success: true, message: 'Removed from queue' })
  } catch (error) {
    console.error('Error removing from queue:', error)
    return NextResponse.json({ success: false, error: 'Failed to remove from queue' }, { status: 500 })
  }
}
