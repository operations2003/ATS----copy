'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { atsStore, JobItem } from '@/lib/atsStore';

interface ClientProfile {
  id: string;
  clientName: string;
  profileName: string;
  description: string;
  strictMandatory: boolean;
  autoReject: boolean;
  techWeight: number;
  expWeight: number;
  certWeight: number;
  jobsUsed: number;
  lastUsed: string;
  tagColor: string;
}

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

const defaultForm = {
  clientName: '',
  profileName: '',
  description: '',
  strictMandatory: true,
  autoReject: true,
  techWeight: 1.0,
  expWeight: 1.0,
  certWeight: 1.0,
  mandatoryWeight: 50,
  skillsWeight: 20,
  experienceWeight: 15,
  responsibilitiesWeight: 10,
  preferredWeight: 5,
};

const CLIENT_PROFILES_STORAGE_KEY = 'tasknera_client_profiles_v1';
const CLIENT_SHARES_STORAGE_KEY = 'tasknera_client_portal_shares_v1';

export default function ClientProfilesPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [list, setList] = useState<ClientProfile[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

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

    // Load custom client evaluation profiles from localStorage
    try {
      const storedProfiles = localStorage.getItem(CLIENT_PROFILES_STORAGE_KEY);
      if (storedProfiles) {
        const parsed = JSON.parse(storedProfiles);
        if (Array.isArray(parsed)) {
          setList(parsed);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoaded(true);
    }

    // Load previously generated client share links
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

  const totalWeight = form.mandatoryWeight + form.skillsWeight + form.experienceWeight + form.responsibilitiesWeight + form.preferredWeight;

  // Derives unique client names from saved profiles and existing ATS jobs
  const availableClientNames = useMemo(() => {
    const set = new Set<string>();
    list.forEach(p => {
      if (p.clientName?.trim()) set.add(p.clientName.trim());
    });
    jobs.forEach(j => {
      if (j.client?.trim()) set.add(j.client.trim());
    });
    return Array.from(set);
  }, [list, jobs]);

  const handleSave = () => {
    if (!form.clientName.trim() || !form.profileName.trim() || totalWeight !== 100) return;

    const newProfile: ClientProfile = {
      id: `cp-${Date.now()}`,
      clientName: form.clientName.trim(),
      profileName: form.profileName.trim(),
      description: form.description.trim() || 'Custom evaluation rules and candidate screening standard.',
      strictMandatory: form.strictMandatory,
      autoReject: form.autoReject,
      techWeight: form.techWeight,
      expWeight: form.expWeight,
      certWeight: form.certWeight,
      jobsUsed: 0,
      lastUsed: 'Just now',
      tagColor: 'bg-blue-50 text-blue-700 border-blue-200',
    };

    const updated = [newProfile, ...list];
    setList(updated);

    try {
      localStorage.setItem(CLIENT_PROFILES_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }

    setForm(defaultForm);
    setShowForm(false);
    showToast('Client evaluation profile created successfully');
  };

  const handleDeleteProfile = (id: string, name: string) => {
    const updated = list.filter(p => p.id !== id);
    setList(updated);
    try {
      localStorage.setItem(CLIENT_PROFILES_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
    showToast(`Removed profile for ${name}`);
  };

  const handleOpenShareModal = (clientName?: string) => {
    if (clientName) {
      setSelectedClientName(clientName);
    } else if (selectedClientName) {
      // maintain current selection
    } else if (list.length > 0) {
      setSelectedClientName(list[0].clientName);
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

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#EFF4FF] border border-[#D1E0FF] rounded-full text-xs font-bold text-[#3563E9] mb-2">
              <span className="w-2 h-2 rounded-full bg-[#3563E9]" />
              Client Governance &amp; Scoring Rules
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#101828] tracking-tight">Client Evaluation Profiles</h1>
            <p className="text-sm text-[#667085] mt-1">Configure scoring rules per hiring account to automatically standardize candidate evaluations</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenShareModal()}
              className="flex items-center gap-2 px-5 py-3 bg-white hover:bg-slate-50 text-[#182230] hover:text-[#101828] border border-[#EAECF0] hover:border-slate-300 text-xs font-bold rounded-xl transition-all shadow-xs hover:-translate-y-0.5 cursor-pointer"
            >
              <svg className="w-4 h-4 text-[#3563E9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share a Link
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-5 py-3 bg-[#3563E9] hover:bg-[#2851D6] text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Create New Client Profile
            </button>
          </div>
        </div>

        {/* Profile Cards Grid or Clean Empty State */}
        {list.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {list.map(p => {
              const activeJobsCount = jobs.filter(
                j => j.client?.toLowerCase().trim() === p.clientName?.toLowerCase().trim()
              ).length;

              return (
                <div key={p.id} className="bg-white border border-[#EAECF0] hover:border-[#3563E9]/40 rounded-2xl p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-[#101828] font-bold text-base">{p.clientName}</h3>
                        <p className="text-[#3563E9] font-semibold text-xs mt-0.5">{p.profileName}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shadow-xs ${
                          p.strictMandatory
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                          {p.strictMandatory ? 'STRICT COMPLIANCE' : 'FLEXIBLE'}
                        </span>
                        <button
                          type="button"
                          title="Delete Profile"
                          onClick={() => handleDeleteProfile(p.id, p.clientName)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <p className="text-[#667085] text-xs leading-relaxed mb-5">{p.description}</p>

                    <div className="space-y-2.5 mb-5 bg-[#F8FAFC] p-4 rounded-xl border border-[#EAECF0]">
                      {[
                        { label: 'Technical Skills Weight', value: `×${p.techWeight}` },
                        { label: 'Experience Multiplier', value: `×${p.expWeight}` },
                        { label: 'Certification Weight', value: `×${p.certWeight}` },
                      ].map((row, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-[#667085] font-medium">{row.label}</span>
                          <span className="text-[#101828] font-bold">{row.value}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-xs pt-2 border-t border-[#EAECF0]">
                        <span className="text-[#667085] font-medium">Mandatory Failure Action</span>
                        <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${p.autoReject ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                          {p.autoReject ? 'Auto-Disqualify' : 'Flag for Review'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#667085] pt-3 border-t border-[#EAECF0]">
                    <span className="font-semibold">
                      {activeJobsCount} Active Requisition{activeJobsCount === 1 ? '' : 's'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenShareModal(p.clientName)}
                      className="inline-flex items-center gap-1 font-bold text-[#3563E9] hover:text-[#2851D6] hover:underline cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Share Link
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Clean Enterprise Empty State when no client profiles exist */
          <div className="bg-white border border-[#EAECF0] rounded-2xl p-10 sm:p-14 text-center shadow-xs mb-8">
            <div className="w-16 h-16 rounded-2xl bg-[#EFF4FF] border border-[#D1E0FF] text-[#3563E9] flex items-center justify-center mx-auto mb-4 shadow-xs">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-[#101828] mb-2">No Client Evaluation Profiles</h3>
            <p className="text-sm text-[#667085] max-w-lg mx-auto mb-6">
              Configure tailored evaluation scoring rules, mandatory criteria weights, and auto-disqualification filters per hiring client to automatically standardize candidate evaluations.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#3563E9] hover:bg-[#2851D6] text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:-translate-y-0.5 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Create First Client Profile
              </button>
              <button
                type="button"
                onClick={() => handleOpenShareModal()}
                className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 text-[#182230] border border-[#EAECF0] hover:border-slate-300 text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
              >
                <svg className="w-4 h-4 text-[#3563E9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share a Client Portal Link
              </button>
            </div>
          </div>
        )}

        {/* Create Form Drawer / Modal */}
        {showForm && (
          <div className="bg-white border border-[#EAECF0] rounded-2xl p-7 shadow-xl mb-8">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#EAECF0]">
              <div>
                <h2 className="text-[#101828] font-bold text-lg">Define New Client Evaluation Profile</h2>
                <p className="text-xs text-[#667085] mt-0.5">Custom weighting models ensure candidate rankings align with client hiring culture</p>
              </div>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
              <div>
                <label className="block text-xs font-bold text-[#101828] mb-1.5">Client Account Name *</label>
                <input
                  type="text"
                  value={form.clientName}
                  onChange={e => setForm({ ...form, clientName: e.target.value })}
                  className="w-full bg-white border border-[#EAECF0] rounded-xl px-4 py-2.5 text-xs font-semibold text-[#182230] focus:outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                  placeholder="e.g. Acme Corporation"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#101828] mb-1.5">Profile Identifier *</label>
                <input
                  type="text"
                  value={form.profileName}
                  onChange={e => setForm({ ...form, profileName: e.target.value })}
                  className="w-full bg-white border border-[#EAECF0] rounded-xl px-4 py-2.5 text-xs font-semibold text-[#182230] focus:outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                  placeholder="e.g. Executive Engineering Standard"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-[#101828] mb-1.5">Rule Strategy Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-white border border-[#EAECF0] rounded-xl px-4 py-2.5 text-xs font-semibold text-[#182230] focus:outline-none focus:border-[#3563E9] focus:ring-2 focus:ring-[#3563E9]/20"
                  placeholder="Describe client specific criteria and requirements..."
                />
              </div>
            </div>

            {/* Rules */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-[#F8FAFC] border border-[#EAECF0] rounded-xl p-5">
                <h3 className="text-[#101828] text-xs font-bold uppercase tracking-wider mb-4">Mandatory Compliance Rules</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <span id="strict-mandatory-label" className="min-w-0 text-slate-700 text-xs font-semibold">Strict mandatory enforcement</span>
                    <button
                      type="button"
                      role="switch"
                      aria-labelledby="strict-mandatory-label"
                      aria-checked={form.strictMandatory}
                      onClick={() => setForm(current => ({ ...current, strictMandatory: !current.strictMandatory }))}
                      className={`relative block h-6 w-11 min-w-11 flex-none overflow-hidden rounded-full border-0 p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3563E9]/50 focus-visible:ring-offset-2 ${form.strictMandatory ? 'bg-[#3563E9]' : 'bg-slate-300'}`}
                    >
                      <span className={`absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${form.strictMandatory ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span id="auto-reject-label" className="min-w-0 text-slate-700 text-xs font-semibold">Auto-disqualify candidate on mandatory failure</span>
                    <button
                      type="button"
                      role="switch"
                      aria-labelledby="auto-reject-label"
                      aria-checked={form.autoReject}
                      onClick={() => setForm(current => ({ ...current, autoReject: !current.autoReject }))}
                      className={`relative block h-6 w-11 min-w-11 flex-none overflow-hidden rounded-full border-0 p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3563E9]/50 focus-visible:ring-offset-2 ${form.autoReject ? 'bg-[#3563E9]' : 'bg-slate-300'}`}
                    >
                      <span className={`absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${form.autoReject ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-[#F8FAFC] border border-[#EAECF0] rounded-xl p-5">
                <h3 className="text-[#101828] text-xs font-bold uppercase tracking-wider mb-4">Evaluation Weight Multipliers</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Technical Competency', key: 'techWeight' },
                    { label: 'Experience Depth', key: 'expWeight' },
                    { label: 'Certifications & Degree', key: 'certWeight' },
                  ].map(row => (
                    <div key={row.key} className="flex items-center justify-between gap-3">
                      <span className="text-slate-700 text-xs font-semibold">{row.label}</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="2.0"
                        value={form[row.key as keyof typeof form] as number}
                        onChange={e => setForm({ ...form, [row.key]: parseFloat(e.target.value) })}
                        className="w-20 bg-white border border-[#EAECF0] rounded-xl px-2 py-1 text-xs font-bold text-[#101828] text-center focus:outline-none focus:border-[#3563E9]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Scoring Weights */}
            <div className="bg-[#F8FAFC] border border-[#EAECF0] rounded-xl p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[#101828] text-xs font-bold uppercase tracking-wider">Default Category Weights (Must sum to 100)</h3>
                <span className={`text-xs font-extrabold px-3 py-1 rounded-full ${totalWeight === 100 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                  Sum: {totalWeight}/100
                </span>
              </div>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: 'Mandatory', key: 'mandatoryWeight' },
                  { label: 'Skills Match', key: 'skillsWeight' },
                  { label: 'Experience', key: 'experienceWeight' },
                  { label: 'Responsibilities', key: 'responsibilitiesWeight' },
                  { label: 'Preferred', key: 'preferredWeight' },
                ].map(row => (
                  <div key={row.key} className="text-center">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={form[row.key as keyof typeof form] as number}
                      onChange={e => setForm({ ...form, [row.key]: parseInt(e.target.value) || 0 })}
                      className="w-full bg-white border border-[#EAECF0] rounded-xl px-2 py-2 text-xs font-bold text-[#101828] text-center focus:outline-none focus:ring-2 focus:ring-[#3563E9]/20 focus:border-[#3563E9] mb-1.5"
                    />
                    <p className="text-[#667085] text-[10px] font-bold uppercase tracking-wider">{row.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-5 py-2.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!form.clientName.trim() || !form.profileName.trim() || totalWeight !== 100}
                className="px-6 py-2.5 bg-[#3563E9] hover:bg-[#2851D6] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer"
              >
                Save Client Profile
              </button>
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

                  {/* Previously created links list */}
                  {sharedLinks.length > 0 && (
                    <div className="border-t border-[#EAECF0] pt-4 mt-4">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085] mb-2">
                        Active Client Shared Links ({sharedLinks.length})
                      </div>
                      <div className="max-h-36 overflow-y-auto space-y-2">
                        {sharedLinks.slice(0, 3).map(link => (
                          <div key={link.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-xs border border-[#EAECF0]">
                            <div className="min-w-0 pr-2">
                              <span className="font-bold text-[#101828] block truncate">{link.clientName}</span>
                              <span className="text-[10px] text-[#667085] block truncate">{link.jobTitle} · Expires {link.expiresAt}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyLink(link.shareUrl)}
                              className="shrink-0 px-2.5 py-1 rounded-lg bg-white border border-[#EAECF0] hover:bg-slate-100 text-[11px] font-semibold text-[#182230] cursor-pointer"
                            >
                              Copy
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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
