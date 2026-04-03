'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, Github, Globe, Youtube, Plus, RefreshCw, Trash2, X, CheckCircle, AlertCircle, Clock, Database, FolderOpen, GitBranch, FileText, BarChart3, Zap } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { SourceListSkeleton, StatsCardSkeleton, ProgressBar, ErrorAlert } from '@/components/Skeleton'

interface KnowledgeSource {
  id: string
  sourceType: string
  externalId: string | null
  title: string
  description: string | null
  sourceUrl: string
  thumbnail: string | null
  author: string | null
  tags: string | null
  status: string
  errorMessage: string | null
  generatedAt: string
  updatedAt: string
  projectGroup: {
    id: string
    name: string
  } | null
  blogPosts: Array<{
    id: string
    title: string
    slug: string
  }>
}

interface ProjectGroup {
  id: string
  name: string
  description: string | null
  tags: string | null
  _count: {
    sources: number
  }
}

const sourceTypeIcons: Record<string, React.ReactNode> = {
  YOUTUBE: <Youtube className="w-5 h-5" />,
  GITHUB: <Github className="w-5 h-5" />,
  WEB: <Globe className="w-5 h-5" />
}

const sourceTypeColors: Record<string, string> = {
  YOUTUBE: 'bg-red-100 text-red-600',
  GITHUB: 'bg-gray-900 text-white',
  WEB: 'bg-blue-100 text-blue-600'
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700'
}

export default function SourcesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    }>
      <SourcesContent />
    </Suspense>
  )
}

