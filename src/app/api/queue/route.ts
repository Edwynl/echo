/**
 * Queue Status API
 * GET - Returns current queue status
 */

import { NextResponse } from 'next/server'
import { queueGetStatus } from '@/lib/queue-processor'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    console.log('[Queue API] Starting...')
    const status = await queueGetStatus()
    console.log('[Queue API] Success:', JSON.stringify(status))
    return NextResponse.json({ success: true, ...status })
  } catch (error) {
    console.error('[Queue API] Error:', error instanceof Error ? error.message : String(error))
    console.error('[Queue API] Stack:', error instanceof Error ? error.stack : '')
    return NextResponse.json({ success: false, error: 'Failed to get queue status', detail: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
