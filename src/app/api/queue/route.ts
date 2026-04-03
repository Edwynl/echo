/**
 * Queue Status API
 * GET - Returns current queue status
 */

import { NextResponse } from 'next/server'
import { queueGetStatus, queueClearCompleted } from '@/lib/queue-processor'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const status = await queueGetStatus()
    return NextResponse.json({ success: true, ...status })
  } catch (error) {
    console.error('Error getting queue status:', error)
    return NextResponse.json({ success: false, error: 'Failed to get queue status' }, { status: 500 })
  }
}
