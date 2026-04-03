# YT-Knowledge-Base Pro 技术架构方案

本文档描述了将现有 YouTube 知识库扩展为 **YT-KB Pro (全方位技术知识引擎)** 的技术架构。该版本旨在支持多源数据接入（GitHub/Web/YouTube）并提供深度语义分析。

## 1. 系统概览

系统将由单一的“视频总结工具”进化为“结构化知识平台”，重点强化数据的**横向关联**与**深度推理**。

### 核心演进方向
- **多维度接入**：支持 GitHub 仓库分析、网页文档爬取。
- **交互式问答**：基于已存储知识进行语义检索与对话。

---

## 2. 逻辑架构 (Layers)

### 2.1 摄取层 (Ingestion Layer) - [增强]
- **YouTube Source**：保留现有 Transcript 获取逻辑。
- **[NEW] GitHub Source**：利用 GitHub API 抓取代码结构、README 及核心逻辑。
- **[NEW] Web Source**：集成抓取工具，提取技术博客或文档正文。

### 2.2 核心服务层 (Service Layer)
- **Minimax Service**：
  - 扩展 Prompt 库：增加“架构分析”、“对比研究”、“代码审阅”等专项 Prompt。
  - **推理模式**：利用 M2.7 的 `reasoning_tokens` 进行复杂逻辑判断。
- **[NEW] Knowledge Engine**：
  - 负责维护知识点之间的 Tag 关联。
  - 支持“知识聚类”，将相同主题的视频和代码库自动归位。

### 2.3 数据持久层 (Data Layer)
- **Prisma + SQLite/PostgreSQL**：
  - 扩展 Schema：增加 `SourceType`, `ProjectGroup`, `ConceptRelation` 等表。
- **[Future] Vector DB**：为 RAG (增强检索生成) 预留接口，支持语义搜索。

### 2.4 展示层 (Presentation Layer)
- **Next.js 14 (App Router)**：
  - 技术博客详情页：集成 Mermaid 渲染引擎。
  - 控制面板：多维度的任务进度追踪。

---

## 3. 技术栈选择

| 模块 | 技术选型 | 理由 |
| :--- | :--- | :--- |
| **基础框架** | Next.js 14 | 全栈能力，成熟的 API Routes 支持 |
| **ORM** | Prisma | 强类型，易于迁移 Schema |
| **AI 引擎** | MiniMax-M2.7 | 推理能力强，适合长文本技术分析 |
| **抓取** | Playwright / GitHub SDK | 处理动态网页与仓库操作 |
| **可视化** | Mermaid.js / Lucide | 展现技术架构与组件图 |

---

## 4. 关键流程设计 (Sequence)

### 4.1 综合知识点提取流程
1. 用户提交 URL (YT/GitHub/Web)。
2. 系统识别来源并分流至对应抓取器。
3. 提取原始内容 (Transcript/Code/Markdown)。
4. 调用 **MiniMax-M2.7** 进行结构化分析（设置 `name: assistant` 以确保最佳输出）。
5. 存入数据库并生成关联标签。
6. 前端实时渲染 Markdown + Mermaid 视图。

---

## 5. 后续开发规划

### 第一阶段：多源接入 (MVP)
- 实现 GitHub README 分析。
- 优化现有的视频抓取重试机制。

### 第二阶段：知识增强
- 引入“知识点对比”视图。
- 自动生成技术学习路线图 (Roadmap)。

### 第三阶段：全能助手
- 集成 Chat 界面，基于已抓取的内容进行交互式问答。
