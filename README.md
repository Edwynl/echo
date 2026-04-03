# Echo - AI-Powered Tech Blog Generator

Automatically scrape multi-source content and generate beautifully formatted tech blogs using MiniMax AI. Supports YouTube video analysis, GitHub project analysis, web scraping, and more.

## Features

- **YouTube Channel Subscription** - Add and manage YouTube tech channels
- **Automatic Video Fetching** - Scheduled retrieval of latest videos from subscribed channels
- **AI Blog Generation** - Transform video content into structured, well-formatted tech blogs
- **GitHub Project Analysis** - Automatically analyze README files and extract links, resources, and metadata
- **Knowledge Source Management** - Unified management of YouTube channels, GitHub repos, and web sources
- **Project Grouping** - Organize knowledge sources into custom groups
- **Beautiful Typography** - Markdown rendering with syntax highlighting
- **Scheduled Sync** - Vercel Cron job support for automated updates
- **Circuit Breaker** - Resilient API calls with automatic failover
- **Streaming Responses** - Real-time SSE streaming from AI responses

## 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd yt-knowledge-base
```

### 2. 一键启动

**方式 1：双击运行（推荐）**
```
双击 start.bat
```

**方式 2：PowerShell 菜单**
```
右键 start.ps1 → "使用 PowerShell 运行"
```

启动脚本会自动：
- 检查并创建 `.env` 配置文件
- 安装项目依赖
- 启动开发服务器

访问 http://localhost:8760

### 手动启动（可选）

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env

# 初始化数据库
npx prisma db push

# 启动开发服务器
npm run dev
```

## 环境变量配置

编辑 `.env` 文件：

```env
# 数据库 (SQLite)
DATABASE_URL="file:./dev.db"

# YouTube API
# 1. 访问 https://console.cloud.google.com/
# 2. 创建项目并启用 YouTube Data API v3
# 3. 创建 API 密钥
YOUTUBE_API_KEY="your_youtube_api_key"

# MiniMax API
# 1. 访问 https://platform.minimaxi.com/
# 2. 注册并获取 API Key
MINIMAX_API_KEY="your_minimax_api_key"
MINIMAX_BASE_URL="https://api.minimax.io/v1"
MINIMAX_MODEL="MiniMax-M2.7"

# GitHub API (可选，用于分析 GitHub 项目)
GITHUB_TOKEN="your_github_token"

# 可选：定时任务密钥
CRON_SECRET="your_cron_secret"
```

## 使用指南

### 仪表盘

访问 http://localhost:8760/dashboard 管理所有内容。

### 添加 YouTube 频道

1. 在仪表盘页面输入 YouTube 频道链接或 @用户名
2. 点击"添加"按钮
3. 等待频道信息加载完成

### 同步视频

1. 在仪表盘点击"同步视频"按钮
2. 系统会自动获取频道的最新视频

### GitHub 项目分析

访问 http://localhost:8760/sources 添加 GitHub 仓库，系统会自动：
- 获取项目基本信息（星标、fork 数等）
- 拉取 README.md 内容
- **分析 README 中的链接**，提取文档、API、Demo 等资源

### 浏览博客

访问 http://localhost:8760/blogs 查看所有博客文章。

## API 端点

### 博客管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/blogs` | 获取博客列表 |
| POST | `/api/blogs` | 生成博客 |
| DELETE | `/api/blogs?id=xxx` | 删除博客 |
| GET | `/api/blogs/[slug]` | 获取单篇博客 |
| POST | `/api/blogs/generate-missing` | 批量生成缺失博客 |

### 频道管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/channels` | 获取频道列表 |
| POST | `/api/channels` | 添加频道 |
| DELETE | `/api/channels?id=xxx` | 删除频道 |
| POST | `/api/channels/sync` | 同步频道视频 |

### 视频管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/videos/fetch` | 抓取视频 |
| POST | `/api/videos/add` | 添加视频 |
| POST | `/api/videos/generate` | 生成单个视频博客 |
| POST | `/api/videos/generate-all` | 批量生成博客 |

### 知识源管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/sources` | 获取知识源列表 |
| POST | `/api/sources/add` | 添加知识源 |
| GET/DELETE | `/api/sources/[id]` | 获取/删除单个知识源 |

### GitHub 分析

| 方法 | 路径 | 描述 |
|------|------|------|
| GET/POST | `/api/github/analyze-readme` | 分析 README 链接 |

**使用示例：**
```bash
# 通过 URL 分析
GET /api/github/analyze-readme?url=https://github.com/owner/repo

# 提交内容分析
POST /api/github/analyze-readme
{
  "content": "# README 内容..."
}
```

### 项目分组

| 方法 | 路径 | 描述 |
|------|------|------|
| GET/POST | `/api/project-groups` | 获取/创建分组 |

### 定时任务

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/cron/sync` | 定时同步频道视频 |

## 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── blogs/              # 博客 API
│   │   ├── channels/           # 频道 API
│   │   ├── videos/             # 视频 API
│   │   ├── sources/            # 知识源 API
│   │   ├── github/             # GitHub 分析 API
│   │   ├── project-groups/    # 分组 API
│   │   └── cron/              # 定时任务
│   ├── blogs/                  # 博客页面
│   ├── dashboard/              # 仪表盘
│   ├── sources/                # 知识源页面
│   └── page.tsx                # 首页
├── lib/
│   ├── prisma.ts               # Prisma 客户端
│   ├── utils.ts                # 工具函数
│   └── youtube-transcript.ts   # YouTube 字幕获取
├── services/
│   ├── youtube.ts              # YouTube API 服务
│   ├── minimax.ts              # MiniMax AI 服务
│   ├── github.ts               # GitHub API 服务
│   ├── knowledge-source.ts     # 知识源服务
│   └── notebooklm.ts           # NotebookLM 服务
└── types/                      # 类型定义
```

