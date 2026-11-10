'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';

type AuditLog = {
  id: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, any> | null;
  createdAt: string;
  user?: { name?: string | null; email?: string | null } | null;
  organization?: { name?: string | null } | null;
};

const actionLabel = (action: string) => {
  const labels: Record<string, string> = {
    CREATE_JD: 'JD created', DELETE_JD: 'JD removed', CREATE_USER: 'User created', DELETE_USER: 'User deleted',
    JD_EVALUATED_CONSUMED: 'JD evaluated', EVALUATION: 'Evaluation', PLAN_CHANGE: 'Plan changed',
  };
  return labels[action] || action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
};

const detailsText = (log: AuditLog) => {
  const d = log.details || {};
  if (d.position) return `${log.action === 'DELETE_JD' ? 'Removed' : 'Created'} requisition “${d.position}”${d.client ? ` for ${d.client}` : ''}${d.hadEvaluations ? ' (had candidate activity)' : ''}`;
  if (d.createdUserEmail) return `Created team member ${d.createdUserEmail}${d.role ? ` · ${d.role}` : ''}`;
  if (d.deletedUserEmail) return `Deleted team member ${d.deletedUserEmail}${d.role ? ` · ${d.role}` : ''}`;
  if (d.reason) return String(d.reason);
  if (d.description) return String(d.description);
  if (log.targetType) return `${log.targetType}${log.targetId ? ` · ${log.targetId}` : ''}`;
  return 'Workspace activity recorded';
};

export default function AuditPage() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadLogs = async () => {
      setLoading(true); setError('');
      try {
        const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
        const response = await fetch(`${api}/users/audit-logs`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load audit activity.');
        if (!cancelled) setLogs(Array.isArray(data.logs) ? data.logs : []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Unable to load audit activity.');
      } finally { if (!cancelled) setLoading(false); }
    };
    loadLogs();
    return () => { cancelled = true; };
  }, [token]);

  const actions = useMemo(() => Array.from(new Set(logs.map(log => log.action))).sort(), [logs]);
  const visibleLogs = actionFilter === 'ALL' ? logs : logs.filter(log => log.action === actionFilter);

  return <div className="min-h-screen bg-[#F7F9FC] text-slate-900 flex flex-col font-sans"><Header />
    <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-14">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-slate-500">Governance</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight">Security &amp; Audit Logs</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Workspace actions are recorded here, including job description and team member changes. Audit entries cannot be edited or deleted.</p></div>
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="w-full sm:w-64 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-200">
          <option value="ALL">All actions</option>{actions.map(action => <option key={action} value={action}>{actionLabel(action)}</option>)}
        </select>
      </div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5"><h2 className="font-semibold">Audit trail</h2><p className="mt-1 text-sm text-slate-500">{loading ? 'Loading recorded activity…' : `${visibleLogs.length} recorded ${visibleLogs.length === 1 ? 'entry' : 'entries'} in this workspace`}</p></div>
        {error && <div role="alert" className="m-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3 font-bold">When</th><th className="px-5 py-3 font-bold">Action</th><th className="px-5 py-3 font-bold">Detail</th><th className="px-5 py-3 font-bold">Actor</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && !error && visibleLogs.length === 0 && <tr><td colSpan={4} className="px-5 py-12 text-center text-slate-500">No audit activity recorded yet. Creating or removing a JD or team member will appear here.</td></tr>}
              {visibleLogs.map(log => <tr key={log.id} className="align-top hover:bg-slate-50/70"><td className="whitespace-nowrap px-5 py-4 text-slate-500">{new Date(log.createdAt).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td className="px-5 py-4"><span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">{actionLabel(log.action)}</span></td><td className="max-w-2xl px-5 py-4 text-slate-700">{detailsText(log)}</td><td className="whitespace-nowrap px-5 py-4 text-slate-500">{log.user?.email || log.user?.name || 'System'}{log.organization?.name ? <span className="ml-2 text-xs text-slate-400">{log.organization.name}</span> : null}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </main><Footer /></div>;
}
