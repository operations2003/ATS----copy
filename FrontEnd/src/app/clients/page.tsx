'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { atsStore, JobItem } from '@/lib/atsStore';

interface SharedClientLink {
  id: string;
  clientName: string;
  jobTitle: string;
  token: string;
  shareUrl: string;
  clientEmail?: string;
  expiresAt: string;
  createdAt: string;
  views: number;
}

const CLIENT_SHARES_STORAGE_KEY = 'tasknera_client_portal_shares_v1';

export default function ClientsPage() {
  // Share Link Modal State
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedClientName, setSelectedClientName] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [expirationDays, setExpirationDays] = useState(14);
  const [includeMatchBreakdown, setIncludeMatchBreakdown] = useState(true);
  const [includeFeedbackControls, setIncludeFeedbackControls] = useState(true);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [sharedLinks, setSharedLinks] = useState<SharedClientLink[]>([]);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    // Load jobs from ATS Store
    const loadedJobs = atsStore.getJobs();
    setJobs(loadedJobs);
    if (loadedJobs.length > 0) {
      setSelectedJobId(loadedJobs[0].id);
    }

    // Load client share links from localStorage
    try {
      const stored = localStorage.getItem(CLIENT_SHARES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setSharedLinks(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Derives unique client names from shared links and existing ATS jobs
  const availableClientNames = useMemo(() => {
    const set = new Set<string>();
    sharedLinks.forEach(l => {
      if (l.clientName?.trim()) set.add(l.clientName.trim());
    });
    jobs.forEach(j => {
      if (j.client?.trim()) set.add(j.client.trim());
    });
    return Array.from(set);
  }, [sharedLinks, jobs]);

  // Aggregate client account cards from existing jobs
  const clientAccounts = useMemo(() => {
    const map = new Map<string, { name: string; jobsCount: number; jobTitles: string[] }>();
    jobs.forEach(j => {
      const client = j.client?.trim() || 'General Client';
      if (!map.has(client)) {
        map.set(client, { name: client, jobsCount: 0, jobTitles: [] });
      }
      const entry = map.get(client)!;
      entry.jobsCount += 1;
      if (j.title && !entry.jobTitles.includes(j.title)) {
        entry.jobTitles.push(j.title);
      }
    });
    return Array.from(map.values());
  }, [jobs]);

  const handleOpenShareModal = (clientName?: string) => {
    if (clientName) {
      setSelectedClientName(clientName);
    } else if (selectedClientName) {
      // maintain current selection
    } else if (availableClientNames.length > 0) {
      setSelectedClientName(availableClientNames[0]);
    } else {
      setSelectedClientName('');
    }
    setGeneratedLink(null);
    setCopiedLink(false);
    setShareModalOpen(true);
  };

  const handleGenerateShareLink = () => {
    const targetClient = selectedClientName.trim() || 'Client Partner';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const token = `cli-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const fullUrl = `${origin}/share/${token}?client=${encodeURIComponent(targetClient)}`;
    
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expirationDays);

    const selectedJob = jobs.find(j => j.id === selectedJobId);
    const newShare: SharedClientLink = {
      id: `share-${Date.now()}`,
      clientName: targetClient,
      jobTitle: selectedJobId === 'default' || !selectedJobId ? 'All Client Positions' : (selectedJob?.title || 'All Client Positions'),
      token,
      shareUrl: fullUrl,
      clientEmail: clientEmail.trim() || undefined,
      expiresAt: expiryDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      createdAt: 'Just now',
      views: 0,
    };

    const updated = [newShare, ...sharedLinks];
    setSharedLinks(updated);
    setGeneratedLink(fullUrl);

    try {
      localStorage.setItem(CLIENT_SHARES_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }

    showToast('Client hiring & transparency link generated successfully!');
  };

  const handleDeleteShare = (id: string, name: string) => {
    const updated = sharedLinks.filter(l => l.id !== id);
    setSharedLinks(updated);
    try {
      localStorage.setItem(CLIENT_SHARES_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
    showToast(`Revoked portal link for ${name}`);
  };

  const handleCopyLink = (url: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      showToast('✓ Link copied to clipboard!');
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  return (
    <div className="min-h-screen bg-[#F7F8FC] text-[#182230] flex flex-col selection:bg-[#EFF4FF] selection:text-[#3563E9]">
      <Header />
      <main className="max-w-screen-xl mx-auto px-6 pt-24 pb-16 flex-1 w-full">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#EFF4FF] border border-[#D1E0FF] rounded-full text-xs font-bold text-[#3563E9] mb-2">
              <span className="w-2 h-2 rounded-full bg-[#3563E9]" />
              Client Transparency &amp; Portals
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#101828] tracking-tight">Client Portals &amp; Shared Links</h1>
            <p className="text-sm text-[#667085] mt-1">
              Generate live, secure hiring portal links for clients to submit JDs, view candidate screening progress, and schedule interviews.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenShareModal()}
              className="flex items-center gap-2 px-5 py-3 bg-[#3563E9] hover:bg-[#2851D6] text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Generate Client Portal Link
            </button>
          </div>
        </div>

        {/* Enterprise KPI Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
          <div className="bg-white border border-[#EAECF0] rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">Active Client Portals</span>
              <div className="w-8 h-8 rounded-lg bg-[#EFF4FF] text-[#3563E9] flex items-center justify-center font-bold">
                🔗
              </div>
            </div>
            <div className="text-3xl font-extrabold text-[#101828]">{sharedLinks.length}</div>
            <p className="text-xs text-[#667085] mt-1">Live transparency links shared with clients</p>
          </div>

          <div className="bg-white border border-[#EAECF0] rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">Client Accounts</span>
              <div className="w-8 h-8 rounded-lg bg-[#EFF4FF] text-[#3563E9] flex items-center justify-center font-bold">
                🏢
              </div>
            </div>
            <div className="text-3xl font-extrabold text-[#101828]">{clientAccounts.length}</div>
            <p className="text-xs text-[#667085] mt-1">Active hiring accounts in HireIQ</p>
          </div>

          <div className="bg-white border border-[#EAECF0] rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">Active Requisitions</span>
              <div className="w-8 h-8 rounded-lg bg-[#EFF4FF] text-[#3563E9] flex items-center justify-center font-bold">
                💼
              </div>
            </div>
            <div className="text-3xl font-extrabold text-[#101828]">{jobs.length}</div>
            <p className="text-xs text-[#667085] mt-1">Open positions connected to clients</p>
          </div>
        </div>

        {/* Active Client Portals Section */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-[#101828]">Active Shared Client Portals</h2>
              <p className="text-xs text-[#667085]">Live links shared with client hiring managers for real-time candidate review and JD upload</p>
            </div>
          </div>

          {sharedLinks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {sharedLinks.map(link => (
                <div
                  key={link.id}
                  className="bg-white border border-[#EAECF0] hover:border-[#3563E9]/40 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-[#101828] font-bold text-base">{link.clientName}</h3>
                        <p className="text-xs text-[#3563E9] font-semibold mt-0.5">{link.jobTitle}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                        <button
                          type="button"
                          title="Revoke Link"
                          onClick={() => handleDeleteShare(link.id, link.clientName)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs text-[#667085]">
                      <div className="flex items-center justify-between">
                        <span>Created:</span>
                        <span className="font-medium text-[#101828]">{link.createdAt}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Expires:</span>
                        <span className="font-medium text-[#101828]">{link.expiresAt}</span>
                      </div>
                      {link.clientEmail && (
                        <div className="flex items-center justify-between">
                          <span>Recipient:</span>
                          <span className="font-medium text-[#101828] truncate max-w-[150px]">{link.clientEmail}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 p-2.5 rounded-xl bg-slate-50 border border-[#EAECF0] flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={link.shareUrl}
                        className="w-full bg-transparent text-[11px] font-mono text-[#667085] outline-none select-all truncate"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopyLink(link.shareUrl)}
                        className="shrink-0 text-xs font-bold text-[#3563E9] hover:underline cursor-pointer"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-[#EAECF0] flex items-center justify-between gap-2">
                    <a
                      href={link.shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#3563E9] hover:text-[#2851D6] cursor-pointer"
                    >
                      <span>Preview Portal</span>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>

                    {link.clientEmail && (
                      <a
                        href={`mailto:${link.clientEmail}?subject=${encodeURIComponent(`Client Review Portal: ${link.clientName}`)}&body=${encodeURIComponent(`Hello,\n\nPlease review our screened candidates and JD submissions using this link:\n\n${link.shareUrl}\n\nBest regards,\nRecruitment Team`)}`}
                        className="text-xs font-semibold text-[#667085] hover:text-[#101828] cursor-pointer"
                      >
                        Send Email
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Clean Empty State */
            <div className="bg-white border border-[#EAECF0] rounded-2xl p-10 sm:p-12 text-center shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-[#EFF4FF] border border-[#D1E0FF] text-[#3563E9] flex items-center justify-center mx-auto mb-4 shadow-xs">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-[#101828] mb-1.5">No Client Portals Shared Yet</h3>
              <p className="text-xs text-[#667085] max-w-md mx-auto mb-5">
                Generate a live client link to share with your clients. Clients can directly submit JDs into HireIQ and track candidate screening with full transparency.
              </p>
              <button
                type="button"
                onClick={() => handleOpenShareModal()}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3563E9] hover:bg-[#2851D6] text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Generate First Client Portal Link
              </button>
            </div>
          )}
        </div>

        {/* Client Accounts from ATS Requisitions */}
        {clientAccounts.length > 0 && (
          <div className="bg-white border border-[#EAECF0] rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#EAECF0]">
              <div>
                <h3 className="text-base font-bold text-[#101828]">Connected Client Accounts ({clientAccounts.length})</h3>
                <p className="text-xs text-[#667085]">Clients identified from current active job requisitions in HireIQ</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {clientAccounts.map(client => (
                <div
                  key={client.name}
                  className="rounded-xl border border-[#EAECF0] bg-slate-50/60 p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-[#101828] truncate">{client.name}</h4>
                    <p className="text-[11px] text-[#667085] mt-0.5">
                      {client.jobsCount} Requisition{client.jobsCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenShareModal(client.name)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-[#EAECF0] hover:border-[#3563E9] text-[#3563E9] text-[11px] font-bold shadow-xs hover:bg-[#EFF4FF] transition-all cursor-pointer"
                  >
                    Share Portal Link
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Share Link Modal */}
        {shareModalOpen && (
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4"
            onMouseDown={e => {
              if (e.target === e.currentTarget) setShareModalOpen(false);
            }}
          >
            <div className="my-auto w-full max-w-xl rounded-2xl bg-white p-6 sm:p-7 shadow-2xl border border-[#EAECF0]">
              <div className="flex items-start justify-between border-b border-[#EAECF0] pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF4FF] text-[#3563E9]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[#101828]">Client Hiring &amp; Transparency Portal</h2>
                    <p className="text-xs text-[#667085]">Generate a live portal link for client JD uploads, sourcing visibility, and candidate reviews</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShareModalOpen(false)}
                  className="rounded-lg p-1 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                >
                  ×
                </button>
              </div>

              {!generatedLink ? (
                <div className="mt-5 space-y-4">
                  {/* Client Account Selection / Input */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-[#101828]">Client Account Name *</label>
                      {availableClientNames.length > 0 && (
                        <span className="text-[11px] text-[#667085]">
                          {availableClientNames.length} known account{availableClientNames.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <input
                        list="available-clients-datalist"
                        type="text"
                        value={selectedClientName}
                        onChange={e => setSelectedClientName(e.target.value)}
                        placeholder="e.g. Acme Corporation or select client..."
                        className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                      />
                      {availableClientNames.length > 0 && (
                        <datalist id="available-clients-datalist">
                          {availableClientNames.map(name => (
                            <option key={name} value={name} />
                          ))}
                        </datalist>
                      )}

                      {availableClientNames.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-[10px] font-semibold text-[#667085]">Quick select:</span>
                          {availableClientNames.slice(0, 4).map(name => (
                            <button
                              key={name}
                              type="button"
                              onClick={() => setSelectedClientName(name)}
                              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-lg border transition-all cursor-pointer ${
                                selectedClientName === name
                                  ? 'bg-[#EFF4FF] border-[#3563E9] text-[#3563E9]'
                                  : 'bg-white border-[#EAECF0] text-[#667085] hover:bg-slate-50'
                              }`}
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Job Requisition */}
                  <div>
                    <label className="block text-xs font-bold text-[#101828] mb-1.5">Associated Requisition</label>
                    <select
                      value={selectedJobId}
                      onChange={e => setSelectedJobId(e.target.value)}
                      className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                    >
                      <option value="default">All Client Requisitions</option>
                      {jobs.map(j => (
                        <option key={j.id} value={j.id}>
                          {j.title} · {j.client} ({j.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Client Contact Email */}
                  <div>
                    <label className="block text-xs font-bold text-[#101828] mb-1.5">
                      Client Contact Email <span className="font-normal text-[#667085]">(Optional - for direct email)</span>
                    </label>
                    <input
                      type="email"
                      value={clientEmail}
                      onChange={e => setClientEmail(e.target.value)}
                      placeholder="e.g. hiring.manager@client.com"
                      className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-medium text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                    />
                  </div>

                  {/* Expiration */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#101828] mb-1.5">Link Expiry</label>
                      <select
                        value={expirationDays}
                        onChange={e => setExpirationDays(Number(e.target.value))}
                        className="w-full rounded-xl border border-[#EAECF0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#182230] outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                      >
                        <option value={7}>7 Days</option>
                        <option value={14}>14 Days (Standard)</option>
                        <option value={30}>30 Days</option>
                        <option value={90}>90 Days</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#101828] mb-1.5">Portal Security</label>
                      <div className="h-[38px] rounded-xl bg-slate-50 border border-[#EAECF0] px-3 flex items-center text-[11px] font-semibold text-[#667085]">
                        🔒 Token-Protected Access
                      </div>
                    </div>
                  </div>

                  {/* Feature Toggles */}
                  <div className="rounded-xl border border-[#EAECF0] bg-slate-50/70 p-3.5 space-y-2.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085] mb-1">
                      Client Portal Permissions
                    </div>
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-[#182230]">
                      <input
                        type="checkbox"
                        checked={includeMatchBreakdown}
                        onChange={e => setIncludeMatchBreakdown(e.target.checked)}
                        className="rounded border-slate-300 text-[#3563E9] focus:ring-[#3563E9]"
                      />
                      <span>Show candidate match breakdown &amp; requirement evidence</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-[#182230]">
                      <input
                        type="checkbox"
                        checked={includeFeedbackControls}
                        onChange={e => setIncludeFeedbackControls(e.target.checked)}
                        className="rounded border-slate-300 text-[#3563E9] focus:ring-[#3563E9]"
                      />
                      <span>Enable client interview scheduling &amp; status decision controls</span>
                    </label>
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-3 border-t border-[#EAECF0] pt-4">
                    <button
                      type="button"
                      onClick={() => setShareModalOpen(false)}
                      className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-[#182230] hover:bg-slate-200 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateShareLink}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#3563E9] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#2851D6] cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      Generate Share Link
                    </button>
                  </div>
                </div>
              ) : (
                /* Link Created Success View */
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Share &amp; Transparency Portal Created for {selectedClientName || 'Client Partner'}
                    </div>
                    <p className="mt-1 text-xs text-emerald-700">
                      Your client can now directly upload new JDs into HireIQ, monitor live screening progress, and review screened &amp; submitted candidate profiles with full transparency.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#101828] mb-1.5">Client Portal URL</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={generatedLink}
                        className="w-full rounded-xl border border-[#EAECF0] bg-slate-50 px-3.5 py-2.5 text-xs font-mono text-[#182230] select-all outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopyLink(generatedLink)}
                        className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          copiedLink
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#3563E9] hover:bg-[#2851D6] text-white'
                        }`}
                      >
                        {copiedLink ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <a
                      href={generatedLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#182230] text-xs font-bold transition-colors cursor-pointer"
                    >
                      <span>Preview Portal</span>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>

                    {clientEmail && (
                      <a
                        href={`mailto:${clientEmail}?subject=${encodeURIComponent(`Candidate Review Portal: ${selectedClientName}`)}&body=${encodeURIComponent(`Hello,\n\nPlease review our shortlisted candidates and evaluation scoring profile using the secure link below:\n\n${generatedLink}\n\nBest regards,\nRecruitment Team`)}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#EAECF0] hover:bg-slate-50 text-[#182230] text-xs font-bold transition-colors cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5 text-[#3563E9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span>Email to Client</span>
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => setGeneratedLink(null)}
                      className="ml-auto text-xs font-semibold text-[#667085] hover:text-[#101828] cursor-pointer"
                    >
                      + Create Another Link
                    </button>
                  </div>

                  <div className="flex items-center justify-end border-t border-[#EAECF0] pt-3">
                    <button
                      type="button"
                      onClick={() => setShareModalOpen(false)}
                      className="rounded-xl bg-[#101828] px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Toast Feedback */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-[350] flex items-center gap-2.5 rounded-2xl bg-[#101828] px-4 py-3 text-sm font-medium text-white shadow-xl border border-slate-800">
            <svg className="h-4 w-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{toastMessage}</span>
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
}
