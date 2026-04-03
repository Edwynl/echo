import { NextRequest, NextResponse } from 'next/server'
import { GitHubService } from '@/services/github'

const githubService = new GitHubService()

// POST /api/github/analyze-readme
// Analyze links in a GitHub repository's README
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, content, owner, repo } = body

    let readmeContent = content

    // If URL is provided, fetch README from GitHub
    if (url && !content) {
      const parsed = githubService.parseRepoUrl(url)
      if (!parsed) {
        return NextResponse.json(
          { error: 'Invalid GitHub URL' },
          { status: 400 }
        )
      }

      const readme = await githubService.getReadme(parsed.owner, parsed.repo)
      if (!readme) {
        return NextResponse.json(
          { error: 'README not found in repository' },
          { status: 404 }
        )
      }

      readmeContent = readme.content
    }

    // If owner/repo provided but no content, fetch README
    if (!readmeContent && owner && repo) {
      const readme = await githubService.getReadme(owner, repo)
      if (!readme) {
        return NextResponse.json(
          { error: 'README not found in repository' },
          { status: 404 }
        )
      }
      readmeContent = readme.content
    }

    if (!readmeContent) {
      return NextResponse.json(
        { error: 'Please provide either url, content, or owner/repo' },
        { status: 400 }
      )
    }

    // Analyze the README content
    const analysis = githubService.analyzeReadmeLinks(readmeContent)

    return NextResponse.json(analysis)
  } catch (error) {
    console.error('Error analyzing README links:', error)
    return NextResponse.json(
      { error: 'Failed to analyze README links' },
      { status: 500 }
    )
  }
}

// GET /api/github/analyze-readme
// Analyze links from a GitHub repository URL
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const url = searchParams.get('url')

    if (!url) {
      return NextResponse.json(
        { error: 'GitHub repository URL is required' },
        { status: 400 }
      )
    }

    const parsed = githubService.parseRepoUrl(url)
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid GitHub URL' },
        { status: 400 }
      )
    }

    const readme = await githubService.getReadme(parsed.owner, parsed.repo)
    if (!readme) {
      return NextResponse.json(
        { error: 'README not found in repository' },
        { status: 404 }
      )
    }

    const analysis = githubService.analyzeReadmeLinks(readme.content)

    return NextResponse.json(analysis)
  } catch (error) {
    console.error('Error analyzing README links:', error)
    return NextResponse.json(
      { error: 'Failed to analyze README links' },
      { status: 500 }
    )
  }
}
