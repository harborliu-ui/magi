export interface System {
  id: string;
  name: string;
  description: string;
  design_principles: string;
  boundaries: string;
  created_at: string;
  updated_at: string;
  modules?: Module[];
  kb_sources?: KbSource[];
  project_count?: number;
}

export interface KbSource {
  id: string;
  system_id: string;
  type: 'confluence' | 'code_repo' | 'markdown';
  name: string;
  config: string;
  created_at: string;
}

export interface Module {
  id: string;
  system_id: string;
  name: string;
  description: string;
  design_principles: string;
  boundaries: string;
  created_at: string;
  updated_at: string;
  project_count?: number;
  system_name?: string;
}

export interface Project {
  id: string;
  system_id: string;
  module_id: string | null;
  name: string;
  description: string;
  status: ProjectStatus;
  scope_mode: ScopeMode;
  created_at: string;
  updated_at: string;
  system_name?: string;
  module_name?: string;
}

export type ProjectStatus = 'draft' | 'analyzing' | 'analyzed' | 'hld_draft' | 'hld_confirmed' | 'prd_draft' | 'prd_final';
export type ScopeMode = 'current_system' | 'all_systems';

export interface Requirement {
  id: string;
  project_id: string;
  type: RequirementType;
  source_type: SourceType;
  name: string;
  content: string;
  content_html: string;
  source_url: string;
  reference_note: string;
  created_at: string;
}

export type RequirementType = 'core' | 'reference';
export type SourceType = 'google_doc' | 'confluence' | 'website' | 'pdf' | 'text';

export interface Annotation {
  id: string;
  project_id: string;
  requirement_id: string;
  highlighted_text: string;
  annotation_text: string;
  question: string;
  suggested_answer: string;
  author: 'ai' | 'user';
  linked_clarification_id: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'open' | 'resolved';
  created_at: string;
}

export interface ErrorLog {
  id: string;
  timestamp: string;
  source: string;
  endpoint: string;
  method: string;
  error_message: string;
  error_stack: string;
  request_body: string;
  context: string;
  severity: 'error' | 'warning' | 'critical';
}

export interface AnalysisSummary {
  id: string;
  project_id: string;
  brd_interpretation: string;
  process_diagram: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ConfluenceRef {
  page_id: string;
  title: string;
  excerpt: string;
  url: string;
}

export interface ClarificationPoint {
  id: string;
  project_id: string;
  category: string;
  question: string;
  reason: string;
  suggested_answer: string;
  actual_answer: string;
  status: 'pending' | 'answered' | 'converted';
  severity: 'info' | 'warning' | 'critical';
  source: string;
  confluence_refs: string;
  created_at: string;
  updated_at: string;
}

export interface LlmLog {
  id: string;
  project_id: string;
  phase: string;
  action: string;
  system_prompt: string;
  user_prompt: string;
  response: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  duration_ms: number;
  status: 'success' | 'error';
  error_message: string;
  created_at: string;
}

export interface BusinessRule {
  id: string;
  project_id: string;
  rule_text: string;
  source_type: 'requirement' | 'clarification' | 'manual';
  source_id: string;
  category: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  project_id: string;
  phase: 'analysis' | 'hld' | 'prd';
  section: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: string;
  created_at: string;
}

export interface AffectedSystem {
  system_name: string;
  module_name: string;
  scope_description: string;
  is_current: boolean;
}

export interface HighLevelDesign {
  id: string;
  project_id: string;
  information_architecture: string;
  system_architecture: string;
  data_architecture: string;
  ia_diagram: string;
  sa_diagram: string;
  da_diagram: string;
  affected_systems: string;
  status: 'draft' | 'confirmed';
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PRD {
  id: string;
  project_id: string;
  template_id: string;
  content: string;
  version: number;
  confluence_page_id: string;
  confluence_url: string;
  status: 'draft' | 'reviewing' | 'published';
  created_at: string;
  updated_at: string;
}

export interface PRDTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  is_default: number;
  created_at: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  trigger_description: string;
  system_prompt: string;
  output_format: string;
  example: string;
  created_at: string;
  updated_at: string;
}

export type SettingsKey = 'llm_api_url' | 'llm_api_key' | 'llm_model' | 'confluence_base_url' | 'confluence_token' | 'confluence_space_key' | 'prd_template_confluence_id';

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: '草稿',
  analyzing: '分析中',
  analyzed: '已分析',
  hld_draft: '高阶设计中',
  hld_confirmed: '高阶设计已确认',
  prd_draft: 'PRD 草稿',
  prd_final: 'PRD 定稿',
};

export const CLARIFICATION_CATEGORIES: Record<string, string> = {
  business_context: '业务背景',
  business_rule: '业务规则',
  challenge: '方案质疑',
  technical_feasibility: '技术可行性',
  data_consistency: '数据一致性',
  edge_case: '边界场景',
  system_interaction: '系统交互',
  compatibility: '兼容性',
  performance: '性能影响',
  general: '通用',
};

export const SEVERITY_LABELS: Record<ClarificationPoint['severity'], string> = {
  info: '待确认',
  warning: '需关注',
  critical: '方案质疑',
};

export const REQUIREMENT_TYPE_LABELS: Record<RequirementType, string> = {
  core: '核心需求',
  reference: '参考资料',
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  google_doc: 'Google Doc',
  confluence: 'Confluence',
  website: '外部网站',
  pdf: 'PDF 上传',
  text: '文本输入',
};

export function isCoreRequirement(type: RequirementType): boolean {
  return type === 'core';
}
