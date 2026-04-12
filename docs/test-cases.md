# MAGI 自测用例

> 版本: 5.0 | 更新日期: 2026-04-12

## 测试环境

- 服务地址: `http://localhost:3000`
- 自动化脚本: `scripts/e2e-test.sh`
- 运行方式: `bash scripts/e2e-test.sh`

---

## 自动化测试用例清单

### 1. 基础设施 (3 cases)

| # | 用例 | 验证点 | 自动化 |
|---|------|--------|--------|
| 1.1 | 服务可用性 | 访问 BASE_URL 返回 200 | ✅ |
| 1.2 | Confluence 凭证 | 从 ~/.confluence-credentials 读取 Token | ✅ |
| 1.3 | 数据库可用 | SQLite 文件存在且可读写 | ✅ |

### 2. 设置与连接 (6 cases)

| # | 用例 | 验证点 | 自动化 |
|---|------|--------|--------|
| 2.1 | 保存 Confluence 设置 | PUT /api/settings 返回更新后的值 | ✅ |
| 2.2 | 测试 Confluence 连接 | POST /api/settings/test-confluence 返回 success=true | ✅ |
| 2.3 | 保存 Google Workspace 设置 | PUT /api/settings 包含 google_* 字段 | ✅ |
| 2.4 | 测试 Google 连接 | POST /api/settings/test-google 返回 success=true | ✅ |
| 2.5 | 保存 PRD 模板配置 | PUT /api/settings 包含 prd_template_confluence_id | ✅ |
| 2.6 | 设置保存失败不误报成功（UX） | 模拟或断网使 PUT /api/settings 失败时，界面显示错误、不出现成功提示 | ⬜ 手动 |

### 3. 系统管理 (3 cases)

| # | 用例 | 验证点 | 自动化 |
|---|------|--------|--------|
| 3.1 | 创建系统 | POST /api/systems 返回包含 id 的对象 | ✅ |
| 3.2 | 上传设计原则 | PUT /api/systems/{id} 更新 design_principles | ✅ |
| 3.3 | 上传系统边界 | PUT /api/systems/{id} 更新 boundaries | ✅ |

### 4. 知识库 (8 cases, v5.0 升级)

| # | 用例 | 验证点 | 自动化 |
|---|------|--------|--------|
| 4.1 | 添加 KB 来源 | PUT /api/systems/{id} 包含 kb_sources 数组 | ✅ |
| 4.2 | KB 来源返回 ID | kb_sources[0].id 非空 | ✅ |
| 4.3 | 索引初始为空 | GET /api/kb/index?kb_source_id={id} 返回 total_pages=0 | ✅ |
| 4.4 | 触发索引构建 | POST /api/kb/index 返回 success=true, total>0, with_content>0 | ✅ |
| 4.5 | 索引页面数>0 | 构建结果 total > 0 | ✅ |
| 4.6 | 有内容页面数>0 | 构建结果 with_content > 0 | ✅ |
| 4.7 | 索引状态已更新 | GET /api/kb/index 返回 total_pages>0, last_indexed 非空 | ✅ |
| 4.8 | 按系统查询索引 | GET /api/kb/index?system_id={id} 返回数组长度>0 | ✅ |

### 5. 模块和项目创建 (2 cases)

| # | 用例 | 验证点 | 自动化 |
|---|------|--------|--------|
| 5.1 | 创建模块 | POST /api/modules 返回包含 id 的对象 | ✅ |
| 5.2 | 创建项目 | POST /api/projects 返回包含 id 的对象 | ✅ |

### 6. 需求文档管理 (4 cases)

| # | 用例 | 验证点 | 自动化 |
|---|------|--------|--------|
| 6.1 | 添加 BRD (Google Doc) | POST /api/projects/{id}/requirements type=google_doc, 内容长度 > 0 | ✅ |
| 6.2 | 添加参考材料 | POST /api/projects/{id}/requirements type=reference, 返回 id | ✅ |
| 6.3 | 核心文档分类正确 | brd/frf/google_doc 归为核心文档 | ✅ |
| 6.4 | 参考材料分类正确 | reference/link 归为参考材料 | ✅ |

