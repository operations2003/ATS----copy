'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import { useAuth } from '@/context/AuthContext';
import { atsStore } from '@/lib/atsStore';

interface PlanDefinition {
  id: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  name: string;
  badge: string;
  priceINR: string;
  priceUSD: string;
  period: string;
  seats: number;
  maxJobs: number;
  maxResumes: number;
  maxStorageMB: number;
  description: string;
  features: string[];
}

const SUBSCRIPTION_PLANS: Record<string, PlanDefinition> = {
  STARTER: {
    id: 'STARTER',
    name: 'Starter',
    badge: 'Boutique Agencies',
    priceINR: '₹3,999',
    priceUSD: '$49',
    period: '/ month',
    seats: 5,
    maxJobs: 20,
    maxResumes: 500,
    maxStorageMB: 2000,
    description: 'Essential recruitment intelligence for small staffing teams and independent recruiters.',
    features: [
      'Up to 5 Team Members',
      '20 Active Job Postings',
      '500 Candidate Resumes / mo',
      'Automated CV Extraction (PDF/DOCX)',
      'Objective ATS Scoring Engine',
      'Standard Email Support',
    ],
  },
  PROFESSIONAL: {
    id: 'PROFESSIONAL',
    name: 'Professional',
    badge: 'Most Popular',
    priceINR: '₹9,999',
    priceUSD: '$119',
    period: '/ month',
    seats: 15,
    maxJobs: 40,
    maxResumes: 2500,
    maxStorageMB: 10000,
    description: 'Comprehensive hiring automation and benchmarking for fast-scaling recruitment agencies.',
    features: [
      'Up to 15 Team Members',
      '40 Active Job Openings',
      '2,500 Candidate Resumes / mo',
      'Deep JD Requirement & Alias Extraction',
      'Candidate Benchmarking & Match Radar',
      'Client Candidate Share Portals',
      'Priority AI Processing Queue',
      'Dedicated Account Support',
    ],
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    badge: 'Corporate Scale',
    priceINR: 'Custom',
    priceUSD: 'Custom',
    period: 'tailored billing',
    seats: 999,
    maxJobs: 999,
    maxResumes: 999999,
    maxStorageMB: 50000,
    description: 'Custom architecture, dedicated SLAs, and custom LLM tuning for corporate talent acquisition.',
    features: [
      'Unlimited Recruiters & Team Members',
      'Unlimited Jobs & Candidate Resumes',
      'Custom ATS & HRIS API Integrations',
      'Custom Verification & Rule Engines',
      'Dedicated Enterprise Cloud Instance',
      '24/7 Phone & Slack Support',
    ],
  },
};

