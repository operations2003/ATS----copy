'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';
import { atsStore, AuditEvent } from '@/lib/atsStore';
import { fetchApi } from '@/lib/api';

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
    CREATE_JD: 'JD created',
    DELETE_JD: 'JD removed',
    CREATE_USER: 'User created',
    DELETE_USER: 'User deleted',
    JD_EVALUATED_CONSUMED: 'JD evaluated',
    EVALUATION: 'Evaluation',
    PLAN_CHANGE: 'Plan changed',
    JOB_CREATED: 'Requisition Created',
    RESUMES_UPLOADED: 'Resumes Uploaded',
    SCREENING_SAVED: 'Screening Saved',
    SENT_TO_TL_REVIEW: 'Sent to TL Review',
    SCORE_OVERRIDE_APPROVED: 'Override Approved',
    TL_APPROVED: 'TL Approved',
    REQUISITION_REASSIGNED: 'Requisition Reassigned',
    USER_ROLE_UPDATED: 'Role Updated',
  };
  return labels[action] || action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
};

const detailsText = (log: AuditLog) => {
  const d = log.details || {};
  if (d.position) return `${log.action === 'DELETE_JD' ? 'Removed' : 'Created'} requisition “${d.position}”${d.client ? ` for ${d.client}` : ''}${d.hadEvaluations ? ' (had candidate activity)' : ''}`;
  if (d.createdUserEmail) return `Created team member ${d.createdUserEmail}${d.role ? ` · ${d.role}` : ''}`;
  if (d.deletedUserEmail) return `Deleted team member ${d.deletedUserEmail}${d.role ? ` · ${d.role}` : ''}`;
  if (d.description) return String(d.description);
  if (d.reason) return String(d.reason);
  if (log.targetType) return `${log.targetType}${log.targetId ? ` · ${log.targetId}` : ''}`;
  return 'Workspace activity recorded';
};

const formatLocalEvent = (evt: AuditEvent): AuditLog => {
  let createdIso = new Date().toISOString();
  if (evt.timestamp) {
    createdIso = new Date(evt.timestamp).toISOString();
  } else if (evt.time && !isNaN(Date.parse(evt.time))) {
    createdIso = new Date(evt.time).toISOString();
  }
  return {
    id: evt.id,
    action: evt.action,
    targetType: evt.target,
    targetId: null,
    details: { description: evt.detail },
    createdAt: createdIso,
    user: { name: evt.user, email: evt.user },
    organization: { name: 'TaskNera Workspace' },
  };
};

export default function AuditPage() {
  const { token, user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadLogs = async () => {
      setLoading(true);
      setError('');

      let serverLogs: AuditLog[] = [];

      try {
        const data = await fetchApi<{ success?: boolean; logs?: AuditLog[] }>(
          '/users/audit-logs',
          {},
          token
        );
        if (data && Array.isArray(data.logs)) {
          serverLogs = data.logs;
        }
      } catch (err: any) {
        // Safe graceful degradation: if backend is unreachable or returns non-JSON, do not crash
        console.warn('[AuditPage] Server audit logs fetch notice:', err?.message || err);
      }

      // Convert local atsStore audit events to AuditLog format
      const localEvents = atsStore.getAuditEvents() || [];
      const localLogs: AuditLog[] = localEvents.map(formatLocalEvent);

      // Merge server logs and local logs without duplicate IDs
      const combined: AuditLog[] = [...serverLogs];
      const existingIds = new Set(serverLogs.map(l => l.id));
      for (const loc of localLogs) {
        if (!existingIds.has(loc.id)) {
          combined.push(loc);
          existingIds.add(loc.id);
        }
      }

      // Sort newest first
      combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (!cancelled) {
        setLogs(combined);
        setLoading(false);
      }
    };

    loadLogs();

    // Subscribe to real-time local workspace events (e.g. creating requisitions, uploading CVs)
    const unsubscribe = atsStore.subscribe(() => {
      const currentLocal = (atsStore.getAuditEvents() || []).map(formatLocalEvent);
      setLogs(prev => {
        const prevIds = new Set(prev.map(p => p.id));
        const added = currentLocal.filter(l => !prevIds.has(l.id));
        if (added.length === 0) return prev;
        const merged = [...added, ...prev];
        merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return merged;
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [token]);

  const actions = useMemo(() => Array.from(new Set(logs.map(log => log.action))).sort(), [logs]);
  const visibleLogs = useMemo(() => {
    return actionFilter === 'ALL' ? logs : logs.filter(log => log.action === actionFilter);
  }, [actionFilter, logs]);

  return (
    <div className="min-h-screen bg-[#F7F9FC] text-slate-900 flex flex-col font-sans">
      <Header />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-14">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-slate-500">Governance</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Security &amp; Audit Logs</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Workspace actions are recorded here, including job description, screening, and team member changes. Audit entries cannot be edited or deleted.
            </p>
          </div>
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="w-full sm:w-64 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
          >
            <option value="ALL">All actions ({logs.length})</option>
            {actions.map(action => (
              <option key={action} value={action}>
                {actionLabel(action)}
              </option>
            ))}
          </select>
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-5 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Audit trail</h2>
              <p className="mt-1 text-sm text-slate-500">
                {loading
                  ? 'Loading recorded activity…'
                  : `${visibleLogs.length} recorded ${visibleLogs.length === 1 ? 'entry' : 'entries'} in this workspace`}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Workspace Audit Active
            </span>
          </div>

          {error && (
            <div role="alert" className="m-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-bold">When</th>
                  <th className="px-5 py-3 font-bold">Action</th>
                  <th className="px-5 py-3 font-bold">Detail</th>
                  <th className="px-5 py-3 font-bold">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!loading && !error && visibleLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-slate-500">
                      No audit activity recorded yet. Creating or removing a JD, uploading resumes, or team member actions will appear here.
                    </td>
                  </tr>
                )}
                {visibleLogs.map(log => {
                  const logDate = new Date(log.createdAt);
                  const isValidDate = !isNaN(logDate.getTime());
                  const formattedDate = isValidDate
                    ? logDate.toLocaleString(undefined, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Recent activity';

                  return (
                    <tr key={log.id} className="align-top hover:bg-slate-50/70 transition-colors">
                      <td className="whitespace-nowrap px-5 py-4 text-slate-500 text-xs font-medium">
                        {formattedDate}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-slate-700 border border-slate-200/60">
                          {actionLabel(log.action)}
                        </span>
                      </td>
                      <td className="max-w-2xl px-5 py-4 text-slate-700 text-sm">
                        {detailsText(log)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-500 text-xs">
                        <span className="font-medium text-slate-700">
                          {log.user?.email || log.user?.name || user?.email || 'Workspace System'}
                        </span>
                        {log.organization?.name && (
                          <span className="block text-[11px] text-slate-400">
                            {log.organization.name}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