### 7. 业务分析 (5 cases)

| # | 用例 | 验证点 | 自动化 |
|---|------|--------|--------|
| 7.1 | Dry-run 分析成功 | POST /api/projects/{id}/analyze?dry_run=1 返回 dry_run=true | ✅ |
| 7.2 | 系统上下文包含设计原则 | context_log 中设计原则 included=true | ✅ |
| 7.3 | 系统上下文包含系统边界 | context_log 中系统边界 included=true | ✅ |
| 7.4 | 系统上下文包含知识库 | context_log 中 KB included=true | ✅ |
| 7.5 | 核心文档与参考材料独立标记 | context_log 分别记录 BRD/FRF 和参考材料 | ✅ |

### 8. 标注 API (6 cases, v4.0 升级)

| # | 用例 | 验证点 | 自动化 |
|---|------|--------|--------|
| 8.1 | GET 标注列表 | GET /api/projects/{id}/annotations 返回数组 | ✅ |
| 8.2 | 添加用户标注（含 question/suggested_answer） | POST 请求包含 question 和 suggested_answer 字段 | ✅ |
| 8.3 | 标注包含 question 字段 | GET 返回的标注有非空 question | ✅ |
| 8.4 | 标注包含 suggested_answer 字段 | GET 返回的标注有非空 suggested_answer | ✅ |
| 8.5 | 删除标注 | DELETE /api/projects/{id}/annotations 返回 success=true | ✅ |
| 8.6 | 删除后数量归零 | 删除后 GET 返回空数组 | ✅ |

### 8b. 错误日志 API (5 cases, v4.0 新增)

| # | 用例 | 验证点 | 自动化 |
|---|------|--------|--------|
| 8b.1 | 错误日志查询 | GET /api/error-logs 返回 {logs: [], total: N} | ✅ |
| 8b.2 | total 字段存在 | total >= 0 | ✅ |
| 8b.3 | severity 过滤 | GET /api/error-logs?severity=critical 返回 logs 数组 | ✅ |
| 8b.4 | 清空日志 | DELETE /api/error-logs body={clear_all: true} 返回 success=true | ✅ |
| 8b.5 | 清空后数量为 0 | 清空后 GET total=0 | ✅ |

### 9. 分析摘要 API (1 case)

| # | 用例 | 验证点 | 自动化 |
|---|------|--------|--------|
| 9.1 | GET 分析摘要 | GET /api/projects/{id}/analysis-summary 返回 JSON | ✅ |

### 10. 对话交互 (7 cases)

| # | 用例 | 验证点 | 自动化 |
|---|------|--------|--------|
| 10.1 | Analysis Chat dry-run | POST /api/projects/{id}/chat phase=analysis, dry_run=true | ✅ |
| 10.2 | 用户消息已保存 | 返回 user_message_id | ✅ |
| 10.3 | 助理回复已保存 | 返回 assistant_message_id | ✅ |
| 10.4 | 消息持久化 | GET /api/projects/{id}/chat?phase=analysis 返回 >= 2 条 | ✅ |
| 10.5 | HLD Section Chat (v3.0) | POST /api/projects/{id}/chat phase=hld, section=system_architecture, dry_run=true | ✅ |
| 10.6 | Section 消息筛选 (v3.0) | GET /api/projects/{id}/chat?phase=hld&section=system_architecture 返回该 section 消息 | ✅ |
| 10.7 | HLD Section Chat 空/错状态（UX） | 各 section 对话区：加载中可见 loading；无消息有空状态；GET 失败有错误提示 | ⬜ 手动 |

### 11. 高阶方案 API (6 cases)

| # | 用例 | 验证点 | 自动化 |
|---|------|--------|--------|
| 11.1 | HLD 前置检查 | POST /api/projects/{id}/hld 无分析时返回错误 | ✅ |
| 11.2 | HLD GET | GET /api/projects/{id}/hld 返回 JSON | ✅ |
| 11.3 | HLD Scope Mode (v3.0) | PUT /api/projects/{id} 更新 scope_mode 成功 | ✅ |
| 11.4 | HLD Section 保存加载与错误（UX） | 编辑某 section 后保存：按钮有加载态；失败有错误提示 | ⬜ 手动 |
| 11.5 | 确认方案 / 范围变更 API 错误（UX） | 确认方案或切换 PRD 范围失败时界面展示错误，不误报成功 | ⬜ 手动 |
| 11.6 | 空 affected_systems 提示（UX） | 无跨系统影响时显示「未识别跨系统影响」 | ⬜ 手动 |

