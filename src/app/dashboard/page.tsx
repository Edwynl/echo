'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Youtube, Trash2, RefreshCw, BookOpen, Settings, ArrowLeft, Loader2, Globe, FileText, Globe2, X, AlertTriangle, Video, Book, Database, Github, ArrowRight, Sparkles, Zap, ListOrdered, CheckCircle, Clock, AlertCircle, Play, XCircle } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { decodeHtmlEntities, truncate } from '@/lib/utils'

interface Channel {
  id: string
  name: string
  description: string
  thumbnail: string
  isActive: boolean
  lastFetched: string | null
  _count: {
    videos: number
  }
}

interface Stats {
  channels: number
  videos: number
  blogs: number
  githubRepos: number
  webSources: number
}

interface QueueItem {
  id: string
  channelId: string
  channelName: string
  channelThumbnail: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  addedAt: string
  startedAt?: string
  completedAt?: string
  progress: {
    current: number
    total: number
    currentVideoTitle?: string
  }
  result?: {
    newVideos: number
    blogsGenerated: number
    skipped: number
    errors: string[]
  }
  error?: string
}

interface QueueStatus {
  isProcessing: boolean
  currentItem: QueueItem | null
  queue: QueueItem[]
  stats: {
    totalProcessed: number
    totalPending: number
    totalFailed: number
  }
  estimatedTimeRemaining?: number
}

