'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Trash2, RefreshCw, Loader2, ChevronDown, ChevronRight, AlertOctagon, AlertCircle, Info, Clock } from 'lucide-react';
import Modal from '@/components/Modal';
import { useToast } from '@/components/Toast';
import type { ErrorLog } from '@/types';

const SEVERITY_CONFIG = {
  critical: { icon: AlertOctagon, label: '严重', cls: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' },
  error: { icon: AlertCircle, label: '错误', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  warning: { icon: Info, label: '警告', cls: 'bg-blue-50 text-blue-600 border-blue-200', dot: 'bg-blue-400' },
};

export default function ErrorLogsPage() {
  const toast = useToast();
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (filter) params.set('severity', filter);
      const res = await fetch(`/api/error-logs?${params}`);
      const data = await res.json();
      setLogs(data.logs); setTotal(data.total);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const deleteLog = async (id: string) => {
    await fetch('/api/error-logs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadLogs();
    toast('info', '日志已删除');
  };

  const clearAll = async () => {
    await fetch('/api/error-logs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clear_all: true }) });
    setShowClearConfirm(false);
    loadLogs();
    toast('info', '所有日志已清除');
  };

  const formatTime = (ts: string) => {
    try { return new Date(ts + 'Z').toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return ts; }
  };

  const counts = { critical: 0, error: 0, warning: 0 };
  logs.forEach(l => { if (l.severity in counts) counts[l.severity as keyof typeof counts]++; });

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-content-tertiary" />
          <div>
            <h1 className="text-xl font-bold">错误日志</h1>
            <p className="text-xs text-content-tertiary mt-0.5">系统运行过程中的错误记录，包含时间、来源、详情和原因分析</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={loadLogs} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-[13px] border border-edge rounded-lg text-content-secondary hover:text-content hover:bg-surface-hover">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            刷新
          </button>
          {logs.length > 0 && (
            <button onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-[13px] border border-negative/30 rounded-lg text-negative hover:bg-negative-subtle">
              <Trash2 className="w-3.5 h-3.5" /> 清空日志
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <button onClick={() => setFilter('')}
          className={`text-center p-3 rounded-xl border transition-colors ${!filter ? 'border-primary bg-primary-subtle' : 'border-edge bg-white hover:bg-surface-hover'}`}>
          <div className="text-lg font-bold text-content">{total}</div>
          <div className="text-[11px] text-content-secondary">总计</div>
        </button>
        {Object.entries(SEVERITY_CONFIG).map(([key, cfg]) => (
          <button key={key} onClick={() => setFilter(f => f === key ? '' : key)}
            className={`text-center p-3 rounded-xl border transition-colors ${filter === key ? 'border-primary bg-primary-subtle' : `border-edge bg-white hover:bg-surface-hover`}`}>
            <div className={`text-lg font-bold ${cfg.cls.split(' ')[1]}`}>{counts[key as keyof typeof counts]}</div>
            <div className="text-[11px] text-content-secondary">{cfg.label}</div>
          </button>
        ))}
      </div>

      {/* Log List */}
      {loading && logs.length === 0 ? (
        <div className="text-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-content-secondary">加载中…</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-edge rounded-2xl p-12 text-center">
          <AlertTriangle className="w-10 h-10 text-content-tertiary mx-auto mb-3 opacity-30" />
          <p className="text-sm text-content-secondary">暂无错误日志</p>
          <p className="text-xs text-content-tertiary mt-1">系统运行正常</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => {
            const cfg = SEVERITY_CONFIG[log.severity] || SEVERITY_CONFIG.error;
            const Ico = cfg.icon;
            const expanded = expandedId === log.id;
            let ctx: Record<string, unknown> = {};
            try { ctx = JSON.parse(log.context || '{}'); } catch { /* */ }

            return (
              <div key={log.id} className="bg-white border border-edge rounded-xl overflow-hidden">
                <div className="flex items-start gap-3 px-5 py-3 cursor-pointer hover:bg-surface-hover transition-colors"
                  onClick={() => setExpandedId(expanded ? null : log.id)}>
                  <div className="mt-0.5">
                    {expanded ? <ChevronDown className="w-4 h-4 text-content-tertiary" /> : <ChevronRight className="w-4 h-4 text-content-tertiary" />}
                  </div>
                  <Ico className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.cls.split(' ')[1]}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${cfg.cls}`}>{cfg.label}</span>
                      <span className="text-xs text-content-tertiary font-mono">{log.source}</span>
                      {log.endpoint && <span className="text-[10px] text-content-tertiary font-mono">{log.method} {log.endpoint}</span>}
                    </div>
                    <p className="text-sm text-content truncate">{log.error_message}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-content-tertiary flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {formatTime(log.timestamp)}
                    </span>
                    <button onClick={e => { e.stopPropagation(); deleteLog(log.id); }}
                      className="p-1 text-content-tertiary hover:text-negative rounded hover:bg-negative-subtle" title="删除">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="px-5 pb-4 pt-2 border-t border-edge-light space-y-3">
                    <div>
                      <div className="text-[11px] font-medium text-content-tertiary uppercase mb-1">错误详情</div>
                      <pre className="bg-surface-hover rounded-lg p-3 text-xs text-content-secondary whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">{log.error_message}</pre>
                    </div>

                    {log.error_stack && (
                      <div>
                        <div className="text-[11px] font-medium text-content-tertiary uppercase mb-1">堆栈追踪</div>
                        <pre className="bg-surface-hover rounded-lg p-3 text-[10px] text-content-tertiary whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">{log.error_stack}</pre>
                      </div>
                    )}

                    {log.request_body && (
                      <div>
                        <div className="text-[11px] font-medium text-content-tertiary uppercase mb-1">请求内容</div>
                        <pre className="bg-surface-hover rounded-lg p-3 text-[10px] text-content-secondary whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">{log.request_body}</pre>
                      </div>
                    )}

                    {Object.keys(ctx).length > 0 && (
                      <div>
                        <div className="text-[11px] font-medium text-content-tertiary uppercase mb-1">上下文信息</div>
                        <div className="bg-surface-hover rounded-lg p-3 space-y-1">
                          {Object.entries(ctx).map(([k, v]) => (
                            <div key={k} className="flex items-start gap-2 text-xs">
                              <span className="text-content-tertiary font-mono shrink-0">{k}:</span>
                              <span className="text-content-secondary break-all">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                      <div className="text-[11px] font-medium text-blue-700 mb-1">原因分析</div>
                      <p className="text-xs text-blue-600 leading-relaxed">
                        {log.source.includes('parse') || log.error_message.includes('JSON')
                          ? 'LLM 返回内容无法解析为有效 JSON。可能原因：1) 模型输出了额外的 markdown 标记或说明文字；2) 响应被截断（max_tokens 不足）；3) 模型选择不当。建议：检查 LLM 配置、增加 max_tokens、或更换模型重试。'
                          : log.error_message.includes('timeout') || log.error_message.includes('ETIMEDOUT')
                          ? '请求超时。可能原因：1) 网络连接不稳定；2) LLM API 服务响应慢；3) 输入内容过长导致处理时间过长。建议：检查网络、缩短输入内容、或增加超时配置。'
                          : log.error_message.includes('401') || log.error_message.includes('Unauthorized')
                          ? '认证失败。可能原因：1) API Key 无效或过期；2) Token 格式错误。建议：前往设置页面重新配置凭证并测试连接。'
                          : log.error_message.includes('429') || log.error_message.includes('rate')
                          ? 'API 频率限制。可能原因：调用频率超过 API 限额。建议：稍后重试，或检查 API 使用额度。'
                          : log.error_message.includes('connect') || log.error_message.includes('ECONNREFUSED') || log.error_message.includes('DNS')
                          ? '网络连接失败。可能原因：1) API 地址不可达；2) DNS 解析失败（公司网络可能屏蔽外部 API）；3) 防火墙限制。建议：检查 API 接口地址配置，必要时使用公司内部 API 网关。'
                          : log.error_message.includes('Confluence')
                          ? 'Confluence 操作失败。可能原因：1) Token 过期；2) 页面权限不足；3) 页面 ID 不存在。建议：检查 Confluence Token 和页面 ID 配置。'
                          : `来源 [${log.source}] 的操作失败。建议：查看上方的错误详情和堆栈追踪定位具体原因。如果问题持续出现，请检查相关服务配置是否正确。`
                        }
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showClearConfirm} onClose={() => setShowClearConfirm(false)} title="清空所有日志">
        <div className="space-y-4">
          <p className="text-sm text-content-secondary">确定清空所有 {total} 条错误日志？此操作不可撤销。</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2 text-sm text-content-secondary">取消</button>
            <button onClick={clearAll} className="px-4 py-2 bg-negative hover:bg-negative/80 text-white text-sm font-medium rounded-lg">清空</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