### 12. Confluence 发布 API (3 cases, v3.0 新增)

| # | 用例 | 验证点 | 自动化 |
|---|------|--------|--------|
| 12.1 | 获取子页面列表 | GET /api/confluence/children 返回页面数组 | ✅ |
| 12.2 | 发布前置检查 | POST /api/confluence/publish 无 PRD 时返回 404 | ✅ |
| 12.3 | 发布前确认步骤（UX） | 选父页与标题后，最终发布前展示确认信息（父页面 + 标题） | ⬜ 手动 |

### 13. PRD API (1 case)

| # | 用例 | 验证点 | 自动化 |
|---|------|--------|--------|
| 13.1 | PRD GET | GET /api/projects/{id}/prd 返回 JSON | ✅ |

### 14. 项目状态 (1 case)

| # | 用例 | 验证点 | 自动化 |
|---|------|--------|--------|
| 14.1 | 项目状态有效 | GET /api/projects/{id} status 非空 | ✅ |

### 15. 标注与模板 UX（v4.0 升级）

| # | 用例 | 验证点 | 自动化 |
|---|------|--------|--------|
| 15.1 | 核心文档存在时标注区可见 | 未跑分析或尚无 AI 标注时，只要有 BRD/FRF 等核心文档，标注 UI 已展示 | ⬜ 手动 |
| 15.2 | Google Doc 风格侧边栏评论 | 展开文档后显示左侧文档 + 右侧评论栏的双栏布局 | ⬜ 手动 |
| 15.3 | 评论卡片包含问题和建议答案 | AI 标注的卡片显示 question 和 suggested_answer | ⬜ 手动 |
| 15.4 | 高亮与评论联动 | 点击文档中的高亮文字，右侧对应评论卡片高亮并滚动到可见 | ⬜ 手动 |
| 15.5 | Google Doc HTML 格式还原 | 来自 Google Doc 的 BRD 显示原始格式（标题、粗体、列表等） | ⬜ 手动 |
| 15.6 | 删除标注 | 删除某条标注后高亮与评论同步移除 | ⬜ 手动 |
| 15.7 | 标注保存进行中 | 添加评论提交时可见进行中状态，避免连点 | ⬜ 手动 |
| 15.8 | PRD 模板页 ID 校验 | 非数字无法作为有效 ID 输入（仅数字） | ⬜ 手动 |
| 15.9 | 测试拉取模板 | 点击「测试拉取模板」能反映成功或失败（非静默） | ⬜ 手动 |

### 16. 错误日志 UX（v4.0 新增）

| # | 用例 | 验证点 | 自动化 |
|---|------|--------|--------|
| 16.1 | 侧边栏入口 | 侧边栏「系统管理 > 错误日志」可点击进入 | ⬜ 手动 |
| 16.2 | 统计卡片 | 页面顶部显示总计/严重/错误/警告四个统计卡片 | ⬜ 手动 |
| 16.3 | 严重度过滤 | 点击统计卡片可过滤对应严重度的日志 | ⬜ 手动 |
| 16.4 | 展开日志详情 | 点击某条日志展开详情（错误信息、堆栈、请求、原因分析） | ⬜ 手动 |
| 16.5 | 原因分析 | 展开的日志包含蓝色「原因分析」区块，基于错误类型给出建议 | ⬜ 手动 |
| 16.6 | 删除单条 | 点击日志右侧删除按钮可删除该条记录 | ⬜ 手动 |
| 16.7 | 清空全部 | 点击「清空日志」，弹出确认对话框，确认后清空所有日志 | ⬜ 手动 |
| 16.8 | 空状态 | 无日志时显示"暂无错误日志 · 系统运行正常" | ⬜ 手动 |