## 部署到 Vercel

### 1. 推送代码到 GitHub

```bash
git add .
git commit -m "feat: prepare for Vercel deployment"
git push origin main
```

### 2. 创建 Vercel Postgres 数据库（推荐）

SQLite 在 Vercel Serverless 环境中无法持久化，推荐使用 Vercel Postgres：

1. 访问 https://vercel.com/dashboard
2. 点击 "Add New..." -> "Database"
3. 选择 "Postgres" 并创建
4. 复制连接字符串，格式如下：
   ```
   postgresql://user:password@host:5432/database?sslmode=require
   ```

### 3. 修改 Prisma 配置

如果使用 Vercel Postgres，需要修改 `prisma/schema.prisma`：

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

然后在本地执行 `npx prisma db push` 并生成客户端 `npx prisma generate`。

### 4. 导入到 Vercel

1. 访问 https://vercel.com
2. 点击 "Add New..." -> "Project"
3. 选择 GitHub 仓库
4. 在 "Environment Variables" 中添加以下变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `DATABASE_URL` | `postgresql://...` | Vercel Postgres 连接字符串 |
| `YOUTUBE_API_KEY` | `AIza...` | YouTube API 密钥 |
| `MINIMAX_API_KEY` | `sk-cp...` | MiniMax API 密钥 |
| `MINIMAX_BASE_URL` | `https://api.minimax.io/v1` | MiniMax API 地址 |
| `MINIMAX_MODEL` | `MiniMax-M2.7` | MiniMax 模型名称 |
| `CRON_SECRET` | `随机字符串` | Cron 作业安全密钥 |

5. 点击 Deploy

### 5. 配置定时任务

Vercel 会根据 `vercel.json` 自动配置 Cron Job。也可手动设置：

1. 前往项目 Settings -> Cron Jobs
2. 确保已配置：
   - Path: `/api/cron/sync`
   - Schedule: `0 6 * * *` (每天 UTC 6 点 = 北京时间 14 点)
   - 方法: POST

### 6. 本地开发连接 Vercel Postgres

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 链接数据库到本地
vercel env pull .env.local
```

### 常见问题

**构建失败？**
- 确保 `npm run build` 能正常运行
- 检查 `postinstall` 脚本是否包含 `prisma generate`

**Cron 作业不执行？**
- 确认已设置 `CRON_SECRET` 环境变量
- 检查 Vercel 项目的 Cron Jobs 配置

## 优化记录

本项目已完成以下优化：

### 性能优化

| 优化项 | 说明 |
|--------|------|
| **YouTube N+1 修复** | 批量获取视频详情，从 N 次 API 调用优化为 ceil(N/50) 次 |
| **Slug 去重** | 统一使用 `slugify()` 和 `uniqueSlug()` 工具函数，消除 11 处重复实现 |
| **API 内存缓存** | 博客/频道/来源列表接入 `ApiCache`，支持 TTL 和 LRU 淘汰 |
| **搜索防抖** | 博客列表搜索输入 300ms 防抖，减少频繁请求 |
| **并发限制** | 引入 `p-limit` 控制并发数量 |

### 可靠性优化

| 优化项 | 说明 |
|--------|------|
| **熔断器** | MiniMax API 接入 `CircuitBreaker`，失败阈值 5 次，超时 30s 自动切换 |
| **流式响应** | MiniMax 服务端支持 SSE 流式输出 |
| **重试机制** | YouTube API / MiniMax API 请求均支持自动重试 |

### 前端优化

| 优化项 | 说明 |
|--------|------|
| **Mermaid 按需加载** | 图表渲染库改为首次遇到代码块时动态 import |
| **react-markdown 动态导入** | 减小首屏 JS bundle |
| **Next.js Image** | 封面图从 `<img>` 替换为 `<Image>`，支持自动格式化和尺寸优化 |
| **Suspense Boundary** | 博客列表页面包裹 Suspense，修复 `useSearchParams` SSG 警告 |
| **安全响应头** | `poweredByHeader: false`，关闭 X-Powered-By 暴露 |
| **Gzip 压缩** | Next.js compress 选项默认开启 |

### 开发者体验

| 优化项 | 说明 |
|--------|------|
| **Sentry 接入** | 客户端+服务端双套 Sentry 配置，`SENTRY_DSN` 未配置时优雅降级 |
| **i18n 文件拆分** | 翻译文件拆分为 `locales/zh.ts` 和 `locales/en.ts`，主文件从 632 行减至 50 行 |
| **统一 RateLimit 工具** | `getRateLimitHeaders()` 导出方法，消除重复实现 |
| **Prisma 索引** | `BlogPost.language` 字段添加数据库索引，加速语言过滤查询 |
| **ESLint/Zod 升级** | `zod` 升级至 3.23.8，`date-fns` 和 `node-cron` 已移除 |

### 配置增强

- `.env.example` 新增 `SENTRY_DSN` 占位
- `next.config.mjs` 新增 `remotePatterns`（YouTube/GitHub 头像图域名）
- `ApiCache` 支持命名、TTL、最大条目配置

## 常见问题

### YouTube API 配额

YouTube API 有每日配额限制，默认 10,000 单位。视频搜索和详情获取会消耗配额。

### MiniMax API 费用

MiniMax API 按字符数计费。建议在 `.env` 中设置 `MINIMAX_MODEL` 来控制成本。

### 字幕获取失败

部分视频没有字幕或字幕不可用，系统会使用视频描述作为后备内容。

## 技术栈

- **前端**: Next.js 14, React, Tailwind CSS
- **后端**: Next.js API Routes
- **数据库**: SQLite, Prisma ORM
- **AI**: MiniMax API
- **部署**: Vercel
