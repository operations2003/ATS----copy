'use client';

import React, { useState, useEffect } from 'react';

interface CandidateLinkModalProps {
  jobId: string;
  jobTitle?: string;
  isOpen: boolean;
  onClose: () => void;
  initialToken?: string | null;
  initialIsActive?: boolean;
}

export default function CandidateLinkModal({
  jobId,
  jobTitle = 'Position',
  isOpen,
  onClose,
  initialToken = null,
  initialIsActive = true,
}: CandidateLinkModalProps) {
  const [publicToken, setPublicToken] = useState<string | null>(initialToken);
  const [publicUrl, setPublicUrl] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(initialIsActive);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState<string>('');

  // Fetch link info when modal opens
  useEffect(() => {
    if (!isOpen || !jobId) return;

    async function loadLink() {
      try {
        setIsLoading(true);
        setErrorMsg('');
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
        const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;

        const res = await fetch(`${backendUrl}/jobs/${jobId}/public-link`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        });

        if (res.ok) {
          const data = await res.json();
          if (data.publicToken) {
            setPublicToken(data.publicToken);
            setIsActive(data.isPublicLinkActive !== false);
            const hostUrl = typeof window !== 'undefined' ? `${window.location.origin}/apply/${data.publicToken}` : data.publicUrl;
            setPublicUrl(hostUrl);
          }
        }
      } catch (err: any) {
        console.warn('Failed to load public link:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadLink();
  }, [isOpen, jobId]);

  if (!isOpen) return null;

  const handleGenerateLink = async () => {
    try {
      setIsLoading(true);
      setErrorMsg('');
      setStatusMsg('');

      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;

      const res = await fetch(`${backendUrl}/jobs/${jobId}/public-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ isPublicLinkActive: true })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate application link.');
      }

      setPublicToken(data.publicToken);
      setIsActive(data.isPublicLinkActive !== false);
      const hostUrl = typeof window !== 'undefined' ? `${window.location.origin}/apply/${data.publicToken}` : data.publicUrl;
      setPublicUrl(hostUrl);
      setStatusMsg('Candidate link generated successfully!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error generating link.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActive = async () => {
    try {
      const newStatus = !isActive;
      setIsActive(newStatus);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;

      const res = await fetch(`${backendUrl}/jobs/${jobId}/public-link`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ isPublicLinkActive: newStatus })
      });

      const data = await res.json();
      if (!res.ok) {
        setIsActive(!newStatus); // revert
        throw new Error(data.error || 'Failed to update status.');
      }

      setStatusMsg(newStatus ? 'Applications are now OPEN.' : 'Applications are now PAUSED.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to toggle status.');
    }
  };

  const handleCopy = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-orange-50/50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-orange-pale text-brand-orange border border-brand-orange-border flex items-center justify-center shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#1E293B]">
                Public Candidate Application Link
              </h2>
              <p className="text-xs text-slate-500 truncate max-w-xs sm:max-w-sm">
                {jobTitle}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {statusMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{statusMsg}</span>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-3 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-slate-500 font-medium">Preparing application link...</p>
            </div>
          ) : !publicToken ? (
            <div className="text-center py-4 space-y-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 text-left text-xs text-slate-600 space-y-2">
                <p className="font-bold text-slate-800">
                  Direct candidate sourcing without recruiter manual CV upload
                </p>
                <p>
                  Generate a secure public URL that you can share on <strong>LinkedIn</strong>, <strong>Naukri</strong>, <strong>Indeed</strong>, or via WhatsApp & email.
                </p>
                <p>
                  When candidates submit their resumes, they are automatically parsed and scored against this JD using the existing ATS evaluation engine.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGenerateLink}
                disabled={isLoading}
                className="w-full py-3 px-5 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-bold rounded-xl transition-all shadow-orange hover:shadow-orange-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Generate Candidate Link</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Application Status Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Candidate Applications</span>
                  <span className="text-[11px] text-slate-500">
                    {isActive ? 'Public URL is active and accepting CVs' : 'Public URL is paused (submissions disabled)'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {isActive ? 'ON' : 'OFF'}
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleActive}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
                      isActive ? 'bg-brand-orange' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isActive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Link Input & Copy Button */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Public Candidate URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={publicUrl}
                    className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs ${
                      isCopied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-brand-orange hover:bg-brand-orange-hover text-white shadow-orange'
                    }`}
                  >
                    {isCopied ? (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Actions & Preview */}
              <div className="flex items-center justify-between pt-2">
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-brand-orange hover:underline flex items-center gap-1"
                >
                  <span>Preview candidate application page</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>

                <button
                  type="button"
                  onClick={handleGenerateLink}
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 hover:underline"
                  title="Generate a new token for this job"
                >
                  Regenerate Link
                </button>
              </div>

              {/* Workflow explanation banner */}
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-950">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Automatic Candidate Ingestion & ATS Scoring:
                </div>
                <p className="text-amber-800 leading-relaxed">
                  Resumes submitted through this public link are processed by the exact same CV parsing and evaluation pipeline as bulk uploads. Candidates will appear in your candidate table with their ATS scores automatically computed.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
