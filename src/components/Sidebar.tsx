'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Box, Layers, FolderKanban, Sparkles, Settings,
  ChevronDown, ChevronRight, Plus, Search, AlertTriangle, MessageSquare,
} from 'lucide-react';
import MagiLogo from '@/components/MagiLogo';
import Modal from '@/components/Modal';

interface ProjectItem { id: string; name: string; status: string; module_id: string | null }
interface ModuleItem { id: string; name: string; system_id: string }
interface SystemItem { id: string; name: string; modules: ModuleItem[] }

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [systems, setSystems] = useState<SystemItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [expandedSystems, setExpandedSystems] = useState<Set<string>>(new Set());
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateSystem, setShowCreateSystem] = useState(false);
  const [newSystemName, setNewSystemName] = useState('');

  const load = useCallback(() => {
    fetch('/api/systems').then(r => r.json()).then((data: SystemItem[]) => setSystems(data)).catch(() => {});
    fetch('/api/projects').then(r => r.json()).then((data: ProjectItem[]) => setProjects(data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load, pathname]);

  useEffect(() => {
    const sysMatch = pathname.match(/\/systems\/([^/]+)/);
    if (sysMatch) setExpandedSystems(prev => new Set(prev).add(sysMatch[1]));
    const modMatch = pathname.match(/\/modules\/([^/]+)/);
    if (modMatch) setExpandedModules(prev => new Set(prev).add(modMatch[1]));
  }, [pathname]);

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  };

  const createSystem = async () => {
    if (!newSystemName.trim()) return;
    const res = await fetch('/api/systems', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newSystemName }) });
    const sys = await res.json();
    setNewSystemName('');
    setShowCreateSystem(false);
    load();
    router.push(`/systems/${sys.id}`);
  };

  const q = searchQuery.toLowerCase().trim();
  const filteredSystems = q
    ? systems.filter(sys =>
        sys.name.toLowerCase().includes(q) ||
        sys.modules.some(m => m.name.toLowerCase().includes(q)) ||
        projects.some(p => p.name.toLowerCase().includes(q) && (p.module_id && sys.modules.some(m => m.id === p.module_id)))
      )
    : systems;
  const filteredRecentProjects = q
    ? projects.filter(p => p.name.toLowerCase().includes(q)).slice(0, 5)
    : projects.slice(0, 5);

  const recentProjects = filteredRecentProjects;
  const projectsByModule = projects.reduce<Record<string, ProjectItem[]>>((acc, p) => {
    const key = p.module_id || '_none';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const isActive = (href: string) => pathname === href;
  const isActivePrefix = (prefix: string) => pathname.startsWith(prefix);

  const linkClass = (active: boolean) =>
    `flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] transition-all cursor-pointer ${
      active ? 'bg-primary-subtle text-primary font-medium' : 'text-content-secondary hover:bg-surface-hover hover:text-content'
    }`;

  return (
    <aside className="w-[252px] min-h-screen bg-surface border-r border-edge flex flex-col select-none">
      {/* Logo */}
      <div className="h-[52px] flex items-center px-4 border-b border-edge">
        <MagiLogo className="w-6 h-6 mr-2" />
        <span className="text-[15px] font-bold tracking-wider text-content">MAGI</span>
        <span className="ml-2 text-[10px] px-1.5 py-[1px] rounded bg-primary-subtle text-primary font-semibold tracking-wide">v1.0</span>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-tertiary" />
          <input
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索系统、模块或项目…"
            className="w-full bg-surface-hover border border-edge rounded-lg pl-8 pr-3 py-[6px] text-xs text-content placeholder:text-content-tertiary"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
        {/* Dashboard */}
        <div>
          <Link href="/" className={linkClass(isActive('/'))}>
            <LayoutDashboard className="w-4 h-4" />
            仪表板
          </Link>
        </div>

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <div>
            <div className="px-3 mb-1.5 text-[11px] font-medium text-content-tertiary uppercase tracking-wider">最近项目</div>
            <div className="space-y-[2px]">
              {recentProjects.map(p => (
                <Link key={p.id} href={`/projects/${p.id}`}
                  className={`flex items-center gap-2 px-3 py-[6px] rounded-lg text-[13px] transition-all ${
                    isActive(`/projects/${p.id}`) ? 'bg-primary-subtle text-primary font-medium' : 'text-content-secondary hover:bg-surface-hover hover:text-content'
                  }`}>
                  <FolderKanban className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  <span className="truncate">{p.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* My Systems */}
        <div>
          <div className="px-3 mb-1.5 text-[11px] font-medium text-content-tertiary uppercase tracking-wider">我的系统</div>
          <div className="space-y-[1px]">
            {filteredSystems.map(sys => {
              const sysExpanded = expandedSystems.has(sys.id);
              const sysActive = isActivePrefix(`/systems/${sys.id}`);
              return (
                <div key={sys.id}>
                  {/* System Row */}
                  <div className={`flex items-center rounded-lg transition-all ${sysActive && !sysExpanded ? 'bg-primary-subtle' : 'hover:bg-surface-hover'}`}>
                    <button onClick={() => toggle(expandedSystems, sys.id, setExpandedSystems)}
                      className="pl-2 pr-0.5 py-[7px] text-content-tertiary hover:text-content">
                      {sysExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    <Link href={`/systems/${sys.id}`}
                      className={`flex-1 flex items-center gap-2 pr-3 py-[7px] text-[13px] ${sysActive ? 'text-primary font-medium' : 'text-content-secondary hover:text-content'}`}>
                      <Box className="w-3.5 h-3.5 text-primary opacity-70" />
                      <span className="truncate">{sys.name}</span>
                    </Link>
                  </div>

                  {/* Modules */}
                  {sysExpanded && (
                    <div className="ml-3 pl-3 border-l border-edge-light">
                      {sys.modules.map(mod => {
                        const modExpanded = expandedModules.has(mod.id);
                        const modActive = isActivePrefix(`/systems/${sys.id}/modules/${mod.id}`);
                        const modProjects = projectsByModule[mod.id] || [];
                        return (
                          <div key={mod.id}>
                            <div className={`flex items-center rounded-lg transition-all ${modActive && !modExpanded ? 'bg-primary-subtle' : 'hover:bg-surface-hover'}`}>
                              <button onClick={() => toggle(expandedModules, mod.id, setExpandedModules)}
                                className="pl-1 pr-0.5 py-[6px] text-content-tertiary hover:text-content">
                                {modExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              </button>
                              <Link href={`/systems/${sys.id}/modules/${mod.id}`}
                                className={`flex-1 flex items-center gap-1.5 pr-3 py-[6px] text-[12px] ${modActive ? 'text-primary font-medium' : 'text-content-secondary hover:text-content'}`}>
                                <Layers className="w-3 h-3 opacity-60" />
                                <span className="truncate">{mod.name}</span>
                              </Link>
                            </div>
                            {modExpanded && modProjects.length > 0 && (
                              <div className="ml-2.5 pl-2.5 border-l border-edge-light">
                                {modProjects.map(proj => (
                                  <Link key={proj.id} href={`/projects/${proj.id}`}
                                    className={`flex items-center gap-1.5 px-2 py-[5px] rounded text-[12px] transition-all ${
                                      isActive(`/projects/${proj.id}`) ? 'text-primary font-medium bg-primary-subtle' : 'text-content-tertiary hover:text-content hover:bg-surface-hover'
                                    }`}>
                                    <FolderKanban className="w-3 h-3 shrink-0 opacity-50" />
                                    <span className="truncate">{proj.name}</span>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {sys.modules.length === 0 && (
                        <div className="text-[11px] text-content-tertiary px-2 py-1.5 italic">暂无模块</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Create System Button */}
          <button onClick={() => setShowCreateSystem(true)}
            className="w-full flex items-center gap-2 px-3 py-[7px] mt-1 rounded-lg text-[13px] text-primary hover:bg-primary-subtle transition-all">
            <Plus className="w-3.5 h-3.5" /> 新建系统
          </button>
        </div>

        {/* Bottom Nav */}
        <div>
          <div className="px-3 mb-1.5 text-[11px] font-medium text-content-tertiary uppercase tracking-wider">系统管理</div>
          <div className="space-y-[2px]">
            <Link href="/error-logs" className={linkClass(isActive('/error-logs'))}>
              <AlertTriangle className="w-4 h-4" /> 错误日志
            </Link>
            <Link href="/llm-logs" className={linkClass(isActive('/llm-logs'))}>
              <MessageSquare className="w-4 h-4" /> 模型交互日志
            </Link>
            <Link href="/skills" className={linkClass(isActive('/skills'))}>
              <Sparkles className="w-4 h-4" /> 技能管理
            </Link>
            <Link href="/settings" className={linkClass(isActive('/settings'))}>
              <Settings className="w-4 h-4" /> 设置
            </Link>
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-edge">
        <div className="text-[11px] text-content-tertiary">MAGI v1.0 · 本地运行</div>
      </div>

      {/* Create System Modal */}
      <Modal open={showCreateSystem} onClose={() => setShowCreateSystem(false)} title="新建系统">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1.5">系统名称</label>
            <input value={newSystemName} onChange={e => setNewSystemName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createSystem()}
              placeholder="例如：ISC、OMS、WMS" autoFocus
              className="w-full bg-white border border-edge rounded-lg px-3 py-2.5 text-sm text-content placeholder:text-content-tertiary" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowCreateSystem(false)} className="px-4 py-2 text-sm text-content-secondary hover:text-content">取消</button>
            <button onClick={createSystem} disabled={!newSystemName.trim()} className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors">创建</button>
          </div>
        </div>
      </Modal>
    </aside>
  );
}
