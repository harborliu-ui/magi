# MAGI

*FPM 辅助 PRD 生产平台** — 从 业务需求 到 PRD 的标准化工作流


---

## 快速开始（5 分钟部署）

### 前置条件

| 工具 | 版本要求 | 检查命令 |
|------|---------|---------|
| **Node.js** | >= 18.0 | `node -v` |
| **npm** | >= 9.0 | `npm -v` |
| **Git** | 任意版本 | `git --version` |

### Step 1：下载项目

```bash
git clone https://github.com/harborliu-ui/magi.git
cd magi
```

### Step 2：安装依赖

```bash
npm install
```

> 如果 `better-sqlite3` 安装报错（常见于 Apple Silicon Mac），请先执行：
> ```bash
> xcode-select --install
> ```

### Step 3：启动

```bash
npm run dev
```

看到以下输出即表示启动成功：
```
▲ Next.js 16.x
- Local: http://localhost:3000
```

### Step 4：打开浏览器

访问 **http://localhost:3000**，即可开始使用 MAGI。

### Step 5：首次配置

启动后，点击左侧导航栏底部的 **「设置」**，完成以下配置：

#### LLM 配置（必须）

| 配置项 | 说明 | 示例 |
|--------|------|------|
| API Base URL | LLM API 地址 | `https://api.anthropic.com/v1` |
| API Key | 你的 API Key | `sk-ant-api03-xxx...` |
| 模型 | 选择模型 | `claude-sonnet-4-20250514` |

支持的 LLM 服务：
- **Anthropic Claude**（推荐）：直接填入 Anthropic API URL 和 Key
- **OpenAI / GPT-4o**：填入 OpenAI 兼容的 API URL 和 Key
- **任何 OpenAI 兼容的 API Gateway**：如公司内部网关

#### Confluence 配置（推荐）

| 配置项 | 说明 | 示例 |
|--------|------|------|
| Base URL | Confluence 地址 | `https://confluence.shopee.io` |
| Bearer Token | 个人访问令牌 | 在 Confluence 个人设置中生成 |

> Token 获取路径：Confluence → 右上角头像 → Personal Access Tokens → Create token

#### Google Workspace 配置（可选）

如果你需要从 Google Docs 导入 BRD：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| Client Secret 路径 | OAuth 客户端密钥文件 | `~/.config/google/client_secret.json` |
| OAuth Token 路径 | 授权令牌文件 | `~/.config/google/oauth_token.json` |

---

## 使用流程

```
创建系统 → 配置知识库 → 创建模块 → 创建项目 → 上传 BRD → 业务分析 → 高阶方案 → 生成 PRD
```

### 1. 创建系统

在左侧导航点击「新建系统」，输入你负责的系统名称（如 ISC、OMS）。

进入系统配置页面后：
- **上传设计原则**：定义系统的核心设计原则（支持 MD 文件上传）
- **上传系统边界**：明确系统职责边界（支持 MD 文件上传）
- **配置知识库**：关联 Confluence 目录作为 AI 参考知识

> 知识库配置后，点击刷新按钮构建索引。MAGI 会递归抓取目录下所有页面（最多 4 层），并在分析时智能匹配最相关的 20 篇文档。

### 2. 业务分析

上传 BRD 后点击「开始分析」，MAGI 将：
- 生成 BRD 核心内容解读
- 绘制业务流程图（Mermaid）
- 在原文中标注需要确认的内容（类似 Google Docs 批注）
- 列出独立的待确认点
- 提取已明确的业务规则

你可以通过对话与 AI 讨论分析结果，AI 会实时更新解读和流程图。

### 3. 高阶方案设计

业务分析确认后，进入高阶方案设计阶段，MAGI 将生成：
- **信息架构**：页面变更方案 + 架构图
- **系统架构**：跨系统交互方案 + 时序图
- **数据架构**：数据模型变更方案 + ER 图

每个部分都支持独立的对话反馈和调整。

### 4. 生成 PRD

确认高阶方案后，一键生成 PRD。支持：
- 使用自定义 PRD 模板（Confluence 页面）
- 编辑和预览 PRD 内容
- 一键发布到 Confluence

---

## 常见问题

### Q: `npm install` 时 `better-sqlite3` 编译失败？

```bash
# macOS
xcode-select --install

# 或者指定 Python 路径
npm install --python=/usr/bin/python3
```

### Q: LLM 连接失败？

1. 确认 API Key 是否正确
2. 确认网络能否访问 API URL（部分公司网络可能需要代理）
3. 在设置页面点击「测试连接」验证

### Q: Confluence 连接失败？

1. 确认 Token 未过期
2. 确认 Base URL 格式正确（不要带尾部 `/`）
3. 在设置页面点击「测试连接」验证

### Q: 数据存在哪里？

所有数据存储在项目根目录的 `data/magi.db`（SQLite 文件）中，完全本地化，不会上传到任何服务器。

---

## 技术栈

- **前端**：Next.js 16 + React 19 + Tailwind CSS 4
- **后端**：Next.js API Routes
- **数据库**：SQLite（better-sqlite3）
- **LLM**：Anthropic Claude / OpenAI / 任何兼容 API

## 目录结构

```
magi/
├── src/
│   ├── app/          # 页面和 API 路由
│   ├── components/   # React 组件
│   ├── lib/          # 核心逻辑（LLM、Confluence、上下文构建）
│   └── types/        # TypeScript 类型定义
├── docs/             # 产品文档
├── scripts/          # E2E 测试脚本
├── public/           # 静态资源
└── data/             # SQLite 数据库（自动创建，不提交到 Git）
```
