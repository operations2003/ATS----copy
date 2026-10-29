'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface ClientShareManagerModalProps {
  jobId: string;
  jobPosition?: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenCreateModal?: () => void;
}

export default function ClientShareManagerModal({
  jobId,
  jobPosition = 'Job Requisition',
  isOpen,
  onClose,
  onOpenCreateModal,
}: ClientShareManagerModalProps) {
  const [shares, setShares] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'links' | 'activities'>('links');
  const [selectedShare, setSelectedShare] = useState<any | null>(null);
  const [actionMsg, setActionMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchSharesAndActivities = useCallback(async () => {
    if (!jobId || !isOpen) return;
    try {
      setIsLoading(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

      const [sharesRes, actRes] = await Promise.all([
        fetch(`${backendUrl}/jobs/${jobId}/client-shares`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        }),
        fetch(`${backendUrl}/jobs/${jobId}/candidate-activities`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        }),
      ]);

      if (sharesRes.ok) {
        const data = await sharesRes.json();
        setShares(data.shares || []);
      }

      if (actRes.ok) {
        const actData = await actRes.json();
        setActivities(actData.activities || []);
      }
    } catch (err: any) {
      console.warn('Failed to load client shares:', err);
    } finally {
      setIsLoading(false);
    }
  }, [jobId, isOpen]);

  useEffect(() => {
    fetchSharesAndActivities();
  }, [fetchSharesAndActivities]);

  if (!isOpen) return null;

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMsg({ text, type });
    setTimeout(() => setActionMsg(null), 3000);
  };

  const handleCopyLink = (share: any) => {
    const raw = share.rawToken || share.tokenHash;
    const url = typeof window !== 'undefined'
      ? `${window.location.origin}/share/${raw}`
      : `/share/${raw}`;
    navigator.clipboard.writeText(url);
    setCopiedId(share.id);
    showNotification('Link copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleRevoke = async (share: any) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const newStatus = share.status === 'active' ? 'revoked' : 'active';

      const res = await fetch(`${backendUrl}/jobs/${jobId}/client-shares/${share.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        showNotification(`Link successfully ${newStatus === 'revoked' ? 'revoked' : 'reactivated'}.`);
        fetchSharesAndActivities();
      } else {
        const data = await res.json();
        showNotification(data.error || 'Failed to update link status', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'Error updating status', 'error');
    }
  };

  const handleRegenerate = async (share: any) => {
    if (!confirm('Regenerating this link will invalidate the existing URL. Proceed?')) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

      const res = await fetch(`${backendUrl}/jobs/${jobId}/client-shares/${share.id}/regenerate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (res.ok) {
        showNotification('New link generated! Old URL has been invalidated.');
        fetchSharesAndActivities();
      } else {
        const data = await res.json();
        showNotification(data.error || 'Failed to regenerate link', 'error');
      }
    } catch (err: any) {
      showNotification(err.message || 'Error regenerating link', 'error');
    }
  };

  const handleRemoveCandidate = async (shareId: string, candidateId: string) => {
    if (!confirm('Remove this candidate from the client sharing link? The client will immediately lose access.')) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

      const res = await fetch(`${backendUrl}/jobs/${jobId}/client-shares/${shareId}/candidates/${candidateId}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (res.ok) {
        showNotification('Candidate removed from sharing link.');
        fetchSharesAndActivities();
      }
    } catch (err: any) {
      showNotification(err.message || 'Error removing candidate', 'error');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Selected':
      case 'Joined':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Offered':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'Interview Scheduled':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Interview Completed':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Offer Declined':
      case 'On Hold':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Client Shared Links
            </h2>
            <p className="text-xs text-slate-500">
              {jobPosition}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onOpenCreateModal && (
              <button
                onClick={() => {
                  onClose();
                  onOpenCreateModal();
                }}
                className="px-3 py-1.5 bg-brand-orange hover:bg-brand-orange-hover text-white rounded-xl text-xs font-bold transition-all shadow-orange cursor-pointer flex items-center gap-1.5"
              >
                <span>+</span>
                <span>New Link</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Selector & Toast */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('links')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'links'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Links ({shares.length})
            </button>
            <button
              onClick={() => setActiveTab('activities')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'activities'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>Recent Activity</span>
              {activities.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-brand-orange text-white text-[10px] flex items-center justify-center font-bold">
                  {activities.length}
                </span>
              )}
            </button>
          </div>

          {actionMsg && (
            <div
              className={`px-3 py-1 rounded-xl text-xs font-bold animate-in fade-in ${
                actionMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {actionMsg.text}
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {isLoading ? (
            <div className="text-center py-12 text-xs font-bold text-slate-400">
              <span className="animate-spin inline-block mr-2">⏳</span>
              Loading client sharing links and interview activity...
            </div>
          ) : activeTab === 'links' ? (
            /* Links List */
            shares.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-2xl space-y-3">
                <span className="text-3xl">🔗</span>
                <div className="text-sm font-bold text-slate-800">No Client Sharing Links Yet</div>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Select candidates from the candidate table and click "Create Client Sharing Link" to generate a secure client portal.
                </p>
                {onOpenCreateModal && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenCreateModal();
                    }}
                    className="px-4 py-2 bg-brand-orange text-white text-xs font-bold rounded-xl shadow-orange cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span>Create Your First Client Link</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {shares.map(share => {
                  const raw = share.rawToken || share.tokenHash;
                  const portalUrl = typeof window !== 'undefined'
                    ? `${window.location.origin}/share/${raw}`
                    : `/share/${raw}`;

                  const isExpired = share.isExpired || (share.expiresAt && new Date(share.expiresAt) < new Date());
                  const isRevoked = share.status === 'revoked';

                  return (
                    <div
                      key={share.id}
                      className="border border-slate-200 rounded-2xl bg-white shadow-xs p-5 space-y-4 hover:border-slate-300 transition-all"
                    >
                      {/* Link Row Header */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                            isRevoked
                              ? 'bg-rose-50 text-rose-600'
                              : isExpired
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-emerald-50 text-emerald-600'
                          }`}>
                            {isRevoked ? '⛔' : isExpired ? '🕒' : '🔗'}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-black text-slate-900">
                                {share.clientName || 'Hiring Client Review'}
                              </h3>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                                  isRevoked
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : isExpired
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                {isRevoked ? 'Revoked' : isExpired ? 'Expired' : 'Active'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium">
                              Created {new Date(share.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              {share.expiresAt && ` • Expires ${new Date(share.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                              {share.lastAccessedAt
                                ? ` • Last viewed ${new Date(share.lastAccessedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                                : ' • Not viewed yet'}
                            </div>
                          </div>
                        </div>

                        {/* Top Link Actions */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => handleCopyLink(share)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                          >
                            <span>{copiedId === share.id ? '✓ Copied' : '📋 Copy Link'}</span>
                          </button>

                          <a
                            href={portalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                          >
                            <span>👁️ Preview</span>
                          </a>

                          <button
                            onClick={() => handleToggleRevoke(share)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                              isRevoked
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                            }`}
                          >
                            {isRevoked ? 'Reactivate' : 'Revoke'}
                          </button>

                          <button
                            onClick={() => handleRegenerate(share)}
                            title="Generate a new URL and invalidate the current one"
                            className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            🔄
                          </button>
                        </div>
                      </div>

                      {/* Shared Candidates Summary within this link */}
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                          Shared Candidates ({share.items?.length || 0}):
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(share.items || []).map((item: any) => {
                            const cand = item.candidate;
                            if (!cand) return null;
                            const candActs = activities.filter(a => a.candidateId === cand.id);
                            const latest = candActs[0];

                            return (
                              <div
                                key={item.id}
                                className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-extrabold text-slate-900 truncate">
                                    {cand.name}
                                  </div>
                                  <div className="text-[10px] text-slate-500 truncate">
                                    {cand.current_title || 'Candidate'} {cand.current_company ? `• ${cand.current_company}` : ''}
                                  </div>
                                  {latest && (
                                    <div className="mt-1 flex items-center gap-1.5">
                                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${getStatusBadge(latest.status)}`}>
                                        {latest.status}
                                      </span>
                                      {latest.feedback && (
                                        <span className="text-[10px] text-slate-600 truncate max-w-[140px]" title={latest.feedback}>
                                          💬 "{latest.feedback}"
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <button
                                  onClick={() => handleRemoveCandidate(share.id, cand.id)}
                                  className="w-6 h-6 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center text-xs font-bold transition-all cursor-pointer shrink-0"
                                  title="Remove from this link"
                                >
                                  ✕
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* Unified Activity Timeline */
            activities.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                <span className="text-3xl">📋</span>
                <div className="text-sm font-bold text-slate-800 mt-2">No Interview Activity Logged Yet</div>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  When clients update candidate interview statuses, schedule rounds, or write feedback through the shared portal, all records will appear here in real-time.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {activities.map((act: any) => (
                  <div
                    key={act.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold text-slate-900">
                          {act.candidate?.name || 'Candidate'}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${getStatusBadge(act.status)}`}>
                          {act.status}
                        </span>
                        {act.interviewRound && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                            🎯 {act.interviewRound}
                          </span>
                        )}
                        {act.interviewerName && (
                          <span className="text-[11px] text-slate-500">
                            by <strong>{act.interviewerName}</strong>
                          </span>
                        )}
                      </div>

                      {act.feedback && (
                        <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100 italic">
                          "{act.feedback}"
                        </p>
                      )}

                      {act.rejectionReason && (
                        <p className="text-xs text-rose-700 bg-rose-50/50 p-2 rounded-lg border border-rose-100">
                          Reason: {act.rejectionReason}
                        </p>
                      )}

                      {act.interviewDate && (
                        <div className="text-[11px] text-slate-500">
                          📅 Scheduled: <strong>{new Date(act.interviewDate).toLocaleString()}</strong>
                        </div>
                      )}

                      {act.expectedJoiningDate && (
                        <div className="text-[11px] text-emerald-700 font-semibold">
                          🎉 Expected Joining Date: <strong>{new Date(act.expectedJoiningDate).toLocaleDateString()}</strong>
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[10px] font-mono text-slate-400">
                        {new Date(act.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      <div className="text-[10px] font-bold text-slate-600 mt-0.5">
                        Updated by: {act.updatedBy || 'Client'} ({act.updatedByRole})
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            Requisition: <strong className="text-slate-800">{jobPosition}</strong>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
