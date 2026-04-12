'use client';

import { useEffect, useState, useCallback, use, useRef } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText, Search, FileOutput, Plus, Trash2, Loader2,
  CheckCircle, Clock, ArrowRightCircle, MessageSquare, AlertTriangle,
  Pencil, Copy, ChevronDown, ChevronRight, Sparkles, Send, Layers,
  ShieldAlert, Info, AlertCircle, AlertOctagon, Globe, ExternalLink,
  HighlighterIcon, RotateCcw, RefreshCw,
} from 'lucide-react';
import Modal from '@/components/Modal';
import { useToast } from '@/components/Toast';
import type {
  Project, Requirement, ClarificationPoint, BusinessRule, PRD,
  AnalysisSummary, HighLevelDesign, ChatMessage, Annotation, AffectedSystem,
} from '@/types';
import {
  PROJECT_STATUS_LABELS, CLARIFICATION_CATEGORIES, REQUIREMENT_TYPE_LABELS,
  SEVERITY_LABELS, isCoreRequirement,
} from '@/types';

type Tab = 'requirements' | 'analysis' | 'hld' | 'prd';

const TABS: { key: Tab; label: string; icon: typeof FileText; step: number }[] = [
  { key: 'requirements', label: '业务需求', icon: FileText, step: 1 },
  { key: 'analysis', label: '业务分析', icon: Search, step: 2 },
  { key: 'hld', label: '高阶方案', icon: Layers, step: 3 },
  { key: 'prd', label: '产品需求', icon: FileOutput, step: 4 },
];

