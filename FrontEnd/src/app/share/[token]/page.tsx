'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';

const STATUS_OPTIONS = [
  'Shared with Client',
  'Interview Scheduled',
  'Interview Completed',
  'Selected',
  'Rejected',
  'Offered',
  'Offer Declined',
  'Joined',
  'On Hold',
];

interface CandidateItem {
  id: string;
  name: string;
  email?: string;
  currentTitle: string;
  currentCompany: string;
  totalExperience: string;
  location?: string;
  summary?: string;
  skills: string[];
  experienceHighlights?: Array<{ title: string; company: string; duration: string }>;
  educationHighlights?: string[];
  atsScore: number;
  matchLevel: string;
  mandatoryPassed: boolean;
  currentStatus: string;
  latestFeedback?: string | null;
  lastUpdatedDate: string;
  latestActivity?: any;
  timeline?: any[];
  hasResume: boolean;
  resumeFileName?: string | null;
}

interface ShareData {
  id: string;
  clientName: string;
  expiresAt?: string;
  createdAt: string;
  job: {
    id: string;
    position: string;
    client: string;
    location?: string;
    workMode?: string;
    salary?: string;
  };
  candidates: CandidateItem[];
}

export default function ClientSharePortalPage() {
  const params = useParams();
  const token = params?.token as string;

  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Status & Feedback Modal state
  const [activeCandidate, setActiveCandidate] = useState<CandidateItem | null>(null);
  const [modalStatus, setModalStatus] = useState<string>('Interview Scheduled');
  const [modalFeedback, setModalFeedback] = useState<string>('');
  const [modalInterviewDate, setModalInterviewDate] = useState<string>('');
  const [modalRejectionReason, setModalRejectionReason] = useState<string>('');
  const [modalClientName, setModalClientName] = useState<string>('');
  const [isSubmittingUpdate, setIsSubmittingUpdate] = useState(false);
  const [updateSuccessMsg, setUpdateSuccessMsg] = useState<string | null>(null);

  // Timeline modal state
  const [timelineCandidate, setTimelineCandidate] = useState<CandidateItem | null>(null);

  const fetchShareData = useCallback(async () => {
    if (!token) return;
    try {
      setIsLoading(true);
      setErrorMsg(null);

      const res = await fetch(`/api/public/client-shares/${token}`, {
        cache: 'no-store',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load candidates.');
      }

      setShareData(data.share);
      if (data.share?.clientName) {
        setModalClientName(data.share.clientName);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to open candidate link.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchShareData();
  }, [fetchShareData]);

  const handleOpenUpdateModal = (cand: CandidateItem) => {
    setActiveCandidate(cand);
    setModalStatus(cand.currentStatus || 'Interview Scheduled');
    setModalFeedback(cand.latestFeedback || '');
    setModalInterviewDate(cand.latestActivity?.interviewDate ? cand.latestActivity.interviewDate.slice(0, 16) : '');
    setModalRejectionReason(cand.latestActivity?.rejectionReason || '');
    setUpdateSuccessMsg(null);
  };

  const handleSaveStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCandidate || !token) return;

    try {
      setIsSubmittingUpdate(true);
      setUpdateSuccessMsg(null);

      const payload = {
        status: modalStatus,
        feedback: modalFeedback,
        interviewDate: modalInterviewDate || undefined,
        rejectionReason: modalRejectionReason || undefined,
        clientName: modalClientName || shareData?.clientName || 'Client',
      };

      const res = await fetch(`/api/public/client-shares/${token}/candidates/${activeCandidate.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update status.');
      }

      setUpdateSuccessMsg('Saved successfully!');

      setShareData(prev => {
        if (!prev) return null;
        return {
          ...prev,
          candidates: prev.candidates.map(c => {
            if (c.id === activeCandidate.id) {
              const updatedAct = {
                status: modalStatus,
                feedback: modalFeedback,
                interviewDate: modalInterviewDate,
                createdAt: new Date().toISOString(),
                updatedBy: payload.clientName,
                updatedByRole: 'CLIENT',
              };
              return {
                ...c,
                currentStatus: modalStatus,
                latestFeedback: modalFeedback,
                lastUpdatedDate: new Date().toISOString(),
                latestActivity: updatedAct,
                timeline: [updatedAct, ...(c.timeline || [])],
              };
            }
            return c;
          }),
        };
      });

      setTimeout(() => {
        setActiveCandidate(null);
        setUpdateSuccessMsg(null);
      }, 1000);
    } catch (err: any) {
      alert(err.message || 'Error saving update.');
    } finally {
      setIsSubmittingUpdate(false);
    }
  };

  const handleDownloadCv = (cand: CandidateItem) => {
    try {
      setDownloadingId(cand.id);
      const downloadUrl = `/api/public/client-shares/${token}/candidates/${cand.id}/cv`;
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.setAttribute('download', '');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err.message || 'Failed to download resume.');
    } finally {
      setTimeout(() => setDownloadingId(null), 1200);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Selected':
      case 'Joined':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'Offered':
        return 'bg-teal-50 text-teal-800 border-teal-200';
      case 'Interview Scheduled':
      case 'Interview Completed':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'Rejected':
      case 'Offer Declined':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      case 'On Hold':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  // Filter candidates
  const filteredCandidates = useMemo(() => {
    if (!shareData?.candidates) return [];
    if (filterStatus === 'all') return shareData.candidates;
    if (filterStatus === 'review') return shareData.candidates.filter(c => c.currentStatus === 'Shared with Client');
    if (filterStatus === 'scheduled') return shareData.candidates.filter(c => c.currentStatus === 'Interview Scheduled' || c.currentStatus === 'Interview Completed');
    if (filterStatus === 'selected') return shareData.candidates.filter(c => ['Selected', 'Offered', 'Joined'].includes(c.currentStatus));
    if (filterStatus === 'rejected') return shareData.candidates.filter(c => ['Rejected', 'Offer Declined', 'On Hold'].includes(c.currentStatus));
    return shareData.candidates;
  }, [shareData, filterStatus]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-600">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm font-semibold">Loading candidates...</div>
        </div>
      </div>
    );
  }

  if (errorMsg || !shareData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center text-2xl mx-auto">
            🔒
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Link Not Available</h1>
            <p className="text-xs text-slate-500 mt-1">
              {errorMsg || 'This link has expired or is no longer valid.'}
            </p>
          </div>
          <p className="text-[11px] text-slate-400">
            Please ask your recruiter for a new link.
          </p>
        </div>
      </div>
    );
  }

  const { job } = shareData;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Clean Modern Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-orange text-white flex items-center justify-center font-black text-sm shadow-sm">
              HQ
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900">
                {job.position}
              </h1>
              <div className="text-xs text-slate-500">
                {shareData.clientName || job.client}
              </div>
            </div>
          </div>

          {shareData.expiresAt && (
            <div className="text-[11px] text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
              Valid until {new Date(shareData.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5 flex-1 w-full">
        {/* Simple Job Context Strip */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-slate-800">🏢 {job.client}</span>
            {job.location && <span>📍 {job.location}</span>}
            {job.workMode && <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-medium">{job.workMode}</span>}
            {job.salary && <span className="text-emerald-700 font-semibold">💰 {job.salary}</span>}
          </div>
          <div className="text-xs text-slate-500 font-medium">
            {shareData.candidates.length} candidate{shareData.candidates.length === 1 ? '' : 's'} shared
          </div>
        </div>

        {/* Clean Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: 'all', label: `All (${shareData.candidates.length})` },
            { id: 'review', label: 'To Review' },
            { id: 'scheduled', label: 'Interview Scheduled' },
            { id: 'selected', label: 'Selected / Offer' },
            { id: 'rejected', label: 'Rejected / Hold' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                filterStatus === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Candidate Cards List */}
        {filteredCandidates.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
            <div className="text-2xl">👥</div>
            <div className="text-sm font-semibold text-slate-800">No candidates under this tab</div>
            <p className="text-xs text-slate-400">Switch to "All" to view the full shortlist.</p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {filteredCandidates.map(c => {
              const score = c.atsScore || 85;
              const isTop = score >= 90;

              return (
                <div
                  key={c.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:border-slate-300 transition-all space-y-3"
                >
                  {/* Candidate Header Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {/* Match Score Badge */}
                      <div className={`px-2.5 py-1 rounded-xl text-xs font-bold border shrink-0 ${
                        isTop
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-blue-50 text-blue-800 border-blue-200'
                      }`}>
                        {score}% Match
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-slate-900">{c.name}</h3>
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getStatusBadge(c.currentStatus)}`}>
                            {c.currentStatus}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {c.currentTitle}
                          {c.currentCompany ? ` at ${c.currentCompany}` : ''}
                          {c.totalExperience ? ` • 💼 ${c.totalExperience}` : ''}
                          {c.location ? ` • 📍 ${c.location}` : ''}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0 flex-wrap">
                      <button
                        onClick={() => handleDownloadCv(c)}
                        disabled={downloadingId === c.id}
                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                        title="Download original uploaded resume"
                      >
                        <span>{downloadingId === c.id ? '⏳' : '📄'}</span>
                        <span>
                          {downloadingId === c.id
                            ? 'Downloading...'
                            : c.resumeFileName?.toLowerCase().endsWith('.docx')
                            ? 'Download Resume (.docx)'
                            : 'Download Resume'}
                        </span>
                      </button>

                      <button
                        onClick={() => handleOpenUpdateModal(c)}
                        className="px-3.5 py-1.5 bg-brand-orange hover:bg-brand-orange-hover text-white rounded-xl text-xs font-bold transition-all shadow-orange cursor-pointer flex items-center gap-1.5"
                      >
                        <span>✏️</span>
                        <span>Update Status</span>
                      </button>
                    </div>
                  </div>

                  {/* Summary Snippet */}
                  {c.summary && (
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {c.summary}
                    </p>
                  )}

                  {/* Skills Pills */}
                  {c.skills && c.skills.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {c.skills.slice(0, 8).map((skill, sIdx) => (
                        <span
                          key={sIdx}
                          className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] font-medium"
                        >
                          {skill}
                        </span>
                      ))}
                      {c.skills.length > 8 && (
                        <span className="text-[11px] text-slate-400 font-medium">
                          +{c.skills.length - 8} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Client Feedback Note (only if present) */}
                  {(c.latestFeedback || c.latestActivity?.interviewDate) && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                        <span>Latest Update</span>
                        {c.timeline && c.timeline.length > 1 && (
                          <button
                            onClick={() => setTimelineCandidate(c)}
                            className="text-brand-orange hover:underline text-[11px] font-medium cursor-pointer"
                          >
                            View History ({c.timeline.length})
                          </button>
                        )}
                      </div>

                      {c.latestFeedback && (
                        <p className="italic text-slate-800">"{c.latestFeedback}"</p>
                      )}

                      {c.latestActivity?.interviewDate && (
                        <div className="text-[11px] text-slate-600">
                          📅 Scheduled: <strong>{new Date(c.latestActivity.interviewDate).toLocaleString()}</strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ─────────────────────────────────────────────────────────────
         MODAL 1: SIMPLE STATUS UPDATE FORM
      ───────────────────────────────────────────────────────────── */}
      {activeCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Update Status</h3>
                <p className="text-xs text-slate-500">{activeCandidate.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveCandidate(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveStatusUpdate} className="p-5 space-y-3.5 text-xs">
              {updateSuccessMsg && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl font-semibold text-center text-xs">
                  ✓ {updateSuccessMsg}
                </div>
              )}

              {/* Status Select */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Status:
                </label>
                <select
                  value={modalStatus}
                  onChange={e => setModalStatus(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-brand-orange/40 font-semibold text-slate-800 bg-white"
                >
                  {STATUS_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Interview Date (if scheduled) */}
              {modalStatus === 'Interview Scheduled' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Interview Date & Time:
                  </label>
                  <input
                    type="datetime-local"
                    value={modalInterviewDate}
                    onChange={e => setModalInterviewDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white text-slate-800"
                  />
                </div>
              )}

              {/* Reason for rejection (if rejected) */}
              {['Rejected', 'Offer Declined', 'On Hold'].includes(modalStatus) && (
                <div>
                  <label className="block text-xs font-semibold text-rose-700 mb-1">
                    Reason:
                  </label>
                  <input
                    type="text"
                    value={modalRejectionReason}
                    onChange={e => setModalRejectionReason(e.target.value)}
                    placeholder="e.g. Needs more hands-on SAP S/4HANA"
                    className="w-full px-3 py-2 rounded-xl border border-rose-200 text-xs bg-white text-slate-800"
                  />
                </div>
              )}

              {/* Notes / Feedback */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes / Feedback:
                </label>
                <textarea
                  rows={3}
                  value={modalFeedback}
                  onChange={e => setModalFeedback(e.target.value)}
                  placeholder="Share any thoughts or next steps for the recruiter..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-brand-orange/40 text-slate-800 placeholder-slate-400"
                />
              </div>

              {/* Reviewer Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Your Name:
                </label>
                <input
                  type="text"
                  value={modalClientName}
                  onChange={e => setModalClientName(e.target.value)}
                  placeholder="e.g. John"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white text-slate-800"
                />
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveCandidate(null)}
                  className="px-3.5 py-2 text-slate-600 font-semibold hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingUpdate}
                  className="px-4 py-2 bg-brand-orange hover:bg-brand-orange-hover text-white rounded-xl font-bold shadow-orange cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingUpdate ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
         MODAL 2: SIMPLE HISTORY TIMELINE
      ───────────────────────────────────────────────────────────── */}
      {timelineCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Activity History</h3>
                <p className="text-xs text-slate-500">{timelineCandidate.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setTimelineCandidate(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {(!timelineCandidate.timeline || timelineCandidate.timeline.length === 0) ? (
                <div className="text-center py-4 text-xs text-slate-400">
                  No activity recorded yet.
                </div>
              ) : (
                <div className="relative border-l border-slate-200 ml-3 pl-4 space-y-4">
                  {timelineCandidate.timeline.map((item, idx) => (
                    <div key={idx} className="relative space-y-1 text-xs">
                      <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-brand-orange border border-white" />
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusBadge(item.status)}`}>
                          {item.status}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {item.feedback && (
                        <p className="text-slate-700 bg-slate-50 p-2 rounded-lg italic">
                          "{item.feedback}"
                        </p>
                      )}

                      <div className="text-[11px] text-slate-400">
                        By {item.updatedBy || 'Client'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-right">
              <button
                onClick={() => setTimelineCandidate(null)}
                className="px-3.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clean Minimal Footer */}
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        <div>HireIQ • Candidate Shortlist</div>
      </footer>
    </div>
  );
}
