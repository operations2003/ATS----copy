'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const profiles = [
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

export default function ClientProfilesPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [list, setList] = useState(profiles);

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

  return (
    <div className="min-h-screen bg-[#EEF2F6] text-[#1E293B] flex flex-col selection:bg-brand-orange-pale selection:text-brand-orange">
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
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-5 py-3 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-bold rounded-xl transition-all shadow-orange hover:shadow-orange-lg hover:-translate-y-0.5 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Create New Client Profile
          </button>
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
                <span>Used {p.lastUsed}</span>
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
      </main>
      <Footer />
    </div>
  );
}


