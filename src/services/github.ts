// GitHub API Service
// Handles repository info, README fetching, and code structure analysis

import { GITHUB_CONFIG } from '@/config'
import { HttpError } from '@/types/api'

// Cache configuration
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour in milliseconds

// Cache entry type
interface CacheEntry<T> {
  data: T
  timestamp: number
}

// API Response types
interface GitHubRepoResponse {
  id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  stargazers_count: number
  forks_count: number
  language: string | null
  topics: string[]
  owner: {
    login: string
    avatar_url: string
  }
  pushed_at: string
  default_branch: string
}

interface GitHubContentResponse {
  name: string
  path: string
  sha: string
  size: number
  html_url: string
  git_url: string
  download_url: string | null
  content?: string // Base64 encoded for files
  encoding?: string
  type: 'file' | 'dir'
}

interface GitHubReadmeResponse {
  name: string
  path: string
  html_url: string
  content: string // Base64 encoded
  encoding: string
}

// Cached data types
interface CachedRepoInfo {
  id: number
  name: string
  fullName: string
  description: string
  url: string
  stars: number
  forks: number
  language: string
  topics: string[]
  owner: string
  ownerAvatar: string
  defaultBranch: string
}

interface CachedReadme {
  content: string
  path: string
  url: string
}

// In-memory cache using Map
class GitHubCache {
  private repoCache: Map<string, CacheEntry<CachedRepoInfo>> = new Map()
  private readmeCache: Map<string, CacheEntry<CachedReadme>> = new Map()

  // Generate cache key in owner/repo format
  private getRepoKey(owner: string, repo: string): string {
    return `${owner}/${repo}`
  }

  // Check if cache entry is expired
  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() - entry.timestamp > CACHE_TTL_MS
  }

  // Get cached repo info
  getRepo(owner: string, repo: string): CachedRepoInfo | null {
    const key = this.getRepoKey(owner, repo)
    const entry = this.repoCache.get(key)

    if (!entry) {
      return null
    }

    if (this.isExpired(entry)) {
      this.repoCache.delete(key)
      return null
    }

    console.log(`[GitHubCache] Cache HIT for repo: ${key}`)
    return entry.data
  }

  // Set cached repo info
  setRepo(owner: string, repo: string, data: CachedRepoInfo): void {
    const key = this.getRepoKey(owner, repo)
    this.repoCache.set(key, {
      data,
      timestamp: Date.now()
    })
    console.log(`[GitHubCache] Cached repo: ${key}`)
  }

  // Get cached README
  getReadme(owner: string, repo: string): CachedReadme | null {
    const key = this.getRepoKey(owner, repo)
    const entry = this.readmeCache.get(key)

    if (!entry) {
      return null
    }

    if (this.isExpired(entry)) {
      this.readmeCache.delete(key)
      return null
    }

    console.log(`[GitHubCache] Cache HIT for README: ${key}`)
    return entry.data
  }

  // Set cached README
  setReadme(owner: string, repo: string, data: CachedReadme): void {
    const key = this.getRepoKey(owner, repo)
    this.readmeCache.set(key, {
      data,
      timestamp: Date.now()
    })
    console.log(`[GitHubCache] Cached README: ${key}`)
  }

  // Clear all cache (useful for testing or manual refresh)
  clear(): void {
    this.repoCache.clear()
    this.readmeCache.clear()
    console.log('[GitHubCache] Cache cleared')
  }

  // Get cache statistics
  getStats(): { repoCount: number; readmeCount: number } {
    return {
      repoCount: this.repoCache.size,
      readmeCount: this.readmeCache.size
    }
  }
}

// Singleton cache instance
const githubCache = new GitHubCache()

export { githubCache, GitHubCache }

export class GitHubService {
  private token: string | undefined

  constructor(token?: string) {
    this.token = token || GITHUB_CONFIG.TOKEN
  }

