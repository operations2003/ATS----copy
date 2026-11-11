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

const profiles: ClientProfile[] = [
  {
    id: 'cp-1',
    clientName: 'TechCorp Industries',
    profileName: 'Strict Technical Matrix',
    description: 'Enterprise manufacturing client — strict mandatory rules, cloud certifications required, zero tolerance on core requirements',
    strictMandatory: true,
    autoReject: true,
    techWeight: 1.2,
    expWeight: 1.1,
    certWeight: 1.3,
    jobsUsed: 8,
    lastUsed: '2 hours ago',
    tagColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    id: 'cp-2',
    clientName: 'InnovateTech Dynamics',
    profileName: 'Flexible High-Growth Startup',
    description: 'Early & growth stage teams — flexible hard requirements, high problem-solving weighting, values open source contributions',
    strictMandatory: false,
    autoReject: false,
    techWeight: 1.5,
    expWeight: 0.9,
    certWeight: 0.7,
    jobsUsed: 5,
    lastUsed: 'Yesterday',
    tagColor: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    id: 'cp-3',
    clientName: 'GlobalBank & Fintech Corp',
    profileName: 'Finance & Compliance Standard',
    description: 'Tier-1 financial services — verified experience, compliance certifications, and security clearance heavily weighted',
    strictMandatory: true,
    autoReject: false,
    techWeight: 1.0,
    expWeight: 1.4,
    certWeight: 1.5,
    jobsUsed: 6,
    lastUsed: '3 days ago',
    tagColor: 'bg-purple-50 text-purple-700 border-purple-200',
  },
];

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

const CLIENT_SHARES_STORAGE_KEY = 'tasknera_client_portal_shares_v1';

