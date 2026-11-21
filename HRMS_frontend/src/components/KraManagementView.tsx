import React, { useState } from 'react';
import { KraTemplate, Kra, Department, Employee } from '../types';
import {
  Plus,
  Search,
  FileText,
  Target,
  Users,
  ChevronRight,
  Edit2,
  Library,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { Button } from './ui/Button';
import { cn } from '../utils/cn';

interface KraManagementViewProps {
  templates: KraTemplate[];
  kras: Kra[];
  departments: Department[];
  employees: Employee[];
  canManage: boolean;
  onOpenCreateTemplate: () => void;
  onOpenCreateBlueprint?: () => void;
  onOpenEditTemplate: (template: KraTemplate) => void;
  onOpenLibrary: () => void;
  onQuickAssign: (employee: Employee) => void;
}

export const KraManagementView: React.FC<KraManagementViewProps> = ({
  templates,
  kras,
  departments,
  employees,
  canManage,
  onOpenCreateTemplate,
  onOpenCreateBlueprint,
  onOpenEditTemplate,
  onOpenLibrary,
  onQuickAssign,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'TEMPLATES' | 'LIBRARY' | 'ASSIGNMENTS'>('TEMPLATES');
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredTemplates = templates.filter((t) => {
    if (selectedDept !== 'ALL' && t.departmentId !== selectedDept) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const title = t.title || t.name || '';
      return (
        title.toLowerCase().includes(q) ||
        (t.departmentName && t.departmentName.toLowerCase().includes(q)) ||
        (t.designationName && t.designationName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const unassignedCount = employees.filter((e) => !e.currentKraTemplateId && e.status !== 'INACTIVE').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="KRA templates"
        description="Standard key result areas, the templates built from them, and how each one is scored. A template's weights always add up to 100%."
        actions={
          <>
            <Button id="btn-open-kra-library" icon={Library} onClick={onOpenLibrary}>
              KRA library ({kras.length})
            </Button>
            {canManage && (
              <>
                {onOpenCreateBlueprint && (
                  <Button
                    id="btn-create-blueprint-template"
                    icon={FileText}
                    onClick={onOpenCreateBlueprint}
                  >
                    Create template
                  </Button>
                )}
                <Button id="btn-create-kra-template" variant="primary" icon={Plus} onClick={onOpenCreateTemplate}>
                  Assign KRAs
                </Button>
              </>
            )}
          </>
        }
      />

      {/* Sub navigation pills */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveSubTab('TEMPLATES')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            activeSubTab === 'TEMPLATES'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          KRA Templates ({templates.length})
        </button>

        <button
          onClick={() => setActiveSubTab('LIBRARY')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            activeSubTab === 'LIBRARY'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Target className="w-3.5 h-3.5" />
          Master Catalog ({kras.length})
        </button>

        <button
          onClick={() => setActiveSubTab('ASSIGNMENTS')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
            activeSubTab === 'ASSIGNMENTS'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Employee Role Mapping ({employees.length})
        </button>
      </div>

      {/* VIEW: TEMPLATES — a list; opening a row shows its KRAs underneath */}
      {activeSubTab === 'TEMPLATES' && (
        <div className="space-y-4">
          {/* Search & Department Filter */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates…"
                aria-label="Search templates"
                className="w-full h-8 pl-8 pr-3 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600"
              />
            </div>

            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              aria-label="Department"
              className="h-8 text-xs px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-200 font-medium focus:outline-none cursor-pointer"
            >
              <option value="ALL">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name || d.code}</option>
              ))}
            </select>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {filteredTemplates.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">No KRA templates found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                    <tr>
                      <th className="py-3 px-4 text-left font-medium">Template</th>
                      <th className="py-3 px-4 text-left font-medium">For</th>
                      <th className="py-3 px-4 text-left font-medium">Type</th>
                      <th className="py-3 px-4 text-right font-medium">KRAs</th>
                      <th className="py-3 px-4 text-right font-medium">Total weight</th>
                      <th className="py-3 px-4 text-left font-medium">Updated</th>
                      {canManage && <th className="py-3 px-4 text-right font-medium">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {filteredTemplates.map((tmpl) => {
                      const isOpen = expandedId === tmpl.id;
                      const toggle = () => setExpandedId(isOpen ? null : tmpl.id);
                      const totalWeight = tmpl.items.reduce((sum, it) => sum + (Number(it.weight) || 0), 0);
                      const weightOk = Math.round(totalWeight) === 100;
                      const updated = tmpl.updatedAt || tmpl.createdAt;
                      const forLabel = tmpl.employeeId
                        ? tmpl.employeeName || '—'
                        : [tmpl.departmentName || 'All departments', tmpl.designationName].filter(Boolean).join(' · ');
                      return (
                        <React.Fragment key={tmpl.id}>
                          <tr
                            onClick={toggle}
                            className={cn(
                              'cursor-pointer transition-colors',
                              isOpen ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            )}
                          >
                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                              <button
                                type="button"
                                aria-expanded={isOpen}
                                aria-controls={`kra-template-${tmpl.id}`}
                                onClick={(e) => { e.stopPropagation(); toggle(); }}
                                className="inline-flex items-center gap-1.5 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
                              >
                                <ChevronRight
                                  className={cn('w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform motion-reduce:transition-none', isOpen && 'rotate-90 text-indigo-600 dark:text-indigo-400')}
                                  aria-hidden="true"
                                />
                                {tmpl.title || tmpl.name}
                              </button>
                            </td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{forLabel}</td>
                            <td className="py-3 px-4">
                              {tmpl.employeeId ? (
                                <span
                                  title="This employee's own scorecard; not shared with anyone else"
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 whitespace-nowrap"
                                >
                                  <UserCheck className="w-3 h-3" aria-hidden="true" /> Employee-owned
                                </span>
                              ) : (
                                <span
                                  title="A shared template; each assignment makes the employee their own copy"
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 whitespace-nowrap"
                                >
                                  <Library className="w-3 h-3" aria-hidden="true" /> Shared
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums">{tmpl.items.length}</td>
                            <td className={cn('py-3 px-4 text-right tabular-nums font-medium', weightOk ? 'text-slate-900 dark:text-white' : 'text-amber-700 dark:text-amber-400')}>
                              {totalWeight}%
                            </td>
                            <td className="py-3 px-4 text-slate-500 dark:text-slate-400 tabular-nums">
                              {updated ? new Date(updated).toLocaleDateString('en-IN') : '—'}
                            </td>
                            {canManage && (
                              <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-end">
                                  <Button variant="ghost" icon={Edit2} aria-label={`Edit ${tmpl.title || tmpl.name}`} title="Edit template" onClick={() => onOpenEditTemplate(tmpl)} />
                                </div>
                              </td>
                            )}
                          </tr>
                          {isOpen && (
                            <tr id={`kra-template-${tmpl.id}`}>
                              <td colSpan={canManage ? 7 : 6} className="p-0">
                                <div className="px-4 sm:px-6 py-4 bg-slate-50/70 dark:bg-slate-850/60 border-t border-slate-100 dark:border-slate-800 space-y-3">
                                  {tmpl.items.length ? (
                                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                      <table className="w-full text-xs">
                                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                          <tr>
                                            <th className="py-2 px-3 text-left font-medium w-8">#</th>
                                            <th className="py-2 px-3 text-left font-medium">Key result area</th>
                                            <th className="py-2 px-3 text-left font-medium">Target</th>
                                            <th className="py-2 px-3 text-right font-medium">Weight</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                                          {tmpl.items.map((item, idx) => (
                                            <tr key={item.id || idx} className="align-top">
                                              <td className="py-2 px-3 text-slate-500 dark:text-slate-400 tabular-nums">{idx + 1}</td>
                                              <td className="py-2 px-3">
                                                <div className="font-medium text-slate-900 dark:text-white">{item.title || item.kraName}</div>
                                                {item.description && (
                                                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{item.description}</div>
                                                )}
                                              </td>
                                              <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{item.target || '—'}</td>
                                              <td className="py-2 px-3 text-right font-semibold tabular-nums">{item.weight}%</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-slate-500 dark:text-slate-400">No KRAs in this template yet.</p>
                                  )}
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {weightOk
                                      ? 'Weights add up to 100%.'
                                      : `Weights add up to ${totalWeight}%; edit the template so they total 100%.`}
                                    {' '}Each KRA is scored 1–5.
                                  </p>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW: MASTER CATALOG (LIBRARY) */}
      {activeSubTab === 'LIBRARY' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {kras.map((kra) => (
              <div
                key={kra.id}
                className="bg-white dark:bg-[#121215] p-4 rounded-xl border border-slate-200/80 dark:border-white/[0.08] shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.4)] hover:border-slate-300 dark:hover:border-white/[0.15] transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white line-clamp-1">{kra.title}</h4>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                      {kra.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3 mb-3 leading-relaxed">
                    {kra.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="tabular-nums text-[11px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-medium">
                    {kra.metricType}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">
                    {kra.departmentName || 'Universal Organization'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW: EMPLOYEE ASSIGNMENTS */}
      {activeSubTab === 'ASSIGNMENTS' && (
        <div className="bg-white dark:bg-[#121215] rounded-xl border border-slate-200/80 dark:border-white/[0.08] overflow-hidden shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-[#18181d]/50 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-800 dark:text-white">
                Employee role & KRA assignment roster
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Each employee's KRA scorecard is exclusive to them — no defaults or shared fallbacks.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {unassignedCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-1 rounded-lg border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {unassignedCount} without a KRA
                </span>
              )}
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-[#18181d] px-3 py-1 rounded-lg border border-slate-200 dark:border-white/[0.08]">
                {employees.length} Employees Active
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50/95 dark:bg-[#18181d]/95 text-slate-600 dark:text-slate-300 border-b border-slate-200/80 dark:border-white/[0.06] font-semibold text-[11px]">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department & designation</th>
                  <th className="py-3 px-4">Appraisal cycle</th>
                  <th className="py-3 px-4">Current KRA scorecard</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04] text-slate-700 dark:text-slate-300">
                {employees.map((emp) => {
                  // Only the employee's own currentKraTemplateId counts as "assigned" — a shared
                  // department/designation template must never be inferred as a fallback, since
                  // every employee's scorecard is now exclusive to them.
                  const assignedTemplate = templates.find((t) => t.id === emp.currentKraTemplateId);
                  const hasNoKra = !emp.currentKraTemplateId;

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{emp.name}</div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">{emp.employeeCode} • {emp.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{emp.designationName || 'Specialist'}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{emp.departmentName}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
                          style={{ backgroundColor: emp.cycleColor || '#1e3a8a' }}
                        >
                          Cycle {emp.cycleCode}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {assignedTemplate ? (
                          <div className="inline-flex items-center gap-1.5 text-blue-700 dark:text-blue-400 font-medium">
                            <FileText className="w-3.5 h-3.5" />
                            <span>{assignedTemplate.title || assignedTemplate.name}</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            No KRA assigned
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800">
                          {emp.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {canManage && hasNoKra && emp.status !== 'INACTIVE' && (
                          <button
                            onClick={() => onQuickAssign(emp)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 px-2 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            Assign KRA
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