export default function Dashboard() {
  const { t, language, setLanguage } = useI18n()
  const router = useRouter()
  const isEnglish = language === 'en'
  const [channels, setChannels] = useState<Channel[]>([])
  const [stats, setStats] = useState<Stats>({ channels: 0, videos: 0, blogs: 0, githubRepos: 0, webSources: 0 })
  const [loading, setLoading] = useState(true)
  const [addingChannel, setAddingChannel] = useState(false)
  const [addType, setAddType] = useState<'channel' | 'video'>('channel')
  const [channelUrl, setChannelUrl] = useState('')
  const [error, setError] = useState('')
  const [recentBlogs, setRecentBlogs] = useState<any[]>([])
  const [showToast, setShowToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success'
  })
  const [showImportModal, setShowImportModal] = useState(false)
  const [importType, setImportType] = useState<'md' | 'web'>('md')
  const [importTitle, setImportTitle] = useState('')
  const [importContent, setImportContent] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [generatingMissing, setGeneratingMissing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [activeIngestionTab, setActiveIngestionTab] = useState<'youtube' | 'github' | 'web'>('youtube')

  // Queue state — restore from sessionStorage for instant display on back-nav
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const saved = sessionStorage.getItem('queueStatus')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [addingToQueue, setAddingToQueue] = useState<Set<string>>(new Set())

  // Poll queue status — immediately on mount + every 5 seconds
  useEffect(() => {
    let cancelled = false

    const pollQueue = async () => {
      try {
        const res = await fetch('/api/queue')
        if (res.ok && !cancelled) {
          const data = await res.json()
          setQueueStatus(data)
          // Persist to sessionStorage so back-nav shows queue instantly
          try {
            sessionStorage.setItem('queueStatus', JSON.stringify(data))
          } catch {}
        }
      } catch (err) {
        console.error('Error polling queue:', err)
      }
    }

    pollQueue() // immediate
    const interval = setInterval(pollQueue, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [channelsRes, blogsRes, sourcesRes] = await Promise.all([
        fetch('/api/channels'),
        fetch('/api/blogs?limit=15'),
        fetch('/api/sources')
      ])
      
      const channelsData = await channelsRes.json()
      const blogsData = await blogsRes.json()
      const sourcesData = await sourcesRes.json()
      const sources = sourcesData.sources || []
      
      setChannels(channelsData)
      setRecentBlogs(blogsData.blogs || [])
      setStats({
        channels: channelsData.length,
        videos: channelsData.reduce((acc: number, ch: Channel) => acc + ch._count.videos, 0),
        blogs: blogsData.pagination?.total || 0,
        githubRepos: sources.filter((s: any) => s.sourceType === 'GITHUB').length,
        webSources: sources.filter((s: any) => s.sourceType === 'WEB').length
      })
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  const addChannel = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddingChannel(true)
    setError('')

    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUrl })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to add channel')
      } else {
        setChannelUrl('')
        fetchData()
      }
    } catch (err) {
      setError('Failed to add channel')
    } finally {
      setAddingChannel(false)
    }
  }

  const addVideo = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddingChannel(true)
    setError('')

    try {
      const res = await fetch('/api/videos/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: channelUrl })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to add video')
      } else {
        setChannelUrl('')
        fetchData()

        // Also add channel to queue for sync tracking
        if (data.channel?.id) {
          try {
            await fetch('/api/queue/add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ channelId: data.channel.id })
            })
          } catch {}
          // Refresh queue status
          try {
            const statusRes = await fetch('/api/queue')
            if (statusRes.ok) {
              const statusData = await statusRes.json()
              setQueueStatus(statusData)
              try { sessionStorage.setItem('queueStatus', JSON.stringify(statusData)) } catch {}
            }
          } catch {}
        }

        if (data.blogGenerated) {
          triggerToast(isEnglish ? 'Blog post generated successfully!' : '博客文章生成成功！', 'success')
        } else if (data.video) {
          if (data.transcriptError) {
            triggerToast(isEnglish ? 'Video added (transcript error)' : `视频已添加（字幕获取失败）`, 'info')
          } else if (!data.transcriptAvailable) {
            triggerToast(isEnglish ? 'Video added (no transcript)' : '视频已添加（无字幕）', 'info')
          } else {
            triggerToast(isEnglish ? 'Video added' : '视频已添加', 'success')
          }
        } else {
          triggerToast(t.videoAddedSuccess, 'success')
        }
      }
    } catch (err) {
      setError(isEnglish ? 'Failed to add video' : '添加视频失败')
    } finally {
      if (activeIngestionTab === 'youtube') setAddingChannel(false)
    }
  }

  const handleQuickAnalyze = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!channelUrl.trim()) return

    setAddingChannel(true)
    setError('')
    triggerToast(t.analysisStarted, 'success')

    try {
      if (activeIngestionTab === 'youtube') {
        // Detect if this is a channel URL vs video URL
        // Channel indicators: /c/, /channel/, /user/, /@
        // Video indicators: watch?v=, youtu.be/, /shorts/
        const isVideoUrl = channelUrl.includes('watch?v=') ||
                          channelUrl.includes('youtu.be/') ||
                          channelUrl.includes('/shorts/')
        const isChannelUrl = channelUrl.includes('/c/') ||
                            channelUrl.includes('/channel/') ||
                            channelUrl.includes('/user/') ||
                            channelUrl.includes('/@')

        if (isChannelUrl) {
          await addChannel(e)
        } else if (isVideoUrl) {
          await addVideo(e)
        } else {
          // Fallback: try as channel
          await addChannel(e)
        }
        }
      } else if (activeIngestionTab === 'github') {
        const res = await fetch('/api/github/analyze-readme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: channelUrl })
        })
        const data = await res.json()
        if (res.ok) {
          setChannelUrl('')
          fetchData()
          triggerToast(t.githubAnalysisComplete, 'success')
        } else {
          triggerToast(data.error || t.githubAnalysisFailed, 'error')
        }
      } else if (activeIngestionTab === 'web') {
        const res = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'web', sourceUrl: channelUrl })
        })
        const data = await res.json()
        if (res.ok) {
          setChannelUrl('')
          fetchData()
          triggerToast(t.webImportComplete, 'success')
        } else {
          triggerToast(data.error || t.webImportFailed, 'error')
        }
      }
    } catch (err) {
      console.error('Analysis error:', err)
      triggerToast(t.systemError, 'error')
    } finally {
      setAddingChannel(false)
    }
  }

  const deleteChannel = async (id: string) => {
    if (!confirm(t.confirmDeleteChannel)) return

    try {
      await fetch(`/api/channels?id=${id}`, { method: 'DELETE' })
      fetchData()
    } catch (err) {
      console.error('Error deleting channel:', err)
    }
  }

  const triggerToast = (message: string, type: 'success' | 'error' = 'success') => {
    setShowToast({ show: true, message, type })
    setTimeout(() => setShowToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const syncVideos = async () => {
    setSyncing(true)
    setError('')
    try {
      const res = await fetch('/api/videos/fetch', { method: 'POST' })
      const data = await res.json()

      if (res.ok) {
        // Add a small delay to ensure database transaction is committed
        await new Promise(resolve => setTimeout(resolve, 500))
        await fetchData()
        triggerToast(`${t.syncComplete}${data.newVideos} ${t.generatedBlogs}: ${data.blogsGenerated}`, 'success')
      } else {
        setError(data.error || t.syncingError)
        triggerToast(t.syncFailed, 'error')
      }
    } catch (err) {
      console.error('Error syncing videos:', err)
      setError(t.syncRequestFailed)
      triggerToast(t.systemError, 'error')
    } finally {
      setSyncing(false)
    }
  }

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!importContent.trim()) return

    setImporting(true)
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: importType,
          content: importContent,
          title: importType === 'md' ? importTitle : undefined,
          sourceUrl: importType === 'web' ? importUrl : undefined
        })
      })

      const data = await res.json()
      if (res.ok) {
        setShowImportModal(false)
        setImportContent('')
        setImportTitle('')
        setImportUrl('')
        fetchData()
        triggerToast(t.importSuccess, 'success')
      } else {
        triggerToast(data.error || t.importFailed, 'error')
      }
    } catch (err) {
      console.error('Error importing:', err)
      triggerToast(t.importFailed, 'error')
    } finally {
      setImporting(false)
    }
  }

  const addToQueue = async (channelId: string) => {
    setAddingToQueue(prev => new Set(prev).add(channelId))
    try {
      const res = await fetch('/api/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId })
      })
      const data = await res.json()

      if (res.ok) {
        // Immediately refresh queue status from server
        try {
          const statusRes = await fetch('/api/queue')
          if (statusRes.ok) {
            const data = await statusRes.json()
            setQueueStatus(data)
            try { sessionStorage.setItem('queueStatus', JSON.stringify(data)) } catch {}
          }
        } catch {}
        const position = data.queuePosition
        triggerToast(
          `${isEnglish ? 'Added to queue' : '已加入队列'} (#${position}) - ${isEnglish ? 'ETA' : '预计'}: ${data.estimatedTime}${isEnglish ? 'min' : '分钟'}`,
          'success'
        )
      } else if (res.status === 409) {
        triggerToast(isEnglish ? 'Already in queue' : '已在队列中', 'error')
      } else {
        triggerToast(data.error || (isEnglish ? 'Failed to add to queue' : '加入队列失败'), 'error')
      }
    } catch (err) {
      console.error('Error adding to queue:', err)
      triggerToast(isEnglish ? 'Failed to add to queue' : '加入队列失败', 'error')
    } finally {
      setAddingToQueue(prev => {
        const next = new Set(prev)
        next.delete(channelId)
        return next
      })
    }
  }

  const startProcessing = async () => {
    try {
      const res = await fetch('/api/queue/workflow-start', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        triggerToast(isEnglish ? 'Processing started' : '已开始处理', 'success')
        // Refresh queue status
        const statusRes = await fetch('/api/queue')
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          setQueueStatus(statusData)
          try { sessionStorage.setItem('queueStatus', JSON.stringify(statusData)) } catch {}
        }
      } else {
        triggerToast(data.error || (isEnglish ? 'Failed to start' : '启动失败'), 'error')
      }
    } catch (err) {
      console.error('Error starting processing:', err)
      triggerToast(isEnglish ? 'Failed to start' : '启动失败', 'error')
    }
  }

  const cancelQueueItem = async (queueId: string) => {
    try {
      const res = await fetch(`/api/queue/add?queueId=${queueId}`, { method: 'DELETE' })
      if (res.ok) {
        triggerToast(isEnglish ? 'Cancelled' : '已取消', 'success')
        // Refresh queue status
        const statusRes = await fetch('/api/queue')
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          setQueueStatus(statusData)
          try { sessionStorage.setItem('queueStatus', JSON.stringify(statusData)) } catch {}
        }
      } else {
        const data = await res.json()
        triggerToast(data.error || (isEnglish ? 'Failed to cancel' : '取消失败'), 'error')
      }
    } catch (err) {
      console.error('Error cancelling:', err)
      triggerToast(isEnglish ? 'Failed to cancel' : '取消失败', 'error')
    }
  }

  const generateMissing = async () => {
    setGeneratingMissing(true)
    try {
      const res = await fetch('/api/blogs/generate-missing', { method: 'POST' })
      const data = await res.json()
      
      if (res.ok) {
        await fetchData()
        if (data.generatedInThisBatch > 0) {
          triggerToast(`${t.generated} ${data.generatedInThisBatch} ${t.missingBlogs}`, 'success')
          // If there are more missing, suggest clicking again
          if (data.totalMissing > data.generatedInThisBatch) {
            setTimeout(() => triggerToast(t.stillHaveMissing, 'success'), 3500)
          }
        } else {
          triggerToast(t.noMissingBlogs, 'success')
        }
      } else {
        triggerToast(data.error || t.systemError, 'error')
      }
    } catch (err) {
      console.error('Error generating missing:', err)
      triggerToast(t.systemError, 'error')
    } finally {
      setGeneratingMissing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="font-serif text-xl font-bold tracking-tight">Echo</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={() => setShowImportModal(true)}
                className="medium-button-secondary py-2 flex items-center gap-2 bg-white"
              >
                <FileText className="w-4 h-4" />
                {t.import}
              </button>
              <Link href="/sources" className="medium-button-secondary py-2 flex items-center gap-2 bg-white">
                <Database className="w-4 h-4" />
                {t.sources}
              </Link>
              <button
                onClick={syncVideos}
                disabled={syncing || generatingMissing}
                className="medium-button-primary disabled:opacity-50 flex items-center gap-2"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {t.syncAll}
              </button>
            </div>
            
            <button
              onClick={() => setLanguage(isEnglish ? 'zh' : 'en')}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors md:mr-0"
              title={isEnglish ? 'Switch to Chinese' : '切换到中文'}
            >
              <Globe className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/90 backdrop-blur-2xl border-t border-slate-100 pb-safe">
        <div className="flex items-center justify-around h-20 px-4">
          <Link href="/" className="flex flex-col items-center gap-1.5 px-3">
            <div className="p-2 rounded-2xl bg-slate-50 text-slate-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 tracking-tighter uppercase">{t.knowledgeBase}</span>
          </Link>
          <Link href="/sources" className="flex flex-col items-center gap-1.5 px-3">
            <div className="p-2 rounded-2xl bg-slate-50 text-slate-400">
              <Database className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 tracking-tighter uppercase">{t.sources}</span>
          </Link>
          <button 
            onClick={syncVideos}
            disabled={syncing}
            className="flex flex-col items-center gap-1.5 -translate-y-4 px-3"
          >
            <div className="w-16 h-16 rounded-full bg-accent text-white shadow-2xl shadow-accent/30 flex items-center justify-center border-4 border-white transition-transform active:scale-90">
              {syncing ? <Loader2 className="w-8 h-8 animate-spin" /> : <RefreshCw className="w-7 h-7" />}
            </div>
            <span className="text-[10px] font-black text-accent tracking-tighter uppercase -mt-1">{t.syncAll}</span>
          </button>
          <Link href="/blogs" className="flex flex-col items-center gap-1.5 px-3">
            <div className="p-2 rounded-2xl bg-slate-50 text-slate-400">
              <FileText className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 tracking-tighter uppercase">{t.viewBlogs}</span>
          </Link>
          <button 
            onClick={() => setShowImportModal(true)}
            className="flex flex-col items-center gap-1.5 px-3"
          >
            <div className="p-2 rounded-2xl bg-slate-50 text-slate-400">
              <Zap className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 tracking-tighter uppercase">{t.import}</span>
          </button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-12 pb-32">
        {/* Stats Section */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-12">
          {[
            { label: t.subscribedChannelsList, value: stats.channels, icon: Youtube, color: 'text-red-500', href: '/sources?filter=YOUTUBE' },
            { label: t.codeRepos, value: stats.githubRepos, icon: Github, color: 'text-slate-900', href: '/sources?filter=GITHUB' },
            { label: t.syncedVideos, value: stats.videos, icon: Video, color: 'text-blue-500', href: '/blogs' },
            { label: t.knowledgeDocs, value: stats.blogs, icon: BookOpen, color: 'text-accent', href: '/blogs' },
          ].map((stat, i) => (
            <Link 
              key={i} 
              href={stat.href}
              className="bg-white p-5 md:p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:border-accent/20 transition-all group"
            >
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <div className={`p-2 md:p-3 rounded-2xl bg-slate-50 ${stat.color} group-hover:scale-110 transition-transform`}>
                  <stat.icon className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <span className="text-xl md:text-3xl font-black tracking-tighter group-hover:text-accent transition-colors">{stat.value}</span>
              </div>
              <div className="text-slate-400 text-[9px] md:text-xs font-bold uppercase tracking-widest group-hover:text-slate-600 transition-colors line-clamp-1">{stat.label}</div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-12">
          {/* Main Column */}
          <div className="space-y-10">
            {/* Quick Action: Intelligence Ingestion */}
            <div className="bg-slate-900 rounded-[40px] p-10 text-white relative overflow-hidden shadow-2xl shadow-slate-200">
               <div className="relative z-10">
                  <h2 className="text-3xl font-black mb-2 tracking-tight">{t.smartIngestionEngine}</h2>
                  <p className="text-slate-400 mb-8 font-medium">{t.smartIngestionDesc}</p>
                  
                  <div className="flex flex-wrap gap-3 mb-6">
                    {[
                      { id: 'youtube', label: t.activeIngestionYoutube },
                      { id: 'github', label: t.activeIngestionGithub },
                      { id: 'web', label: t.activeIngestionWeb }
                    ].map((tab) => (
                      <button 
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveIngestionTab(tab.id as any)}
                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                          activeIngestionTab === tab.id ? 'bg-white text-black' : 'bg-white/10 text-white/60 hover:bg-white/20'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleQuickAnalyze} className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={channelUrl}
                        onChange={(e) => setChannelUrl(e.target.value)}
                        placeholder={t.pasteLinkPlaceholder}
                        className="w-full h-12 md:h-14 bg-white/10 border border-white/10 rounded-2xl px-6 focus:outline-none focus:bg-white focus:text-black transition-all font-medium text-sm text-white"
                      />
                    </div>
                    <button 
                      type="submit"
                      disabled={addingChannel || !channelUrl.trim()}
                      className="h-12 md:h-14 px-8 bg-accent text-white rounded-2xl font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-accent/20 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                    >
                      {addingChannel ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          {t.analyzing}
                        </>
                      ) : (
                        t.analyzeNow
                      )}
                    </button>
                  </form>
               </div>
               {/* Decorative background circle */}
               <div className="absolute top-0 right-0 w-64 h-64 bg-accent/20 blur-[100px] -translate-y-1/2 translate-x-1/2" />
            </div>

            {/* Recent Blogs */}
            <div>
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black tracking-tight italic font-serif">{t.recentBlogs}</h2>
                <Link href="/blogs" className="text-sm font-bold text-accent hover:underline flex items-center gap-1">
                   {t.allContent} <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              
              {recentBlogs.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[40px] text-slate-300">
                   <Sparkles className="w-10 h-10 mb-4 opacity-20" />
                   <p className="font-bold">{t.noBlogsYet}</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {recentBlogs.map((blog) => (
                    <Link 
                      key={blog.id} 
                      href={`/blogs/${blog.slug}`}
                      className="group flex items-center gap-4 md:gap-6 p-4 md:p-6 bg-white border border-slate-100 rounded-3xl hover:border-accent hover:shadow-xl hover:shadow-accent/5 transition-all active:bg-slate-50"
                    >
                      <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-slate-50 flex items-center justify-center flex-shrink-0 group-hover:bg-accent/10 transition-colors">
                        {blog.sourceType === 'github' || blog.knowledgeSource?.sourceType === 'GITHUB' ? (
                          <Github className="w-6 h-6 md:w-8 md:h-8 text-slate-700" />
                        ) : blog.sourceType === 'web' || blog.knowledgeSource?.sourceType === 'WEB' ? (
                          <Globe className="w-6 h-6 md:w-8 md:h-8 text-blue-500" />
                        ) : (
                          <Youtube className="w-6 h-6 md:w-8 md:h-8 text-red-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-base md:text-lg leading-tight truncate pr-4">{decodeHtmlEntities(blog.title)}</h3>
                        <div className="flex items-center gap-2 md:gap-3 mt-1 underline-offset-4 decoration-slate-200">
                           <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-tighter truncate max-w-[80px] md:max-w-none">{blog.video?.channel?.name || (isEnglish ? 'External' : '外部来源')}</span>
                           <span className="w-1 h-1 rounded-full bg-slate-200 flex-shrink-0" />
                           <span className="text-[10px] md:text-xs font-bold text-slate-300">
                             {blog.generatedAt ? new Date(blog.generatedAt).toLocaleDateString() : (blog.publishedAt ? new Date(blog.publishedAt).toLocaleDateString() : (isEnglish ? 'Pending' : '待处理'))}
                           </span>
                        </div>
                      </div>
                      <div className="p-2 md:p-3 rounded-full bg-slate-50 opacity-0 group-hover:opacity-100 transition-all hidden md:block">
                         <ArrowRight className="w-5 h-5" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Column */}
          <div className="space-y-8 mt-4 lg:mt-0">
            <div className="bg-white rounded-[40px] border border-slate-100 p-6 md:p-8 shadow-sm">
              <div className="flex items-center justify-between mb-6 md:mb-8">
                <h2 className="text-xl font-black tracking-tight">{t.subscribedChannelsList}</h2>
                <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black">{channels.length}</span>
              </div>
              
              <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {channels.map((channel) => {
                  const isInQueue = queueStatus?.queue.some(
                    q => q.channelId === channel.id && q.status !== 'completed'
                  )
                  const queueItem = queueStatus?.queue.find(
                    q => q.channelId === channel.id
                  )
                  const isProcessing = queueItem?.status === 'processing'
                  const isAdding = addingToQueue.has(channel.id)

                  return (
                    <div key={channel.id} className="group flex items-center gap-4">
                      <Link href={`/blogs?channelId=${channel.id}`} className="relative flex-shrink-0 cursor-pointer w-12 h-12 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 shadow-inner flex items-center justify-center text-white font-bold text-lg">
                        <span>{channel.name.charAt(0).toUpperCase()}</span>
                        {channel.thumbnail && (
                          <img
                            src={channel.thumbnail}
                            className="absolute inset-0 w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500 z-10"
                            alt=""
                            onError={(e) => { e.currentTarget.style.display = 'none' }}
                          />
                        )}
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center border border-slate-100 z-20">
                          <Youtube className="w-3 h-3 text-red-500" />
                        </div>
                      </Link>
                      <Link href={`/blogs?channelId=${channel.id}`} className="flex-1 min-w-0 cursor-pointer hover:opacity-70 transition-opacity">
                        <p className="font-bold text-sm truncate">{channel.name}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{channel._count.videos} {t.knowledgePoints}</p>
                        {isProcessing && (
                          <p className="text-[10px] text-accent font-medium">
                            {queueItem?.progress.current}/{queueItem?.progress.total} - {truncate(queueItem?.progress.currentVideoTitle || '', 20)}
                          </p>
                        )}
                      </Link>
                      <button
                        onClick={() => addToQueue(channel.id)}
                        disabled={isInQueue || isAdding}
                        className={`p-3 rounded-xl transition-all ${
                          isInQueue
                            ? 'bg-green-100 text-green-600 cursor-not-allowed'
                            : isAdding
                            ? 'bg-accent/20 text-accent cursor-wait'
                            : 'bg-slate-50 text-slate-400 md:scale-0 md:group-hover:scale-100 hover:bg-accent hover:text-white active:scale-95'
                        }`}
                        title={isInQueue ? (isEnglish ? 'In queue' : '队列中') : (isEnglish ? 'Add to queue' : '加入队列')}
                      >
                        {isProcessing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : isInQueue ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : isAdding ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ListOrdered className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Queue Status Panel */}
            {queueStatus && queueStatus.queue.length > 0 && (
              <div className="bg-accent/5 border border-accent/10 rounded-[40px] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ListOrdered className="w-4 h-4 text-accent" />
                    <h3 className="font-black text-sm uppercase tracking-widest">
                      {isEnglish ? 'Sync Queue' : '同步队列'}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={startProcessing}
                      className="p-1.5 rounded-lg bg-accent/20 text-accent hover:bg-accent hover:text-white transition-all"
                      title={isEnglish ? 'Start Processing' : '开始处理'}
                    >
                      <Play className="w-3 h-3" />
                    </button>
                    {queueStatus.estimatedTimeRemaining && (
                      <span className="text-[10px] text-slate-400">
                        ~{queueStatus.estimatedTimeRemaining} {isEnglish ? 'min' : '分钟'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {queueStatus.queue.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-xs">
                      {item.status === 'processing' ? (
                        <Loader2 className="w-3 h-3 animate-spin text-accent flex-shrink-0" />
                      ) : item.status === 'completed' ? (
                        <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />
                      ) : item.status === 'failed' ? (
                        <AlertCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
                      ) : (
                        <Clock className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      )}
                      <span className="truncate flex-1 min-w-0">{item.channelName}</span>
                      {item.status === 'processing' && (
                        <span className="text-accent font-medium whitespace-nowrap">
                          {item.progress.current}/{item.progress.total}
                        </span>
                      )}
                      {item.status === 'pending' && (
                        <span className="text-slate-400 whitespace-nowrap">{isEnglish ? 'Waiting' : '等待'}</span>
                      )}
                      {item.status === 'completed' && item.result && (
                        <span className="text-green-500 whitespace-nowrap">+{item.result.blogsGenerated}</span>
                      )}
                      {item.status === 'failed' && (
                        <span className="text-red-400 whitespace-nowrap truncate max-w-[60px]" title={item.error || 'Error'}>
                          {item.error ? 'Error' : (isEnglish ? 'Failed' : '失败')}
                        </span>
                      )}
                      {/* Action buttons */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {(item.status === 'pending' || item.status === 'failed') && (
                          <button
                            onClick={() => startProcessing()}
                            className="p-1 rounded hover:bg-accent/20 text-slate-400 hover:text-accent transition-all"
                            title={isEnglish ? 'Retry' : '重试'}
                          >
                            <RefreshCw className="w-3 h-3" />
                          </button>
                        )}
                        {item.status === 'pending' && (
                          <button
                            onClick={() => cancelQueueItem(item.id)}
                            className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-all"
                            title={isEnglish ? 'Cancel' : '取消'}
                          >
                            <XCircle className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {queueStatus.queue.length > 5 && (
                    <p className="text-[10px] text-slate-400 text-center pt-2">
                      +{queueStatus.queue.length - 5} {isEnglish ? 'more' : '更多'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Quick Tips Box */}
            <div className="bg-accent/5 border border-accent/10 rounded-[40px] p-8">
               <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center text-white">
                     <Zap className="w-4 h-4" />
                  </div>
                  <h3 className="font-black text-sm uppercase tracking-widest">{t.proTip}</h3>
               </div>
               <p className="text-xs font-medium text-slate-500 leading-relaxed">
                  {t.proTipDesc}
               </p>
            </div>
          </div>
        </div>
      </main>

      {/* Toast Notification */}
      {showToast.show && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl transition-all flex items-center gap-3 ${
          showToast.type === 'success' ? 'bg-[#191919] text-white' : 'bg-red-500 text-white'
        }`}>
          <div className={`w-2 h-2 rounded-full ${showToast.type === 'success' ? 'bg-green-400' : 'bg-white'} animate-pulse`} />
          <p className="text-sm font-medium">{showToast.message}</p>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="font-serif text-xl font-bold">{t.importContentTitle}</h2>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleImport} className="p-6 space-y-4">
              {/* Import Type Tabs */}
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setImportType('md')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                    importType === 'md' ? 'bg-[#191919] text-white' : 'bg-gray-100 text-muted hover:bg-gray-200'
                  }`}
                >
                  <FileText className="w-4 h-4 inline mr-2" />
                  {t.mdFile}
                </button>
                <button
                  type="button"
                  onClick={() => setImportType('web')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                    importType === 'web' ? 'bg-[#191919] text-white' : 'bg-gray-100 text-muted hover:bg-gray-200'
                  }`}
                >
                  <Globe2 className="w-4 h-4 inline mr-2" />
                  {t.webPage}
                </button>
              </div>

              {/* Title (only for MD) */}
              {importType === 'md' && (
                <div>
                  <label className="block text-sm font-medium mb-2">{t.titleLabel}</label>
                  <input
                    type="text"
                    value={importTitle}
                    onChange={(e) => setImportTitle(e.target.value)}
                    placeholder={t.enterArticleTitle}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-accent text-sm"
                    required
                  />
                </div>
              )}

              {/* URL (only for Web) */}
              {importType === 'web' && (
                <div>
                  <label className="block text-sm font-medium mb-2">URL</label>
                  <input
                    type="url"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder={isEnglish ? 'Enter webpage URL' : '输入网页URL'}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-accent text-sm"
                  />
                </div>
              )}

              {/* Content */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  {importType === 'md' ? t.mdContentLabel : t.webContentLabel}
                </label>
                <textarea
                  value={importContent}
                  onChange={(e) => setImportContent(e.target.value)}
                  placeholder={importType === 'md'
                    ? t.pasteMdPlaceholder
                    : t.pasteWebPlaceholder
                  }
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:border-accent text-sm min-h-[200px]"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={importing || !importContent.trim()}
                  className="flex-1 py-3 bg-[#191919] text-white rounded-lg text-sm font-medium hover:bg-black/80 transition-colors disabled:opacity-50"
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t.importAndGenerate}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