export default function ClientProfilesPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [list, setList] = useState<ClientProfile[]>(profiles);

  // Share Link Modal State
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedClientName, setSelectedClientName] = useState('TechCorp Industries');
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

  const handleSave = () => {
    setList(prev => [...prev, {
      id: `cp-${Date.now()}`,
      ...form,
      jobsUsed: 0,
      lastUsed: 'Just now',
      tagColor: 'bg-brand-orange-pale text-brand-orange border-brand-orange-border',
    }]);
    setForm(defaultForm);
    setShowForm(false);
  };

  const handleOpenShareModal = (clientName?: string) => {
    if (clientName) {
      setSelectedClientName(clientName);
    } else if (list.length > 0) {
      setSelectedClientName(list[0].clientName);
    }
    setGeneratedLink(null);
    setCopiedLink(false);
    setShareModalOpen(true);
  };

  const handleGenerateShareLink = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const token = `cli-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const fullUrl = `${origin}/share/${token}?client=${encodeURIComponent(selectedClientName)}`;
    
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expirationDays);

    const selectedJob = jobs.find(j => j.id === selectedJobId);
    const newShare: SharedClientLink = {
      id: `share-${Date.now()}`,
      clientName: selectedClientName,
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
    <div className="min-h-screen bg-[#F7F8FC] text-[#1E293B] flex flex-col selection:bg-brand-orange-pale selection:text-brand-orange">
      <Header />
      <main className="max-w-screen-xl mx-auto px-6 pt-24 pb-16 flex-1 w-full">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-orange-pale border border-brand-orange-border rounded-full text-xs font-bold text-brand-orange mb-2">
              <span className="w-2 h-2 rounded-full bg-brand-orange" />
              Client Governance & Scoring Rules
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1E293B] tracking-tight">Client Evaluation Profiles</h1>
            <p className="text-sm text-slate-500 mt-1">Configure scoring rules per hiring account to automatically standardize candidate evaluations</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenShareModal()}
              className="flex items-center gap-2 px-5 py-3 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 hover:border-slate-300 text-xs font-bold rounded-xl transition-all shadow-xs hover:-translate-y-0.5 cursor-pointer"
            >
              <svg className="w-4 h-4 text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share a Link
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-5 py-3 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-bold rounded-xl transition-all shadow-orange hover:shadow-orange-lg hover:-translate-y-0.5 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Create New Client Profile
            </button>
          </div>
        </div>

        {/* Profile Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {list.map(p => (
            <div key={p.id} className="bg-white border border-slate-200/90 hover:border-brand-orange/40 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all card-hover-lift flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-[#1E293B] font-bold text-base">{p.clientName}</h3>
                    <p className="text-brand-orange font-semibold text-xs mt-0.5">{p.profileName}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shadow-xs ${
                    p.strictMandatory
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}>
                    {p.strictMandatory ? 'STRICT COMPLIANCE' : 'FLEXIBLE'}
                  </span>
                </div>

                <p className="text-slate-500 text-xs leading-relaxed mb-5">{p.description}</p>

                <div className="space-y-2.5 mb-5 bg-[#F8FAFC] p-4 rounded-2xl border border-slate-200">
                  {[
                    { label: 'Technical Skills Weight', value: `×${p.techWeight}` },
                    { label: 'Experience Multiplier', value: `×${p.expWeight}` },
                    { label: 'Certification Weight', value: `×${p.certWeight}` },
                  ].map((row, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">{row.label}</span>
                      <span className="text-[#1E293B] font-bold">{row.value}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
                    <span className="text-slate-500 font-medium">Mandatory Failure Action</span>
                    <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${p.autoReject ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                      {p.autoReject ? 'Auto-Disqualify' : 'Flag for Review'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100">
                <span className="font-semibold">{p.jobsUsed} Active Jobs</span>
                <button
                  type="button"
                  onClick={() => handleOpenShareModal(p.clientName)}
                  className="inline-flex items-center gap-1 font-bold text-brand-orange hover:text-brand-orange-hover hover:underline cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Share Link
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Create Form Modal / Drawer */}
        {showForm && (
          <div className="bg-white border border-slate-200/90 rounded-3xl p-7 shadow-xl">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-[#1E293B] font-bold text-lg">Define New Client Evaluation Profile</h2>
                <p className="text-xs text-slate-500 mt-0.5">Custom weighting models ensure candidate rankings align with client hiring culture</p>
              </div>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
              <div>
                <label className="block text-xs font-bold text-[#1E293B] mb-1.5">Client Account Name *</label>
                <input type="text" value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30" placeholder="e.g. Acme Corporation" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#1E293B] mb-1.5">Profile Identifier *</label>
                <input type="text" value={form.profileName} onChange={e => setForm({ ...form, profileName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30" placeholder="e.g. Executive Engineering Standard" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-[#1E293B] mb-1.5">Rule Strategy Description</label>
                <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30" placeholder="Describe client specific criteria and requirements..." />
              </div>
            </div>

            {/* Rules */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-[#F8FAFC] border border-slate-200 rounded-2xl p-5">
                <h3 className="text-[#1E293B] text-xs font-bold uppercase tracking-wider mb-4">Mandatory Compliance Rules</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <span id="strict-mandatory-label" className="min-w-0 text-slate-700 text-xs font-semibold">Strict mandatory enforcement</span>
                    <button type="button" role="switch" aria-labelledby="strict-mandatory-label" aria-checked={form.strictMandatory}
                      onClick={() => setForm(current => ({ ...current, strictMandatory: !current.strictMandatory }))}
                      className={`relative block h-6 w-11 min-w-11 flex-none overflow-hidden rounded-full border-0 p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2 ${form.strictMandatory ? 'bg-brand-orange' : 'bg-slate-300'}`}>
                      <span className={`absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${form.strictMandatory ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span id="auto-reject-label" className="min-w-0 text-slate-700 text-xs font-semibold">Auto-disqualify candidate on mandatory failure</span>
                    <button type="button" role="switch" aria-labelledby="auto-reject-label" aria-checked={form.autoReject}
                      onClick={() => setForm(current => ({ ...current, autoReject: !current.autoReject }))}
                      className={`relative block h-6 w-11 min-w-11 flex-none overflow-hidden rounded-full border-0 p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2 ${form.autoReject ? 'bg-brand-orange' : 'bg-slate-300'}`}>
                      <span className={`absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${form.autoReject ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-[#F8FAFC] border border-slate-200 rounded-2xl p-5">
                <h3 className="text-[#1E293B] text-xs font-bold uppercase tracking-wider mb-4">Evaluation Weight Multipliers</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Technical Competency', key: 'techWeight' },
                    { label: 'Experience Depth', key: 'expWeight' },
                    { label: 'Certifications & Degree', key: 'certWeight' },
                  ].map(row => (
                    <div key={row.key} className="flex items-center justify-between gap-3">
                      <span className="text-slate-700 text-xs font-semibold">{row.label}</span>
                      <input type="number" step="0.1" min="0.5" max="2.0"
                        value={form[row.key as keyof typeof form] as number}
                        onChange={e => setForm({ ...form, [row.key]: parseFloat(e.target.value) })}
                        className="w-20 bg-white border border-slate-300 rounded-xl px-2 py-1 text-xs font-bold text-[#1E293B] text-center focus:outline-none focus:border-brand-orange" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Scoring Weights */}
            <div className="bg-[#F8FAFC] border border-slate-200 rounded-2xl p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[#1E293B] text-xs font-bold uppercase tracking-wider">Default Category Weights (Must sum to 100)</h3>
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
                    <input type="number" min="0" max="100"
                      value={form[row.key as keyof typeof form] as number}
                      onChange={e => setForm({ ...form, [row.key]: parseInt(e.target.value) || 0 })}
                      className="w-full bg-white border border-slate-300 rounded-xl px-2 py-2 text-xs font-bold text-[#1E293B] text-center focus:outline-none focus:ring-2 focus:ring-brand-orange/30 mb-1.5" />
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">{row.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="px-5 py-2.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.clientName || !form.profileName || totalWeight !== 100}
                className="px-6 py-2.5 bg-brand-orange hover:bg-brand-orange-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all shadow-orange cursor-pointer"
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
            <div className="my-auto w-full max-w-xl rounded-3xl bg-white p-6 sm:p-7 shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF4FF] text-[#3563E9]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-[#1E293B]">Client Hiring & Transparency Portal</h2>
                    <p className="text-xs text-slate-500">Generate a live portal link for client JD uploads, sourcing visibility, and candidate reviews</p>
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
                  {/* Client Select */}
                  <div>
                    <label className="block text-xs font-bold text-[#1E293B] mb-1.5">Client Account</label>
                    <select
                      value={selectedClientName}
                      onChange={e => setSelectedClientName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-brand-orange/30"
                    >
                      {list.map(p => (
                        <option key={p.id} value={p.clientName}>
                          {p.clientName} ({p.profileName})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Job Requisition */}
                  <div>
                    <label className="block text-xs font-bold text-[#1E293B] mb-1.5">Associated Requisition</label>
                    <select
                      value={selectedJobId}
                      onChange={e => setSelectedJobId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-brand-orange/30"
                    >
                      {jobs.map(j => (
                        <option key={j.id} value={j.id}>
                          {j.title} · {j.client} ({j.status})
                        </option>
                      ))}
                      {jobs.length === 0 && (
                        <option value="default">All Active Requisitions</option>
                      )}
                    </select>
                  </div>

                  {/* Client Contact Email */}
                  <div>
                    <label className="block text-xs font-bold text-[#1E293B] mb-1.5">
                      Client Contact Email <span className="font-normal text-slate-400">(Optional - for direct email)</span>
                    </label>
                    <input
                      type="email"
                      value={clientEmail}
                      onChange={e => setClientEmail(e.target.value)}
                      placeholder="e.g. hiring.manager@client.com"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-brand-orange/30"
                    />
                  </div>

                  {/* Expiration */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#1E293B] mb-1.5">Link Expiry</label>
                      <select
                        value={expirationDays}
                        onChange={e => setExpirationDays(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-brand-orange/30"
                      >
                        <option value={7}>7 Days</option>
                        <option value={14}>14 Days (Standard)</option>
                        <option value={30}>30 Days</option>
                        <option value={90}>90 Days</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#1E293B] mb-1.5">Portal Security</label>
                      <div className="h-[38px] rounded-xl bg-slate-50 border border-slate-200 px-3 flex items-center text-[11px] font-semibold text-slate-600">
                        🔒 Token-Protected Access
                      </div>
                    </div>
                  </div>

                  {/* Feature Toggles */}
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-2.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Client Portal Permissions
                    </div>
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={includeMatchBreakdown}
                        onChange={e => setIncludeMatchBreakdown(e.target.checked)}
                        className="rounded border-slate-300 text-brand-orange focus:ring-brand-orange"
                      />
                      <span>Show candidate match breakdown &amp; requirement evidence</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={includeFeedbackControls}
                        onChange={e => setIncludeFeedbackControls(e.target.checked)}
                        className="rounded border-slate-300 text-brand-orange focus:ring-brand-orange"
                      />
                      <span>Enable client interview scheduling &amp; status decision controls</span>
                    </label>
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={() => setShareModalOpen(false)}
                      className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateShareLink}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-orange px-5 py-2.5 text-xs font-bold text-white shadow-orange hover:bg-brand-orange-hover cursor-pointer"
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
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Share & Transparency Portal Created for {selectedClientName}
                    </div>
                    <p className="mt-1 text-xs text-emerald-700">
                      Your client can now directly upload new JDs into HireIQ, monitor live screening progress, and review screened &amp; submitted candidate profiles with full transparency.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Client Portal URL</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={generatedLink}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-mono text-slate-800 select-all outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopyLink(generatedLink)}
                        className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          copiedLink
                            ? 'bg-emerald-600 text-white'
                            : 'bg-brand-orange hover:bg-brand-orange-hover text-white'
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
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <span>Preview Portal</span>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>

                    {clientEmail && (
                      <a
                        href={`mailto:${clientEmail}?subject=${encodeURIComponent(`Candidate Review Portal: ${selectedClientName}`)}&body=${encodeURIComponent(`Hello,\n\nPlease review our shortlisted candidates and evaluation scoring profile using the secure link below:\n\n${generatedLink}\n\nBest regards,\nRecruitment Team`)}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5 text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span>Email to Client</span>
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => setGeneratedLink(null)}
                      className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      + Create Another Link
                    </button>
                  </div>

                  {/* Previously created links list */}
                  {sharedLinks.length > 0 && (
                    <div className="border-t border-slate-100 pt-4 mt-4">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Active Client Shared Links ({sharedLinks.length})
                      </div>
                      <div className="max-h-36 overflow-y-auto space-y-2">
                        {sharedLinks.slice(0, 3).map(link => (
                          <div key={link.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-xs border border-slate-200/70">
                            <div className="min-w-0 pr-2">
                              <span className="font-bold text-slate-800 block truncate">{link.clientName}</span>
                              <span className="text-[10px] text-slate-400 block truncate">{link.jobTitle} · Expires {link.expiresAt}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyLink(link.shareUrl)}
                              className="shrink-0 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
                            >
                              Copy
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => setShareModalOpen(false)}
                      className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer"
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
          <div className="fixed bottom-6 right-6 z-[350] flex items-center gap-2.5 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-xl border border-slate-800">
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