---

## 手动测试用例（需要 LLM 连接）

### M1. 完整业务分析（含标注）

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 配置 LLM 设置并测试连接 | 连接成功 |
| 2 | 添加 BRD 文档（至少 500 字） | 文档显示在"核心需求文档"组 |
| 3 | 添加参考材料 | 文档显示在"参考材料"组 |
| 4 | 切换到「业务分析」标签（尚未点击「开始分析」） | **有核心文档时标注 UI 已可见** |
| 5 | 点击"开始分析" | 页面显示 loading 状态 |
| 6 | 等待分析完成 | 出现 BRD 解读、流程图、**标注评论**、待确认点、业务规则 |
| 7 | **检查原文标注（Google Doc 风格）** | **文档以原始格式展示（如来自 Google Doc），右侧评论栏显示 AI 标注卡片，每张含问题和建议答案** |
| 8 | **点击高亮文字** | **右侧对应评论卡片获得焦点并滚动到可见位置** |
| 9 | **选中 BRD 文字添加自定义评论** | **底部弹出输入框，提交后评论出现在右侧栏** |
| 10 | **删除一条标注** | **该标注从高亮与评论栏中消失** |
| 10 | 检查待确认点是否有 severity 标记 | critical/warning/info 标记正确 |
| 11 | 对一个待确认点"确认并转为规则" | 状态变为 converted，业务规则数增加 |

### M2. 高阶方案（含架构图和跨系统识别）

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 完成 M1 | 有分析结果 |
| 2 | 切换到"高阶方案"标签 | 显示空状态 |
| 3 | 点击"生成高阶方案" | 显示三个 section |
| 4 | **检查每个 section 是否有 Mermaid 图** | **信息架构/系统架构/数据架构各有对应图表** |
| 5 | **检查"受影响系统"卡片** | **有跨系统影响时显示列表且当前系统有标记；无影响时显示「未识别跨系统影响」** |
| 6 | **打开某 section 对话区（含首次加载）** | **加载中有 loading；无历史消息时有空状态；请求失败时有错误提示** |
| 7 | **如有多系统，切换 PRD 范围** | **切换成功；若接口失败有错误提示** |
| 8 | **在某个 section 的对话区输入反馈** | **该 section 的文字和图表更新** |
| 9 | 编辑某个 section 并保存 | **保存按钮有加载态；成功则内容更新，失败有错误提示** |
| 10 | 点击"确认方案" | **成功则显示确认状态；失败有错误提示** |

### M3. PRD 生成与发布

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 完成 M2 并确认方案 | 高阶方案已确认 |
| 2 | 切换到"产品需求"标签 | 显示空状态 |
| 3 | 点击"生成 PRD" | PRD 内容显示 |
| 4 | 检查 PRD 是否包含高阶方案内容 | 包含信息/系统/数据架构 |
| 5 | **点击"发布到 Confluence"** | **弹出目录选择器** |
| 6 | **在目录浏览器中浏览并选择父页面** | **页面列表正常加载，可导航子目录** |
| 7 | **输入标题并进入最终发布** | **发布前出现确认步骤，展示父页面与标题；确认后发布成功并自动打开 Confluence** |
| 8 | **检查 PRD 页面显示 Confluence 链接** | **显示外部链接指向 Confluence** |

### M4. PRD 模板（Confluence）

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 1 | 在设置页面试填非数字字符到模板页面 ID | **输入被限制为仅数字** |
| 2 | 填入有效数字 ID，点击「测试拉取模板」 | **成功或失败有明确反馈** |
| 3 | 保存设置（含错误场景如断网） | **仅成功时提示已保存；失败显示错误** |
| 4 | 生成 PRD | PRD 结构参考 Confluence 页面内容 |
| 5 | 清空模板 ID 并重新生成 | PRD 使用内置默认模板 |

---

## 运行自动化测试

```bash
# 先确保服务已启动
cd /Users/harbor.liu/prd-studio
npm run dev

# 在另一个终端运行测试
bash scripts/e2e-test.sh
```

测试报告将保存在 `test-report-YYYYMMDD_HHMMSS.md`。
