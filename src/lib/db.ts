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
      type TEXT NOT NULL CHECK(type IN ('brd','frf','reference','link','google_doc')),
      name TEXT NOT NULL,
      content TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
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

  migrateChatMessagesPhaseCheck(db);
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

export const DEFAULT_PRD_TEMPLATE = `# {{project_name}} PRD

## 1. 项目背景
### 1.1 业务背景
### 1.2 项目目标
### 1.3 项目范围

## 2. 术语定义

## 3. 需求概述
### 3.1 用户角色
### 3.2 功能总览

## 4. 功能需求
> 每个功能点需包含：功能描述、业务规则、页面/接口说明、验收标准、具体举例（初始状态 → 触发动作 → 最终状态）

## 5. 非功能需求
### 5.1 性能
### 5.2 安全
### 5.3 可用性

## 6. 系统交互
### 6.1 架构概览
### 6.2 接口列表
### 6.3 数据流说明

## 7. 数据需求
### 7.1 数据模型
### 7.2 数据迁移

## 8. 上线计划
### 8.1 里程碑
### 8.2 灰度策略
### 8.3 回滚方案

## 9. 附录
### 9.1 参考文档
### 9.2 开放问题
`;