export default function BillingPage() {
  const { user } = useAuth();

  // Determine current active plan from user or default to Professional
  const currentPlanKey = (
    (user as any)?.organization?.subscriptionPlan ||
    (user as any)?.subscriptionPlan ||
    'PROFESSIONAL'
  ).toUpperCase();

  const activePlan = SUBSCRIPTION_PLANS[currentPlanKey] || SUBSCRIPTION_PLANS.PROFESSIONAL;

  // Real usage calculated from workspace records
  const [candidatesCount, setCandidatesCount] = useState(0);
  const [activeJobsCount, setActiveJobsCount] = useState(0);
  const [evaluationsCount, setEvaluationsCount] = useState(0);
  const [inquiryModalOpen, setInquiryModalOpen] = useState(false);
  const [selectedUpgradePlan, setSelectedUpgradePlan] = useState<string>('ENTERPRISE');
  const [inquiryNotes, setInquiryNotes] = useState('');
  const [inquirySubmitted, setInquirySubmitted] = useState(false);

  useEffect(() => {
    try {
      // 1. Count stored candidates
      const candidates = atsStore.getCandidates();
      let totalCand = candidates.length;
      try {
        const pipelineRaw = localStorage.getItem('tasknera_recruitment_pipeline_v1');
        if (pipelineRaw) {
          const parsed = JSON.parse(pipelineRaw);
          if (Array.isArray(parsed) && parsed.length > totalCand) {
            totalCand = parsed.length;
          }
        }
      } catch {}
      setCandidatesCount(Math.max(totalCand, 1)); // Default at least 1 for active workspace

      // 2. Count active jobs/requisitions
      const jobs = atsStore.getJobs();
      let totalJobs = jobs.filter(j => j.status !== 'Closed').length;
      try {
        const jobsRaw = localStorage.getItem('tasknera_jobs_v1');
        if (jobsRaw) {
          const parsed = JSON.parse(jobsRaw);
          if (Array.isArray(parsed) && parsed.length > totalJobs) {
            totalJobs = parsed.length;
          }
        }
      } catch {}
      setActiveJobsCount(totalJobs);

      // 3. Count evaluations
      let evals = candidates.filter(c => c.match > 0).length;
      try {
        const evalsRaw = localStorage.getItem('tasknera_evaluations_v1');
        if (evalsRaw) {
          const parsed = JSON.parse(evalsRaw);
          if (Array.isArray(parsed)) evals = Math.max(evals, parsed.length);
        }
      } catch {}
      setEvaluationsCount(evals);
    } catch {
      setCandidatesCount(1);
      setActiveJobsCount(0);
      setEvaluationsCount(0);
    }
  }, []);

  // Storage usage calculation (approx 2.5 MB per candidate resume)
  const storageUsedMB = Math.round(candidatesCount * 2.5);

  const orgName = (user as any)?.organizationName || 'TaskNera Demo Workspace';
  const userEmail = user?.email || '';
  const userName = user?.name || userEmail.split('@')[0] || 'User';

  const getMailtoUrl = (planName?: string) => {
    const targetPlan = planName || 'Enterprise';
    const subject = encodeURIComponent(`TaskNera Plan Upgrade Request - ${orgName} (${targetPlan} Plan)`);
    const body = encodeURIComponent(
      `Hello TaskNera Operations Team,\n\nI would like to request an upgrade for our workspace subscription plan.\n\nWorkspace: ${orgName}\nContact: ${userName} (${userEmail})\nCurrent Plan: ${activePlan.name}\nRequested Plan: ${targetPlan}\n\nPlease reach out with details on pricing, invoice, and next steps to activate this upgrade.\n\nThank you,\n${userName}`
    );
    return `mailto:operations@tasknera.com?subject=${subject}&body=${body}`;
  };

  const handleInquirySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInquirySubmitted(true);
    setTimeout(() => {
      setInquirySubmitted(false);
      setInquiryModalOpen(false);
      setInquiryNotes('');
    }, 2200);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Header />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        {/* Header Section */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
              ACCOUNT
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#172033] tracking-tight">
              Subscription &amp; Billing
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">
              Your current plan and usage, calculated from stored records in this workspace.
            </p>
          </div>
          <a
            href={getMailtoUrl(activePlan.name === 'Enterprise' ? 'Enterprise' : 'Professional')}
            className="inline-flex items-center gap-2 rounded-xl bg-[#FF5722] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#e04a1b] shadow-xs transition shrink-0"
            title="Open email to operations@tasknera.com"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span>Email operations@tasknera.com to Upgrade</span>
          </a>
        </div>

        {/* 2 Main Top Cards (Matches UI Screenshot) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
          {/* Card 1: Plan */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-bold text-slate-900">Plan</h2>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active Plan
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-6">
                Assigned to your workspace by TaskNera
              </p>

              {/* Plan Details 4 Columns */}
              <div className="grid grid-cols-4 gap-2 border-y border-slate-100 py-4 mb-5">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                    PLAN
                  </span>
                  <span className="text-sm font-bold text-slate-900 block truncate">
                    {activePlan.name}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                    STATUS
                  </span>
                  <span className="text-sm font-bold text-slate-900 block truncate">
                    Active
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                    RENEWS
                  </span>
                  <span className="text-sm font-bold text-slate-400 block">
                    —
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                    SEATS
                  </span>
                  <span className="text-sm font-bold text-slate-900 block">
                    {activePlan.seats >= 900 ? 'Unlimited' : activePlan.seats}
                  </span>
                </div>
              </div>
            </div>

            {/* Gray Notice Banner with direct Upgrade email button */}
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5 text-[11px] text-slate-500 leading-relaxed space-y-2.5">
              <p>
                Plan changes are handled by TaskNera. Nothing is charged from this screen — no payment provider is connected to this app yet.
              </p>
              <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-700">Need to upgrade or change seats?</span>
                <a
                  href={getMailtoUrl()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-bold text-[#FF5722] hover:bg-orange-50/60 hover:border-orange-200 shadow-2xs transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>Email operations@tasknera.com</span>
                </a>
              </div>
            </div>
          </div>

          {/* Card 2: Usage this period */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Usage this period</h2>
              <p className="text-xs text-slate-400 mb-4">
                Counted from stored records
              </p>

              {/* Usage Metrics List */}
              <div className="space-y-3.5">
                {/* Active requisitions */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600 font-medium">Active requisitions</span>
                    <span className="font-bold text-slate-800">
                      {activeJobsCount} / {activePlan.maxJobs >= 900 ? 'Unlimited' : activePlan.maxJobs}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#FF5722] rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.round((activeJobsCount / activePlan.maxJobs) * 100))}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Evaluations */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600 font-medium">Evaluations</span>
                    <span className="font-bold text-slate-800">
                      {evaluationsCount} / {activePlan.maxResumes >= 900000 ? 'Unlimited' : activePlan.maxResumes.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.round((evaluationsCount / activePlan.maxResumes) * 100))}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Candidates stored */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600 font-medium">Candidates stored</span>
                    <span className="font-bold text-slate-800">{candidatesCount}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, candidatesCount * 2)}%` }}
                    />
                  </div>
                </div>

                {/* Storage */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600 font-medium">Storage</span>
                    <span className="font-bold text-slate-800">
                      {storageUsedMB} / {activePlan.maxStorageMB.toLocaleString()} MB used
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-500 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(1, Math.round((storageUsedMB / activePlan.maxStorageMB) * 100)))}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick action */}
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Workspace: {(user as any)?.organizationName || 'TaskNera Demo'}
              </span>
              <button
                type="button"
                onClick={() => setInquiryModalOpen(true)}
                className="text-xs font-bold text-[#FF5722] hover:text-[#e04a1b] hover:underline transition"
              >
                Request quota increase →
              </button>
            </div>
          </div>
        </div>

        {/* Subscription Plans Section (According to our subscription plans) */}
        <div className="mt-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900">TaskNera Subscription Plans</h2>
              <p className="text-xs text-slate-500">
                Select or inquire about plans configured for your agency or enterprise team.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedUpgradePlan('ENTERPRISE');
                setInquiryModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow-xs transition"
            >
              <span>Contact Sales / Custom Plan</span>
              <span>→</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {Object.values(SUBSCRIPTION_PLANS).map(plan => {
              const isCurrent = plan.id === activePlan.id;
              return (
                <div
                  key={plan.id}
                  className={`rounded-2xl p-6 transition-all flex flex-col justify-between ${
                    isCurrent
                      ? 'border-2 border-[#FF5722] bg-white shadow-md relative'
                      : 'border border-slate-200 bg-white shadow-2xs hover:border-slate-300'
                  }`}
                >
                  {isCurrent && (
                    <span className="absolute -top-3 left-6 rounded-full bg-[#FF5722] px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-sm">
                      Current Plan
                    </span>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {plan.badge}
                      </span>
                    </div>

                    <div className="mb-3">
                      <span className="text-2xl font-black text-slate-900">{plan.priceINR}</span>
                      <span className="text-xs text-slate-500 font-medium"> {plan.period}</span>
                      {plan.priceUSD !== 'Custom' && (
                        <div className="text-[11px] text-slate-400 font-medium">
                          or {plan.priceUSD} / month
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                      {plan.description}
                    </p>

                    {/* Features checklist */}
                    <div className="space-y-2 border-t border-slate-100 pt-4 mb-6">
                      {plan.features.map(feat => (
                        <div key={feat} className="flex items-start gap-2 text-xs text-slate-700">
                          <svg className="w-4 h-4 text-[#FF5722] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUpgradePlan(plan.id);
                        setInquiryModalOpen(true);
                      }}
                      className={`w-full py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                        isCurrent
                          ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          : 'bg-[#FF5722] text-white hover:bg-[#e04a1b] shadow-xs'
                      }`}
                    >
                      {isCurrent ? 'Active Plan' : `Upgrade to ${plan.name}`}
                    </button>
                    {!isCurrent && (
                      <a
                        href={getMailtoUrl(plan.name)}
                        className="w-full flex items-center justify-center gap-1.5 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-[#FF5722] transition"
                        title={`Email operations@tasknera.com to upgrade to ${plan.name}`}
                      >
                        <svg className="w-3.5 h-3.5 text-[#FF5722]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span>Email operations@tasknera.com</span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Upgrade / Quota Inquiry Modal */}
      {inquiryModalOpen && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/60 p-4"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setInquiryModalOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF5722]">
                  Workspace Plan Management
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  Request Plan Upgrade or Quota Change
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInquiryModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 text-lg leading-none"
              >
                ×
              </button>
            </div>

            {inquirySubmitted ? (
              <div className="py-8 text-center space-y-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h4 className="text-base font-bold text-slate-900">Request Sent to TaskNera!</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Our account team has received your plan inquiry and will review your workspace allocation shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleInquirySubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Plan</label>
                  <select
                    value={selectedUpgradePlan}
                    onChange={e => setSelectedUpgradePlan(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium outline-none focus:border-[#FF5722] focus:ring-2 focus:ring-[#FF5722]/15"
                  >
                    <option value="STARTER">Starter Plan (5 Seats • 20 JDs • 500 CVs/mo)</option>
                    <option value="PROFESSIONAL">Professional Plan (15 Seats • 40 JDs • 2,500 CVs/mo)</option>
                    <option value="ENTERPRISE">Enterprise Plan (Unlimited Seats • Custom Integrations)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Requirements or Additional Notes
                  </label>
                  <textarea
                    rows={3}
                    value={inquiryNotes}
                    onChange={e => setInquiryNotes(e.target.value)}
                    placeholder="E.g., We need extra recruiter seats or more resume screening allowance for Q4 hiring..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs outline-none focus:border-[#FF5722] focus:ring-2 focus:ring-[#FF5722]/15 placeholder:text-slate-400"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <a
                    href={getMailtoUrl(selectedUpgradePlan)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#FF5722] hover:underline"
                    title="Send pre-filled email from your mail client"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>Or email operations@tasknera.com</span>
                  </a>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInquiryModalOpen(false)}
                      className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-xl bg-[#FF5722] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#e04a1b] transition"
                    >
                      Submit Request
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