function SourcesContent() {
  const { t, language } = useI18n()
  const isEnglish = language === 'en'
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [groups, setGroups] = useState<ProjectGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [addingSource, setAddingSource] = useState(false)
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceType, setSourceType] = useState<'YOUTUBE' | 'GITHUB' | 'WEB'>('GITHUB')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'YOUTUBE' | 'GITHUB' | 'WEB'>('all')

  const searchParams = useSearchParams()
  const initialFilter = searchParams.get('filter') as any

  useEffect(() => {
    if (initialFilter && ['YOUTUBE', 'GITHUB', 'WEB'].includes(initialFilter)) {
      setFilter(initialFilter)
    }
    fetchData()
  }, [initialFilter])

  const [showAddGroupModal, setShowAddGroupModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')

  const [showToast, setShowToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success'
  })

  // Progress tracking state
  const [processingSources, setProcessingSources] = useState<Record<string, { status: string; progress: number }>>({})
  const [activeOperations, setActiveOperations] = useState<{ id: string; title: string; type: string; startTime: number }[]>([])

  // Add progress tracking messages
  const getProgressMessage = (sourceType: string): string[] => {
    const messages: Record<string, { zh: string[]; en: string[] }> = {
      GITHUB: {
        zh: [
          '正在分析仓库结构...',
          '正在抓取 README 内容...',
          '正在解析代码文档...',
          '正在生成知识摘要...',
          '正在构建架构图...'
        ],
        en: [
          'Analyzing repository structure...',
          'Fetching README content...',
          'Parsing code documentation...',
          'Generating knowledge summary...',
          'Building architecture diagram...'
        ]
      },
      YOUTUBE: {
        zh: [
          '正在获取视频信息...',
          '正在下载字幕...',
          '正在分析视频内容...',
          '正在生成知识结构...',
          '正在创建技术总结...'
        ],
        en: [
          'Getting video information...',
          'Downloading subtitles...',
          'Analyzing video content...',
          'Generating knowledge structure...',
          'Creating technical summary...'
        ]
      },
      WEB: {
        zh: [
          '正在抓取网页内容...',
          '正在提取关键信息...',
          '正在分析文档结构...',
          '正在生成技术解析...',
          '正在整理知识点...'
        ],
        en: [
          'Fetching web content...',
          'Extracting key information...',
          'Analyzing document structure...',
          'Generating technical analysis...',
          'Organizing knowledge points...'
        ]
      }
    }
    const lang = language === 'en' ? 'en' : 'zh'
    return messages[sourceType]?.[lang] || []
  }

  // Simulate progress for a source being processed
  const simulateProgress = (sourceId: string, sourceType: string) => {
    const messages = getProgressMessage(sourceType)
    let currentStep = 0

    const interval = setInterval(() => {
      currentStep++
      const progress = Math.min(90, (currentStep / messages.length) * 100)

      setProcessingSources(prev => ({
        ...prev,
        [sourceId]: {
          status: messages[currentStep - 1] || 'Processing...',
          progress: progress
        }
      }))

      if (currentStep >= messages.length) {
        clearInterval(interval)
      }
    }, 2000) // Update every 2 seconds

    return () => clearInterval(interval)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [sourcesRes, groupsRes] = await Promise.all([
        fetch('/api/sources'),
        fetch('/api/project-groups')
      ])

      const sourcesData = await sourcesRes.json()
      const groupsData = await groupsRes.json()

      setSources(sourcesData.sources || [])
      setGroups(groupsData || [])
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  const addSource = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddingSource(true)
    setError('')

    // Validate URL format
    try {
      new URL(sourceUrl)
    } catch {
      setError(language === 'zh'
        ? '请输入有效的 URL 地址'
        : 'Please enter a valid URL')
      setAddingSource(false)
      return
    }

    try {
      const res = await fetch('/api/sources/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl,
          sourceType,
          projectGroupId: selectedGroup || undefined
        })
      })

      const data = await res.json()

      if (!res.ok) {
        // Enhanced error handling with specific messages
        let errorMsg = data.error || t.failedToAddSource

        if (res.status === 400) {
          // Invalid URL format
          if (sourceType === 'GITHUB') {
            errorMsg = language === 'zh'
              ? 'GitHub URL 格式不正确，请使用 github.com/owner/repo 格式'
              : 'Invalid GitHub URL format. Use github.com/owner/repo'
          } else if (sourceType === 'YOUTUBE') {
            errorMsg = language === 'zh'
              ? 'YouTube URL 格式不正确'
              : 'Invalid YouTube URL format'
          }
        } else if (res.status === 409) {
          // Duplicate source
          errorMsg = language === 'zh'
            ? '该数据源已存在，请勿重复添加'
            : 'This source already exists. Do not add duplicates.'
        } else if (res.status === 429) {
          errorMsg = language === 'zh'
            ? '请求过于频繁，请稍后再试'
            : 'Too many requests. Please try again later.'
        } else if (res.status === 500) {
          errorMsg = language === 'zh'
            ? '服务器内部错误，请稍后再试'
            : 'Server error. Please try again later.'
        }

        setError(errorMsg)
      } else {
        setSourceUrl('')
        setSelectedGroup('')
        fetchData()
        triggerToast(t.sourceAddedSuccess, 'success')

        // Start progress tracking for the new source
        const newSourceId = data.id
        if (newSourceId) {
          simulateProgress(newSourceId, sourceType)
        }
      }
    } catch (err: any) {
      setError(language === 'zh'
        ? `网络错误: ${err.message || '请检查网络连接'}`
        : `Network error: ${err.message || 'Please check your connection'}`)
    } finally {
      setAddingSource(false)
    }
  }

  const deleteSource = async (id: string) => {
    if (!confirm(t.confirmDeleteSource)) return

    try {
      const res = await fetch(`/api/sources/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchData()
        triggerToast(t.sourceDeleted, 'success')
      }
    } catch (err) {
      console.error('Error deleting source:', err)
    }
  }

  const reprocessSource = async (id: string) => {
    // Find the source type for progress tracking
    const source = sources.find(s => s.id === id)

    try {
      const res = await fetch(`/api/sources/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reprocess: true })
      })

      const data = await res.json()
      if (res.ok) {
        fetchData()
        triggerToast(t.reprocessing, 'success')

        // Start progress tracking for reprocessing
        if (source) {
          // Clear any existing progress
          setProcessingSources(prev => {
            const next = { ...prev }
            delete next[id]
            return next
          })

          // Start new progress simulation
          setTimeout(() => {
            simulateProgress(id, source.sourceType)
          }, 500)
        }
      } else {
        let errorMsg = data.error || t.failedToReprocess

        if (res.status === 429) {
          errorMsg = language === 'zh'
            ? '请求过于频繁，请稍后再试'
            : 'Too many requests. Please try again later.'
        }

        triggerToast(errorMsg, 'error')
      }
    } catch (err: any) {
      console.error('Error reprocessing source:', err)
      triggerToast(language === 'zh'
        ? `网络错误: ${err.message}`
        : `Network error: ${err.message}`, 'error')
    }
  }

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGroupName.trim()) return

    try {
      const res = await fetch('/api/project-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName,
          description: newGroupDescription
        })
      })

      if (res.ok) {
        setShowAddGroupModal(false)
        setNewGroupName('')
        setNewGroupDescription('')
        fetchData()
        triggerToast(t.groupCreated, 'success')
      }
    } catch (err) {
      console.error('Error creating group:', err)
    }
  }

  const triggerToast = (message: string, type: 'success' | 'error' = 'success') => {
    setShowToast({ show: true, message, type })
    setTimeout(() => setShowToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const filteredSources = filter === 'all'
    ? sources
    : sources.filter(s => s.sourceType === filter)

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa]">
        {/* Header Skeleton */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-lg animate-pulse bg-gray-200" />
              <div className="w-40 h-6 rounded animate-pulse bg-gray-200" />
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8">
          {/* Stats Skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map(i => <StatsCardSkeleton key={i} />)}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8">
            <SourceListSkeleton count={4} />
            <div className="space-y-6">
              {/* Form Skeleton */}
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <div className="h-6 w-32 rounded animate-pulse bg-gray-200 mb-4" />
                <div className="flex gap-2 mb-4">
                  {[1, 2, 3].map(i => <div key={i} className="flex-1 h-10 rounded-lg animate-pulse bg-gray-100" />)}
                </div>
                <div className="h-12 rounded-lg animate-pulse bg-gray-100 mb-4" />
                <div className="h-10 rounded-lg animate-pulse bg-gray-200" />
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-serif text-xl font-bold tracking-tight">{t.knowledgeSources}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddGroupModal(true)}
              className="medium-button-secondary py-2 flex items-center gap-2 bg-white"
            >
              <FolderOpen className="w-4 h-4" />
              {t.newGroup}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <Database className="w-5 h-5 text-accent" />
              <span className="text-sm text-muted uppercase tracking-wider">{t.sourceTotal}</span>
            </div>
            <div className="text-3xl font-serif font-bold">{sources.length}</div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <Youtube className="w-5 h-5 text-red-500" />
              <span className="text-sm text-muted uppercase tracking-wider">YouTube</span>
            </div>
            <div className="text-3xl font-serif font-bold">{sources.filter(s => s.sourceType === 'YOUTUBE').length}</div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <Github className="w-5 h-5 text-gray-700" />
              <span className="text-sm text-muted uppercase tracking-wider">GitHub</span>
            </div>
            <div className="text-3xl font-serif font-bold">{sources.filter(s => s.sourceType === 'GITHUB').length}</div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <Globe className="w-5 h-5 text-blue-500" />
              <span className="text-sm text-muted uppercase tracking-wider">Web</span>
            </div>
            <div className="text-3xl font-serif font-bold">{sources.filter(s => s.sourceType === 'WEB').length}</div>
          </div>
        </div>

        {/* Processing Status Section */}
        {sources.filter(s => s.status === 'processing' || s.status === 'pending').length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-amber-500 animate-pulse" />
              <h3 className="font-serif font-bold text-lg">
                {language === 'zh' ? '正在处理的任务' : 'Processing Tasks'}
              </h3>
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">
                {sources.filter(s => s.status === 'processing' || s.status === 'pending').length}
              </span>
            </div>
            <div className="space-y-3">
              {sources.filter(s => s.status === 'processing' || s.status === 'pending').map(source => {
                const progress = processingSources[source.id]?.progress || 0
                const statusMsg = processingSources[source.id]?.status ||
                  (source.status === 'processing'
                    ? (language === 'zh' ? '正在分析...' : 'Analyzing...')
                    : (language === 'zh' ? '等待处理...' : 'Pending...'))

                return (
                  <div key={source.id} className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-3 h-3 rounded-full ${
                        source.status === 'processing' ? 'bg-blue-500 animate-pulse' : 'bg-amber-500'
                      }`} />
                      <span className={`text-xs font-bold uppercase tracking-wide ${
                        source.status === 'processing' ? 'text-blue-600' : 'text-amber-600'
                      }`}>
                        {source.status === 'processing'
                          ? (language === 'zh' ? '处理中' : 'Processing')
                          : (language === 'zh' ? '等待中' : 'Pending')}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        source.sourceType === 'GITHUB' ? 'bg-gray-900 text-white' :
                        source.sourceType === 'YOUTUBE' ? 'bg-red-100 text-red-600' :
                        'bg-blue-100 text-blue-600'
                      }`}>
                        {source.sourceType}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 font-medium truncate mb-3">{source.title}</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <ProgressBar progress={progress} showPercentage={true} />
                      </div>
                      <span className="text-xs text-blue-600 font-medium min-w-[120px]">
                        {statusMsg}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8">
          {/* Main Content */}
          <div className="space-y-6">
            {/* Filter Tabs */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'all' ? 'bg-[#191919] text-white' : 'bg-white text-muted hover:bg-gray-100'
                }`}
              >
                {t.allSources}
              </button>
              <button
                onClick={() => setFilter('YOUTUBE')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  filter === 'YOUTUBE' ? 'bg-red-500 text-white' : 'bg-white text-muted hover:bg-gray-100'
                }`}
              >
                <Youtube className="w-4 h-4" />
                YouTube
              </button>
              <button
                onClick={() => setFilter('GITHUB')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  filter === 'GITHUB' ? 'bg-gray-900 text-white' : 'bg-white text-muted hover:bg-gray-100'
                }`}
              >
                <Github className="w-4 h-4" />
                GitHub
              </button>
              <button
                onClick={() => setFilter('WEB')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  filter === 'WEB' ? 'bg-blue-500 text-white' : 'bg-white text-muted hover:bg-gray-100'
                }`}
              >
                <Globe className="w-4 h-4" />
                Web
              </button>
            </div>

            {/* Sources List */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {filteredSources.length === 0 ? (
                <div className="text-center py-16 text-muted font-serif">
                  {t.noSourcesYet}
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {filteredSources.map((source) => (
                    <div 
                      key={source.id} 
                      className={`p-6 transition-all border-b border-gray-50 last:border-0 ${
                        source.blogPosts?.length > 0 ? 'hover:bg-gray-50' : ''
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        {/* Card Content (Clickable if blog exists) */}
                        <div className="flex-1 flex items-start gap-3 md:gap-4 min-w-0">
                          {source.blogPosts?.length > 0 ? (
                            <Link 
                              href={source.blogPosts.length === 1 
                                ? `/blogs/${source.blogPosts[0].slug}` 
                                : `/blogs?sourceId=${source.id}`}
                              className="flex items-start gap-3 md:gap-4 flex-1 min-w-0 group"
                            >
                              {/* Thumbnail */}
                              {source.thumbnail ? (
                                <img
                                  src={source.thumbnail}
                                  alt={source.title}
                                  className="w-12 h-12 md:w-16 md:h-16 rounded-lg object-cover flex-shrink-0 shadow-sm group-hover:opacity-90 transition-opacity"
                                />
                              ) : (
                                <div className="w-12 h-12 md:w-16 md:h-16 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 transition-colors">
                                  {sourceTypeIcons[source.sourceType]}
                                </div>
                              )}

                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-tight ${sourceTypeColors[source.sourceType]}`}>
                                    {source.sourceType}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold flex items-center gap-1 ${statusColors[source.status]}`}>
                                    {source.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                                    {source.status === 'processing' && <Clock className="w-3 h-3" />}
                                    {source.status === 'failed' && <AlertCircle className="w-3 h-3" />}
                                    {source.status === 'pending' ? t.statusPending : 
                                     source.status === 'processing' ? t.statusProcessing :
                                     source.status === 'completed' ? t.statusCompleted : t.statusFailed}
                                  </span>
                                </div>

                                <h3 className="font-serif font-bold text-base md:text-lg mb-0.5 md:mb-1 truncate group-hover:text-accent transition-colors">{source.title}</h3>
                                {source.description && (
                                  <p className="text-xs md:text-sm text-muted line-clamp-1 mb-1 md:mb-2">{source.description}</p>
                                )}

                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium text-muted/60 uppercase tracking-wider">
                                  {source.author && (
                                    <span className="flex items-center gap-1">
                                      <GitBranch className="w-3 h-3" />
                                      {source.author}
                                    </span>
                                  )}
                                  <span>{new Date(source.generatedAt).toLocaleDateString()}</span>
                                  <span className="text-accent flex items-center gap-1 font-bold">
                                    <FileText className="w-3 h-3" />
                                    {t.readArticle}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          ) : (
                            <div className="flex items-start gap-3 md:gap-4 flex-1 min-w-0">
                              {source.thumbnail ? (
                                <img
                                  src={source.thumbnail}
                                  alt={source.title}
                                  className="w-12 h-12 md:w-16 md:h-16 rounded-lg object-cover flex-shrink-0 shadow-sm"
                                />
                              ) : (
                                <div className="w-12 h-12 md:w-16 md:h-16 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                  {sourceTypeIcons[source.sourceType]}
                                </div>
                              )}

                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-tight ${sourceTypeColors[source.sourceType]}`}>
                                    {source.sourceType}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold flex items-center gap-1 ${statusColors[source.status]}`}>
                                    {source.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                                    {source.status === 'processing' && <Clock className="w-3 h-3" />}
                                    {source.status === 'failed' && <AlertCircle className="w-3 h-3" />}
                                    {source.status === 'pending' ? t.statusPending : 
                                     source.status === 'processing' ? t.statusProcessing :
                                     source.status === 'completed' ? t.statusCompleted : t.statusFailed}
                                  </span>
                                </div>

                                <h3 className="font-serif font-bold text-base md:text-lg mb-0.5 md:mb-1 truncate">{source.title}</h3>
                                {source.description && (
                                  <p className="text-xs md:text-sm text-muted line-clamp-1 mb-1 md:mb-2">{source.description}</p>
                                )}

                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium text-muted/60 uppercase tracking-wider">
                                  {source.author && (
                                    <span className="flex items-center gap-1">
                                      <GitBranch className="w-3 h-3" />
                                      {source.author}
                                    </span>
                                  )}
                                  <span>{new Date(source.generatedAt).toLocaleDateString()}</span>
                                  {source.status === 'completed' && (
                                    <span className="text-muted/40">{t.noArticleGenerated}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          {(source.status === 'completed' || source.status === 'failed') && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                reprocessSource(source.id);
                              }}
                              className="p-2 text-muted hover:text-accent hover:bg-accent/5 rounded-full transition-all"
                              title={t.updateContent}
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              deleteSource(source.id);
                            }}
                            className="p-2 text-muted hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                            title={t.deleteSource}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {source.errorMessage && (
                        <div className="mt-3 ml-20 p-3 bg-red-50 rounded-lg text-xs text-red-600 border border-red-100 italic">
                          Error: {source.errorMessage}
                        </div>
                      )}
                    </div>
                  ))}

                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Add Source Form */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <h2 className="font-serif text-xl font-bold mb-4">{t.addNewSource}</h2>

              {/* Source Type Selection */}
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setSourceType('GITHUB')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    sourceType === 'GITHUB' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-muted hover:bg-gray-200'
                  }`}
                >
                  <Github className="w-4 h-4" />
                  GitHub
                </button>
                <button
                  type="button"
                  onClick={() => setSourceType('WEB')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    sourceType === 'WEB' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-muted hover:bg-gray-200'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  Web
                </button>
                <button
                  type="button"
                  onClick={() => setSourceType('YOUTUBE')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    sourceType === 'YOUTUBE' ? 'bg-red-500 text-white' : 'bg-gray-100 text-muted hover:bg-gray-200'
                  }`}
                >
                  <Youtube className="w-4 h-4" />
                  YouTube
                </button>
              </div>

              <form onSubmit={addSource} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    {sourceType === 'GITHUB' ? t.repositoryUrl :
                     sourceType === 'WEB' ? t.webUrl : t.youtubeUrl}
                  </label>
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder={
                      sourceType === 'GITHUB' ? 'https://github.com/owner/repo' :
                      sourceType === 'WEB' ? 'https://example.com/article' :
                      'https://youtube.com/watch?v=...'
                    }
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-accent text-sm"
                    required
                  />
                </div>

                {/* Project Group Selection */}
                {groups.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium mb-2">{t.projectGroupOptional}</label>
                    <select
                      value={selectedGroup}
                      onChange={(e) => setSelectedGroup(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-accent text-sm"
                    >
                      <option value="">{t.noGroup}</option>
                      {groups.map(group => (
                        <option key={group.id} value={group.id}>{group.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={addingSource}
                  className="medium-button-primary w-full py-3 flex items-center justify-center gap-2"
                >
                  {addingSource ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {t.addSource}
                </button>
              </form>
              {error && <p className="text-red-500 text-xs mt-3">{error}</p>}
            </div>

            {/* Project Groups */}
            {groups.length > 0 && (
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <h2 className="font-serif text-xl font-bold mb-4">{t.projectGroups}</h2>
                <div className="space-y-3">
                  {groups.map(group => (
                    <div key={group.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <div className="font-medium text-sm">{group.name}</div>
                        <div className="text-xs text-muted">
                          {group._count.sources} {t.sourcesCount}
                        </div>
                      </div>
                      <FolderOpen className="w-4 h-4 text-muted" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tips */}
            <div className="p-6 bg-[#ffc017]/10 rounded-xl border border-[#ffc017]/20">
              <h4 className="font-bold text-sm mb-2 flex items-center gap-2 uppercase tracking-widest text-[#191919]">
                <Database className="w-4 h-4" /> {t.supportedSources}
              </h4>
              <ul className="text-xs text-[#191919]/70 space-y-2">
                <li className="flex items-center gap-2">
                  <Github className="w-3 h-3" />
                  {t.githubDesc}
                </li>
                <li className="flex items-center gap-2">
                  <Globe className="w-3 h-3" />
                  {t.webDesc}
                </li>
                <li className="flex items-center gap-2">
                  <Youtube className="w-3 h-3" />
                  {t.youtubeDesc}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Add Group Modal */}
      {showAddGroupModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md m-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="font-serif text-xl font-bold">{t.createProjectGroup}</h2>
              <button
                onClick={() => setShowAddGroupModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createGroup} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t.groupName}</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder={t.groupNamePlaceholder}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-accent text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t.descriptionOptional}</label>
                <textarea
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                  placeholder={t.groupDescriptionPlaceholder}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-accent text-sm min-h-[80px]"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddGroupModal(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[#191919] text-white rounded-lg text-sm font-medium hover:bg-black/80 transition-colors"
                >
                  {t.create}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {showToast.show && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl transition-all flex items-center gap-3 ${
          showToast.type === 'success' ? 'bg-[#191919] text-white' : 'bg-red-500 text-white'
        }`}>
          <div className={`w-2 h-2 rounded-full ${showToast.type === 'success' ? 'bg-green-400' : 'bg-white'} animate-pulse`} />
          <p className="text-sm font-medium">{showToast.message}</p>
        </div>
      )}
    </div>
  )
}
