'use client';

import { useEffect, useState, useCallback, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Plus, Trash2, Layers, Save, Globe, FileCode, Database, Pencil, X, Upload, Loader2, CheckCircle, AlertCircle, Zap, RefreshCw } from 'lucide-react';
import Modal from '@/components/Modal';
import { useToast } from '@/components/Toast';
import type { System, Module, KbSource } from '@/types';

type TestStatus = { loading: boolean; result?: { success: boolean; message: string } };
type IndexInfo = { kb_source_id: string; total_pages: number; pages_with_content: number; last_indexed: string | null };

export default function SystemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const [system, setSystem] = useState<System | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', design_principles: '', boundaries: '' });
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [moduleForm, setModuleForm] = useState({ name: '', description: '' });
  const [showKbModal, setShowKbModal] = useState(false);
  const [kbForm, setKbForm] = useState({ type: 'confluence' as KbSource['type'], name: '', config: '' });
  const [kbTest, setKbTest] = useState<TestStatus>({ loading: false });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [kbIndexMap, setKbIndexMap] = useState<Record<string, IndexInfo>>({});
  const [indexingKbId, setIndexingKbId] = useState<string | null>(null);

  const loadKbIndex = useCallback((systemId: string) => {
    fetch(`/api/kb/index?system_id=${systemId}`).then(r => r.json()).then((arr: IndexInfo[]) => {
      if (Array.isArray(arr)) {
        const map: Record<string, IndexInfo> = {};
        for (const s of arr) map[s.kb_source_id] = s;
        setKbIndexMap(map);
      }
    }).catch(() => {});
  }, []);

  const load = useCallback(() => {
    fetch(`/api/systems/${id}`).then(r => r.json()).then((d: System) => {
      setSystem(d);
      setForm({ name: d.name, description: d.description, design_principles: d.design_principles, boundaries: d.boundaries });
      loadKbIndex(d.id);
    }).catch(() => router.push('/'));
  }, [id, router, loadKbIndex]);

  useEffect(() => { load(); }, [load]);

  const [showDeleteSystem, setShowDeleteSystem] = useState(false);
  const [pendingDeleteModule, setPendingDeleteModule] = useState<Module | null>(null);

  const saveField = async (field: string) => {
    await fetch(`/api/systems/${id}`, {
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

  const addModule = async () => {
    if (!moduleForm.name.trim()) return;
    const res = await fetch('/api/modules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...moduleForm, system_id: id }) });
    const mod = await res.json();
    const savedName = moduleForm.name;
    setModuleForm({ name: '', description: '' });
    setShowModuleModal(false);
    toast('success', `模块「${savedName}」已创建`);
    router.push(`/systems/${id}/modules/${mod.id}`);
  };

  const doDeleteModule = async (mod: Module) => {
    await fetch(`/api/modules/${mod.id}`, { method: 'DELETE' });
    setPendingDeleteModule(null);
    load();
    toast('info', `模块「${mod.name}」已删除`);
  };

  const testKb = async () => {
    setKbTest({ loading: true });
    try {
      const res = await fetch('/api/kb/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: kbForm.type, config: kbForm.config }),
      });
      const data = await res.json();
      setKbTest({ loading: false, result: { success: data.success, message: data.success ? data.message : data.error } });
    } catch (err) {
      setKbTest({ loading: false, result: { success: false, message: String(err) } });
    }
  };

  const addKb = async () => {
    if (!kbForm.name.trim()) return;
    const existing = system?.kb_sources || [];
    let configObj: Record<string, string> = {};
    try { configObj = kbForm.config ? JSON.parse(kbForm.config) : {}; } catch { configObj = { value: kbForm.config }; }
    await fetch(`/api/systems/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kb_sources: [...existing, { type: kbForm.type, name: kbForm.name, config: configObj }] }),
    });
    const savedName = kbForm.name;
    setKbForm({ type: 'confluence', name: '', config: '' });
    setKbTest({ loading: false });
    setShowKbModal(false);
    load();
    toast('success', `知识库「${savedName}」已添加`);
  };

  const removeKb = async (kbId: string) => {
    const updated = (system?.kb_sources || []).filter(k => k.id !== kbId);
    await fetch(`/api/systems/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kb_sources: updated }),
    });
    load();
  };

  const triggerIndex = async (kbId: string) => {
    setIndexingKbId(kbId);
    try {
      const res = await fetch('/api/kb/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kb_source_id: kbId, system_id: id }),
      });
      const data = await res.json();
      if (data.success) {
        toast('success', `索引完成：${data.total} 页 (${data.with_content} 有内容)`);
        loadKbIndex(id);
      } else {
        toast('error', data.error || '索引失败');
      }
    } catch (err) {
      toast('error', `索引失败: ${String(err)}`);
    } finally {
      setIndexingKbId(null);
    }
  };

  const doDeleteSystem = async () => {
    await fetch(`/api/systems/${id}`, { method: 'DELETE' });
    setShowDeleteSystem(false);
    toast('info', `系统「${system?.name}」已删除`);
    router.push('/');
  };

  if (!system) return <div className="p-8 text-content-tertiary">加载中...</div>;

  const kbIcons: Record<string, typeof Globe> = { confluence: Globe, code_repo: FileCode, markdown: Database };

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
              <button onClick={() => { setEditing(null); setForm(f => ({ ...f, [field]: (system as unknown as Record<string, string>)[field] || '' })); }}
                className="flex items-center gap-1 px-3 py-1 text-xs text-content-secondary"><X className="w-3 h-3" /> 取消</button>
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
            <Box className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{system.name}</h1>
            <p className="text-xs text-content-tertiary">系统配置</p>
          </div>
        </div>
        <button onClick={() => setShowDeleteSystem(true)} className="text-xs text-content-tertiary hover:text-negative transition-colors">删除系统</button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Config */}
        <div className="col-span-2 space-y-6">
          <div className="bg-white border border-edge rounded-2xl p-6 space-y-5">
            <EditableField field="name" label="系统名称" />
            <EditableField field="description" label="系统描述" />
            <EditableField field="design_principles" label="设计原则" multiline />
            <EditableField field="boundaries" label="系统边界" multiline />
          </div>

          {/* Modules */}
          <div className="bg-white border border-edge rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Layers className="w-4 h-4 text-primary" /> 模块</h2>
              <button onClick={() => setShowModuleModal(true)} className="flex items-center gap-1 text-xs text-primary hover:text-primary-hover transition-colors">
                <Plus className="w-3.5 h-3.5" /> 添加模块
              </button>
            </div>
            {(system.modules || []).length === 0 ? (
              <div className="text-center py-6">
                <Layers className="w-8 h-8 text-content-tertiary mx-auto mb-2 opacity-50" />
                <p className="text-sm text-content-tertiary">暂无模块，点击上方添加</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(system.modules || []).map((m: Module) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-surface-hover transition-colors group cursor-pointer"
                    onClick={() => router.push(`/systems/${id}/modules/${m.id}`)}>
                    <Layers className="w-4 h-4 text-primary opacity-60 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{m.name}</div>
                      {m.description && <div className="text-xs text-content-tertiary truncate">{m.description}</div>}
                    </div>
                    <button onClick={e => { e.stopPropagation(); setPendingDeleteModule(m); }}
                      className="text-content-tertiary hover:text-negative opacity-0 group-hover:opacity-100 transition-all p-0.5 rounded hover:bg-negative-subtle"
                      title="删除模块"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: KB Sources */}
        <div>
          <div className="bg-white border border-edge rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-content-tertiary uppercase tracking-wider">知识库来源</h2>
              <button onClick={() => { setShowKbModal(true); setKbTest({ loading: false }); }} className="text-content-tertiary hover:text-primary"><Plus className="w-4 h-4" /></button>
            </div>
            {(system.kb_sources || []).length === 0 ? (
              <p className="text-xs text-content-tertiary py-3 text-center">暂无配置</p>
            ) : (
              <div className="space-y-2">
                {(system.kb_sources || []).map(kb => {
                  const Icon = kbIcons[kb.type] || Database;
                  const idx = kbIndexMap[kb.id];
                  const isIndexing = indexingKbId === kb.id;
                  const isConfluence = kb.type === 'confluence';
                  let configVal = '';
                  try { const c = JSON.parse(typeof kb.config === 'string' ? kb.config : JSON.stringify(kb.config)); configVal = c.page_id || c.value || ''; } catch { configVal = ''; }
                  const isDirectory = isConfluence && !!configVal && /\/display\//.test(configVal);
                  return (
                    <div key={kb.id} className="group p-2.5 rounded-lg hover:bg-surface-hover">
                      <div className="flex items-center gap-2 text-sm">
                        <Icon className="w-3.5 h-3.5 text-content-tertiary shrink-0" />
                        <span className="truncate flex-1 text-content-secondary text-xs">{kb.name}</span>
                        {isDirectory && (
                          <button onClick={() => triggerIndex(kb.id)} disabled={isIndexing}
                            className="text-content-tertiary hover:text-primary disabled:opacity-40 transition-all"
                            title={idx?.total_pages ? '刷新索引' : '构建索引'}>
                            {isIndexing ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <RefreshCw className="w-3 h-3" />}
                          </button>
                        )}
                        <button onClick={() => removeKb(kb.id)} className="text-content-tertiary hover:text-negative opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      {isDirectory && idx && idx.total_pages > 0 && (
                        <div className="mt-1.5 ml-5 text-[10px] text-content-tertiary leading-relaxed">
                          <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 px-1.5 py-0.5 rounded">
                            <CheckCircle className="w-2.5 h-2.5" /> {idx.total_pages} 页已索引 · {idx.pages_with_content} 有内容
                          </span>
                          {idx.last_indexed && (
                            <span className="ml-1.5 text-content-tertiary">
                              {new Date(idx.last_indexed + 'Z').toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      )}
                      {isDirectory && (!idx || idx.total_pages === 0) && !isIndexing && (
                        <div className="mt-1.5 ml-5 text-[10px] text-content-tertiary">
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                            <AlertCircle className="w-2.5 h-2.5" /> 未索引
                          </span>
                          <button onClick={() => triggerIndex(kb.id)} className="ml-1.5 text-primary hover:underline">点击构建</button>
                        </div>
                      )}
                      {isIndexing && (
                        <div className="mt-1.5 ml-5 text-[10px] text-primary flex items-center gap-1">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" /> 正在索引，请稍候…
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal open={showModuleModal} onClose={() => setShowModuleModal(false)} title="添加模块">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1.5">模块名称 <span className="text-negative">*</span></label>
            <input value={moduleForm.name} onChange={e => setModuleForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addModule()} autoFocus
              placeholder="例如：LPS、FM、Billing" className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1.5">描述（可选）</label>
            <input value={moduleForm.description} onChange={e => setModuleForm(f => ({ ...f, description: e.target.value }))}
              placeholder="模块的主要职责" className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary" />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={() => setShowModuleModal(false)} className="px-4 py-2 text-sm text-content-secondary">取消</button>
            <button onClick={addModule} disabled={!moduleForm.name.trim()} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-40">创建</button>
          </div>
        </div>
      </Modal>

      <Modal open={showKbModal} onClose={() => { setShowKbModal(false); setKbTest({ loading: false }); }} title="添加知识库来源">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1.5">类型</label>
            <select value={kbForm.type} onChange={e => { setKbForm(f => ({ ...f, type: e.target.value as KbSource['type'], config: '' })); setKbTest({ loading: false }); }}
              className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content">
              <option value="confluence">Confluence 页面</option>
              <option value="code_repo">代码仓库</option>
              <option value="markdown">Markdown 文档</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1.5">名称 <span className="text-negative">*</span></label>
            <input value={kbForm.name} onChange={e => setKbForm(f => ({ ...f, name: e.target.value }))}
              placeholder="例如：ISC 系统架构文档" className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1.5">
              {kbForm.type === 'confluence' ? 'Page ID 或搜索关键词' : kbForm.type === 'code_repo' ? '仓库路径' : 'Markdown 内容'}
            </label>
            <textarea value={kbForm.config} onChange={e => setKbForm(f => ({ ...f, config: e.target.value }))} rows={3}
              placeholder={kbForm.type === 'confluence' ? 'Confluence Page ID（纯数字）或搜索关键词' : kbForm.type === 'code_repo' ? '/path/to/repo' : '直接粘贴 Markdown 内容'}
              className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary resize-none font-mono" />
            {kbForm.type === 'confluence' && (
              <p className="text-xs text-content-tertiary mt-1">输入 Confluence 页面 ID（如 123456）或关键词搜索。需先在设置中配置 Confluence 连接。</p>
            )}
          </div>

          {/* Test result */}
          {kbTest.loading && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-primary">正在验证…</span>
            </div>
          )}
          {kbTest.result && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${kbTest.result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              {kbTest.result.success ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
              <span className={`text-sm ${kbTest.result.success ? 'text-green-700' : 'text-red-600'}`}>{kbTest.result.message}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-1">
            <button onClick={testKb} disabled={kbTest.loading || !kbForm.config.trim()}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-hover disabled:opacity-40 transition-colors">
              {kbTest.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              验证连接
            </button>
            <div className="flex gap-3">
              <button onClick={() => { setShowKbModal(false); setKbTest({ loading: false }); }} className="px-4 py-2 text-sm text-content-secondary">取消</button>
              <button onClick={addKb} disabled={!kbForm.name.trim()} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-40">添加</button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete System Confirmation */}
      <Modal open={showDeleteSystem} onClose={() => setShowDeleteSystem(false)} title="删除系统">
        <div className="space-y-4">
          <p className="text-sm text-content-secondary">
            确定删除系统 <span className="font-medium text-content">「{system?.name}」</span>？所有模块和项目将被一并删除，此操作不可撤销。
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowDeleteSystem(false)} className="px-4 py-2 text-sm text-content-secondary hover:text-content">取消</button>
            <button onClick={doDeleteSystem} className="px-4 py-2 bg-negative hover:bg-negative/80 text-white text-sm font-medium rounded-lg transition-colors">删除系统</button>
          </div>
        </div>
      </Modal>

      {/* Delete Module Confirmation */}
      <Modal open={!!pendingDeleteModule} onClose={() => setPendingDeleteModule(null)} title="删除模块">
        <div className="space-y-4">
          <p className="text-sm text-content-secondary">
            确定删除模块 <span className="font-medium text-content">「{pendingDeleteModule?.name}」</span>？关联的项目也会被一并删除，此操作不可撤销。
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setPendingDeleteModule(null)} className="px-4 py-2 text-sm text-content-secondary hover:text-content">取消</button>
            <button onClick={() => pendingDeleteModule && doDeleteModule(pendingDeleteModule)}
              className="px-4 py-2 bg-negative hover:bg-negative/80 text-white text-sm font-medium rounded-lg transition-colors">删除模块</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
