'use client';

import { useEffect, useState, useCallback } from 'react';
import { Settings, Save, Eye, EyeOff, CheckCircle, Loader2, Zap, AlertCircle, ChevronDown, Upload } from 'lucide-react';
import { useToast } from '@/components/Toast';

const LLM_MODELS = [
  { group: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { group: 'Anthropic', models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'] },
  { group: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'] },
];

const API_PRESETS: Record<string, string> = {
  'OpenAI': 'https://api.openai.com/v1',
  'Anthropic': 'https://api.anthropic.com/v1',
};

type TestStatus = { loading: boolean; result?: { success: boolean; message: string } };

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showKeys, setShowKeys] = useState<Set<string>>(new Set());
  const [llmTest, setLlmTest] = useState<TestStatus>({ loading: false });
  const [confTest, setConfTest] = useState<TestStatus>({ loading: false });
  const [googleTest, setGoogleTest] = useState<TestStatus>({ loading: false });
  const [templateTest, setTemplateTest] = useState<TestStatus>({ loading: false });
  const [customModel, setCustomModel] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then((data: Record<string, string>) => {
      setSettings(data);
      const builtIn = LLM_MODELS.flatMap(g => g.models);
      if (data.llm_model && !builtIn.includes(data.llm_model)) setCustomModel(true);
    }).catch(() => {});
  }, []);

  const update = (key: string, value: string) => { setSettings(s => ({ ...s, [key]: value })); setSaved(false); };
  const toggleShow = (key: string) => {
    setShowKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      if (!res.ok) throw new Error('保存失败');
      setSaved(true);
      toast('success', '设置已保存');
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : '保存设置失败');
    }
    setSaving(false);
  };

  const testLLM = useCallback(async () => {
    setLlmTest({ loading: true });
    try {
      const res = await fetch('/api/settings/test-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          llm_api_url: settings.llm_api_url,
          llm_api_key: settings.llm_api_key,
          llm_model: settings.llm_model,
        }),
      });
      const data = await res.json();
      setLlmTest({
        loading: false,
        result: { success: data.success, message: data.success ? `连接成功，模型: ${data.model}` : data.error },
      });
    } catch (err) {
      setLlmTest({ loading: false, result: { success: false, message: String(err) } });
    }
  }, [settings]);

  const testConfluence = useCallback(async () => {
    setConfTest({ loading: true });
    try {
      const res = await fetch('/api/settings/test-confluence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confluence_base_url: settings.confluence_base_url,
          confluence_token: settings.confluence_token,
        }),
      });
      const data = await res.json();
      setConfTest({
        loading: false,
        result: { success: data.success, message: data.success ? data.message : data.error },
      });
    } catch (err) {
      setConfTest({ loading: false, result: { success: false, message: String(err) } });
    }
  }, [settings]);

  const testGoogle = useCallback(async () => {
    setGoogleTest({ loading: true });
    try {
      const res = await fetch('/api/settings/test-google', { method: 'POST' });
      const data = await res.json();
      setGoogleTest({ loading: false, result: { success: data.success, message: data.success ? data.message : data.error || data.message } });
    } catch (err) {
      setGoogleTest({ loading: false, result: { success: false, message: String(err) } });
    }
  }, []);

  const saveAndTest = async (which: 'llm' | 'confluence' | 'google') => {
    setSaving(true);
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    if (which === 'llm') testLLM();
    else if (which === 'confluence') testConfluence();
    else testGoogle();
  };

  const Field = ({ label, name, placeholder, secret, hint }: { label: string; name: string; placeholder: string; secret?: boolean; hint?: string }) => (
    <div>
      <label className="block text-sm font-medium text-content-secondary mb-1.5">{label}</label>
      <div className="relative">
        <input type={secret && !showKeys.has(name) ? 'password' : 'text'}
          value={settings[name] || ''} onChange={e => update(name, e.target.value)} placeholder={placeholder}
          className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary pr-10" />
        {secret && (
          <button onClick={() => toggleShow(name)} className="absolute right-3 top-1/2 -translate-y-1/2 text-content-tertiary hover:text-content">
            {showKeys.has(name) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-content-tertiary mt-1">{hint}</p>}
    </div>
  );

  const TestResult = ({ status }: { status: TestStatus }) => {
    if (status.loading) return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 mt-4">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span className="text-sm text-primary">正在测试连接…</span>
      </div>
    );
    if (!status.result) return null;
    return (
      <div className={`flex items-center gap-2 p-3 rounded-lg mt-4 ${status.result.success
        ? 'bg-green-50 border border-green-200'
        : 'bg-red-50 border border-red-200'}`}>
        {status.result.success
          ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
          : <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
        <span className={`text-sm ${status.result.success ? 'text-green-700' : 'text-red-600'}`}>
          {status.result.message}
        </span>
      </div>
    );
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-content-tertiary" />
          <div>
            <h1 className="text-xl font-bold">设置</h1>
            <p className="text-xs text-content-tertiary mt-0.5">配置 LLM 接口和外部服务连接</p>
          </div>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white px-4 py-2 rounded-lg text-[13px] font-medium transition-colors">
          {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? '已保存' : saving ? '保存中...' : '保存设置'}
        </button>
      </div>

      <div className="space-y-6">
        {/* LLM Config */}
        <div className="bg-white border border-edge rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">LLM API 配置</h2>
            <button onClick={() => saveAndTest('llm')} disabled={llmTest.loading || saving}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-hover disabled:opacity-40 transition-colors">
              {llmTest.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              保存并测试连接
            </button>
          </div>
          <div className="space-y-4">
            {/* API URL with presets */}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1.5">API 接口地址</label>
              <div className="flex gap-2">
                <input type="text"
                  value={settings.llm_api_url || ''} onChange={e => update('llm_api_url', e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="flex-1 bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary" />
                <div className="relative group">
                  <button className="h-full px-3 border border-edge rounded-lg text-xs text-content-secondary hover:border-primary hover:text-primary transition-colors flex items-center gap-1">
                    快速填入 <ChevronDown className="w-3 h-3" />
                  </button>
                  <div className="absolute right-0 top-full mt-1 bg-white border border-edge rounded-lg shadow-lg py-1 z-10 min-w-[200px] hidden group-hover:block">
                    {Object.entries(API_PRESETS).map(([name, url]) => (
                      <button key={name} onClick={() => update('llm_api_url', url)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-base transition-colors">
                        <span className="font-medium">{name}</span>
                        <span className="block text-content-tertiary mt-0.5 truncate">{url}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-xs text-content-tertiary mt-1">
                填写 LLM 服务的 API 接口地址。支持 OpenAI 兼容格式（如公司内部 API 网关、Azure OpenAI、第三方中转服务等）
              </p>
            </div>

            <Field name="llm_api_key" label="API Key" placeholder="sk-..." secret hint="API 密钥，会安全存储在本地数据库中" />

            {/* Model select */}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1.5">模型</label>
              {!customModel ? (
                <div className="flex gap-2">
                  <select value={settings.llm_model || ''}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setCustomModel(true); update('llm_model', '');
                      } else {
                        update('llm_model', e.target.value);
                      }
                    }}
                    className="flex-1 bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content">
                    <option value="">选择模型…</option>
                    {LLM_MODELS.map(g => (
                      <optgroup key={g.group} label={g.group}>
                        {g.models.map(m => <option key={m} value={m}>{m}</option>)}
                      </optgroup>
                    ))}
                    <option value="__custom__">✏️ 自定义模型名称…</option>
                  </select>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input type="text" value={settings.llm_model || ''}
                    onChange={e => update('llm_model', e.target.value)}
                    placeholder="输入自定义模型名称"
                    className="flex-1 bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary" />
                  <button onClick={() => { setCustomModel(false); update('llm_model', ''); }}
                    className="px-3 border border-edge rounded-lg text-xs text-content-secondary hover:border-primary hover:text-primary transition-colors">
                    选择预设
                  </button>
                </div>
              )}
              <p className="text-xs text-content-tertiary mt-1">
                选择预置模型或输入自定义模型名称（如公司内部模型代号）
              </p>
            </div>
          </div>
          <TestResult status={llmTest} />
        </div>

        {/* Confluence Config */}
        <div className="bg-white border border-edge rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Confluence 配置</h2>
            <button onClick={() => saveAndTest('confluence')} disabled={confTest.loading || saving}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-hover disabled:opacity-40 transition-colors">
              {confTest.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              保存并测试连接
            </button>
          </div>
          <div className="space-y-4">
            <Field name="confluence_base_url" label="Confluence 地址" placeholder="https://confluence.shopee.io"
              hint="Confluence 实例的根地址（不含 /rest/api 后缀）" />
            <Field name="confluence_token" label="Bearer Token" placeholder="Token..." secret
              hint="个人访问令牌，可在 Confluence 个人设置 → Personal Access Tokens 中创建" />
            <Field name="confluence_space_key" label="默认 Space Key" placeholder="SSCP"
              hint="PRD 同步的默认 Space，格式为大写字母缩写（如 SSCP、DEV）" />
          </div>
          <TestResult status={confTest} />
        </div>

        {/* PRD Template Config */}
        <div className="bg-white border border-edge rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">PRD 模板配置</h2>
            <button onClick={async () => {
              const raw = (settings.prd_template_confluence_id || '').trim();
              if (!raw) { toast('error', '请先填入 Confluence 模板页面链接'); return; }
              setTemplateTest({ loading: true });
              try {
                const res = await fetch(`/api/confluence/resolve-page?input=${encodeURIComponent(raw)}`);
                const data = await res.json();
                if (!res.ok || !data.page_id) throw new Error(data.error || '无法解析该链接');
                const checkRes = await fetch(`/api/confluence/children?page_id=${data.page_id}`);
                if (!checkRes.ok) throw new Error('页面存在但无法读取内容');
                setTemplateTest({ loading: false, result: { success: true, message: `✓ 已识别页面「${data.title || data.page_id}」` } });
              } catch (e) {
                setTemplateTest({ loading: false, result: { success: false, message: e instanceof Error ? e.message : '模板页面不可达' } });
              }
            }} disabled={templateTest.loading}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-hover disabled:opacity-40 transition-colors">
              {templateTest.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              测试拉取模板
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1.5">Confluence 模板页面链接</label>
              <input type="text" value={settings.prd_template_confluence_id || ''}
                onChange={e => update('prd_template_confluence_id', e.target.value)}
                placeholder="粘贴 Confluence 页面 URL，如 https://confluence.shopee.io/display/SPACE/Page+Title"
                className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary" />
              <p className="text-xs text-content-tertiary mt-1">粘贴 Confluence 页面链接作为 PRD 模板（也支持直接填写页面 ID）。留空则使用系统内置默认模板。</p>
            </div>
          </div>
          <TestResult status={templateTest} />
          <p className="text-xs text-content-tertiary mt-3 leading-relaxed">
            在生成 PRD 时，系统会优先使用此 Confluence 页面的内容作为结构参考。如果页面内容获取失败或未填写，将使用内置默认模板。
          </p>
        </div>

        {/* Business Analysis Rules */}
        <div className="bg-white border border-edge rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold">业务分析规则</h2>
              <p className="text-xs text-content-tertiary mt-0.5">上传 Markdown 文档，自定义 LLM 在分析 BRD/FRF 时的侧重方向</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1.5">分析侧重规则（Markdown）</label>
              <textarea
                value={settings.analysis_custom_rules || ''}
                onChange={e => update('analysis_custom_rules', e.target.value)}
                placeholder={"例如：\n- 重点审查运费计算规则是否合理\n- 关注物流时效承诺的可行性\n- 检查是否遗漏了异常包裹的处理流程"}
                rows={6}
                className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary font-mono" />
              <p className="text-xs text-content-tertiary mt-1">这些规则会在业务分析阶段指导 LLM 的分析侧重点</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1.5">或上传 MD 文件</label>
              <label className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-edge rounded-lg cursor-pointer hover:border-primary hover:bg-primary-subtle transition-colors">
                <Upload className="w-4 h-4 text-content-tertiary" />
                <span className="text-sm text-content-secondary">选择 .md 文件上传</span>
                <input type="file" accept=".md,.markdown,.txt" className="hidden" onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = ev => {
                    const text = ev.target?.result as string;
                    if (text) { update('analysis_custom_rules', text); toast('success', `已导入 ${file.name}`); }
                  };
                  reader.readAsText(file);
                  e.target.value = '';
                }} />
              </label>
            </div>
          </div>
        </div>

        {/* Google Workspace Config */}
        <div className="bg-white border border-edge rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Google Workspace 配置</h2>
            <button onClick={() => saveAndTest('google')} disabled={googleTest.loading || saving}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-hover disabled:opacity-40 transition-colors">
              {googleTest.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              保存并测试连接
            </button>
          </div>
          <div className="space-y-4">
            <Field name="google_client_secret_path" label="Client Secret 路径"
              placeholder="~/.config/google/client_secret.json"
              hint="OAuth 2.0 Client Secret 文件路径。在 Google Cloud Console → APIs & Services → Credentials 创建" />
            <Field name="google_oauth_token_path" label="OAuth Token 路径"
              placeholder="~/.config/google/oauth_token.json"
              hint="OAuth Token 文件路径（首次授权后自动生成）。如需重新授权，运行 auth.py 脚本" />
          </div>
          <TestResult status={googleTest} />
          <p className="text-xs text-content-tertiary mt-3 leading-relaxed">
            用于读取 Google Docs 文档内容。首次使用需运行授权：
            <code className="bg-surface-hover px-1.5 py-0.5 rounded text-[11px] mx-1">
              python3.11 ~/.cursor/skills/google-workspace/scripts/auth.py
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}
