'use client'

import React from 'react'
import Link from 'next/link'
import { Youtube, BookOpen, ArrowRight, Zap, Layout, Github, Globe, Shield, Sparkles } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export default function Home() {
  const { t, language, setLanguage } = useI18n()
  const isEnglish = language === 'en'

  return (
    <div className="min-h-screen bg-white text-slate-900 selection:bg-accent/30">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 font-serif text-2xl font-black tracking-tighter italic">
            <img src="/logo.png" alt="Echo Logo" className="w-10 h-10 rounded-xl shadow-lg shadow-black/10 hover:scale-105 transition-transform" />
            <span className="ml-1">Echo <span className="text-accent not-italic font-sans text-xs align-top font-bold">PRO</span></span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-500">
            <Link href="/blogs" className="hover:text-black transition-colors">{t.browseBlogs}</Link>
            <Link href="/dashboard" className="hover:text-black transition-colors">{t.dashboardNav}</Link>
            <button
              onClick={() => setLanguage(isEnglish ? 'zh' : 'en')}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              title={t.switchLanguage}
            >
              <Globe className="w-5 h-5" />
            </button>
          </div>
          <Link 
            href="/dashboard"
            className="px-5 py-2.5 bg-black text-white rounded-full text-sm font-bold hover:scale-105 active:scale-95 transition-all shadow-xl shadow-black/10"
          >
            {t.startNow}
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-50 border border-slate-100 text-slate-500 text-xs font-bold mb-10 tracking-widest uppercase">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span>{t.nextGenEngine}</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-black tracking-tight text-slate-900 mb-8 leading-[0.95] font-serif">
            {isEnglish ? 'Knowledge' : '让知识'}<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-purple-500 to-indigo-600">
              {t.touchableKnowledge}
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-500 mb-12 max-w-2xl mx-auto leading-relaxed font-medium">
            {t.autoTransform}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link
              href="/dashboard"
              className="group w-full sm:w-auto px-10 py-5 bg-black text-white rounded-2xl font-black text-lg hover:shadow-[0_20px_50px_rgba(0,0,0,0.2)] transition-all flex items-center justify-center gap-3"
            >
              {t.goToDashboard}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/blogs"
              className="w-full sm:w-auto px-10 py-5 bg-white text-slate-900 border-2 border-slate-100 rounded-2xl font-black text-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-3"
            >
              {t.browsePublicLibrary}
              <BookOpen className="w-5 h-5" />
            </Link>
          </div>
        </div>
        
        {/* Abstract Background Element */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-accent/10 blur-[120px] rounded-full" />
        <div className="absolute top-1/2 -right-24 w-80 h-80 bg-purple-500/10 blur-[100px] rounded-full" />
      </section>

      {/* Features Grid */}
      <section className="py-32 bg-slate-50/50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Github,
                title: t.multiSourceIngestion,
                color: 'bg-black',
                desc: t.multiSourceIngestionDesc
              },
              {
                icon: Zap,
                title: t.aiDeepReconstruction,
                color: 'bg-accent',
                desc: t.aiDeepReconstructionDesc
              },
              {
                icon: Layout,
                title: t.knowledgeGraph,
                color: 'bg-indigo-600',
                desc: t.knowledgeGraphDesc
              }
            ].map((f, i) => (
              <div key={i} className="group p-10 bg-white rounded-[32px] border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500">
                <div className={`w-14 h-14 ${f.color} rounded-2xl flex items-center justify-center mb-8 text-white shadow-lg`}>
                  <f.icon className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-black mb-4 tracking-tight">{f.title}</h3>
                <p className="text-slate-500 leading-relaxed font-medium">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-8 border-t border-slate-100 pt-20">
          <div className="flex items-center gap-2 font-serif text-xl font-black italic">
             <img src="/logo.png" alt="Echo Logo" className="w-8 h-8 rounded-lg shadow-sm" />
             Echo <span className="text-accent not-italic font-sans text-xs align-top font-bold">PRO</span>
          </div>
          <div className="text-slate-400 text-sm font-medium">
            {t.footerCopyright}
          </div>
          <div className="flex gap-6">
            <Link href="#" className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-black transition-colors">
              <Github className="w-5 h-5" />
            </Link>
            <Link href="#" className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-black transition-colors">
              <Globe className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
