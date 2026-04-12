'use client';

import { useEffect, useState, useCallback, useRef, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Layers, Plus, FolderKanban, Pencil, Save, X, Upload, ArrowRight } from 'lucide-react';
import Modal from '@/components/Modal';
import { useToast } from '@/components/Toast';
import type { Module, Project } from '@/types';
import { PROJECT_STATUS_LABELS } from '@/types';

export default function ModuleDetailPage({ params }: { params: Promise<{ id: string; moduleId: string }> }) {
  const { id: systemId, moduleId } = use(params);
  const router = useRouter();
  const toast = useToast();
  const [mod, setMod] = useState<Module | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', design_principles: '', boundaries: '' });
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/modules/${moduleId}`).then(r => r.ok ? r.json() : null).then(data => {
      if (!data) { router.push(`/systems/${systemId}`); return; }
      setMod(data);
      setForm({ name: data.name, description: data.description || '', design_principles: data.design_principles || '', boundaries: data.boundaries || '' });
    });
    fetch(`/api/projects?module_id=${moduleId}`).then(r => r.json()).then(setProjects);
  }, [moduleId, systemId, router]);

  useEffect(() => { load(); }, [load]);

  const saveField = async (field: string) => {
    await fetch(`/api/modules/${moduleId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: (form as Record<string, string>)[field] }),
    });
    setEditing(null);
    load();
    toast('success', '已保存');
  };

  const handleFileUpload = (field: string) => {
    setUploadTarget(field);
    fileInputRef.current?.click();
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setForm(f => ({ ...f, [uploadTarget]: content }));
      setEditing(uploadTarget);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const createProject = async () => {
    if (!projectForm.name.trim()) return;
    const res = await fetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...projectForm, system_id: systemId, module_id: moduleId }),
    });
    const proj = await res.json();
    const savedName = projectForm.name;
    setProjectForm({ name: '', description: '' });
    setShowProjectModal(false);
    toast('success', `项目「${savedName}」已创建`);
    router.push(`/projects/${proj.id}`);
  };

  if (!mod) return <div className="p-8 text-content-tertiary">加载中...</div>;

  const statusDot: Record<string, string> = {
    draft: 'bg-content-tertiary', analyzing: 'bg-caution', analyzed: 'bg-primary',
    prd_draft: 'bg-purple', prd_final: 'bg-positive',
  };

  const EditableField = ({ field, label, multiline = false }: { field: string; label: string; multiline?: boolean }) => {
    const isEditing = editing === field;
    const value = (form as Record<string, string>)[field];
    return (
      <div className="group">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-content-tertiary uppercase tracking-wider">{label}</label>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
            {multiline && !isEditing && (
              <button onClick={() => handleFileUpload(field)}
                className="flex items-center gap-1 text-content-tertiary hover:text-primary text-xs">
                <Upload className="w-3 h-3" /> 上传 MD
              </button>
            )}
            {!isEditing && (
              <button onClick={() => setEditing(field)} className="text-content-tertiary hover:text-primary">
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        {isEditing ? (
          <div>
            {multiline ? (
              <textarea value={value} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} rows={8}
                className="w-full bg-white border border-edge rounded-lg px-3 py-2 text-sm text-content resize-none font-mono" autoFocus />
            ) : (
              <input value={value} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                className="w-full bg-white border border-edge rounded-lg px-3 py-2 text-sm text-content" autoFocus />
            )}
            <div className="flex items-center gap-2 mt-2">
              <button onClick={() => saveField(field)} className="flex items-center gap-1 px-3 py-1 bg-primary text-white text-xs rounded-lg"><Save className="w-3 h-3" /> 保存</button>
              <button onClick={() => setEditing(null)} className="flex items-center gap-1 px-3 py-1 text-xs text-content-secondary"><X className="w-3 h-3" /> 取消</button>
              {multiline && (
                <button onClick={() => handleFileUpload(field)}
                  className="flex items-center gap-1 px-3 py-1 text-xs text-content-tertiary hover:text-primary ml-auto">
                  <Upload className="w-3 h-3" /> 从 MD 文件导入
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-content-secondary min-h-[1.5em]">
            {value ? (multiline ? <pre className="whitespace-pre-wrap font-sans max-h-40 overflow-y-auto">{value}</pre> : value) : <span className="text-content-tertiary italic">未设置（可手动编辑或上传 .md 文件）</span>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt" className="hidden" onChange={onFileSelected} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-subtle flex items-center justify-center">
            <Layers className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-content-tertiary mb-0.5">
              <Link href="/" className="hover:text-primary transition-colors">首页</Link>
              <span>/</span>
              <Link href={`/systems/${systemId}`} className="hover:text-primary transition-colors">{mod.system_name || '系统'}</Link>
              <span>/</span>
              <span className="text-content-secondary">{mod.name}</span>
            </div>
            <h1 className="text-xl font-bold">{mod.name}</h1>
          </div>
        </div>
      </div>

      {/* Module Config */}
      <div className="bg-white border border-edge rounded-2xl p-6 space-y-5 mb-6">
        <EditableField field="name" label="模块名称" />
        <EditableField field="description" label="描述" />
        <EditableField field="design_principles" label="设计原则" multiline />
        <EditableField field="boundaries" label="模块边界" multiline />
      </div>

      {/* Projects */}
      <div className="bg-white border border-edge rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-primary" /> 项目
          </h2>
          <button onClick={() => setShowProjectModal(true)}
            className="flex items-center gap-1.5 text-xs bg-primary hover:bg-primary-hover text-white px-3 py-1.5 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" /> 新建项目
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-8">
            <FolderKanban className="w-10 h-10 text-content-tertiary mx-auto mb-2 opacity-40" />
            <p className="text-sm text-content-tertiary">暂无项目</p>
            <button onClick={() => setShowProjectModal(true)} className="mt-2 text-xs text-primary hover:text-primary-hover">创建第一个项目</button>
          </div>
        ) : (
          <div className="space-y-1">
            {projects.map(p => (
              <Link key={p.id} href={`/projects/${p.id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-surface-hover transition-colors group">
                <FolderKanban className="w-4 h-4 text-content-tertiary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  {p.description && <div className="text-xs text-content-tertiary truncate mt-0.5">{p.description}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${statusDot[p.status] || 'bg-content-tertiary'}`} />
                  <span className="text-xs text-content-secondary">{PROJECT_STATUS_LABELS[p.status]}</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-content-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
          </div>
        )}
      </div>

      <Modal open={showProjectModal} onClose={() => setShowProjectModal(false)} title="新建项目">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1.5">项目名称 <span className="text-negative">*</span></label>
            <input value={projectForm.name} onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && createProject()} autoFocus
              placeholder="例如：BR Multi-CNPJ 发票库存改造" className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1.5">描述（可选）</label>
            <textarea value={projectForm.description} onChange={e => setProjectForm(f => ({ ...f, description: e.target.value }))} rows={2}
              placeholder="简述需求背景" className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={() => setShowProjectModal(false)} className="px-4 py-2 text-sm text-content-secondary">取消</button>
            <button onClick={createProject} disabled={!projectForm.name.trim()} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-40">创建并进入</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