export default function ProjectWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>('requirements');
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [clarifications, setClarifications] = useState<ClarificationPoint[]>([]);
  const [rules, setRules] = useState<BusinessRule[]>([]);
  const [hld, setHld] = useState<HighLevelDesign | null>(null);
  const [prd, setPrd] = useState<PRD | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [progressSteps, setProgressSteps] = useState<string[]>([]);
  const [progressIdx, setProgressIdx] = useState(0);

  const loadProject = useCallback(() => { fetch(`/api/projects/${id}`).then(r => r.json()).then(setProject); }, [id]);
  const loadReqs = useCallback(() => { fetch(`/api/projects/${id}/requirements`).then(r => r.json()).then(setRequirements); }, [id]);
  const loadSummary = useCallback(() => { fetch(`/api/projects/${id}/analysis-summary`).then(r => r.json()).then(setSummary); }, [id]);
  const loadClars = useCallback(() => { fetch(`/api/projects/${id}/clarifications`).then(r => r.json()).then(setClarifications); }, [id]);
  const loadRules = useCallback(() => { fetch(`/api/projects/${id}/rules`).then(r => r.json()).then(setRules); }, [id]);
  const loadHld = useCallback(() => { fetch(`/api/projects/${id}/hld`).then(r => r.json()).then(setHld); }, [id]);
  const loadPrd = useCallback(() => { fetch(`/api/projects/${id}/prd`).then(r => r.json()).then(setPrd); }, [id]);
  const loadAnnotations = useCallback(() => { fetch(`/api/projects/${id}/annotations`).then(r => r.json()).then(setAnnotations); }, [id]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${id}`).then(r => r.json()).then(setProject),
      fetch(`/api/projects/${id}/requirements`).then(r => r.json()).then(setRequirements),
      fetch(`/api/projects/${id}/analysis-summary`).then(r => r.json()).then(setSummary),
      fetch(`/api/projects/${id}/clarifications`).then(r => r.json()).then(setClarifications),
      fetch(`/api/projects/${id}/rules`).then(r => r.json()).then(setRules),
      fetch(`/api/projects/${id}/hld`).then(r => r.json()).then(setHld),
      fetch(`/api/projects/${id}/prd`).then(r => r.json()).then(setPrd),
      fetch(`/api/projects/${id}/annotations`).then(r => r.json()).then(setAnnotations),
    ]).finally(() => setPageLoading(false));
  }, [id]);

  const startProgress = useCallback((steps: string[]) => {
    setProgressSteps(steps);
    setProgressIdx(0);
    setLoading(true);
    setError('');
  }, []);

  const stopProgress = useCallback(() => {
    setProgressSteps([]);
    setProgressIdx(0);
    setLoading(false);
  }, []);

  // Auto-advance progress steps on a timer
  useEffect(() => {
    if (progressSteps.length === 0 || progressIdx >= progressSteps.length - 1) return;
    const delays = [2500, 4000, 8000, 15000, 30000, 45000];
    const delay = delays[Math.min(progressIdx, delays.length - 1)];
    const timer = setTimeout(() => setProgressIdx(i => Math.min(i + 1, progressSteps.length - 1)), delay);
    return () => clearTimeout(timer);
  }, [progressSteps, progressIdx]);

  const pendingCount = clarifications.filter(c => c.status === 'pending').length;
  const criticalCount = clarifications.filter(c => c.severity === 'critical').length;

  const hasReqs = requirements.some(r => isCoreRequirement(r.type));
  const hasAnalysis = !!(summary || clarifications.length > 0);
  const hasHld = !!hld;
  const hasPrd = !!prd;

  const stepDone = (key: Tab): boolean => {
    if (key === 'requirements') return hasReqs;
    if (key === 'analysis') return hasAnalysis;
    if (key === 'hld') return hasHld && hld?.status === 'confirmed';
    if (key === 'prd') return hasPrd;
    return false;
  };

  if (pageLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-content-secondary">加载项目中…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-edge px-6 py-4">
        <div className="flex items-center gap-1.5 text-xs text-content-tertiary mb-2">
          <Link href="/" className="hover:text-primary transition-colors">首页</Link>
          <span>/</span>
          <Link href={project ? `/systems/${project.system_id}` : '/'} className="hover:text-primary transition-colors">
            {project?.system_name || '系统'}
          </Link>
          {project?.module_name && (
            <>
              <span>/</span>
              <span className="text-content-secondary">{project.module_name}</span>
            </>
          )}
          <span>/</span>
          <span className="text-content font-medium">{project?.name || '...'}</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">{project?.name || '...'}</h1>
          {project && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-hover text-content-secondary">
              {PROJECT_STATUS_LABELS[project.status]}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-4">
          {TABS.map((t, i) => {
            const active = tab === t.key;
            const done = stepDone(t.key);
            return (
              <div key={t.key} className="flex items-center">
                {i > 0 && <div className={`w-8 h-px mx-1 ${done || stepDone(TABS[i - 1].key) ? 'bg-primary/30' : 'bg-edge'}`} />}
                <button onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-medium transition-all ${
                    active ? 'bg-primary text-white shadow-sm' : 'bg-surface-hover text-content-secondary hover:text-content'
                  }`}>
                  {done && !active ? (
                    <CheckCircle className="w-4 h-4 text-positive" />
                  ) : (
                    <span className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center font-bold ${
                      active ? 'bg-white/25' : 'bg-edge'
                    }`}>{t.step}</span>
                  )}
                  {t.label}
                  {t.key === 'analysis' && pendingCount > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${active ? 'bg-white/25' : criticalCount > 0 ? 'bg-red-100 text-red-600' : 'bg-caution-subtle text-caution'}`}>
                      {criticalCount > 0 ? `${criticalCount}!` : pendingCount}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-negative-subtle border border-negative/20 rounded-xl flex items-center gap-2 text-sm text-negative">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto text-xs hover:underline">关闭</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'requirements' && <RequirementsTab projectId={id} requirements={requirements} onReload={loadReqs} toast={toast} />}
        {tab === 'analysis' && (
          <AnalysisTab projectId={id} requirements={requirements} summary={summary} clarifications={clarifications}
            rules={rules} annotations={annotations} loading={loading} toast={toast}
            onAnalyze={async (mode?: 'full' | 'refresh') => {
              const isRefresh = mode === 'refresh';
              if (!isRefresh && hasAnalysis) {
                setShowConfirmModal({ title: '全新分析', message: '全新分析将覆盖当前的 BRD 解读、流程图、标注和所有待确认点（已手动添加的业务规则不受影响）。确定继续？', onConfirm: () => doAnalyze('full') });
                return;
              }
              doAnalyze(mode || 'full');
              async function doAnalyze(m: string) {
                setShowConfirmModal(null);
                startProgress(m === 'refresh'
                  ? ['正在加载已确认的业务规则…', '正在获取知识库上下文…', '正在请求模型更新解读…', '正在等待模型反馈…', '正在写入更新结果…']
                  : ['正在加载需求文档…', '正在获取知识库上下文…', '正在请求模型分析…', '正在等待模型反馈…', '正在解析分析结果…']
                );
                try {
                  const res = await fetch(`/api/projects/${id}/analyze?mode=${m}`, { method: 'POST' });
                  if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
                  loadSummary(); loadClars(); loadRules(); loadProject(); loadAnnotations();
                  toast('success', m === 'refresh' ? '已基于确认信息更新解读' : '业务分析完成');
                } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
                stopProgress();
              }
            }}
            onReloadSummary={loadSummary} onReloadClars={() => { loadClars(); loadRules(); }}
            onReloadRules={loadRules} onReloadAnnotations={loadAnnotations} onGoToStep1={() => setTab('requirements')}
          />
        )}
        {tab === 'hld' && (
          <HldTab projectId={id} project={project} hld={hld} loading={loading} toast={toast}
            onGenerate={async () => {
              if (hasHld) {
                setShowConfirmModal({ title: '重新生成高阶方案', message: '重新生成将覆盖当前的信息架构、系统架构和数据架构内容。确定继续？', onConfirm: doGenerate });
                return;
              }
              doGenerate();
              async function doGenerate() {
                setShowConfirmModal(null);
                startProgress(['正在加载业务分析结果…', '正在组装系统上下文…', '正在请求模型生成高阶方案…', '正在等待模型反馈…', '正在解析架构设计…']);
                try {
                  const res = await fetch(`/api/projects/${id}/hld`, { method: 'POST' });
                  if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
                  loadHld(); loadProject();
                  toast('success', '高阶方案生成完成');
                } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
                stopProgress();
              }
            }}
            onReload={() => { loadHld(); loadProject(); }}
            onGoToStep2={() => setTab('analysis')}
          />
        )}
        {tab === 'prd' && (
          <PrdTab projectId={id} project={project} prd={prd} loading={loading} toast={toast}
            onGenerate={async () => {
              if (hasPrd) {
                setShowConfirmModal({ title: '重新生成 PRD', message: '重新生成将覆盖当前的 PRD 文档内容（版本号会增加）。确定继续？', onConfirm: doGenerate });
                return;
              }
              doGenerate();
              async function doGenerate() {
                setShowConfirmModal(null);
                startProgress(['正在加载业务规则与方案设计…', '正在获取 PRD 模板…', '正在请求模型生成 PRD…', '正在等待模型反馈（PRD 内容较多，可能需要 1-3 分钟）…', '正在格式化文档…']);
                try {
                  const res = await fetch(`/api/projects/${id}/prd`, { method: 'POST' });
                  if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
                  loadPrd(); loadProject();
                  toast('success', 'PRD 生成完成');
                } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
                stopProgress();
              }
            }}
            onReload={loadPrd} onGoToStep3={() => setTab('hld')}
          />
        )}
      </div>

      <Modal open={!!showConfirmModal} onClose={() => setShowConfirmModal(null)} title={showConfirmModal?.title || ''}>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertOctagon className="w-5 h-5 text-caution shrink-0 mt-0.5" />
            <p className="text-sm text-content-secondary leading-relaxed">{showConfirmModal?.message}</p>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowConfirmModal(null)} className="px-4 py-2 text-sm text-content-secondary hover:text-content">取消</button>
            <button onClick={showConfirmModal?.onConfirm}
              className="px-4 py-2 bg-caution hover:bg-caution/80 text-white text-sm font-medium rounded-lg transition-colors">确定继续</button>
          </div>
        </div>
      </Modal>

      {/* Progress overlay */}
      {progressSteps.length > 0 && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-content">正在处理中</h3>
                <p className="text-xs text-content-tertiary">请稍候，AI 正在工作…</p>
              </div>
            </div>
            <div className="space-y-3">
              {progressSteps.map((step, i) => (
                <div key={i} className={`flex items-center gap-3 transition-all duration-500 ${
                  i < progressIdx ? 'opacity-60' : i === progressIdx ? 'opacity-100' : 'opacity-30'
                }`}>
                  <div className="w-5 h-5 flex items-center justify-center shrink-0">
                    {i < progressIdx ? (
                      <CheckCircle className="w-4 h-4 text-positive" />
                    ) : i === progressIdx ? (
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-content-tertiary/30" />
                    )}
                  </div>
                  <span className={`text-sm ${i === progressIdx ? 'text-content font-medium' : 'text-content-secondary'}`}>
                    {step}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-6 h-1.5 bg-surface-hover rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${Math.max(5, ((progressIdx + 1) / progressSteps.length) * 100)}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========= Section Chat Panel (for HLD per-section) ========= */
function SectionChatPanel({ projectId, section, onContentUpdated }: {
  projectId: string; section: string; onContentUpdated: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [chatError, setChatError] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const loadMessages = useCallback(async () => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/chat?phase=hld&section=${section}`);
      if (!res.ok) throw new Error('加载对话失败');
      const data = await res.json();
      setMessages(data);
    } catch (e) { setChatError(e instanceof Error ? e.message : '加载对话失败'); }
    setLoadingMessages(false);
  }, [projectId, section]);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const formatTime = (ts: string) => {
    try { return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  const send = async () => {
    if (!input.trim() || sending) return;
    const msg = input; setInput(''); setSending(true); setChatError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'hld', section, message: msg }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '发送失败'); }
      loadMessages(); onContentUpdated();
      toast('success', 'AI 已更新内容');
    } catch (e) { setChatError(e instanceof Error ? e.message : '发送失败'); }
    setSending(false);
  };

  return (
    <div className="border-t border-edge-light">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-5 py-2.5 text-xs text-content-tertiary hover:text-content-secondary hover:bg-surface-hover transition-colors">
        <MessageSquare className="w-3 h-3" />
        <span>反馈与对话</span>
        {messages.length > 0 && <span className="px-1.5 py-0.5 rounded bg-surface-hover text-[10px]">{messages.length}</span>}
        {expanded ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
      </button>

      {expanded && (
        <div className="border-t border-edge-light">
          {loadingMessages && (
            <div className="px-4 py-3 text-center text-xs text-content-tertiary">
              <Loader2 className="w-3 h-3 animate-spin inline mr-1" />加载中…
            </div>
          )}
          {!loadingMessages && messages.length === 0 && !chatError && (
            <div className="px-4 py-3 text-center text-xs text-content-tertiary">可在此反馈本节内容，AI 会据此更新方案</div>
          )}
          {messages.length > 0 && (
            <div className="max-h-48 overflow-y-auto px-4 py-3 space-y-2">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                    <div className={`inline-block px-3 py-1.5 rounded-xl text-xs ${
                      m.role === 'user' ? 'bg-primary text-white rounded-br-sm' : 'bg-surface-hover text-content rounded-bl-sm'
                    }`}>{m.content}</div>
                    <div className="text-[10px] text-content-tertiary mt-0.5 px-1">{formatTime(m.created_at)}</div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}

          {chatError && (
            <div className="mx-4 mb-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" /> {chatError}
            </div>
          )}

          <div className="flex items-center gap-2 px-4 py-2.5">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="输入对这部分的反馈…" disabled={sending}
              className="flex-1 bg-surface-hover rounded-lg px-3 py-1.5 text-xs text-content placeholder:text-content-tertiary outline-none" />
            <button onClick={send} disabled={!input.trim() || sending}
              className="p-1.5 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white rounded-lg transition-colors">
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========= Global Chat Panel (for analysis) ========= */
function ChatPanel({ projectId, phase, onContentUpdated }: {
  projectId: string; phase: 'analysis' | 'hld' | 'prd'; onContentUpdated: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const loadMessages = useCallback(() => {
    fetch(`/api/projects/${projectId}/chat?phase=${phase}`).then(r => r.json()).then(setMessages);
  }, [projectId, phase]);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const formatTime = (ts: string) => {
    try { return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  const send = async () => {
    if (!input.trim() || sending) return;
    const msg = input; setInput(''); setSending(true); setChatError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase, message: msg }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '发送失败'); }
      loadMessages(); onContentUpdated();
      toast('success', 'AI 已更新内容');
    } catch (e) { setChatError(e instanceof Error ? e.message : '发送失败，请重试'); }
    setSending(false);
  };

  return (
    <div className="border border-edge rounded-xl bg-white overflow-hidden">
      <div className="px-4 py-2.5 border-b border-edge-light bg-surface-hover flex items-center gap-2">
        <MessageSquare className="w-3.5 h-3.5 text-content-tertiary" />
        <span className="text-xs font-medium text-content-secondary">反馈与对话</span>
        <span className="text-[10px] text-content-tertiary">— 告诉 AI 解读和流程图哪里需要调整</span>
      </div>

      {messages.length > 0 && (
        <div className="max-h-60 overflow-y-auto px-4 py-3 space-y-2.5">
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                <div className={`inline-block px-3 py-2 rounded-xl text-sm ${
                  m.role === 'user' ? 'bg-primary text-white rounded-br-sm' : 'bg-surface-hover text-content rounded-bl-sm'
                }`}>{m.content}</div>
                <div className="text-[10px] text-content-tertiary mt-0.5 px-1">{formatTime(m.created_at)}</div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {chatError && (
        <div className="mx-4 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-600">
          <AlertTriangle className="w-3 h-3 shrink-0" /> {chatError}
        </div>
      )}

      <div className="flex items-center gap-2 px-4 py-3 border-t border-edge-light">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="输入反馈，例如：流程图中缺少了XX步骤…" disabled={sending}
          className="flex-1 bg-surface-hover rounded-lg px-3 py-2 text-sm text-content placeholder:text-content-tertiary outline-none" />
        <button onClick={send} disabled={!input.trim() || sending}
          className="p-2 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white rounded-lg transition-colors">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

/* ========= Mermaid Renderer ========= */
function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!chart) return;
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });
        const uniqueId = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const { svg: rendered } = await mermaid.render(uniqueId, chart);
        if (!cancelled) setSvg(rendered);
      } catch (e) { if (!cancelled) setErr(String(e)); }
    })();
    return () => { cancelled = true; };
  }, [chart]);

  if (!chart) return null;
  if (err) {
    return (
      <div className="bg-caution-subtle border border-caution/20 rounded-xl p-4">
        <p className="text-xs text-caution font-medium mb-2">图表渲染出错，以下为原始 Mermaid 代码：</p>
        <pre className="text-xs text-content-secondary whitespace-pre-wrap font-mono">{chart}</pre>
      </div>
    );
  }
  if (!svg) return <div className="text-xs text-content-tertiary py-4 text-center"><Loader2 className="w-4 h-4 animate-spin inline mr-1.5" />渲染中…</div>;
  return <div ref={containerRef} className="overflow-x-auto bg-white rounded-xl border border-edge p-4" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/* ========= Doc Comment Viewer (Google Doc-style sidebar comments) ========= */
function AnnotatedContent({ projectId, content, contentHtml, requirementId, annotations, onAddAnnotation, onDeleteAnnotation, onResolve, onConvertToRule, toast }: {
  projectId: string; content: string; contentHtml?: string; requirementId: string;
  annotations: Annotation[];
  onAddAnnotation: (text: string, note: string) => void;
  onDeleteAnnotation: (annId: string) => void;
  onResolve: (annId: string, reply?: string) => void;
  onConvertToRule: (annId: string, ruleText: string) => void;
  toast: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const [selection, setSelection] = useState<{ text: string } | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeAnnId, setActiveAnnId] = useState<string | null>(null);
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [refreshingHtml, setRefreshingHtml] = useState(false);
  const [localHtml, setLocalHtml] = useState(contentHtml);
  const contentRef = useRef<HTMLDivElement>(null);
  const commentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0 && contentRef.current?.contains(sel.anchorNode)) {
      setSelection({ text: sel.toString().trim() });
    }
  };

  const addNote = async () => {
    if (selection && noteInput.trim()) {
      setSaving(true);
      await onAddAnnotation(selection.text, noteInput);
      setSelection(null); setNoteInput('');
      setSaving(false);
    }
  };

  const refreshHtml = async () => {
    setRefreshingHtml(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/requirements`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirement_id: requirementId, action: 'refresh_html' }),
      });
      if (res.ok) {
        const resp = await fetch(`/api/projects/${projectId}/requirements`);
        const reqs = await resp.json();
        const updated = reqs.find((r: { id: string }) => r.id === requirementId);
        if (updated?.content_html) setLocalHtml(updated.content_html);
        toast('success', '文档格式已刷新');
      } else {
        const d = await res.json();
        toast('error', d.error || '刷新失败');
      }
    } catch { toast('error', '刷新格式失败'); }
    setRefreshingHtml(false);
  };

  const openAnns = annotations.filter(a => a.status === 'open');
  const resolvedAnns = annotations.filter(a => a.status === 'resolved');

  const injectHighlights = (raw: string) => {
    if (!openAnns.length) return raw;
    let result = raw;
    const sorted = [...openAnns].sort((a, b) => {
      const ia = result.indexOf(a.highlighted_text);
      const ib = result.indexOf(b.highlighted_text);
      return ib - ia;
    });
    for (const ann of sorted) {
      const idx = result.indexOf(ann.highlighted_text);
      if (idx === -1) continue;
      const isActive = activeAnnId === ann.id;
      const sevColor = ann.severity === 'critical' ? 'bg-red-200/80' : ann.severity === 'warning' ? 'bg-amber-200/80' : 'bg-blue-100/80';
      const activeBorder = isActive ? 'ring-2 ring-primary shadow-sm' : '';
      const before = result.slice(0, idx);
      const after = result.slice(idx + ann.highlighted_text.length);
      result = `${before}<mark class="${sevColor} ${activeBorder} cursor-pointer rounded px-0.5 transition-all border-b-2 ${ann.severity === 'critical' ? 'border-red-400' : ann.severity === 'warning' ? 'border-amber-400' : 'border-blue-300'}" data-ann-id="${ann.id}">${ann.highlighted_text}</mark>${after}`;
    }
    return result;
  };

  const markRefs = useRef<Record<string, HTMLElement | null>>({});

  const handleDocClick = (e: React.MouseEvent) => {
    const mark = (e.target as HTMLElement).closest('mark[data-ann-id]');
    if (mark) {
      const annId = mark.getAttribute('data-ann-id');
      setActiveAnnId(annId);
      if (annId && commentRefs.current[annId]) {
        commentRefs.current[annId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  };

  const scrollToHighlight = (annId: string) => {
    const docEl = contentRef.current;
    if (!docEl) return;
    const mark = docEl.querySelector(`mark[data-ann-id="${annId}"]`);
    if (mark) {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      mark.classList.add('ring-2', 'ring-primary');
      setTimeout(() => mark.classList.remove('ring-2', 'ring-primary'), 1500);
    }
  };

  const sevConfig = {
    critical: { border: 'border-l-red-500', bg: 'bg-red-50', label: '方案质疑', labelCls: 'bg-red-100 text-red-700' },
    warning: { border: 'border-l-amber-500', bg: 'bg-amber-50', label: '需关注', labelCls: 'bg-amber-100 text-amber-700' },
    info: { border: 'border-l-blue-400', bg: 'bg-blue-50', label: '待确认', labelCls: 'bg-blue-100 text-blue-700' },
  };

  const useHtml = !!(localHtml && localHtml.trim());

  const injectHighlightsHtml = (html: string) => {
    if (!openAnns.length) return html;
    let result = html;
    const sorted = [...openAnns].sort((a, b) => b.highlighted_text.length - a.highlighted_text.length);
    for (const ann of sorted) {
      const escaped = ann.highlighted_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?<=>)([^<]*?)(${escaped})([^<]*?)(?=<)`, 'g');
      const isActive = activeAnnId === ann.id;
      const sevColor = ann.severity === 'critical' ? 'background:#fca5a5' : ann.severity === 'warning' ? 'background:#fcd34d' : 'background:#bfdbfe';
      const borderBottom = ann.severity === 'critical' ? 'border-bottom:2px solid #f87171' : ann.severity === 'warning' ? 'border-bottom:2px solid #fbbf24' : 'border-bottom:2px solid #93c5fd';
      const activeBorder = isActive ? ';outline:2px solid rgba(37,99,235,0.5);box-shadow:0 1px 3px rgba(37,99,235,0.2)' : '';
      result = result.replace(regex, `>$1<mark style="${sevColor};${borderBottom}${activeBorder};cursor:pointer;border-radius:3px;padding:1px 3px;transition:all 0.15s" data-ann-id="${ann.id}">$2</mark>$3<`);
    }
    return result;
  };

  const renderCommentCard = (ann: Annotation, showActions: boolean) => {
    const cfg = sevConfig[ann.severity] || sevConfig.info;
    const isActive = activeAnnId === ann.id;
    const isResolved = ann.status === 'resolved';
    const reply = replyInputs[ann.id] || '';

    return (
      <div key={ann.id}
        ref={el => { commentRefs.current[ann.id] = el; }}
        onClick={() => {
          const newId = isActive ? null : ann.id;
          setActiveAnnId(newId);
          if (newId) scrollToHighlight(newId);
        }}
        className={`border-l-[3px] ${isResolved ? 'border-l-gray-300' : cfg.border} rounded-r-lg transition-all group ${
          isActive ? `${isResolved ? 'bg-gray-50' : cfg.bg} shadow-sm ring-1 ring-primary/20` : `${isResolved ? 'bg-gray-50/50' : 'bg-white'} hover:bg-surface-hover`
        } ${isActive ? 'p-3' : 'p-2.5'}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <span className={`shrink-0 ${ann.author === 'ai' ? 'text-purple-500' : 'text-blue-500'}`}>
              {ann.author === 'ai' ? <Sparkles className="w-3 h-3" /> : <HighlighterIcon className="w-3 h-3" />}
            </span>
            <span className="text-[10px] font-medium text-content-tertiary">{ann.author === 'ai' ? 'AI' : '我'}</span>
            {isResolved
              ? <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">已处理</span>
              : <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${cfg.labelCls}`}>{cfg.label}</span>}
          </div>
          {deleteConfirmId === ann.id ? (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <button onClick={() => { onDeleteAnnotation(ann.id); setDeleteConfirmId(null); }}
                className="text-[10px] text-red-600 hover:underline font-medium">删除</button>
              <button onClick={() => setDeleteConfirmId(null)}
                className="text-[10px] text-content-tertiary hover:underline">取消</button>
            </div>
          ) : (
            <button onClick={e => { e.stopPropagation(); setDeleteConfirmId(ann.id); }}
              className="text-content-tertiary hover:text-negative opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-negative-subtle" title="删除">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Highlighted excerpt */}
        <div className={`text-[11px] text-content-tertiary mb-1.5 italic ${isActive ? '' : 'line-clamp-2'}`}>
          &ldquo;{isActive ? ann.highlighted_text : ann.highlighted_text.slice(0, 80)}{!isActive && ann.highlighted_text.length > 80 ? '…' : ''}&rdquo;
        </div>

        {/* Question / note */}
        <div className="text-xs text-content font-medium mb-1.5">
          {ann.question || ann.annotation_text || '（无说明）'}
        </div>

        {/* Suggested answer */}
        {ann.suggested_answer && (
          <div className="bg-surface-hover rounded px-2.5 py-2 text-[11px] text-content-secondary mb-2">
            <span className="text-content-tertiary font-medium">💡 建议：</span>{ann.suggested_answer}
          </div>
        )}

        {/* === Expanded action area (only when active + open + showActions) === */}
        {isActive && showActions && !isResolved && (
          <div className="mt-2 pt-2 border-t border-edge-light space-y-2" onClick={e => e.stopPropagation()}>
            {/* Reply input */}
            <div className="flex items-center gap-1.5">
              <input value={reply} onChange={e => setReplyInputs(prev => ({ ...prev, [ann.id]: e.target.value }))}
                placeholder="输入回复…" className="flex-1 bg-white border border-edge rounded-lg px-2.5 py-1.5 text-[11px] outline-none"
                onKeyDown={e => { if (e.key === 'Enter' && reply.trim()) { setActionLoading(ann.id); onResolve(ann.id, reply); setReplyInputs(prev => ({ ...prev, [ann.id]: '' })); setActionLoading(null); } }} />
              <button onClick={() => { if (reply.trim()) { setActionLoading(ann.id); onResolve(ann.id, reply); setReplyInputs(prev => ({ ...prev, [ann.id]: '' })); setActionLoading(null); } }}
                disabled={!reply.trim() || actionLoading === ann.id}
                className="px-2 py-1.5 bg-primary text-white text-[10px] rounded-lg disabled:opacity-40 whitespace-nowrap">
                回复并确认
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-1.5">
              {ann.suggested_answer && (
                <button onClick={() => { setActionLoading(ann.id); onResolve(ann.id, ann.suggested_answer); setActionLoading(null); }}
                  disabled={actionLoading === ann.id}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-positive border border-positive/30 rounded-lg hover:bg-positive-subtle">
                  <CheckCircle className="w-3 h-3" /> 采纳建议
                </button>
              )}
              <button onClick={() => {
                const ruleText = ann.suggested_answer || ann.question || ann.annotation_text;
                setActionLoading(ann.id);
                onConvertToRule(ann.id, ruleText);
                setActionLoading(null);
              }}
                disabled={actionLoading === ann.id}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary-subtle">
                <ArrowRightCircle className="w-3 h-3" /> 转为规则
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Format refresh hint */}
      {!useHtml && content && (
        <div className="mb-3 flex items-center gap-2 text-xs text-content-tertiary bg-surface-hover rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>当前为纯文本显示</span>
          <button onClick={refreshHtml} disabled={refreshingHtml}
            className="ml-auto flex items-center gap-1 px-2 py-1 bg-primary-subtle text-primary text-[11px] rounded-lg hover:bg-primary/10 disabled:opacity-40">
            {refreshingHtml ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
            {refreshingHtml ? '刷新中…' : '刷新原始格式'}
          </button>
        </div>
      )}

      <div className="flex gap-0 relative">
        {/* Left: Document Content */}
        <div className="flex-1 min-w-0 pr-4 border-r border-edge-light max-h-[75vh] overflow-y-auto">
          {useHtml ? (
            <div ref={contentRef} onMouseUp={handleMouseUp} onClick={handleDocClick}
              className="gdoc-rendered text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: injectHighlightsHtml(localHtml!) }} />
          ) : (
            <div ref={contentRef} onMouseUp={handleMouseUp} onClick={handleDocClick}
              className="text-sm text-content-secondary whitespace-pre-wrap leading-relaxed"
              dangerouslySetInnerHTML={{ __html: injectHighlights(content) }} />
          )}

          {/* Add annotation popover */}
          {selection && (
            <div className="sticky bottom-0 mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2 shadow-lg z-10">
              <div className="text-xs text-blue-700 font-medium flex items-center gap-1.5">
                <HighlighterIcon className="w-3.5 h-3.5" /> 添加评论
              </div>
              <div className="bg-white rounded-lg px-3 py-1.5 text-xs text-content-secondary border border-blue-100 line-clamp-2">
                &ldquo;{selection.text.slice(0, 120)}{selection.text.length > 120 ? '…' : ''}&rdquo;
              </div>
              <div className="flex items-center gap-2">
                <input value={noteInput} onChange={e => setNoteInput(e.target.value)} placeholder="输入评论…" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') addNote(); if (e.key === 'Escape') { setSelection(null); setNoteInput(''); } }} disabled={saving}
                  className="flex-1 bg-white border border-blue-200 rounded-lg px-3 py-1.5 text-xs outline-none" />
                <button onClick={addNote} disabled={!noteInput.trim() || saving}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-xs rounded-lg disabled:opacity-40">
                  {saving && <Loader2 className="w-3 h-3 animate-spin" />} 评论
                </button>
                <button onClick={() => { setSelection(null); setNoteInput(''); }} disabled={saving}
                  className="px-2 py-1.5 text-xs text-content-tertiary hover:text-content">×</button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Comment Sidebar */}
        <div className="w-[300px] shrink-0 pl-4 max-h-[75vh] overflow-y-auto">
          {annotations.length === 0 && (
            <div className="text-center py-8 text-xs text-content-tertiary">
              <HighlighterIcon className="w-6 h-6 mx-auto mb-2 opacity-20" />
              <p className="mb-1">在左侧文档中选中文字</p>
              <p>即可添加评论</p>
            </div>
          )}

          {/* Open annotations */}
          {openAnns.length > 0 && (
            <div className="space-y-2 mb-4">
              {openAnns.map(ann => renderCommentCard(ann, true))}
            </div>
          )}

          {/* Resolved annotations */}
          {resolvedAnns.length > 0 && (
            <div>
              <div className="text-[10px] font-medium text-content-tertiary uppercase tracking-wider mb-2 px-1">
                已处理 ({resolvedAnns.length})
              </div>
              <div className="space-y-1.5 opacity-70">
                {resolvedAnns.map(ann => renderCommentCard(ann, false))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ========= Requirements Tab ========= */
function RequirementsTab({ projectId, requirements, onReload, toast }: {
  projectId: string; requirements: Requirement[]; onReload: () => void;
  toast: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ type: 'brd' as Requirement['type'], name: '', content: '', source_url: '' });
  const [fetchingDoc, setFetchingDoc] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const coreReqs = requirements.filter(r => isCoreRequirement(r.type));
  const refReqs = requirements.filter(r => !isCoreRequirement(r.type));

  const add = async () => {
    if (!form.name.trim()) return;
    if (form.type === 'google_doc') {
      if (!form.source_url.trim()) return;
      setFetchingDoc(true); setFetchError('');
      try {
        const res = await fetch(`/api/projects/${projectId}/requirements`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
        setForm({ type: 'brd', name: '', content: '', source_url: '' }); setShowAdd(false); onReload();
        toast('success', `文档「${form.name}」已添加`);
      } catch (e) { setFetchError(e instanceof Error ? e.message : String(e)); }
      setFetchingDoc(false);
      return;
    }
    if (!form.content.trim() && !form.source_url.trim()) return;
    await fetch(`/api/projects/${projectId}/requirements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const savedName = form.name;
    setForm({ type: 'brd', name: '', content: '', source_url: '' }); setShowAdd(false); onReload();
    toast('success', `文档「${savedName}」已添加`);
  };

  const remove = async (req: Requirement) => {
    await fetch(`/api/projects/${projectId}/requirements`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requirement_id: req.id }) });
    onReload(); toast('info', `已删除「${req.name}」`);
  };

  const typeColors: Record<string, string> = {
    brd: 'bg-primary-subtle text-primary', frf: 'bg-purple-100 text-purple-700',
    reference: 'bg-positive-subtle text-positive', link: 'bg-caution-subtle text-caution',
    google_doc: 'bg-blue-50 text-blue-600',
  };

  const renderGroup = (title: string, desc: string, reqs: Requirement[]) => (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-[10px] text-content-tertiary">{desc}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-hover text-content-tertiary">{reqs.length}</span>
      </div>
      {reqs.length === 0 ? (
        <div className="bg-white border border-dashed border-edge rounded-xl p-6 text-center text-xs text-content-tertiary">暂无文档</div>
      ) : (
        <div className="space-y-2">
          {reqs.map(req => <ReqCard key={req.id} req={req} typeColors={typeColors} onDelete={() => remove(req)} />)}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[15px] font-semibold">业务需求文档</h2>
          <p className="text-xs text-content-tertiary mt-0.5">BRD/FRF 是 AI 分析的核心输入，参考材料仅辅助理解上下文</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white px-3.5 py-2 rounded-lg text-[13px] font-medium transition-colors">
          <Plus className="w-4 h-4" /> 添加文档
        </button>
      </div>

      <div className="space-y-6">
        {renderGroup('核心需求文档', 'BRD / FRF — AI 将深入分析', coreReqs)}
        {renderGroup('参考材料', '仅辅助 AI 理解上下文', refReqs)}
      </div>

      <Modal open={showAdd} onClose={() => { setShowAdd(false); setFetchError(''); }} title="添加业务需求文档" maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1.5">文档类型</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Requirement['type'] }))}
                className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content">
                {Object.entries(REQUIREMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1.5">文档名称 <span className="text-negative">*</span></label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="例如：Multi-CNPJ BRD" className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary" />
            </div>
          </div>
          {form.type === 'google_doc' ? (
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1.5">Google Doc 链接 <span className="text-negative">*</span></label>
              <input value={form.source_url} onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))}
                placeholder="https://docs.google.com/document/d/xxxxx/edit"
                className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary" />
              {fetchError && (
                <div className="flex items-center gap-2 p-2.5 mt-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {fetchError}
                </div>
              )}
            </div>
          ) : form.type === 'link' ? (
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1.5">链接 URL</label>
              <input value={form.source_url} onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))}
                placeholder="https://..." className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary" />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1.5">文档内容 <span className="text-negative">*</span></label>
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={12}
                placeholder="粘贴 BRD/FRF 文档内容（支持 Markdown）"
                className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary resize-none font-mono" />
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={() => { setShowAdd(false); setFetchError(''); }} className="px-4 py-2 text-sm text-content-secondary hover:text-content">取消</button>
            <button onClick={add}
              disabled={fetchingDoc || !form.name.trim() || (form.type === 'google_doc' ? !form.source_url.trim() : (!form.content.trim() && !form.source_url.trim()))}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-40">
              {fetchingDoc && <Loader2 className="w-4 h-4 animate-spin" />}
              {fetchingDoc ? '拉取中...' : form.type === 'google_doc' ? '拉取并添加' : '添加'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ReqCard({ req, typeColors, onDelete }: { req: Requirement; typeColors: Record<string, string>; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div className="bg-white border border-edge rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-surface-hover transition-colors" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown className="w-4 h-4 text-content-tertiary" /> : <ChevronRight className="w-4 h-4 text-content-tertiary" />}
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${typeColors[req.type] || 'bg-gray-100 text-gray-600'}`}>
          {REQUIREMENT_TYPE_LABELS[req.type]}
        </span>
        <span className="font-medium text-sm flex-1">{req.name}</span>
        <span className="text-xs text-content-tertiary">{req.content?.length || 0} 字</span>
        <button onClick={e => { e.stopPropagation(); setShowDeleteConfirm(true); }}
          className="text-content-tertiary hover:text-negative transition-colors p-1 rounded hover:bg-negative-subtle" title="删除文档">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && (
        <div className="px-5 pb-4 border-t border-edge-light pt-3">
          {req.source_url && <a href={req.source_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline block mb-2">{req.source_url}</a>}
          {req.content && <pre className="text-sm text-content-secondary whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed">{req.content}</pre>}
        </div>
      )}
      <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="删除文档">
        <div className="space-y-4">
          <p className="text-sm text-content-secondary">确定删除文档 <span className="font-medium text-content">「{req.name}」</span>？此操作不可撤销。</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-sm text-content-secondary hover:text-content">取消</button>
            <button onClick={() => { setShowDeleteConfirm(false); onDelete(); }}
              className="px-4 py-2 bg-negative hover:bg-negative/80 text-white text-sm font-medium rounded-lg">删除</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ========= Analysis Tab ========= */
function AnalysisTab({ projectId, requirements, summary, clarifications, rules, annotations, loading, toast,
  onAnalyze, onReloadSummary, onReloadClars, onReloadRules, onReloadAnnotations, onGoToStep1 }: {
  projectId: string; requirements: Requirement[]; summary: AnalysisSummary | null;
  clarifications: ClarificationPoint[]; rules: BusinessRule[]; annotations: Annotation[]; loading: boolean;
  toast: (type: 'success' | 'error' | 'info', message: string) => void;
  onAnalyze: (mode?: 'full' | 'refresh') => void; onReloadSummary: () => void; onReloadClars: () => void; onReloadRules: () => void;
  onReloadAnnotations: () => void; onGoToStep1: () => void;
}) {
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRule, setNewRule] = useState('');
  const [showAnnotatedDoc, setShowAnnotatedDoc] = useState<Requirement | null>(null);

  const hasCore = requirements.some(r => isCoreRequirement(r.type));
  const coreReqs = requirements.filter(r => isCoreRequirement(r.type));
  const pending = clarifications.filter(c => c.status === 'pending').length;
  const answered = clarifications.filter(c => c.status === 'answered').length;
  const converted = clarifications.filter(c => c.status === 'converted').length;
  const criticals = clarifications.filter(c => c.severity === 'critical').length;

  const addRule = async () => {
    if (!newRule.trim()) return;
    await fetch(`/api/projects/${projectId}/rules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rule_text: newRule }) });
    setNewRule(''); setShowAddRule(false); onReloadRules();
    toast('success', '业务规则已添加');
  };
  const deleteRule = async (rule: BusinessRule) => {
    await fetch(`/api/projects/${projectId}/rules`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rule_id: rule.id }) });
    onReloadRules(); toast('info', '规则已删除');
  };

  const revertRuleToCp = async (rule: BusinessRule) => {
    if (rule.source_type === 'clarification' && rule.source_id) {
      await fetch(`/api/projects/${projectId}/clarifications/${rule.source_id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revert' }),
      });
    } else {
      await fetch(`/api/projects/${projectId}/rules`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule_id: rule.id }),
      });
    }
    onReloadRules(); onReloadClars();
    toast('info', '已回退');
  };

  const [addingAnnotation, setAddingAnnotation] = useState(false);

  const addAnnotation = async (reqId: string, text: string, note: string) => {
    setAddingAnnotation(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/annotations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirement_id: reqId, highlighted_text: text, annotation_text: note, author: 'user' }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '添加标注失败'); }
      onReloadAnnotations();
      toast('success', '评论已添加');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : '添加标注失败');
    }
    setAddingAnnotation(false);
  };

  const deleteAnnotation = async (annId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/annotations`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotation_id: annId }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '删除标注失败'); }
      onReloadAnnotations();
      toast('info', '标注已删除');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : '删除标注失败');
    }
  };

  const resolveAnnotation = async (annId: string, reply?: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/annotations`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotation_id: annId, action: reply ? 'reply' : 'resolve', reply }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '操作失败'); }
      onReloadAnnotations();
      toast('success', reply ? '已回复并确认' : '已采纳建议');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : '操作失败');
    }
  };

  const convertAnnotationToRule = async (annId: string, ruleText: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/annotations`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotation_id: annId, action: 'convert_to_rule', rule_text: ruleText }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '转换失败'); }
      onReloadAnnotations();
      onReloadRules();
      toast('success', '已转为业务规则');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : '转换失败');
    }
  };

  const grouped = clarifications.reduce<Record<string, ClarificationPoint[]>>((acc, cp) => {
    const cat = cp.category || 'general';
    (acc[cat] = acc[cat] || []).push(cp);
    return acc;
  }, {});

  const hasContent = summary || clarifications.length > 0 || rules.length > 0;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[15px] font-semibold">业务分析</h2>
          <p className="text-xs text-content-tertiary mt-0.5">AI 解读 BRD/FRF、绘制流程图、标注问题点、识别待确认点</p>
        </div>
        <div className="flex items-center gap-2">
          {hasContent && (
            <button onClick={() => onAnalyze('refresh')} disabled={loading || !hasCore}
              className="flex items-center gap-2 bg-white border border-primary text-primary hover:bg-primary/5 disabled:opacity-40 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors"
              title="保留已确认的待确认点和规则，更新 BRD 解读和流程图">
              <RefreshCw className="w-3.5 h-3.5" /> 更新解读
            </button>
          )}
          <button onClick={() => onAnalyze('full')} disabled={loading || !hasCore}
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
            title={!hasCore ? '请先在 Step 1 添加 BRD/FRF 文档' : ''}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? '分析中...' : hasContent ? '全新分析' : '开始分析'}
          </button>
        </div>
      </div>

      {!hasContent ? (
        <div className="bg-white border-2 border-dashed border-edge rounded-2xl p-12 text-center">
          <Search className="w-10 h-10 text-content-tertiary mx-auto mb-3 opacity-40" />
          <p className="text-sm text-content-secondary">尚未进行业务分析</p>
          {hasCore ? (
            <p className="text-xs text-content-tertiary mt-1">点击上方"开始分析"按钮</p>
          ) : (
            <p className="text-xs text-content-tertiary mt-1">
              请先<button onClick={onGoToStep1} className="text-primary hover:underline mx-0.5 font-medium">回到 Step 1</button>添加 BRD/FRF 文档
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: '方案质疑', value: criticals, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
              { label: '待确认', value: pending, color: 'text-caution', bg: 'bg-caution-subtle', border: 'border-caution/10' },
              { label: '已回答', value: answered, color: 'text-primary', bg: 'bg-primary-subtle', border: 'border-primary/10' },
              { label: '已转规则', value: converted, color: 'text-positive', bg: 'bg-positive-subtle', border: 'border-positive/10' },
              { label: '业务规则', value: rules.length, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-3 text-center`}>
                <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[11px] text-content-secondary mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Inline Annotations on BRD */}
          {coreReqs.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <HighlighterIcon className="w-4 h-4 text-blue-500" /> 原文标注与评论
                {annotations.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{annotations.length} 条评论</span>}
              </h3>
              <div className="space-y-2">
                {coreReqs.map(req => {
                  const reqAnns = annotations.filter(a => a.requirement_id === req.id);
                  return (
                    <div key={req.id} className="bg-white border border-edge rounded-xl overflow-hidden">
                      <button onClick={() => setShowAnnotatedDoc(showAnnotatedDoc?.id === req.id ? null : req)}
                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-hover transition-colors text-left">
                        {showAnnotatedDoc?.id === req.id ? <ChevronDown className="w-4 h-4 text-content-tertiary" /> : <ChevronRight className="w-4 h-4 text-content-tertiary" />}
                        <span className="text-sm font-medium flex-1">{req.name}</span>
                        {reqAnns.length > 0
                          ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{reqAnns.length} 条评论</span>
                          : <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-hover text-content-tertiary">展开查看文档 · 划词添加评论</span>
                        }
                      </button>
                      {showAnnotatedDoc?.id === req.id && (
                        <div className="px-5 pb-4 border-t border-edge-light pt-3">
                          <AnnotatedContent projectId={projectId} content={req.content} contentHtml={req.content_html}
                            requirementId={req.id} annotations={reqAnns}
                            onAddAnnotation={(text, note) => addAnnotation(req.id, text, note)}
                            onDeleteAnnotation={(annId) => deleteAnnotation(annId)}
                            onResolve={(annId, reply) => resolveAnnotation(annId, reply)}
                            onConvertToRule={(annId, ruleText) => convertAnnotationToRule(annId, ruleText)}
                            toast={toast} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {summary?.brd_interpretation && (
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> BRD/FRF 解读
              </h3>
              <div className="bg-white border border-edge rounded-xl px-5 py-4 markdown-body text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary.brd_interpretation}</ReactMarkdown>
              </div>
            </div>
          )}

          {summary?.process_diagram && (
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" /> 业务流程图
              </h3>
              <MermaidDiagram chart={summary.process_diagram} />
            </div>
          )}

          {summary && (
            <ChatPanel projectId={projectId} phase="analysis" onContentUpdated={() => { onReloadSummary(); onReloadClars(); onReloadRules(); }} />
          )}

          {Object.keys(grouped).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-caution" /> 待确认点
              </h3>
              <div className="space-y-4">
                {Object.entries(grouped).map(([cat, pts]) => (
                  <div key={cat}>
                    <div className="text-[11px] font-medium text-content-tertiary uppercase tracking-wider mb-2">
                      {CLARIFICATION_CATEGORIES[cat] || cat}
                    </div>
                    <div className="space-y-2">
                      {pts.map(cp => <ClarCard key={cp.id} point={cp} projectId={projectId} onReload={onReloadClars} toast={toast} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-positive" /> 业务规则 ({rules.length})
              </h3>
              <button onClick={() => setShowAddRule(true)} className="flex items-center gap-1 text-xs text-primary hover:text-primary-hover font-medium">
                <Plus className="w-3.5 h-3.5" /> 手动添加
              </button>
            </div>
            {rules.length === 0 ? (
              <p className="text-sm text-content-tertiary bg-white border border-edge rounded-xl p-4">暂无业务规则</p>
            ) : (
              <div className="space-y-1.5">
                {rules.map(rule => (
                  <div key={rule.id} className="bg-white border border-edge rounded-xl px-4 py-2.5 flex items-start gap-2.5 group">
                    <CheckCircle className="w-3.5 h-3.5 text-positive mt-0.5 shrink-0" />
                    <span className="text-sm flex-1">{rule.rule_text}</span>
                    <span className="text-[10px] text-content-tertiary whitespace-nowrap">
                      {rule.source_type === 'clarification' ? '来自确认' : rule.source_type === 'requirement' ? '来自需求' : '手动'}
                    </span>
                    {rule.source_type === 'clarification' && (
                      <button onClick={() => revertRuleToCp(rule)}
                        className="text-content-tertiary hover:text-caution opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-amber-50" title="回退为待确认点">
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => deleteRule(rule)}
                      className="text-content-tertiary hover:text-negative opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-negative-subtle" title="删除规则">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Modal open={showAddRule} onClose={() => setShowAddRule(false)} title="手动添加业务规则">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1.5">规则描述 <span className="text-negative">*</span></label>
            <textarea value={newRule} onChange={e => setNewRule(e.target.value)} rows={4}
              placeholder="输入明确的业务规则描述" className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm resize-none" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowAddRule(false)} className="px-4 py-2 text-sm text-content-secondary">取消</button>
            <button onClick={addRule} disabled={!newRule.trim()} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg disabled:opacity-40">添加</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

interface CpChatMsg { id: string; role: 'user' | 'assistant'; content: string; metadata?: string; created_at: string }

function ClarCard({ point, projectId, onReload, toast }: {
  point: ClarificationPoint; projectId: string; onReload: () => void;
  toast: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const [expanded, setExpanded] = useState(point.status === 'pending');
  const [chatMsgs, setChatMsgs] = useState<CpChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [suggestedRule, setSuggestedRule] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadChat = useCallback(() => {
    fetch(`/api/projects/${projectId}/clarifications/${point.id}/chat`).then(r => r.json()).then(setChatMsgs).catch(() => {});
  }, [projectId, point.id]);

  useEffect(() => { if (expanded) loadChat(); }, [expanded, loadChat]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const msg = input.trim();
    setInput('');
    setSending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/clarifications/${point.id}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      let data: Record<string, unknown>;
      try {
        data = await res.json();
      } catch {
        toast('error', `服务端返回异常 (${res.status})，请检查错误日志`);
        return;
      }
      if (!res.ok) { toast('error', (data.error as string) || '发送失败'); return; }
      loadChat();
      onReload();
      if (data.is_conclusive && data.suggested_rule) {
        setSuggestedRule(data.suggested_rule as string);
      }
    } catch (err) {
      toast('error', String(err));
    } finally {
      setSending(false);
    }
  };

  const convertToRule = async (ruleText: string) => {
    await fetch(`/api/projects/${projectId}/clarifications/${point.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actual_answer: ruleText, status: 'converted', use_conversation: true, rule_text: ruleText }),
    });
    setShowConvertModal(false);
    setSuggestedRule('');
    onReload();
    toast('success', '已确认并转为业务规则');
  };

  const revertToPending = async () => {
    await fetch(`/api/projects/${projectId}/clarifications/${point.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revert' }),
    });
    onReload();
    toast('info', '已回退为待确认');
  };

  const statusIcon = {
    pending: <Clock className="w-3.5 h-3.5 text-caution" />,
    answered: <CheckCircle className="w-3.5 h-3.5 text-primary" />,
    converted: <ArrowRightCircle className="w-3.5 h-3.5 text-positive" />,
  };

  const severityBadge = {
    critical: { icon: <ShieldAlert className="w-3 h-3" />, label: SEVERITY_LABELS.critical, cls: 'bg-red-100 text-red-700 border-red-200' },
    warning: { icon: <AlertCircle className="w-3 h-3" />, label: SEVERITY_LABELS.warning, cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    info: { icon: <Info className="w-3 h-3" />, label: SEVERITY_LABELS.info, cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  };

  const sev = severityBadge[point.severity || 'info'];

  return (
    <div className={`bg-white border rounded-xl overflow-hidden ${
      point.severity === 'critical' ? 'border-red-200 bg-red-50/30' :
      point.status === 'pending' ? 'border-caution/30' : point.status === 'converted' ? 'border-positive/20' : 'border-edge'
    }`}>
      {/* Header — always visible */}
      <div className="px-4 py-3 flex items-start gap-2.5 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="mt-0.5">{statusIcon[point.status]}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${sev.cls}`}>
              {sev.icon} {sev.label}
            </span>
            {chatMsgs.length > 0 && (
              <span className="text-[10px] text-content-tertiary">{chatMsgs.length} 条对话</span>
            )}
          </div>
          <p className="text-sm font-medium">{point.question}</p>
          {point.reason && !expanded && <p className="text-xs text-content-tertiary mt-1 leading-relaxed line-clamp-1">{point.reason}</p>}
        </div>
        <div className="mt-1 text-content-tertiary">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {point.reason && <p className="text-xs text-content-tertiary leading-relaxed">{point.reason}</p>}

          {point.suggested_answer && point.status === 'pending' && (
            <div className="bg-surface-hover rounded-lg px-3 py-2 text-xs flex items-start gap-2">
              <div className="flex-1">
                <span className="text-content-tertiary">AI 建议：</span>
                <span className="text-content-secondary">{point.suggested_answer}</span>
              </div>
              <button onClick={() => { setSuggestedRule(point.suggested_answer); setShowConvertModal(true); }}
                className="shrink-0 px-2 py-1 bg-positive hover:bg-positive/80 text-white text-[11px] rounded-md font-medium whitespace-nowrap">
                采纳为规则
              </button>
            </div>
          )}

          {/* Confluence references */}
          {(() => {
            try {
              const refs = JSON.parse(point.confluence_refs || '[]') as { title: string; excerpt: string; relevance?: string }[];
              if (refs.length === 0) return null;
              return (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-medium text-content-tertiary flex items-center gap-1">
                    <Globe className="w-3 h-3" /> 相关 Confluence 文档
                  </div>
                  {refs.map((ref, i) => (
                    <div key={i} className="bg-blue-50/60 border border-blue-100 rounded-lg px-3 py-2 text-xs">
                      <div className="font-medium text-blue-700 mb-0.5">{ref.title}</div>
                      <div className="text-content-secondary text-[11px] leading-relaxed">{ref.excerpt}</div>
                      {ref.relevance && <div className="text-content-tertiary text-[10px] mt-1 italic">{ref.relevance}</div>}
                    </div>
                  ))}
                </div>
              );
            } catch { return null; }
          })()}

          {/* Conversation thread */}
          {chatMsgs.length > 0 && (
            <div className="border border-edge rounded-lg bg-surface-hover/30 max-h-80 overflow-y-auto">
              <div className="p-3 space-y-3">
                {chatMsgs.map(m => (
                  <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      m.role === 'user' ? 'bg-primary text-white' : 'bg-white border border-edge text-content-secondary'
                    }`}>
                      {m.role === 'assistant' ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                          p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5">{children}</ol>,
                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        }}>{m.content}</ReactMarkdown>
                      ) : m.content}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </div>
          )}

          {/* Suggested rule banner */}
          {suggestedRule && point.status !== 'converted' && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
              <div className="flex-1 text-xs">
                <div className="font-medium text-green-800 mb-1">AI 建议可形成业务规则：</div>
                <div className="text-green-700">{suggestedRule}</div>
              </div>
              <button onClick={() => { setShowConvertModal(true); }}
                className="shrink-0 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-[11px] rounded-lg font-medium">
                确认转为规则
              </button>
            </div>
          )}

          {/* Converted / Answered state with revert */}
          {point.status === 'converted' && point.actual_answer && (
            <div className="bg-positive-subtle rounded-lg px-3 py-2 text-xs flex items-start gap-2">
              <ArrowRightCircle className="w-3.5 h-3.5 text-positive mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="text-[10px] font-medium text-positive mb-0.5">已转为业务规则</div>
                <span className="text-content-secondary">{point.actual_answer}</span>
              </div>
              <button onClick={revertToPending} title="回退为待确认"
                className="shrink-0 text-content-tertiary hover:text-caution transition-colors">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {point.status === 'answered' && point.actual_answer && (
            <div className="flex justify-end">
              <button onClick={revertToPending}
                className="flex items-center gap-1 text-[11px] text-content-tertiary hover:text-caution transition-colors">
                <RotateCcw className="w-3 h-3" /> 回退为待确认
              </button>
            </div>
          )}

          {/* Actions & Chat input */}
          {point.status !== 'converted' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="和 AI 进一步讨论细节…"
                  disabled={sending}
                  className="flex-1 bg-white border border-edge rounded-lg px-3 py-2 text-sm disabled:opacity-50" />
                <button onClick={sendMessage} disabled={!input.trim() || sending}
                  className="flex items-center gap-1 px-3 py-2 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white text-xs rounded-lg shrink-0">
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="flex justify-end">
                <button onClick={() => {
                  const defaultRule = suggestedRule || point.suggested_answer || point.actual_answer
                    || (chatMsgs.length > 0 ? chatMsgs.filter(m => m.role === 'assistant').slice(-1).map(m => m.content).join('') : point.question);
                  setSuggestedRule(defaultRule); setShowConvertModal(true);
                }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-positive hover:bg-positive/80 text-white text-xs rounded-lg font-medium">
                  <ArrowRightCircle className="w-3.5 h-3.5" /> 直接转为业务规则
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Convert to rule modal */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setShowConvertModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">确认业务规则</h3>
            <p className="text-xs text-content-secondary mb-3">请确认或编辑以下内容作为最终的业务规则：</p>
            <textarea value={suggestedRule} onChange={e => setSuggestedRule(e.target.value)} rows={4}
              className="w-full bg-white border border-edge rounded-lg px-3 py-2 text-sm resize-none mb-3" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConvertModal(false)} className="px-4 py-2 text-sm text-content-secondary">取消</button>
              <button onClick={() => convertToRule(suggestedRule)} disabled={!suggestedRule.trim()}
                className="px-4 py-2 bg-positive hover:bg-positive/80 disabled:opacity-40 text-white text-sm rounded-lg font-medium">确认转为规则</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========= HLD Tab ========= */
function HldTab({ projectId, project, hld, loading, toast, onGenerate, onReload, onGoToStep2 }: {
  projectId: string; project: Project | null; hld: HighLevelDesign | null; loading: boolean;
  toast: (type: 'success' | 'error' | 'info', message: string) => void;
  onGenerate: () => void; onReload: () => void; onGoToStep2: () => void;
}) {
  const [showConfirmHld, setShowConfirmHld] = useState(false);

  const confirmHld = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/hld`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '确认失败'); }
      setShowConfirmHld(false); onReload();
      toast('success', '高阶方案已确认');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : '确认失败');
      setShowConfirmHld(false);
    }
  };

  const updateScopeMode = async (mode: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope_mode: mode }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '更新失败'); }
      onReload();
      toast('success', mode === 'current_system' ? '范围已设为当前系统' : '范围已设为所有系统');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : '更新范围失败');
    }
  };

  let affectedSystems: AffectedSystem[] = [];
  try { affectedSystems = JSON.parse(hld?.affected_systems || '[]'); } catch { /* */ }

  const sections = [
    { key: 'information_architecture', diagramKey: 'ia_diagram', title: '信息架构', desc: '页面改动和导航关系', sectionId: 'information_architecture' },
    { key: 'system_architecture', diagramKey: 'sa_diagram', title: '系统架构', desc: '系统间交互和接口变更', sectionId: 'system_architecture' },
    { key: 'data_architecture', diagramKey: 'da_diagram', title: '数据架构', desc: '数据实体和字段变更', sectionId: 'data_architecture' },
  ] as const;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[15px] font-semibold">高阶方案设计</h2>
          <p className="text-xs text-content-tertiary mt-0.5">
            {hld ? `版本 ${hld.version} · ${hld.status === 'confirmed' ? '已确认' : '草稿'}` : '基于业务分析结果生成高阶方案'}
          </p>
        </div>
        <div className="flex gap-2">
          {hld && hld.status !== 'confirmed' && (
            <button onClick={() => setShowConfirmHld(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-positive hover:bg-positive/80 text-white text-[13px] font-medium rounded-lg">
              <CheckCircle className="w-4 h-4" /> 确认方案
            </button>
          )}
          <button onClick={onGenerate} disabled={loading}
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white px-4 py-2 rounded-lg text-[13px] font-medium">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? '生成中...' : hld ? '重新生成' : '生成高阶方案'}
          </button>
        </div>
      </div>

      {!hld ? (
        <div className="bg-white border-2 border-dashed border-edge rounded-2xl p-12 text-center">
          <Layers className="w-10 h-10 text-content-tertiary mx-auto mb-3 opacity-40" />
          <p className="text-sm text-content-secondary">尚未生成高阶方案</p>
          <p className="text-xs text-content-tertiary mt-1">
            请先完成<button onClick={onGoToStep2} className="text-primary hover:underline mx-0.5 font-medium">Step 2 业务分析</button>
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {hld.status === 'confirmed' && (
            <div className="bg-positive-subtle border border-positive/20 rounded-xl p-3 flex items-center gap-2 text-sm text-positive">
              <CheckCircle className="w-4 h-4" /> 方案已确认，将作为 PRD 生成的重要输入
            </div>
          )}

          {/* Affected Systems + Scope Selection */}
          {affectedSystems.length === 0 && (
            <div className="bg-surface-hover border border-edge rounded-xl px-5 py-3 flex items-center gap-2 text-xs text-content-tertiary">
              <Globe className="w-3.5 h-3.5" /> 未识别跨系统影响 — 当前需求仅涉及本系统
            </div>
          )}
          {affectedSystems.length > 0 && (
            <div className="bg-white border border-edge rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-edge-light bg-surface-hover">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" /> 受影响系统
                </h4>
                <p className="text-[11px] text-content-tertiary mt-0.5">本需求涉及以下系统/模块的改造</p>
              </div>
              <div className="px-5 py-4 space-y-2">
                {affectedSystems.map((sys, i) => (
                  <div key={i} className={`flex items-start gap-3 px-3 py-2 rounded-lg ${sys.is_current ? 'bg-primary-subtle border border-primary/10' : 'bg-surface-hover'}`}>
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${sys.is_current ? 'bg-primary' : 'bg-content-tertiary'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {sys.system_name}
                        {sys.module_name && <span className="text-content-secondary"> / {sys.module_name}</span>}
                        {sys.is_current && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">当前系统</span>}
                      </div>
                      <p className="text-xs text-content-tertiary mt-0.5">{sys.scope_description}</p>
                    </div>
                  </div>
                ))}
              </div>

              {affectedSystems.some(s => !s.is_current) && (
                <div className="px-5 py-3 border-t border-edge-light bg-caution-subtle/50">
                  <p className="text-xs text-content-secondary mb-2 font-medium">PRD 范围选择</p>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="scope" checked={project?.scope_mode === 'current_system'}
                        onChange={() => updateScopeMode('current_system')}
                        className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs text-content-secondary">仅当前系统</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="scope" checked={project?.scope_mode === 'all_systems'}
                        onChange={() => updateScopeMode('all_systems')}
                        className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs text-content-secondary">所有受影响系统</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {sections.map(s => (
            <HldSection key={s.key} title={s.title} desc={s.desc}
              content={(hld as unknown as Record<string, string>)[s.key] || ''}
              diagram={(hld as unknown as Record<string, string>)[s.diagramKey] || ''}
              projectId={projectId} fieldKey={s.key} diagramFieldKey={s.diagramKey}
              sectionId={s.sectionId}
              onReload={onReload} confirmed={hld.status === 'confirmed'} toast={toast}
            />
          ))}
        </div>
      )}

      <Modal open={showConfirmHld} onClose={() => setShowConfirmHld(false)} title="确认高阶方案">
        <div className="space-y-4">
          <p className="text-sm text-content-secondary leading-relaxed">确认后，此方案将作为 PRD 生成的重要输入。</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowConfirmHld(false)} className="px-4 py-2 text-sm text-content-secondary">取消</button>
            <button onClick={confirmHld} className="px-4 py-2 bg-positive hover:bg-positive/80 text-white text-sm font-medium rounded-lg">确认方案</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function HldSection({ title, desc, content, diagram, projectId, fieldKey, diagramFieldKey, sectionId, onReload, confirmed, toast }: {
  title: string; desc: string; content: string; diagram: string;
  projectId: string; fieldKey: string; diagramFieldKey: string; sectionId: string;
  onReload: () => void; confirmed: boolean;
  toast: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const hasUnsaved = editing && editContent !== content;

  useEffect(() => { setEditContent(content); }, [content]);

  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/hld`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [fieldKey]: editContent }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '保存失败'); }
      setEditing(false); onReload();
      toast('success', `${title}已保存`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : '保存失败');
    }
    setSaving(false);
  };

  return (
    <div className="bg-white border border-edge rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-edge-light bg-surface-hover">
        <div>
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="text-[11px] text-content-tertiary">{desc}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasUnsaved && <span className="text-[10px] text-caution font-medium">未保存</span>}
          {!confirmed && (
            <button onClick={() => { if (editing) save(); else setEditing(true); }} disabled={saving}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary-hover font-medium disabled:opacity-40">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pencil className="w-3 h-3" />}
              {saving ? '保存中…' : editing ? '保存' : '编辑'}
            </button>
          )}
        </div>
      </div>
      <div className="px-5 py-4 space-y-4">
        {editing ? (
          <div className="space-y-2">
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={10}
              className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm font-mono resize-none" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setEditing(false); setEditContent(content); }} className="px-3 py-1.5 text-xs text-content-tertiary">取消</button>
              <button onClick={save} className="px-3 py-1.5 bg-primary text-white text-xs rounded-lg">保存</button>
            </div>
          </div>
        ) : content ? (
          <div className="markdown-body text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-content-tertiary">暂无内容</p>
        )}

        {diagram && <MermaidDiagram chart={diagram} />}
      </div>

      {!confirmed && <SectionChatPanel projectId={projectId} section={sectionId} onContentUpdated={onReload} />}
    </div>
  );
}

/* ========= PRD Tab ========= */
function PrdTab({ projectId, project, prd, loading, toast, onGenerate, onReload, onGoToStep3 }: {
  projectId: string; project: Project | null; prd: PRD | null; loading: boolean;
  toast: (type: 'success' | 'error' | 'info', message: string) => void;
  onGenerate: () => void; onReload: () => void; onGoToStep3: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [content, setContent] = useState('');
  const [copied, setCopied] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const hasUnsaved = editMode && content !== (prd?.content || '');

  useEffect(() => { if (prd?.content) setContent(prd.content); }, [prd]);

  const [savingPrd, setSavingPrd] = useState(false);

  const saveContent = async () => {
    setSavingPrd(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/prd`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '保存失败'); }
      setEditMode(false); onReload();
      toast('success', 'PRD 已保存');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : '保存失败');
    }
    setSavingPrd(false);
  };

  const wordCount = content.length;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[15px] font-semibold">产品需求文档</h2>
          <p className="text-xs text-content-tertiary mt-0.5">
            {prd ? (
              <>版本 {prd.version} · {prd.updated_at?.slice(0, 16)} · {wordCount.toLocaleString()} 字
                {hasUnsaved && <span className="text-caution font-medium ml-2">· 有未保存更改</span>}
                {prd.confluence_url && (
                  <a href={prd.confluence_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary hover:underline inline-flex items-center gap-0.5">
                    <ExternalLink className="w-3 h-3" /> Confluence
                  </a>
                )}
              </>
            ) : '基于业务分析和高阶方案生成 PRD'}
          </p>
        </div>
        <div className="flex gap-2">
          {prd && (
            <>
              <button onClick={() => { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000); toast('success', 'Markdown 已复制'); }}
                className="flex items-center gap-1.5 px-3 py-2 text-[13px] border border-edge rounded-lg text-content-secondary hover:text-content hover:bg-surface-hover">
                <Copy className="w-3.5 h-3.5" /> {copied ? '已复制' : '复制 MD'}
              </button>
              <button onClick={() => { if (editMode) saveContent(); else setEditMode(true); }}
                className={`flex items-center gap-1.5 px-3 py-2 text-[13px] border rounded-lg ${
                  hasUnsaved ? 'border-caution bg-caution-subtle text-caution' : 'border-edge text-content-secondary hover:text-content hover:bg-surface-hover'
                }`}>
                <Pencil className="w-3.5 h-3.5" /> {editMode ? '保存' : '编辑'}
              </button>
              <button onClick={() => setShowPublish(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-[13px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
                <Globe className="w-3.5 h-3.5" /> 发布到 Confluence
              </button>
            </>
          )}
          <button onClick={onGenerate} disabled={loading}
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white px-4 py-2 rounded-lg text-[13px] font-medium">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? '生成中...' : prd ? '重新生成' : '生成 PRD'}
          </button>
        </div>
      </div>

      {!prd ? (
        <div className="bg-white border-2 border-dashed border-edge rounded-2xl p-12 text-center">
          <FileOutput className="w-10 h-10 text-content-tertiary mx-auto mb-3 opacity-40" />
          <p className="text-sm text-content-secondary">尚未生成 PRD</p>
          <p className="text-xs text-content-tertiary mt-1">
            建议先完成<button onClick={onGoToStep3} className="text-primary hover:underline mx-0.5 font-medium">Step 3 高阶方案设计</button>
          </p>
        </div>
      ) : editMode ? (
        <textarea value={content} onChange={e => setContent(e.target.value)}
          className="w-full min-h-[600px] bg-white border border-edge rounded-2xl px-6 py-5 text-sm font-mono resize-none" />
      ) : (
        <div className="bg-white border border-edge rounded-2xl px-8 py-6 markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{prd.content}</ReactMarkdown>
        </div>
      )}

      {showPublish && (
        <ConfluencePublishModal
          projectId={projectId}
          projectName={project?.name || 'PRD'}
          toast={toast}
          onClose={() => setShowPublish(false)}
          onPublished={() => { setShowPublish(false); onReload(); }}
        />
      )}
    </div>
  );
}

/* ========= Confluence Publish Modal ========= */
function ConfluencePublishModal({ projectId, projectName, toast, onClose, onPublished }: {
  projectId: string; projectName: string;
  toast: (type: 'success' | 'error' | 'info', message: string) => void;
  onClose: () => void; onPublished: () => void;
}) {
  const [pages, setPages] = useState<{ id: string; title: string; hasChildren: boolean }[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<{ id: string; title: string }[]>([]);
  const [selectedParent, setSelectedParent] = useState<string>('');
  const [selectedParentTitle, setSelectedParentTitle] = useState<string>('');
  const [title, setTitle] = useState(`${projectName} PRD`);
  const [loadingPages, setLoadingPages] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [error, setError] = useState('');

  const loadChildren = useCallback(async (pageId?: string) => {
    setLoadingPages(true);
    try {
      const url = pageId ? `/api/confluence/children?page_id=${pageId}` : '/api/confluence/children';
      const res = await fetch(url);
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      setPages(data);
      if (pageId) {
        setSelectedParent(pageId);
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setLoadingPages(false);
  }, []);

  useEffect(() => { loadChildren(); }, [loadChildren]);

  const navigateInto = (page: { id: string; title: string }) => {
    setBreadcrumb(prev => [...prev, page]);
    loadChildren(page.id);
  };

  const navigateBack = (index: number) => {
    const newBc = breadcrumb.slice(0, index);
    setBreadcrumb(newBc);
    if (newBc.length === 0) {
      setSelectedParent('');
      loadChildren();
    } else {
      const last = newBc[newBc.length - 1];
      setSelectedParent(last.id);
      loadChildren(last.id);
    }
  };

  const publish = async () => {
    if (!title.trim()) return;
    setPublishing(true); setError('');
    try {
      const res = await fetch('/api/confluence/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, parent_page_id: selectedParent, title }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      toast('success', 'PRD 已发布到 Confluence');
      if (data.page_url) {
        window.open(data.page_url, '_blank');
      }
      onPublished();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setPublishing(false);
  };

  return (
    <Modal open={true} onClose={onClose} title="发布到 Confluence" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-content-secondary mb-1.5">
            页面标题 <span className="text-negative">*</span>
          </label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-content-secondary mb-1.5">选择父页面（发布目录）</label>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs text-content-tertiary mb-2 flex-wrap">
            <button onClick={() => navigateBack(0)} className="hover:text-primary">根目录</button>
            {breadcrumb.map((bc, i) => (
              <span key={bc.id} className="flex items-center gap-1">
                <span>/</span>
                <button onClick={() => navigateBack(i + 1)} className="hover:text-primary">{bc.title}</button>
              </span>
            ))}
          </div>

          <div className="border border-edge rounded-lg max-h-60 overflow-y-auto">
            {loadingPages ? (
              <div className="p-4 text-center"><Loader2 className="w-4 h-4 animate-spin inline mr-1.5" />加载中…</div>
            ) : pages.length === 0 ? (
              <div className="p-4 text-center text-xs text-content-tertiary">
                {breadcrumb.length > 0 ? '该页面下没有子页面，PRD 将创建在此目录下' : '无法加载页面列表，请检查 Confluence 配置'}
              </div>
            ) : (
              <div>
                {pages.map(p => (
                  <div key={p.id}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer hover:bg-surface-hover border-b border-edge-light last:border-0 ${
                      selectedParent === p.id ? 'bg-primary-subtle' : ''
                    }`}
                    onClick={() => { setSelectedParent(p.id); setSelectedParentTitle(p.title); }}>
                    <FileText className="w-4 h-4 text-content-tertiary shrink-0" />
                    <span className="flex-1 truncate">{p.title}</span>
                    <button onClick={e => { e.stopPropagation(); navigateInto(p); }}
                      className="text-content-tertiary hover:text-primary p-1" title="进入子目录">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {selectedParent && (
            <p className="text-xs text-content-tertiary mt-1.5">
              将在「{selectedParentTitle || '所选页面'}」下创建新页面
            </p>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {confirmPublish && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
            <p className="text-sm text-content-secondary">
              即将在{selectedParent ? `「${selectedParentTitle}」` : '根目录'}下创建页面 <span className="font-medium text-content">「{title}」</span>
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmPublish(false)} className="px-3 py-1.5 text-xs text-content-secondary">返回修改</button>
              <button onClick={() => { setConfirmPublish(false); publish(); }} disabled={publishing}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg">
                {publishing && <Loader2 className="w-3 h-3 animate-spin" />}
                确认发布
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-content-secondary">取消</button>
          <button onClick={() => setConfirmPublish(true)} disabled={publishing || !title.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg">
            {publishing && <Loader2 className="w-4 h-4 animate-spin" />}
            {publishing ? '发布中…' : '发布'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
