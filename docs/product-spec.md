# MAGI 产品说明文档

> 版本: 5.0 | 更新日期: 2026-04-12

## 1. 产品概述

MAGI 是一个 AI 辅助的 PRD（产品需求文档）生产平台，面向 Shopee Supply Chain 的 FPM（Functional Product Manager）。命名灵感源自 EVA 中的 MAGI 超级计算机系统，三层 AI 分析（业务分析 → 高阶方案 → PRD）如同 MELCHIOR、BALTHASAR、CASPER 三台计算机的协同决策。

**核心目标**：标准化 FPM 从"理解业务需求"到"输出 PRD 文档"的完整工作流程，不是一键生成 PRD，而是在 AI 辅助下逐步厘清需求细节。

## 2. 核心架构

### 2.1 数据层级

```
系统 (System)         ← Level 1: 如 ISC, OMS, SPX
 └── 模块 (Module)    ← Level 2: 如 Invoice Stock, Order Management
      └── 项目 (Project) ← Level 3: 每个具体需求 = 一个项目
```

### 2.2 四步工作流

```
Step 1: 业务需求 → Step 2: 业务分析 → Step 3: 高阶方案设计 → Step 4: 产品需求
```

| 步骤 | 目的 | 输入 | AI 输出 | 用户操作 |
|------|------|------|---------|---------|
| 1. 业务需求 | 收集 BRD/FRF 及参考材料 | BRD, FRF, Google Doc, 参考链接 | - | 上传/粘贴文档 |
| 2. 业务分析 | 理解需求、标注问题、识别风险 | 核心需求 + 系统上下文 + KB | BRD 解读、流程图、**内联标注**、待确认点、业务规则 | 回答确认点、添加标注、对话反馈 |
| 3. 高阶方案 | 设计产品方案 | 分析结果 + 系统上下文 | 信息/系统/数据架构（**含 Mermaid 图**）、**受影响系统列表** | 确认/修改方案、**选择 PRD 范围** |
| 4. 产品需求 | 生成 PRD | 全部上游输出 + **Confluence 模板** | 完整 PRD 文档 | 编辑/复制/**发布到 Confluence** |

## 3. 功能清单

### 3.1 系统管理
- 创建/编辑/删除系统
- 上传设计原则和系统边界（支持 MD 文件导入）
- 配置知识库来源（Confluence 目录 / 关键词搜索 / Markdown）
- **KB 索引管理 (v5.0 新增)**：
  - Confluence 目录类型的 KB 支持构建/刷新索引（递归遍历最多 4 层，所有页面的 ID、标题、摘要存入本地 SQLite）
  - UI 显示索引状态：已索引页数、有内容页数、上次索引时间
  - 在线检索采用两阶段策略：本地关键词匹配 + CQL 搜索，合并去重取 top 20 页
  - 每页内容上限 8000 字符，单次最多 20 篇文档
- **错误日志查询 (v4.0 新增)**：
  - 全局错误捕获：所有 API 路由的异常自动记录到 `error_logs` 表
  - 每条日志包含：发生时间、来源模块、请求端点/方法、错误详情、堆栈追踪、请求上下文
  - 三级严重度：`critical`（LLM 解析失败等）、`error`（一般错误）、`warning`（非致命问题）
  - 智能原因分析：根据错误特征自动给出可能原因和建议处理方式
  - 支持按严重度过滤、单条删除、清空全部日志
  - 侧边栏「系统管理 > 错误日志」入口

### 3.2 模块管理
- 在系统下创建模块
- 每个模块可独立定义设计原则和边界

### 3.3 项目工作台

#### Step 1 - 业务需求
- **文档分类**：BRD/FRF 为核心需求文档，其他为参考材料
- **支持格式**：直接粘贴 Markdown、Google Doc 链接自动拉取、外部链接
- **分组展示**：核心需求文档和参考材料分组显示

#### Step 2 - 业务分析
- **BRD 解读**：AI 对核心需求文档的结构化文字解读
- **业务流程图**：自动生成 Mermaid 流程图（如 BRD 涉及明确流程）
- **原文标注与评论 (v4.0 升级为 Google Doc 风格)**：
  - **文档格式还原**：Google Doc 来源的 BRD 保存 HTML 格式版本（`content_html`），尽量还原原始排版（标题、粗体、列表、表格、颜色、链接等）
  - **侧边栏评论交互**：采用左侧文档 + 右侧评论侧边栏的布局，类似 Google Doc 的 Comment 交互
  - **评论卡片内容**：每条标注卡片包含——引用原文片段、**问题（question）**、**建议答案（suggested_answer）**、严重度标签、作者标识（AI/用户）
  - **双向联动**：点击文档中的高亮标注自动滚动到对应评论卡片，点击评论卡片高亮显示对应文字
  - **AI 生成标注增强**：LLM 分析时每个标注输出 `question`（具体问题）和 `suggested_answer`（建议答案），直接展示在评论卡片中
  - 用户可以选中文字手动添加评论；用户可删除已有标注
  - 当存在核心需求文档时，标注相关 UI 始终可见
  - 保存标注时展示进行中状态，避免重复提交
  - 标注分三级严重度：critical（红色）、warning（橙色）、info（蓝色/黄色）
  - 标注可关联到对应的待确认点
  - 保持独立的待确认点列表，因为不是所有待确认点都能对应到原文中的具体位置
- **待确认点**：
  - 三级严重度：`critical`（方案质疑）、`warning`（需关注）、`info`（待确认）
  - **方案质疑**：AI 主动识别违反系统设计原则、超越系统边界的需求
  - 每个问题附带建议答案，用户可采纳或自行回答
  - 支持"确认回答"或"确认并转为规则"
- **业务规则**：从需求中提取的明确规则，支持手动添加
- **对话交互**：用户可通过聊天告诉 AI 哪里存在偏差，AI 更新解读和流程图

#### Step 3 - 高阶方案设计
- **信息架构**：页面改动、新页面、导航关系 + **Mermaid 架构图 (v3.0 新增)**
- **系统架构**：跨系统/跨模块改造、接口变更 + **Mermaid 序列图 (v3.0 新增)**
- **数据架构**：新增数据实体、现有实体字段变更 + **Mermaid ER 图 (v3.0 新增)**
- **Per-section 对话 (v3.0 新增)**：每个 section 有独立的对话窗口，针对性反馈；**消息加载展示 loading/空状态；加载失败时有错误处理**
- **Section 内容保存**：**保存按钮展示加载态；接口失败时错误提示**（不误报成功）
- **跨系统识别 (v3.0 新增)**：
  - AI 自动识别本需求涉及改造的所有业务系统/模块
  - 标记哪些属于当前项目系统、哪些是外部系统
  - 用户可选择 PRD 范围：仅当前系统 or 所有受影响系统
  - **`affected_systems` 为空时展示提示「未识别跨系统影响」**
- **确认机制**：用户确认方案后进入 PRD 生成；**确认方案与 PRD 范围变更时对接口错误做明确处理**

#### Step 4 - 产品需求
- **PRD 生成**：基于业务分析 + 高阶方案 + 系统上下文生成
- **Confluence 模板 (v3.0 新增)**：支持配置 Confluence 页面作为 PRD 模板或样例
- **范围控制 (v3.0 新增)**：根据 scope_mode 控制 PRD 覆盖范围
- **编辑/复制**：支持在线编辑和复制 Markdown
- **发布到 Confluence (v3.0 新增)**：
  - 一键将 PRD 发布为 Confluence 页面
  - 支持通过目录浏览器选择发布的父页面
  - **正式发布前增加确认步骤，展示目标父页面与将要创建的页面标题**
  - 发布后自动记录 Confluence 页面链接
- **版本追踪**：每次生成自增版本号

### 3.4 设置
- LLM API 配置（支持 OpenAI 兼容 / Anthropic 原生）
- Confluence 连接配置
- Google Workspace 凭证配置
- **PRD 模板配置 (v3.0 新增)**：指定 Confluence 页面 ID 作为 PRD 模板；**页面 ID 仅允许数字输入**；**提供「测试拉取模板」以验证模板页可读**
- **保存设置：仅在成功时提示已保存；失败时展示错误，不误报成功**
- 各项连接测试

### 3.5 自定义 Skill
- 自定义 LLM 技能（提示词、输出格式）

## 4. 技术架构

| 组件 | 技术选型 |
|------|---------|
| 前端 | Next.js 16 + React 19 + Tailwind CSS 4 |
| 后端 | Next.js API Routes (App Router) |
| 数据库 | SQLite (better-sqlite3) |
| LLM | OpenAI SDK / Anthropic Native API |
| 流程图/架构图 | Mermaid.js |
| Markdown | react-markdown + remark-gfm |
| 外部集成 | Confluence REST API (读写), Google Workspace (Python script) |

## 5. 数据模型

### 核心实体

| 实体 | 说明 | 关键字段 |
|------|------|---------|
| System | 系统 | name, design_principles, boundaries |
| Module | 模块 | name, design_principles, boundaries |
| KbSource | 知识库来源 | type (confluence/code_repo/markdown), config |
| **KbPageIndex** | **KB 页面索引 (v5.0)** | **page_id, title, excerpt, path, char_count, depth, indexed_at** |
| Project | 项目 | name, status, system_id, module_id, **scope_mode** |
| Requirement | 需求文档 | type, content, **content_html (v4.0)** |
| **Annotation** | **原文评论** | **highlighted_text, annotation_text, question, suggested_answer (v4.0), author, severity** |
| **ErrorLog** | **错误日志 (v4.0)** | **source, endpoint, method, error_message, error_stack, severity** |
| AnalysisSummary | 分析摘要 | brd_interpretation, process_diagram |
| ClarificationPoint | 待确认点 | question, severity (info/warning/critical), status |
| BusinessRule | 业务规则 | rule_text, source_type |
| ChatMessage | 对话消息 | phase (analysis/hld/prd), **section**, role, content |
| HighLevelDesign | 高阶方案 | information/system/data_architecture, **ia/sa/da_diagram, affected_systems** |
| PRD | 产品需求文档 | content, version, status, **confluence_page_id, confluence_url** |

### 项目状态机

```
draft → analyzing → analyzed → hld_draft → hld_confirmed → prd_draft → prd_final
```

## 6. 上下文组装策略

分析和方案生成时，AI 获得的上下文包括：

1. **系统设计原则** — 用于判断需求是否合理
2. **系统边界** — 用于识别超越边界的需求
3. **模块设计原则** — 更精细的约束
4. **知识库内容 (v5.0 升级)** — 两阶段检索策略：
   - **离线索引**：首次配置 KB 时递归遍历 Confluence 目录（最多 4 层），存储每页的 ID、标题、摘要（前 500 字）到本地 SQLite `kb_page_index` 表
   - **在线检索**：从 BRD 内容中提取关键词，同时在本地索引（LIKE 匹配）和 Confluence CQL 中搜索，合并去重取 top 20 页，每页最多 8000 字符
   - 支持最多 20 篇文档/次请求，总 token 预算约 24,000（兼容 Claude Sonnet 4、GPT-4o、DeepSeek Chat）
5. **核心需求文档** — BRD/FRF/Google Doc，AI 深入分析的对象
6. **参考材料** — 仅辅助理解上下文，不作为分析对象

## 7. API 路由概览

### v4.0 新增路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/error-logs` | GET/DELETE | 错误日志查询/删除/清空 |
| `/api/kb/index` | GET/POST/DELETE | KB 索引状态查询/触发构建/清除索引 (v5.0) |

### v3.0 新增路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/projects/[id]/annotations` | GET/POST/DELETE | 原文评论 CRUD（v4.0 新增 question/suggested_answer 字段） |
| `/api/confluence/children` | GET | 获取 Confluence 子页面（目录浏览器） |
| `/api/confluence/publish` | POST | 将 PRD 发布为 Confluence 页面 |

### v3.0 变更路由

| 路由 | 变更说明 |
|------|---------|
| `/api/projects/[id]/analyze` | 新增 annotations 输出 |
| `/api/projects/[id]/hld` | 新增 diagram 和 affected_systems 字段 |
| `/api/projects/[id]/chat` | 支持 section 参数实现 per-section 对话 |
| `/api/projects/[id]/prd` | 支持 Confluence 模板和 scope_mode |
| `/api/projects/[id]` | 支持 scope_mode 更新 |

## 8. 限制和约束

- MVP 版本，仅支持本地单用户部署
- LLM 调用依赖外部 API，需配置 API Key
- Confluence 发布需要写入权限的 Token
- Google Doc 拉取依赖本地 Python 环境