  /**
   * Generic fetch method with error handling
   */
  private async fetch<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${GITHUB_CONFIG.API_BASE}${endpoint}`, {
      headers: this.getHeaders()
    })

    if (!response.ok) {
      const error = await response.text()
      throw new HttpError(error, response.status)
    }

    return await response.json()
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Accept': `application/vnd.github.${GITHUB_CONFIG.API_VERSION}`,
      'User-Agent': GITHUB_CONFIG.USER_AGENT
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }
    return headers
  }

  /**
   * Parse GitHub URL to extract owner and repo
   */
  parseRepoUrl(url: string): { owner: string; repo: string } | null {
    const patterns = [
      /github\.com\/([^\/]+)\/([^\/\s]+)\/?$/,
      /github\.com\/([^\/]+)\/([^\/\s]+)\/tree\/[^\/]+/,
      /github\.com\/([^\/]+)\/([^\/\s]+)\/blob\/[^\/]+/,
      /^([^\/]+)\/([^\/\s]+)$/,
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) {
        const repo = match[2].replace(/\.git$/, '')
        return { owner: match[1], repo }
      }
    }

    return null
  }

  /**
   * Transform API response to normalized format
   */
  private transformRepoResponse(data: GitHubRepoResponse): CachedRepoInfo {
    return {
      id: data.id,
      name: data.name,
      fullName: data.full_name,
      description: data.description || '',
      url: data.html_url,
      stars: data.stargazers_count,
      forks: data.forks_count,
      language: data.language || 'Unknown',
      topics: data.topics || [],
      owner: data.owner.login,
      ownerAvatar: data.owner.avatar_url,
      defaultBranch: data.default_branch
    }
  }

  /**
   * Fetch repository information (with caching)
   */
  async getRepo(owner: string, repo: string): Promise<CachedRepoInfo | null> {
    // Check cache first
    const cached = githubCache.getRepo(owner, repo)
    if (cached) {
      return cached
    }

    try {
      const data = await this.fetch<GitHubRepoResponse>(`/repos/${owner}/${repo}`)
      const result = this.transformRepoResponse(data)
      githubCache.setRepo(owner, repo, result)
      return result
    } catch (error) {
      console.error(`GitHub API error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return null
    }
  }

  /**
   * Fetch README content (supports various locations, with caching)
   */
  async getReadme(owner: string, repo: string, branch?: string): Promise<{
    content: string
    path: string
    url: string
  } | null> {
    // Check cache first (note: cache doesn't account for branch)
    const cached = githubCache.getReadme(owner, repo)
    if (cached) {
      return cached
    }

    const readmeNames = ['README.md', 'README.rst', 'README.txt', 'README', 'readme.md']
    const branchParam = branch ? `?ref=${branch}` : ''

    for (const name of readmeNames) {
      try {
        const data = await this.fetch<GitHubReadmeResponse>(
          `/repos/${owner}/${repo}/contents/${name}${branchParam}`
        )

        if (data.content) {
          const result = {
            content: Buffer.from(data.content, 'base64').toString('utf-8'),
            path: data.path,
            url: data.html_url
          }
          githubCache.setReadme(owner, repo, result)
          return result
        }
      } catch (e) {
        // Continue to next filename if not found
        continue
      }
    }

    return null
  }

  /**
   * Fetch specific file content
   */
  async getFileContent(owner: string, repo: string, path: string, branch?: string): Promise<string | null> {
    const branchParam = branch ? `?ref=${branch}` : ''

    try {
      const data = await this.fetch<GitHubContentResponse>(
        `/repos/${owner}/${repo}/contents/${path}${branchParam}`
      )

      if (data.content && data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64').toString('utf-8')
      }
      return null
    } catch (error) {
      console.error(`Error fetching file ${path}: ${error instanceof Error ? error.message : 'Unknown'}`)
      return null
    }
  }

  /**
   * Get repository directory structure
   */
  async getDirectoryStructure(
    owner: string,
    repo: string,
    path: string = '',
    branch?: string
  ): Promise<Array<{
    name: string
    path: string
    type: 'file' | 'dir'
    size?: number
  }>> {
    const branchParam = branch ? `?ref=${branch}` : ''

    try {
      const data = await this.fetch<GitHubContentResponse | GitHubContentResponse[]>(
        `/repos/${owner}/${repo}/contents/${path}${branchParam}`
      )

      const items = Array.isArray(data) ? data : [data]

      return items.map((item: GitHubContentResponse) => ({
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size
      }))
    } catch (error) {
      console.error(`Error fetching directory: ${error instanceof Error ? error.message : 'Unknown'}`)
      return []
    }
  }

  /**
   * Get repository languages
   */
  async getLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    try {
      return await this.fetch<Record<string, number>>(`/repos/${owner}/${repo}/languages`)
    } catch (error) {
      console.error(`Error fetching languages: ${error instanceof Error ? error.message : 'Unknown'}`)
      return {}
    }
  }

  /**
   * Get repository contributors (top 10)
   */
  async getContributors(owner: string, repo: string): Promise<Array<{
    login: string
    avatar_url: string
    contributions: number
  }>> {
    try {
      return await this.fetch<Array<{
        login: string
        avatar_url: string
        contributions: number
      }>>(`/repos/${owner}/${repo}/contributors?per_page=10`)
    } catch (error) {
      console.error(`Error fetching contributors: ${error instanceof Error ? error.message : 'Unknown'}`)
      return []
    }
  }

  /**
   * Get repository releases (latest 5)
   */
  async getReleases(owner: string, repo: string): Promise<Array<{
    tag_name: string
    name: string
    published_at: string
    body: string
  }>> {
    try {
      return await this.fetch<Array<{
        tag_name: string
        name: string
        published_at: string
        body: string
      }>>(`/repos/${owner}/${repo}/releases?per_page=5`)
    } catch (error) {
      console.error(`Error fetching releases: ${error instanceof Error ? error.message : 'Unknown'}`)
      return []
    }
  }

  /**
   * Extract and analyze links from README content
   */
  analyzeReadmeLinks(readmeContent: string): {
    allLinks: Array<{
      text: string
      url: string
      type: 'internal' | 'external' | 'anchor' | 'relative'
      category: string
    }>
    categorizedLinks: Record<string, Array<{
      text: string
      url: string
    }>>
    statistics: {
      totalLinks: number
      internalLinks: number
      externalLinks: number
      relativeLinks: number
      anchorLinks: number
    }
  } {
    // Common link patterns and their categories
    const categoryPatterns: Record<string, RegExp[]> = {
      'documentation': [
        /docs?\/?/i,
        /documentation/i,
        /guide/i,
        /tutorial/i,
        /wiki/i,
        /\.md$/i,
      ],
      'api': [
        /api\.?/i,
        /endpoint/i,
        /reference/i,
      ],
      'github': [
        /github\.com/i,
        /github\.io/i,
        /raw\.githubusercontent\.com/i,
      ],
      'demo': [
        /demo/i,
        /example/i,
        /sample/i,
        /playground/i,
        /preview/i,
      ],
      'dependency': [
        /npmjs\.com/i,
        /pypi\.org/i,
        /pip\.install/i,
        /cargo\.rs/i,
        /go\.mod/i,
        /maven/i,
        /gradle/i,
      ],
      'social': [
        /twitter\.com/i,
        /discord/i,
        /slack\.com/i,
        /reddit\.com/i,
      ],
      'license': [
        /license/i,
        /mit\.license/i,
        /apache/i,
        /gpl/i,
      ],
      'video': [
        /youtube\.com/i,
        /youtu\.be/i,
        /vimeo\.com/i,
      ],
      'image': [
        /\.(png|jpg|jpeg|gif|svg|webp)$/i,
        /img\.github/i,
        /raw\.github/i,
      ],
    }

    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
    const rawUrlRegex = /(?:^|\s)(https?:\/\/[^\s<>"\)]+)/g

    const allLinks: Array<{
      text: string
      url: string
      type: 'internal' | 'external' | 'anchor' | 'relative'
      category: string
    }> = []

    let match

    // Extract Markdown links
    while ((match = markdownLinkRegex.exec(readmeContent)) !== null) {
      const text = match[1].trim()
      const url = match[2].trim()

      // Skip image links
      if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(url) ||
          text.toLowerCase().includes('image') ||
          text.toLowerCase().includes('img')) {
        continue
      }

      allLinks.push({
        text,
        url,
        type: this.classifyLinkType(url),
        category: this.categorizeLink(url, categoryPatterns)
      })
    }

    // Extract raw URLs
    const markdownUrls = new Set(allLinks.map(l => l.url))
    while ((match = rawUrlRegex.exec(readmeContent)) !== null) {
      const url = match[1].trim()
      if (!markdownUrls.has(url)) {
        allLinks.push({
          text: url,
          url,
          type: this.classifyLinkType(url),
          category: this.categorizeLink(url, categoryPatterns)
        })
      }
    }

    // Categorize links
    const categorizedLinks: Record<string, Array<{ text: string; url: string }>> = {}
    for (const link of allLinks) {
      const category = link.category || 'other'
      if (!categorizedLinks[category]) {
        categorizedLinks[category] = []
      }
      if (!categorizedLinks[category].some(l => l.url === link.url)) {
        categorizedLinks[category].push({
          text: link.text,
          url: link.url
        })
      }
    }

    return {
      allLinks,
      categorizedLinks,
      statistics: {
        totalLinks: allLinks.length,
        internalLinks: allLinks.filter(l => l.type === 'internal').length,
        externalLinks: allLinks.filter(l => l.type === 'external').length,
        relativeLinks: allLinks.filter(l => l.type === 'relative').length,
        anchorLinks: allLinks.filter(l => l.type === 'anchor').length
      }
    }
  }

  /**
   * Classify link type
   */
  private classifyLinkType(url: string): 'internal' | 'external' | 'anchor' | 'relative' {
    if (url.startsWith('#')) {
      return 'anchor'
    }
    if (url.startsWith('./') || url.startsWith('../') || !url.includes('://')) {
      return 'relative'
    }
    if (url.includes('github.com') || url.includes('github.io')) {
      return 'internal'
    }
    return 'external'
  }

  /**
   * Categorize link based on patterns
   */
  private categorizeLink(url: string, patterns: Record<string, RegExp[]>): string {
    for (const [category, regexes] of Object.entries(patterns)) {
      for (const regex of regexes) {
        if (regex.test(url)) {
          return category
        }
      }
    }
    return 'other'
  }

  /**
   * Comprehensive repo analysis
   */
  async analyzeRepo(url: string): Promise<{
    repo: CachedRepoInfo | null
    readme: Awaited<ReturnType<GitHubService['getReadme']>>
    structure: Awaited<ReturnType<GitHubService['getDirectoryStructure']>>
    languages: Record<string, number>
    contributors: Awaited<ReturnType<GitHubService['getContributors']>>
    releases: Awaited<ReturnType<GitHubService['getReleases']>>
  } | null> {
    const parsed = this.parseRepoUrl(url)
    if (!parsed) {
      console.error('Invalid GitHub URL')
      return null
    }

    const { owner, repo } = parsed

    const [repoInfo, readme, languages, contributors, releases] = await Promise.all([
      this.getRepo(owner, repo),
      this.getReadme(owner, repo),
      this.getLanguages(owner, repo),
      this.getContributors(owner, repo),
      this.getReleases(owner, repo)
    ])

    const structure = await this.getDirectoryStructure(owner, repo)

    if (!repoInfo) {
      return null
    }

    return {
      repo: repoInfo,
      readme,
      structure,
      languages,
      contributors,
      releases
    }
  }
}

export const githubService = new GitHubService()
