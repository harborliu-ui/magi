import { getDb } from './db';
import { fetchKbContext } from './confluence';

export interface ContextLog {
  section: string;
  included: boolean;
  charCount: number;
  detail?: string;
}

export interface BuiltContext {
  systemContext: string;
  coreContent: string;
  referenceContent: string;
  analysisCustomRules: string;
  contextLog: ContextLog[];
}

export async function buildProjectContext(projectId: string): Promise<BuiltContext> {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Record<string, string>;
  const requirements = db.prepare('SELECT * FROM requirements WHERE project_id = ?').all(projectId) as Record<string, string>[];
  const system = project.system_id
    ? db.prepare('SELECT * FROM systems WHERE id = ?').get(project.system_id) as Record<string, string> | undefined
    : undefined;

  const contextLog: ContextLog[] = [];
  let systemContext = '';

  const coreReqs = requirements.filter(r => r.type === 'core');
  const refReqs = requirements.filter(r => r.type === 'reference');

  const coreContent = coreReqs.map(r => `### ${r.name}\n${r.content}`).join('\n\n---\n\n');
  const referenceContent = refReqs.map(r => {
    let block = `### ${r.name}`;
    if (r.reference_note) {
      block += `\n**参考方式说明：** ${r.reference_note}`;
    }
    block += `\n${r.content}`;
    return block;
  }).join('\n\n---\n\n');

  if (system) {
    systemContext = `系统名称: ${system.name}\n`;
    if (system.description) systemContext += `系统描述: ${system.description}\n`;

    if (system.design_principles) {
      systemContext += `\n## 设计原则\n${system.design_principles}\n`;
      contextLog.push({ section: '设计原则', included: true, charCount: system.design_principles.length });
    } else {
      contextLog.push({ section: '设计原则', included: false, charCount: 0 });
    }

    if (system.boundaries) {
      systemContext += `\n## 系统边界\n${system.boundaries}\n`;
      contextLog.push({ section: '系统边界', included: true, charCount: system.boundaries.length });
    } else {
      contextLog.push({ section: '系统边界', included: false, charCount: 0 });
    }

    const module = project.module_id
      ? db.prepare('SELECT * FROM modules WHERE id = ?').get(project.module_id) as Record<string, string> | undefined
      : null;
    if (module) {
      systemContext += `\n模块名称: ${module.name}\n`;
      if (module.description) systemContext += `模块描述: ${module.description}\n`;
      if (module.design_principles) {
        systemContext += `模块设计原则:\n${module.design_principles}\n`;
        contextLog.push({ section: '模块设计原则', included: true, charCount: module.design_principles.length });
      }
    }

    try {
      const kbResult = await fetchKbContext(system.id, coreContent || referenceContent);
      if (kbResult.contextParts.length > 0) {
        systemContext += `\n## 知识库参考\n${kbResult.contextParts.join('\n\n---\n\n')}\n`;
      }
      contextLog.push({
        section: '知识库(KB)',
        included: kbResult.contextParts.length > 0,
        charCount: kbResult.contextParts.join('').length,
        detail: JSON.stringify(kbResult.log),
      });
    } catch (err) {
      contextLog.push({ section: '知识库(KB)', included: false, charCount: 0, detail: String(err) });
    }
  }

  // Load custom analysis rules from settings
  const customRulesRow = db.prepare("SELECT value FROM settings WHERE key = 'analysis_custom_rules'").get() as { value: string } | undefined;
  const analysisCustomRules = customRulesRow?.value || '';
  contextLog.push({ section: '业务分析自定义规则', included: !!analysisCustomRules, charCount: analysisCustomRules.length });

  contextLog.push({ section: '核心需求文档', included: coreReqs.length > 0, charCount: coreContent.length, detail: `${coreReqs.length} 份` });
  contextLog.push({ section: '参考材料', included: refReqs.length > 0, charCount: referenceContent.length, detail: `${refReqs.length} 份` });
  contextLog.push({ section: 'LLM 上下文总长度', included: true, charCount: systemContext.length + coreContent.length + referenceContent.length + analysisCustomRules.length });

  return { systemContext, coreContent, referenceContent, analysisCustomRules, contextLog };
}
