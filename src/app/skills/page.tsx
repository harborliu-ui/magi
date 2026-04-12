'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Plus, Trash2, ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import Modal from '@/components/Modal';
import type { Skill } from '@/types';

const PRESETS: Partial<Skill>[] = [
  { name: '原型图绘制', description: '生成页面原型图的文字规范', system_prompt: '你是 UI/UX 设计师。根据需求描述，用 Markdown 表格描述页面布局、组件列表、交互行为和状态变化。', output_format: 'Markdown' },
  { name: '系统交互图', description: '生成系统间时序图', system_prompt: '你是系统架构师。根据业务场景，用 Mermaid sequenceDiagram 生成系统间交互时序图，覆盖正常和异常流程。', output_format: 'Mermaid' },
];

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<Partial<Skill>>({});

  const load = () => { fetch('/api/skills').then(r => r.json()).then(setSkills).catch(() => {}); };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name?.trim()) return;
    const method = editId ? 'PUT' : 'POST';
    const url = editId ? `/api/skills/${editId}` : '/api/skills';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setForm({}); setShowModal(false); setEditId(null); load();
  };

  const remove = async (id: string) => { if (confirm('确定删除？')) { await fetch(`/api/skills/${id}`, { method: 'DELETE' }); load(); } };
  const edit = (s: Skill) => { setForm(s); setEditId(s.id); setShowModal(true); };
  const addPreset = async (p: Partial<Skill>) => { await fetch('/api/skills', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }); load(); };
  const toggleExpand = (id: string) => { setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-caution" />
          <div>
            <h1 className="text-xl font-bold">技能管理</h1>
            <p className="text-xs text-content-tertiary mt-0.5">自定义 LLM 技能，用于原型图、交互图等</p>
          </div>
        </div>
        <button onClick={() => { setForm({}); setEditId(null); setShowModal(true); }}
          className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white px-3.5 py-2 rounded-lg text-[13px] font-medium transition-colors">
          <Plus className="w-4 h-4" /> 创建技能
        </button>
      </div>

      {skills.length === 0 && (
        <div className="bg-white border border-edge rounded-2xl p-6 mb-6">
          <p className="text-sm text-content-secondary mb-3">快速添加预设技能：</p>
          <div className="flex gap-3">
            {PRESETS.map((p, i) => (
              <button key={i} onClick={() => addPreset(p)} className="flex items-center gap-2 bg-surface-hover border border-edge rounded-lg px-4 py-2 text-sm text-content hover:border-primary/30 transition-colors">
                <Plus className="w-3.5 h-3.5 text-primary" /> {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {skills.map(sk => (
          <div key={sk.id} className="bg-white border border-edge rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-surface-hover transition-colors" onClick={() => toggleExpand(sk.id)}>
              {expanded.has(sk.id) ? <ChevronDown className="w-4 h-4 text-content-tertiary" /> : <ChevronRight className="w-4 h-4 text-content-tertiary" />}
              <Sparkles className="w-4 h-4 text-caution" />
              <span className="font-medium text-sm flex-1">{sk.name}</span>
              {sk.description && <span className="text-xs text-content-tertiary">{sk.description}</span>}
              <button onClick={e => { e.stopPropagation(); edit(sk); }} className="text-content-tertiary hover:text-primary"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={e => { e.stopPropagation(); remove(sk.id); }} className="text-content-tertiary hover:text-negative"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            {expanded.has(sk.id) && (
              <div className="px-5 pb-4 border-t border-edge-light pt-3 space-y-2 text-sm">
                {sk.system_prompt && <div><span className="text-xs text-content-tertiary">System Prompt：</span><pre className="mt-1 bg-surface-hover rounded-lg p-3 text-xs text-content-secondary whitespace-pre-wrap">{sk.system_prompt}</pre></div>}
                {sk.output_format && <div className="text-xs"><span className="text-content-tertiary">输出格式：</span> {sk.output_format}</div>}
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditId(null); }} title={editId ? '编辑技能' : '创建技能'} maxWidth="max-w-2xl">
        <div className="space-y-4">
          {[
            { key: 'name', label: '技能名称', placeholder: '例如：原型图绘制' },
            { key: 'description', label: '描述', placeholder: '简述技能用途' },
            { key: 'output_format', label: '输出格式', placeholder: 'Mermaid / Markdown / JSON' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-content-secondary mb-1.5">{f.label}</label>
              <input value={(form as Record<string, string>)[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder} className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1.5">System Prompt</label>
            <textarea value={form.system_prompt || ''} onChange={e => setForm(p => ({ ...p, system_prompt: e.target.value }))} rows={6}
              placeholder="LLM 执行此技能时的系统提示词" className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary resize-none font-mono" />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={() => { setShowModal(false); setEditId(null); }} className="px-4 py-2 text-sm text-content-secondary">取消</button>
            <button onClick={save} disabled={!form.name?.trim()} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-40">{editId ? '保存' : '创建'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
