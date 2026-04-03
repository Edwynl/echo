// API Route: Individual Knowledge Source Management
// Handles updating/reprocessing and deleting sources

import { NextRequest, NextResponse } from 'next/server'
import { knowledgeSourceService } from '@/services/knowledge-source'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id
    const body = await request.json()
    const { reprocess } = body

    if (reprocess) {
      // Logic for reprocessing: update status to pending and trigger processing
      // Note: knowledgeSourceService.processSource handles status updates internally
      knowledgeSourceService.processSource({
        sourceId: id,
        generateBlog: true
      }).catch(console.error)

      return NextResponse.json({
        success: true,
        message: 'Re-processing started in background.'
      })
    }

    return NextResponse.json(
      { error: 'Invalid update request' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error updating source:', error)
    return NextResponse.json(
      { error: 'Failed to update source' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id
    await knowledgeSourceService.deleteSource(id)
    return NextResponse.json({ success: true, message: 'Source deleted' })
  } catch (error) {
    console.error('Error deleting source:', error)
    return NextResponse.json(
      { error: 'Failed to delete source' },
      { status: 500 }
    )
  }
}
