'use client';

import { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Clock, ChevronDown, ChevronRight, Loader2, Trash2, AlertCircle, CheckCircle, RefreshCw, ExternalLink, Copy } from 'lucide-react';
import { useToast } from '@/components/Toast';

interface LogSummary {
  id: string;
  project_id: string;
  phase: string;
  action: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  duration_ms: number;
  status: 'success' | 'error';
  error_message: string;
  created_at: string;
  sys_len: number;
  user_len: number;
  resp_len: number;
}

interface LogDetail {
  id: string;
  project_id: string;
  system_prompt: string;
  user_prompt: string;
  response: string;
  model: string;
  phase: string;
  action: string;
  tokens_in: number;
  tokens_out: number;
  duration_ms: number;
  status: string;
  error_message: string;
  created_at: string;
}

const PHASE_LABELS: Record<string, { label: string; cls: string }> = {
  analysis: { label: '业务分析', cls: 'bg-blue-100 text-blue-700' },
  hld: { label: '高阶设计', cls: 'bg-purple-100 text-purple-700' },
  prd: { label: 'PRD 生成', cls: 'bg-green-100 text-green-700' },
};

export default function LlmLogsPage() {
  const [logs, setLogs] = useState<LogSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [phaseFilter, setPhaseFilter] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (phaseFilter) params.set('phase', phaseFilter);
      const res = await fetch(`/api/llm-logs?${params}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch { toast('error', '加载日志失败'); }
    setLoading(false);
  }, [phaseFilter, toast]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/llm-logs/${id}`);
      setDetail(await res.json());
    } catch { toast('error', '加载详情失败'); }
    setDetailLoading(false);
  };

  const clearAll = async () => {
    await fetch('/api/llm-logs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    setShowClearConfirm(false);
    load();
    toast('success', '日志已清空');
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast('info', `${label} 已复制`);
  };

  const PromptBlock = ({ label, text }: { label: string; text: string }) => (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-content-tertiary">{label} ({text.length.toLocaleString()} chars)</span>
        <button onClick={() => copyText(text, label)} className="flex items-center gap-1 text-[10px] text-primary hover:underline">
          <Copy className="w-3 h-3" /> 复制
        </button>
      </div>
      <pre className="bg-gray-50 border border-edge rounded-lg px-3 py-2 text-[11px] text-content-secondary max-h-48 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
        {text.slice(0, 5000)}{text.length > 5000 ? '\n\n… (truncated)' : ''}
      </pre>
    </div>
  );

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-content-tertiary" />
          <div>
            <h1 className="text-xl font-bold">模型交互日志</h1>
            <p className="text-xs text-content-tertiary mt-0.5">
              记录每次 LLM 调用的输入输出，共 {total} 条
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={phaseFilter} onChange={e => setPhaseFilter(e.target.value)}
            className="bg-white border border-edge rounded-lg px-3 py-2 text-xs text-content">
            <option value="">全部阶段</option>
            <option value="analysis">业务分析</option>
            <option value="hld">高阶设计</option>
            <option value="prd">PRD 生成</option>
          </select>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 border border-edge rounded-lg text-xs text-content-secondary hover:border-primary hover:text-primary">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </button>
          <button onClick={() => setShowClearConfirm(true)} disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-500 rounded-lg text-xs hover:bg-red-50 disabled:opacity-40">
            <Trash2 className="w-3.5 h-3.5" /> 清空
          </button>
        </div>
      </div>

      {showClearConfirm && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm text-red-600">确定清空所有模型交互日志？此操作不可撤销。</span>
          <div className="flex gap-2">
            <button onClick={() => setShowClearConfirm(false)} className="px-3 py-1.5 text-xs text-content-secondary">取消</button>
            <button onClick={clearAll} className="px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg">确认清空</button>
          </div>
        </div>
      )}

      {loading && logs.length === 0 ? (
        <div className="text-center py-16">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-content-tertiary" />
          <p className="text-sm text-content-tertiary">加载中…</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 bg-white border border-edge rounded-2xl">
          <MessageSquare className="w-8 h-8 mx-auto mb-3 text-content-tertiary opacity-20" />
          <p className="text-sm text-content-tertiary">暂无模型交互日志</p>
          <p className="text-xs text-content-tertiary mt-1">当你触发业务分析、高阶设计或 PRD 生成时，模型的输入输出会自动记录在这里</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => {
            const phaseCfg = PHASE_LABELS[log.phase] || { label: log.phase, cls: 'bg-gray-100 text-gray-600' };
            const isExpanded = expandedId === log.id;
            return (
              <div key={log.id} className="bg-white border border-edge rounded-xl overflow-hidden">
                <button onClick={() => loadDetail(log.id)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-hover transition-colors text-left">
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-content-tertiary shrink-0" /> : <ChevronRight className="w-4 h-4 text-content-tertiary shrink-0" />}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${phaseCfg.cls}`}>{phaseCfg.label}</span>
                  <span className="text-xs text-content font-medium flex-1 truncate">{log.action}</span>
                  <span className="text-[10px] text-content-tertiary">{log.model}</span>
                  <span className="text-[10px] text-content-tertiary flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {(log.duration_ms / 1000).toFixed(1)}s
                  </span>
                  <span className="text-[10px] text-content-tertiary">~{log.tokens_in + log.tokens_out} tok</span>
                  {log.status === 'error'
                    ? <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    : <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                  <span className="text-[10px] text-content-tertiary whitespace-nowrap">
                    {new Date(log.created_at + 'Z').toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-edge px-5 py-4">
                    {detailLoading ? (
                      <div className="text-center py-6"><Loader2 className="w-5 h-5 animate-spin mx-auto text-content-tertiary" /></div>
                    ) : detail ? (
                      <div>
                        <div className="flex flex-wrap gap-3 text-[11px] text-content-tertiary mb-3">
                          <span>模型: <span className="text-content font-medium">{detail.model}</span></span>
                          <span>耗时: <span className="text-content font-medium">{(detail.duration_ms / 1000).toFixed(1)}s</span></span>
                          <span>输入 tokens: <span className="text-content font-medium">~{detail.tokens_in.toLocaleString()}</span></span>
                          <span>输出 tokens: <span className="text-content font-medium">~{detail.tokens_out.toLocaleString()}</span></span>
                          {detail.error_message && (
                            <span className="text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {detail.error_message.slice(0, 200)}</span>
                          )}
                        </div>

                        <PromptBlock label="System Prompt" text={detail.system_prompt} />
                        <PromptBlock label="User Prompt" text={detail.user_prompt} />
                        <PromptBlock label="LLM Response" text={detail.response || '(empty)'} />

                        {detail.project_id && (
                          <div className="mt-3 flex items-center gap-2">
                            <a href={`/projects/${detail.project_id}`} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                              <ExternalLink className="w-3 h-3" /> 查看项目
                            </a>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
