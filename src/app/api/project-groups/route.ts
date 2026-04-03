// API Route: Project Groups
// Manage knowledge project groups for clustering related content

import { NextRequest, NextResponse } from 'next/server'
import { knowledgeSourceService } from '@/services/knowledge-source'

export async function GET() {
  try {
    const groups = await knowledgeSourceService.getProjectGroups()
    return NextResponse.json(groups)
  } catch (error) {
    console.error('Error fetching project groups:', error)
    return NextResponse.json(
      { error: 'Failed to fetch project groups' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, tags, coverImage } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Project group name is required' },
        { status: 400 }
      )
    }

    const group = await knowledgeSourceService.createProjectGroup({
      name,
      description,
      tags,
      coverImage
    })

    return NextResponse.json({ success: true, group })
  } catch (error) {
    console.error('Error creating project group:', error)
    return NextResponse.json(
      { error: 'Failed to create project group' },
      { status: 500 }
    )
  }
}
