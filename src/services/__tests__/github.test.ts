import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GitHubService, githubCache } from '../github'

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('GitHubService', () => {
  let service: GitHubService

  beforeEach(() => {
    service = new GitHubService('test-token')
    githubCache.clear()
    mockFetch.mockReset()
  })

  describe('parseRepoUrl', () => {
    it('should parse standard GitHub URL', () => {
      const result = service.parseRepoUrl('https://github.com/facebook/react')
      expect(result).toEqual({ owner: 'facebook', repo: 'react' })
    })

    it('should parse GitHub URL with trailing slash', () => {
      const result = service.parseRepoUrl('https://github.com/facebook/react/')
      expect(result).toEqual({ owner: 'facebook', repo: 'react' })
    })

    it('should parse GitHub URL with tree path', () => {
      const result = service.parseRepoUrl('https://github.com/facebook/react/tree/main')
      expect(result).toEqual({ owner: 'facebook', repo: 'react' })
    })

    it('should parse GitHub URL with blob path', () => {
      const result = service.parseRepoUrl('https://github.com/facebook/react/blob/main/README.md')
      expect(result).toEqual({ owner: 'facebook', repo: 'react' })
    })

    it('should parse owner/repo shorthand', () => {
      const result = service.parseRepoUrl('facebook/react')
      expect(result).toEqual({ owner: 'facebook', repo: 'react' })
    })

    it('should remove .git suffix', () => {
      const result = service.parseRepoUrl('https://github.com/facebook/react.git')
      expect(result).toEqual({ owner: 'facebook', repo: 'react' })
    })

    it('should return null for invalid URL', () => {
      const result = service.parseRepoUrl('https://invalid-url.com')
      expect(result).toBeNull()
    })

    it('should return null for empty string', () => {
      const result = service.parseRepoUrl('')
      expect(result).toBeNull()
    })
  })

  describe('analyzeReadmeLinks', () => {
    it('should extract markdown links from README', () => {
      const readme = `
# My Project

Check out the [Documentation](https://docs.example.com)
Visit our [Demo](https://demo.example.com)
      `
      const result = service.analyzeReadmeLinks(readme)

      expect(result.allLinks).toHaveLength(2)
      expect(result.allLinks[0]).toMatchObject({
        text: 'Documentation',
        url: 'https://docs.example.com',
        category: 'documentation'
      })
      expect(result.allLinks[1]).toMatchObject({
        text: 'Demo',
        url: 'https://demo.example.com',
        category: 'demo'
      })
    })

    it('should extract raw URLs', () => {
      const readme = `
# My Project

Visit https://example.com for more info.
      `
      const result = service.analyzeReadmeLinks(readme)

      expect(result.allLinks.some(l => l.url === 'https://example.com')).toBe(true)
    })

    it('should classify internal GitHub links', () => {
      const readme = `
[React](https://github.com/facebook/react)
[Other Repo](https://github.com/other/project)
      `
      const result = service.analyzeReadmeLinks(readme)

      expect(result.statistics.internalLinks).toBe(2)
    })

    it('should classify external links', () => {
      const readme = `
[External](https://external-site.com)
[NPM](https://npmjs.com)
      `
      const result = service.analyzeReadmeLinks(readme)

      expect(result.statistics.externalLinks).toBe(2)
    })

    it('should classify anchor links', () => {
      const readme = `
[Skip to content](#content)
[Go to top](#top)
      `
      const result = service.analyzeReadmeLinks(readme)

      expect(result.statistics.anchorLinks).toBe(2)
    })

    it('should classify relative links', () => {
      const readme = `
[Go to guide](./docs/guide.md)
[Back to parent](../README.md)
      `
      const result = service.analyzeReadmeLinks(readme)

      expect(result.statistics.relativeLinks).toBe(2)
    })

    it('should categorize links correctly', () => {
      const readme = `
[Docs](https://example.com/docs)
[API](https://example.com/api)
[Twitter](https://twitter.com/example)
[License](LICENSE)
[YouTube](https://youtube.com/watch?v=123)
      `
      const result = service.analyzeReadmeLinks(readme)

      expect(result.categorizedLinks.documentation).toBeDefined()
      expect(result.categorizedLinks.api).toBeDefined()
      expect(result.categorizedLinks.video).toBeDefined()
    })

    it('should filter out image links', () => {
      const readme = `
![Logo](./logo.png)
![Screenshot](./screenshot.jpg)
[Valid link](https://example.com)
      `
      const result = service.analyzeReadmeLinks(readme)

      expect(result.allLinks.some(l => l.text === 'Logo')).toBe(false)
      expect(result.allLinks.some(l => l.text === 'Valid link')).toBe(true)
    })

    it('should calculate correct statistics', () => {
      const readme = `
[Link 1](https://github.com/a/b) - internal
[Link 2](https://github.com/c/d) - internal
[Link 3](https://external.com) - external
[Anchor](#anchor)
[Relative](./relative)
      `
      const result = service.analyzeReadmeLinks(readme)

      expect(result.statistics.totalLinks).toBe(5)
      expect(result.statistics.internalLinks).toBe(2)
      expect(result.statistics.externalLinks).toBe(1)
      expect(result.statistics.anchorLinks).toBe(1)
      expect(result.statistics.relativeLinks).toBe(1)
    })

    it('should avoid duplicate links in categorized results', () => {
      const readme = `
[Doc 1](https://docs.example.com/page1)
[Doc 2](https://docs.example.com/page2)
[Doc 3](https://docs.example.com/page1)
      `
      const result = service.analyzeReadmeLinks(readme)

      const docsLinks = result.categorizedLinks.documentation || []
      const doc1Count = docsLinks.filter(l => l.url === 'https://docs.example.com/page1').length
      expect(doc1Count).toBe(1)
    })
  })

  describe('getRepo', () => {
    it('should fetch repository information', async () => {
      const mockResponse = {
        id: 10270250,
        name: 'react',
        full_name: 'facebook/react',
        description: 'A declarative, efficient, and flexible JavaScript library',
        html_url: 'https://github.com/facebook/react',
        stargazers_count: 215000,
        forks_count: 46000,
        language: 'JavaScript',
        topics: ['javascript', 'react', 'frontend'],
        owner: {
          login: 'facebook',
          avatar_url: 'https://avatars.githubusercontent.com/u/69631'
        },
        pushed_at: '2024-01-15T00:00:00Z',
        default_branch: 'main'
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })

      const result = await service.getRepo('facebook', 'react')

      expect(result).toMatchObject({
        id: 10270250,
        name: 'react',
        fullName: 'facebook/react',
        description: 'A declarative, efficient, and flexible JavaScript library',
        url: 'https://github.com/facebook/react',
        stars: 215000,
        forks: 46000,
        language: 'JavaScript',
        topics: ['javascript', 'react', 'frontend'],
        owner: 'facebook',
        defaultBranch: 'main'
      })
    })

    it('should return null for non-existent repo', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found'
      })

      const result = await service.getRepo('nonexistent', 'repo')

      expect(result).toBeNull()
    })

    it('should handle API rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'rate limit exceeded'
      })

      const result = await service.getRepo('facebook', 'react')

      expect(result).toBeNull()
    })
  })

  describe('getReadme', () => {
    it('should fetch README content', async () => {
      const base64Content = Buffer.from('# Hello World\n\nThis is a README').toString('base64')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'README.md',
          path: 'README.md',
          html_url: 'https://github.com/facebook/react/blob/main/README.md',
          content: base64Content,
          encoding: 'base64'
        })
      })

      const result = await service.getReadme('facebook', 'react')

      expect(result).toMatchObject({
        path: 'README.md',
        content: '# Hello World\n\nThis is a README'
      })
    })

    it('should try multiple README names', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            name: 'README.rst',
            path: 'README.rst',
            html_url: 'https://github.com/facebook/react/blob/main/README.rst',
            content: Buffer.from('RST README').toString('base64'),
            encoding: 'base64'
          })
        })

      const result = await service.getReadme('facebook', 'react')

      expect(result).toMatchObject({
        path: 'README.rst',
        content: 'RST README'
      })
    })

    it('should return null when no README found', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 })

      const result = await service.getReadme('facebook', 'react')

      expect(result).toBeNull()
    })
  })

  describe('getDirectoryStructure', () => {
    it('should fetch directory contents', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            name: 'src',
            path: 'src',
            sha: 'abc123',
            size: 0,
            type: 'dir',
            html_url: 'https://github.com/facebook/react/tree/main/src',
            git_url: null,
            download_url: null
          },
          {
            name: 'README.md',
            path: 'README.md',
            sha: 'def456',
            size: 1000,
            type: 'file',
            html_url: 'https://github.com/facebook/react/blob/main/README.md',
            git_url: null,
            download_url: 'https://raw.githubusercontent.com/facebook/react/main/README.md'
          }
        ]
      })

      const result = await service.getDirectoryStructure('facebook', 'react')

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        name: 'src',
        path: 'src',
        type: 'dir'
      })
      expect(result[1]).toMatchObject({
        name: 'README.md',
        path: 'README.md',
        type: 'file',
        size: 1000
      })
    })

    it('should return empty array on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      })

      const result = await service.getDirectoryStructure('nonexistent', 'repo')

      expect(result).toEqual([])
    })
  })

  describe('getLanguages', () => {
    it('should fetch repository languages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          TypeScript: 50000,
          JavaScript: 30000,
          CSS: 10000
        })
      })

      const result = await service.getLanguages('facebook', 'react')

      expect(result).toEqual({
        TypeScript: 50000,
        JavaScript: 30000,
        CSS: 10000
      })
    })
  })

  describe('getContributors', () => {
    it('should fetch top contributors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { login: 'user1', avatar_url: 'https://avatars...', contributions: 100 },
          { login: 'user2', avatar_url: 'https://avatars...', contributions: 50 }
        ]
      })

      const result = await service.getContributors('facebook', 'react')

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        login: 'user1',
        contributions: 100
      })
    })
  })

  describe('getReleases', () => {
    it('should fetch latest releases', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tag_name: 'v18.2.0',
            name: 'React 18.2.0',
            published_at: '2024-01-15T00:00:00Z',
            body: 'Release notes here'
          }
        ]
      })

      const result = await service.getReleases('facebook', 'react')

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        tag_name: 'v18.2.0',
        name: 'React 18.2.0'
      })
    })
  })

  describe('analyzeRepo', () => {
    it('should fetch comprehensive repo analysis', async () => {
      mockFetch
        // getRepo
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 1,
            name: 'test',
            full_name: 'owner/test',
            description: 'Test repo',
            html_url: 'https://github.com/owner/test',
            stargazers_count: 100,
            forks_count: 10,
            language: 'TypeScript',
            topics: [],
            owner: { login: 'owner', avatar_url: 'https://avatars...' },
            pushed_at: '2024-01-01',
            default_branch: 'main'
          })
        })
        // getReadme
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            name: 'README.md',
            path: 'README.md',
            html_url: 'https://github.com/owner/test',
            content: Buffer.from('# Test').toString('base64'),
            encoding: 'base64'
          })
        })
        // getLanguages
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ TypeScript: 1000 })
        })
        // getContributors
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ login: 'user1', avatar_url: '', contributions: 10 }]
        })
        // getReleases
        .mockResolvedValueOnce({
          ok: true,
          json: async () => []
        })
        // getDirectoryStructure
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ name: 'src', path: 'src', sha: 'abc', size: 0, type: 'dir', html_url: '', git_url: '', download_url: null }]
        })

      const result = await service.analyzeRepo('https://github.com/owner/test')

      expect(result).not.toBeNull()
      expect(result?.repo).toBeDefined()
      expect(result?.readme).toBeDefined()
      expect(result?.structure).toBeDefined()
      expect(result?.languages).toBeDefined()
      expect(result?.contributors).toBeDefined()
      expect(result?.releases).toBeDefined()
    })

    it('should return null for invalid URL', async () => {
      const result = await service.analyzeRepo('https://invalid.com/repo')

      expect(result).toBeNull()
    })
  })
})
