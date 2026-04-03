// Knowledge Source Service
// Unified service for managing all data sources (YouTube, GitHub, Web)

import { prisma } from '@/lib/prisma'
import { uniqueSlug } from '@/lib/utils'
import { githubService } from './github'
import { webScraperService } from './web-scraper'
import { minimaxService } from './minimax'
import { youtubeService } from './youtube'
import { getTranscript } from '@/lib/youtube-transcript'

export type SourceType = 'YOUTUBE' | 'GITHUB' | 'WEB' | 'YOUTUBE_CHANNEL'
export type SourceStatus = 'pending' | 'processing' | 'completed' | 'failed'

interface CreateSourceOptions {
  sourceType: SourceType
  sourceUrl: string
  title: string
  description?: string
  content?: string
  thumbnail?: string
  author?: string
  tags?: string
  projectGroupId?: string
}

interface ProcessSourceOptions {
  sourceId: string
  generateBlog?: boolean
}

export class KnowledgeSourceService {
  // Detect source type from URL
  detectSourceType(url: string): SourceType | null {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return 'YOUTUBE'
    }
    if (url.includes('github.com')) {
      return 'GITHUB'
    }
    // Default to WEB for other URLs
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return 'WEB'
    }
    return null
  }

  // Create a new knowledge source
  async createSource(options: CreateSourceOptions) {
    const externalId = this.extractExternalId(options.sourceType, options.sourceUrl)

    return await prisma.knowledgeSource.create({
      data: {
        sourceType: options.sourceType,
        externalId,
        sourceUrl: options.sourceUrl,
        title: options.title,
        description: options.description,
        content: options.content,
        thumbnail: options.thumbnail,
        author: options.author,
        tags: options.tags,
        projectGroupId: options.projectGroupId,
        status: 'pending'
      }
    })
  }

  // Extract external ID based on source type
  private extractExternalId(sourceType: SourceType, url: string): string | null {
    switch (sourceType) {
      case 'YOUTUBE':
        return youtubeService.extractVideoId(url)
      case 'GITHUB': {
        const parsed = githubService.parseRepoUrl(url)
        return parsed ? `${parsed.owner}/${parsed.repo}` : null
      }
      case 'WEB':
        try {
          const parsed = new URL(url)
          return parsed.hostname + parsed.pathname
        } catch {
          return null
        }
      default:
        return null
    }
  }

  // Process a knowledge source - fetch content and generate analysis
  async processSource(options: ProcessSourceOptions): Promise<void> {
    const { sourceId, generateBlog = true } = options

    // Update status to processing and clear old errors
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: 'processing', errorMessage: null }
    })

    try {
      const source = await prisma.knowledgeSource.findUnique({
        where: { id: sourceId }
      })

      if (!source) {
        throw new Error('Source not found')
      }

      let processedContent = ''

      switch (source.sourceType) {
        case 'YOUTUBE':
          processedContent = await this.processYouTubeSource(source)
          break
        case 'GITHUB':
          processedContent = await this.processGitHubSource(source)
          break
        case 'WEB':
          processedContent = await this.processWebSource(source)
          break
        default:
          throw new Error(`Unknown source type: ${source.sourceType}`)
      }

      // Update source with processed content
      const updatedSource = await prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: {
          processedContent,
          status: 'completed',
          errorMessage: null
        }
      })

      // Generate blog post if requested
      // For GitHub/Web sources, check processedContent; for YouTube, check content
      const hasContent = source.sourceType === 'YOUTUBE'
        ? updatedSource.content
        : (updatedSource.processedContent || updatedSource.content)

      if (generateBlog && updatedSource.title && hasContent) {
        await this.generateBlogPost(sourceId, updatedSource)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      await prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: {
          status: 'failed',
          errorMessage
        }
      })

      throw error
    }
  }

  // Process YouTube source
  private async processYouTubeSource(source: any): Promise<string> {
    const videoId = source.externalId

    if (!videoId) {
      throw new Error('No video ID found')
    }

    // Get video details
    const videoDetails = await youtubeService.getVideo(videoId)
    if (!videoDetails) {
      throw new Error('Failed to fetch video details')
    }

    // Get transcript
    let transcriptText = ''
    try {
      const transcript = await getTranscript(videoId)
      transcriptText = transcript.map(t => t.text).join(' ')
    } catch (e) {
      console.error('Failed to get transcript:', e)
      transcriptText = source.content || ''
    }

    // Update source with full data
    await prisma.knowledgeSource.update({
      where: { id: source.id },
      data: {
        content: transcriptText,
        title: videoDetails.title,
        description: videoDetails.description,
        thumbnail: videoDetails.thumbnail,
        author: videoDetails.channelTitle,
        status: 'completed',
        errorMessage: null
      }
    })

    // Generate AI analysis using MiniMax
    if (transcriptText) {
      const analysis = await minimaxService.summarizeVideo(
        videoDetails.title,
        videoDetails.description || '',
        transcriptText,
        videoDetails.channelTitle
      )

      // Extract tags from analysis
      const tags = analysis.tags?.join(', ')

      await prisma.knowledgeSource.update({
        where: { id: source.id },
        data: {
          tags,
          processedContent: JSON.stringify({
            summary: analysis.summary,
            keyPoints: analysis.keyPoints
          })
        }
      })

      return JSON.stringify(analysis)
    }

    return ''
  }

  // Process GitHub source
  private async processGitHubSource(source: any): Promise<string> {
    const repoUrl = source.sourceUrl

    // Analyze repository
    const analysis = await githubService.analyzeRepo(repoUrl)
    if (!analysis || !analysis.repo) {
      throw new Error('Failed to analyze repository')
    }

    const { repo, readme, languages, contributors, releases } = analysis

    // Prepare content for AI processing
    const content = `
# ${repo.fullName}

${repo.description}

## Stars: ${repo.stars} | Forks: ${repo.forks} | Language: ${repo.language}

## Topics: ${repo.topics.join(', ')}

${readme ? readme.content : 'No README found'}

## Top Contributors
${contributors.slice(0, 5).map(c => `- ${c.login} (${c.contributions} contributions)`).join('\n')}

## Recent Releases
${releases.slice(0, 3).map(r => `- ${r.tag_name}: ${r.name || ''}`).join('\n')}

## Languages
${Object.entries(languages).map(([lang, bytes]) => `${lang}: ${Math.round(bytes / 1000)}KB`).join(', ')}
    `.trim()

    // Update source
    await prisma.knowledgeSource.update({
      where: { id: source.id },
      data: {
        title: repo.fullName,
        description: repo.description,
        content,
        thumbnail: repo.ownerAvatar,
        author: repo.owner,
        tags: repo.topics.join(', ')
      }
    })

    // Generate AI analysis
    if (readme?.content) {
      const aiAnalysis = await minimaxService.summarizeContent(
        readme.content,
        repo.fullName,
        repo.url
      )

      return JSON.stringify({
        analysis: aiAnalysis,
        stats: {
          stars: repo.stars,
          forks: repo.forks,
          language: repo.language,
          topics: repo.topics
        },
        contributors: contributors.slice(0, 5),
        releases: releases.slice(0, 3)
      })
    } else {
      // Even without README, generate analysis from repo info
      const fallbackContent = `
# ${repo.fullName}

${repo.description}

Stars: ${repo.stars} | Forks: ${repo.forks} | Language: ${repo.language}

Topics: ${repo.topics.join(', ') || 'None'}
      `.trim()

      const aiAnalysis = await minimaxService.summarizeContent(
        fallbackContent,
        repo.fullName,
        repo.url
      )

      return JSON.stringify({
        analysis: aiAnalysis,
        stats: {
          stars: repo.stars,
          forks: repo.forks,
          language: repo.language,
          topics: repo.topics
        },
        contributors: contributors.slice(0, 5),
        releases: releases.slice(0, 3),
        note: 'Generated from repo metadata (no README found)'
      })
    }
  }

  // Process Web source
  private async processWebSource(source: any): Promise<string> {
    const url = source.sourceUrl

    // Scrape content
    const scraped = await webScraperService.scrape(url)
    if (!scraped) {
      throw new Error('Failed to scrape web content')
    }

    // Update source
    await prisma.knowledgeSource.update({
      where: { id: source.id },
      data: {
        title: scraped.title,
        description: scraped.description,
        content: scraped.content,
        thumbnail: scraped.image,
        author: scraped.author
      }
    })

    // Generate AI analysis
    const analysis = await minimaxService.summarizeWebContent(
      scraped.content,
      url
    )

    return JSON.stringify({
      title: scraped.title,
      analysis,
      metadata: {
        author: scraped.author,
        publishedAt: scraped.publishedAt,
        siteName: scraped.siteName
      }
    })
  }

  // Generate blog post from source
  private async generateBlogPost(sourceId: string, source: any): Promise<void> {
    const slug = uniqueSlug(source.title)

    let content = source.processedContent || source.content || ''

    // For different source types, generate appropriate blog content
    if (source.sourceType === 'YOUTUBE' && source.content) {
      const transcript = await getTranscript(source.externalId || '').then(t => t.map(t => t.text).join(' ')).catch(() => source.content) || source.content
      content = await minimaxService.generateBlogPost(
        source.title,
        source.description || '',
        transcript,
        source.author || 'Unknown',
        source.sourceUrl,
        source.thumbnail || ''
      )
    } else if (source.sourceType === 'GITHUB' || source.sourceType === 'WEB') {
      // For GitHub and Web, summarize if not already summarized
      if (!source.processedContent || source.processedContent.length < 100) {
        content = await minimaxService.summarizeContent(
          source.content || '',
          source.title,
          source.sourceUrl || ''
        )
      } else {
        // Extract analysis from JSON if it's a JSON string
        try {
          const parsed = JSON.parse(source.processedContent)
          content = parsed.analysis || parsed.content || source.processedContent
        } catch (e) {
          content = source.processedContent
        }
      }
    }

    // Prepare tags for Prisma
    const tagList = source.tags ? source.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : []

    // Clean content by removing AI thinking process tags (e.g., <think>...</think>)
    const cleanContent = typeof content === 'string' 
      ? content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
      : content

    // Check if a blog post already exists for this knowledge source
    const existingBlog = await prisma.blogPost.findFirst({
      where: { knowledgeSourceId: sourceId }
    })

    const blogData = {
      title: source.title,
      // If updating, keep the old slug to avoid broken links, unless it's new
      slug: existingBlog ? existingBlog.slug : slug,
      content: typeof cleanContent === 'string' ? cleanContent : JSON.stringify(cleanContent),
      excerpt: source.description?.slice(0, 200),
      coverImage: source.thumbnail,
      status: 'published',
      sourceType: source.sourceType.toLowerCase(),
      sourceUrl: source.sourceUrl,
      knowledgeSourceId: sourceId,
      publishedAt: existingBlog?.publishedAt || new Date(),
      tags: tagList.length > 0 ? {
        connectOrCreate: tagList.map((tagName: string) => ({
          where: { name: tagName },
          create: { name: tagName }
        }))
      } : undefined
    }

    if (existingBlog) {
      await prisma.blogPost.update({
        where: { id: existingBlog.id },
        data: blogData
      })
    } else {
      await prisma.blogPost.create({
        data: blogData
      })
    }
  }

  // Get all sources with optional filters
  async getSources(options: {
    sourceType?: SourceType
    status?: SourceStatus
    projectGroupId?: string
    limit?: number
    offset?: number
  } = {}) {
    const { sourceType, status, projectGroupId, limit = 20, offset = 0 } = options

    const where: any = {}
    if (sourceType) where.sourceType = sourceType
    if (status) where.status = status
    if (projectGroupId) where.projectGroupId = projectGroupId

    const [sources, total] = await Promise.all([
      prisma.knowledgeSource.findMany({
        where,
        orderBy: { generatedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          projectGroup: true,
          blogPosts: {
            select: { id: true, title: true, slug: true }
          }
        }
      }),
      prisma.knowledgeSource.count({ where })
    ])

    return { sources, total }
  }

  // Get single source by ID
  async getSource(id: string) {
    return await prisma.knowledgeSource.findUnique({
      where: { id },
      include: {
        projectGroup: true,
        blogPosts: true
      }
    })
  }

  // Delete source
  async deleteSource(id: string) {
    return await prisma.knowledgeSource.delete({
      where: { id }
    })
  }

  // Create project group
  async createProjectGroup(data: {
    name: string
    description?: string
    tags?: string
    coverImage?: string
  }) {
    return await prisma.projectGroup.create({ data })
  }

  // Get all project groups
  async getProjectGroups() {
    return await prisma.projectGroup.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { sources: true }
        }
      }
    })
  }
}

export const knowledgeSourceService = new KnowledgeSourceService()
