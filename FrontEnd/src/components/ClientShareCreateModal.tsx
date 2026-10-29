'use client';

import React, { useState } from 'react';

export interface SelectedCandidateSummary {
  id: string;
  name: string;
  score: number;
  currentTitle?: string;
  currentCompany?: string;
  totalExperienceYears?: number;
}

interface ClientShareCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: {
    id: string;
    position: string;
    client: string;
    location?: string;
  };
  selectedCandidates: SelectedCandidateSummary[];
  onShareCreated?: (shareData: any) => void;
}

export default function ClientShareCreateModal({
  isOpen,
  onClose,
  job,
  selectedCandidates,
  onShareCreated,
}: ClientShareCreateModalProps) {
  const [clientName, setClientName] = useState(job.client || '');
  const [expiresInDays, setExpiresInDays] = useState<number | null>(14);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [createdShare, setCreatedShare] = useState<{
    shareUrl: string;
    token: string;
    expiresAt?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCreateLink = async () => {
    try {
      setIsSubmitting(true);
      setErrorMsg('');

      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

      const res = await fetch(`${backendUrl}/jobs/${job.id}/client-shares`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          candidateIds: selectedCandidates.map(c => c.id),
          clientName: clientName.trim() || job.client,
          expiresInDays: expiresInDays,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate link.');
      }

      const fullUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/share/${data.token}`
        : `/share/${data.token}`;

      setCreatedShare({
        shareUrl: fullUrl,
        token: data.token,
        expiresAt: data.share?.expiresAt,
      });

      if (onShareCreated) {
        onShareCreated(data.share);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    if (!createdShare?.shareUrl) return;
    navigator.clipboard.writeText(createdShare.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleResetAndClose = () => {
    setCreatedShare(null);
    setErrorMsg('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Share Shortlist
            </h2>
            <p className="text-xs text-slate-500">
              {job.position} • {job.client}
            </p>
          </div>
          <button
            onClick={handleResetAndClose}
            className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {!createdShare ? (
            <div className="space-y-4">
              {/* Selected Candidates Summary */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Selected Candidates ({selectedCandidates.length}):
                </label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {selectedCandidates.map((c, idx) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-2 rounded-xl border border-slate-200 bg-slate-50/60"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-400 w-4">
                          {idx + 1}.
                        </span>
                        <span className="text-xs font-bold text-slate-800">{c.name}</span>
                        {c.currentTitle && (
                          <span className="text-[11px] text-slate-500">
                            • {c.currentTitle}
                          </span>
                        )}
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white border border-slate-200 text-slate-700">
                        {c.score}% Match
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Client Name Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Client Name:
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-800"
                />
              </div>

              {/* Link Expiry Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Expires in:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: '7 Days', val: 7 },
                    { label: '14 Days', val: 14 },
                    { label: '30 Days', val: 30 },
                    { label: 'Never', val: null },
                  ].map(opt => (
                    <button
                      key={String(opt.val)}
                      type="button"
                      onClick={() => setExpiresInDays(opt.val)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer text-center ${
                        expiresInDays === opt.val
                          ? 'border-brand-orange bg-orange-50 text-brand-orange'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Created Link Result */
            <div className="space-y-4 text-center py-2">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg mx-auto">
                ✓
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Link Ready to Share
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Send this link to {clientName || 'the client'} to review {selectedCandidates.length} candidate{selectedCandidates.length === 1 ? '' : 's'}.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-left">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={createdShare.shareUrl}
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-700 select-all"
                  />
                  <button
                    onClick={handleCopyLink}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-brand-orange hover:bg-brand-orange-hover text-white shadow-orange'
                    }`}
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                {createdShare.expiresAt && (
                  <p className="text-[11px] text-slate-400">
                    Expires on {new Date(createdShare.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-center gap-2 pt-1">
                <a
                  href={createdShare.shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold"
                >
                  Open Link ↗
                </a>
                <button
                  onClick={handleResetAndClose}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!createdShare && (
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleResetAndClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting || selectedCandidates.length === 0}
              onClick={handleCreateLink}
              className="px-4 py-1.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-bold rounded-xl shadow-orange cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : `Create Link (${selectedCandidates.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
