import Database from 'better-sqlite3';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'magi.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dir = path.dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS systems (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      design_principles TEXT DEFAULT '',
      boundaries TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kb_sources (
      id TEXT PRIMARY KEY,
      system_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('confluence', 'code_repo', 'markdown')),
      name TEXT NOT NULL,
      config TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY,
      system_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      design_principles TEXT DEFAULT '',
      boundaries TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      system_id TEXT NOT NULL,
      module_id TEXT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'draft',
      scope_mode TEXT DEFAULT 'current_system',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE,
      FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS requirements (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('core','reference')),
      source_type TEXT NOT NULL DEFAULT 'text' CHECK(source_type IN ('google_doc','confluence','website','pdf','text')),
      name TEXT NOT NULL,
      content TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
      reference_note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      requirement_id TEXT NOT NULL,
      highlighted_text TEXT NOT NULL,
      annotation_text TEXT DEFAULT '',
      author TEXT DEFAULT 'user' CHECK(author IN ('ai','user')),
      linked_clarification_id TEXT DEFAULT '',
      severity TEXT DEFAULT 'info' CHECK(severity IN ('info','warning','critical')),
      status TEXT DEFAULT 'open' CHECK(status IN ('open','resolved')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS analysis_summaries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL UNIQUE,
      brd_interpretation TEXT DEFAULT '',
      process_diagram TEXT DEFAULT '',
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS clarification_points (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      question TEXT NOT NULL,
      reason TEXT DEFAULT '',
      suggested_answer TEXT DEFAULT '',
      actual_answer TEXT DEFAULT '',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','answered','converted')),
      severity TEXT DEFAULT 'info' CHECK(severity IN ('info','warning','critical')),
      source TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS business_rules (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      rule_text TEXT NOT NULL,
      source_type TEXT DEFAULT 'manual' CHECK(source_type IN ('requirement','clarification','manual')),
      source_id TEXT DEFAULT '',
      category TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      phase TEXT NOT NULL CHECK(phase IN ('analysis','hld','prd','clarification')),
      section TEXT DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS high_level_designs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL UNIQUE,
      information_architecture TEXT DEFAULT '',
      system_architecture TEXT DEFAULT '',
      data_architecture TEXT DEFAULT '',
      ia_diagram TEXT DEFAULT '',
      sa_diagram TEXT DEFAULT '',
      da_diagram TEXT DEFAULT '',
      affected_systems TEXT DEFAULT '[]',
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','confirmed')),
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prds (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL UNIQUE,
      template_id TEXT DEFAULT '',
      content TEXT DEFAULT '',
      version INTEGER DEFAULT 1,
      confluence_page_id TEXT DEFAULT '',
      confluence_url TEXT DEFAULT '',
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','reviewing','published')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prd_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      content TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      trigger_description TEXT DEFAULT '',
      system_prompt TEXT DEFAULT '',
      output_format TEXT DEFAULT '',
      example TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kb_page_index (
      id TEXT PRIMARY KEY,
      kb_source_id TEXT NOT NULL,
      system_id TEXT NOT NULL,
      page_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      excerpt TEXT DEFAULT '',
      path TEXT DEFAULT '',
      char_count INTEGER DEFAULT 0,
      depth INTEGER DEFAULT 0,
      indexed_at TEXT DEFAULT (datetime('now')),
      UNIQUE(kb_source_id, page_id)
    );

    CREATE TABLE IF NOT EXISTS llm_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT DEFAULT '',
      phase TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL DEFAULT '',
      system_prompt TEXT DEFAULT '',
      user_prompt TEXT DEFAULT '',
      response TEXT DEFAULT '',
      model TEXT DEFAULT '',
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      status TEXT DEFAULT 'success' CHECK(status IN ('success','error')),
      error_message TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS error_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT DEFAULT (datetime('now')),
      source TEXT NOT NULL DEFAULT '',
      endpoint TEXT DEFAULT '',
      method TEXT DEFAULT '',
      error_message TEXT NOT NULL,
      error_stack TEXT DEFAULT '',
      request_body TEXT DEFAULT '',
      context TEXT DEFAULT '{}',
      severity TEXT DEFAULT 'error' CHECK(severity IN ('error','warning','critical'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('llm_api_url', '');
  insertSetting.run('llm_api_key', '');
  insertSetting.run('llm_model', 'gpt-4o');
  insertSetting.run('confluence_base_url', '');
  insertSetting.run('confluence_token', '');
  insertSetting.run('confluence_space_key', '');
  insertSetting.run('google_client_secret_path', '~/.config/google/client_secret.json');
  insertSetting.run('google_oauth_token_path', '~/.config/google/oauth_token.json');
  insertSetting.run('prd_template_confluence_id', '');

  migrate(db);

  const hasTemplate = db.prepare('SELECT id FROM prd_templates WHERE is_default = 1').get();
  if (!hasTemplate) {
    db.prepare('INSERT INTO prd_templates (id, name, description, content, is_default) VALUES (?, ?, ?, ?, 1)')
      .run('default-template', '标准 PRD 模板', 'Shopee Supply Chain 标准 PRD 模板', DEFAULT_PRD_TEMPLATE);
  }
}

function migrate(db: Database.Database) {
  const safeAdd = (table: string, col: string, def: string) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch { /* exists */ }
  };
  safeAdd('clarification_points', 'severity', "TEXT DEFAULT 'info'");
  safeAdd('chat_messages', 'section', "TEXT DEFAULT ''");
  safeAdd('high_level_designs', 'ia_diagram', "TEXT DEFAULT ''");
  safeAdd('high_level_designs', 'sa_diagram', "TEXT DEFAULT ''");
  safeAdd('high_level_designs', 'da_diagram', "TEXT DEFAULT ''");
  safeAdd('high_level_designs', 'affected_systems', "TEXT DEFAULT '[]'");
  safeAdd('projects', 'scope_mode', "TEXT DEFAULT 'current_system'");
  safeAdd('requirements', 'content_html', "TEXT DEFAULT ''");
  safeAdd('annotations', 'question', "TEXT DEFAULT ''");
  safeAdd('annotations', 'suggested_answer', "TEXT DEFAULT ''");
  safeAdd('clarification_points', 'confluence_refs', "TEXT DEFAULT '[]'");

  safeAdd('requirements', 'source_type', "TEXT NOT NULL DEFAULT 'text'");
  safeAdd('requirements', 'reference_note', "TEXT DEFAULT ''");

  migrateChatMessagesPhaseCheck(db);
  migrateRequirementsTypeCheck(db);

  db.prepare("UPDATE prd_templates SET content = ?, description = '场景驱动 PRD 模板' WHERE id = 'default-template' AND is_default = 1")
    .run(DEFAULT_PRD_TEMPLATE);
}

function migrateChatMessagesPhaseCheck(db: Database.Database) {
  try {
    // Test if 'clarification' phase is accepted by inserting and rolling back
    const testStmt = db.prepare("INSERT INTO chat_messages (id, project_id, phase, role, content) VALUES ('__migrate_test__', '__test__', 'clarification', 'user', '__test__')");
    try {
      testStmt.run();
      db.prepare("DELETE FROM chat_messages WHERE id = '__migrate_test__'").run();
      // If we get here, the constraint already allows 'clarification' — nothing to do
    } catch {
      // CHECK constraint rejected 'clarification' — need to rebuild the table
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_messages_new (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          phase TEXT NOT NULL CHECK(phase IN ('analysis','hld','prd','clarification')),
          section TEXT DEFAULT '',
          role TEXT NOT NULL CHECK(role IN ('user','assistant')),
          content TEXT NOT NULL,
          metadata TEXT DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
        INSERT INTO chat_messages_new SELECT id, project_id, phase, section, role, content, metadata, created_at FROM chat_messages;
        DROP TABLE chat_messages;
        ALTER TABLE chat_messages_new RENAME TO chat_messages;
      `);
    }
  } catch {
    // Table might not exist yet — initSchema will create it
  }
}

function migrateRequirementsTypeCheck(db: Database.Database) {
  try {
    const testStmt = db.prepare("INSERT INTO requirements (id, project_id, type, source_type, name) VALUES ('__req_migrate_test__', '__test__', 'core', 'text', '__test__')");
    try {
      testStmt.run();
      db.prepare("DELETE FROM requirements WHERE id = '__req_migrate_test__'").run();
    } catch {
      db.exec(`
        CREATE TABLE IF NOT EXISTS requirements_new (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('core','reference')),
          source_type TEXT NOT NULL DEFAULT 'text' CHECK(source_type IN ('google_doc','confluence','website','pdf','text')),
          name TEXT NOT NULL,
          content TEXT DEFAULT '',
          content_html TEXT DEFAULT '',
          source_url TEXT DEFAULT '',
          reference_note TEXT DEFAULT '',
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
      `);
      const oldRows = db.prepare('SELECT * FROM requirements').all() as Record<string, string>[];
      const ins = db.prepare('INSERT INTO requirements_new (id, project_id, type, source_type, name, content, content_html, source_url, reference_note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const r of oldRows) {
        const oldType = r.type;
        let newType: string;
        let sourceType: string;
        if (oldType === 'brd' || oldType === 'frf') {
          newType = 'core'; sourceType = 'text';
        } else if (oldType === 'google_doc') {
          newType = 'core'; sourceType = 'google_doc';
        } else if (oldType === 'link') {
          newType = 'reference'; sourceType = 'website';
        } else {
          newType = 'reference'; sourceType = 'text';
        }
        ins.run(r.id, r.project_id, newType, sourceType, r.name, r.content || '', r.content_html || '', r.source_url || '', '', r.created_at);
      }
      db.exec('DROP TABLE requirements; ALTER TABLE requirements_new RENAME TO requirements;');
    }
  } catch {
    // Table might not exist yet
  }
}

export const DEFAULT_PRD_TEMPLATE = `| 项目 | 内容 |
|------|------|
| **文档标题** | {{project_name}} PRD |
| **Jira 链接** | （请补充） |
| **文档作者** | （请补充） |
| **修改记录** | v1.0 - 初始版本 |

---

## 目录

[TOC]

---

## 1. 项目背景
### 1.1 业务背景
### 1.2 项目目标
### 1.3 项目范围（本系统的改造范围）

## 2. 术语定义与核心概念
> 定义本需求涉及的关键术语和核心业务概念/模型。如有贯穿多个场景的核心模型（如暂存态、两阶段流程等），在此处详细解释。

## 3. 整体设计
### 3.1 功能清单总览
> 列出所有需要覆盖的业务场景，标注影响范围和优先级。

### 3.2 关键信息来源总览
> 汇总各场景中的信息来源关系表（谁调本系统、关键信息从哪来）。

| 场景 | 触发方 | 关键信息来源 | 本系统职责 |
|------|--------|------------|-----------|

### 3.3 系统交互概览
> 描述本系统与上下游系统的交互关系。

## 4. 功能需求（按业务场景展开）

> **每个场景必须包含**：
> 1. 现状描述（当前系统如何处理）
> 2. 改造内容与原因
> 3. 完整举例（带数据表格，展示操作前后关键字段的数值变化）
> 4. 异常/边界场景处理（取消、失败、部分成功等）
> 5. 业务规则与约束

### 4.1 场景一：XXX
#### 4.1.1 现状
#### 4.1.2 改造内容
#### 4.1.3 举例

| 字段 | 操作前 | 操作后 | 说明 |
|------|--------|--------|------|

#### 4.1.4 异常场景
#### 4.1.5 业务规则

### 4.2 场景二：XXX
（同上结构）

## 5. 非功能需求
### 5.1 性能
### 5.2 兼容性
### 5.3 数据迁移（如有）

## 6. 上线策略
> 描述上线策略思路（如按市场灰度、按仓库灰度等），不编造具体日期。

## 7. 附录
### 7.1 待确认问题汇总

| 编号 | 问题 | 确认方 | 状态 |
|------|------|--------|------|

### 7.2 相关文档链接
> 关联的 BRD、其他系统 PRD、TD 等参考文档。

---
`;
