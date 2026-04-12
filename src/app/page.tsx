'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderKanban, ArrowRight, Clock, Loader2 } from 'lucide-react';
import { PROJECT_STATUS_LABELS } from '@/types';
import type { Project } from '@/types';

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(setProjects).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const statusDot: Record<string, string> = {
    draft: 'bg-content-tertiary', analyzing: 'bg-caution', analyzed: 'bg-primary',
    hld_draft: 'bg-purple-400', hld_confirmed: 'bg-purple-600',
    prd_draft: 'bg-purple', prd_final: 'bg-positive',
  };

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-bold text-content">MAGI</h1>
        <p className="text-sm text-content-secondary mt-1">从左侧导航选择系统或项目开始工作，或从下方快速访问最近项目</p>
      </div>

      {/* Quick Guide */}
      {projects.length === 0 && (
        <div className="bg-white border border-edge rounded-2xl p-8 mb-8">
          <h2 className="text-base font-semibold mb-4">快速开始</h2>
          <div className="grid grid-cols-4 gap-4">
            {[
              { step: '1', title: '创建系统', desc: '在左侧点击"新建系统"' },
              { step: '2', title: '添加模块', desc: '进入系统后创建模块' },
              { step: '3', title: '创建项目', desc: '在模块下新建需求项目' },
              { step: '4', title: '生成 PRD', desc: '上传 BRD → 分析 → 生成' },
            ].map(s => (
              <div key={s.step} className="relative">
                <div className="w-7 h-7 rounded-full bg-primary-subtle text-primary text-xs font-bold flex items-center justify-center mb-2.5">{s.step}</div>
                <div className="text-sm font-medium text-content">{s.title}</div>
                <div className="text-xs text-content-tertiary mt-0.5">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Projects */}
      {projects.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-content-tertiary" /> 最近项目
            </h2>
            <span className="text-xs text-content-tertiary">{projects.length} 个项目</span>
          </div>
          <div className="bg-white border border-edge rounded-2xl overflow-hidden">
            {projects.slice(0, 10).map((p, i) => (
              <Link key={p.id} href={`/projects/${p.id}`}
                className={`flex items-center gap-4 px-5 py-3.5 hover:bg-surface-hover transition-colors ${i > 0 ? 'border-t border-edge-light' : ''}`}>
                <FolderKanban className="w-4 h-4 text-content-tertiary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-content truncate">{p.name}</div>
                  <div className="text-xs text-content-tertiary mt-0.5">
                    {p.system_name}{p.module_name ? ` / ${p.module_name}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${statusDot[p.status] || 'bg-content-tertiary'}`} />
                  <span className="text-xs text-content-secondary">{PROJECT_STATUS_LABELS[p.status]}</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-content-tertiary" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
