'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchApi } from '../lib/api';
import Logo from './Logo';

export const SubscriptionModelModal: React.FC = () => {
  const { user, token, logout } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'>('PROFESSIONAL');
  const [showInquiryModal, setShowInquiryModal] = useState(false);
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  const plans = [
    {
      id: 'STARTER' as const,
      name: 'Starter Plan',
      badge: 'Boutique Agencies',
      priceINR: '₹3,999',
      priceUSD: '$49',
      period: '/ month',
      description: 'Essential recruitment intelligence for small staffing teams and independent recruiters.',
      features: [
        'Up to 5 Team Members',
        '20 Active Job Postings',
        '500 Candidate Resumes / mo',
        'Automated CV Extraction (PDF/DOCX)',
        'Objective ATS Scoring Engine',
        'Standard Email Support',
      ],
      popular: false,
      cta: 'Choose Starter Plan',
    },
    {
      id: 'PROFESSIONAL' as const,
      name: 'Professional Plan',
      badge: 'Most Popular',
      priceINR: '₹9,999',
      priceUSD: '$119',
      period: '/ month',
      description: 'Comprehensive hiring automation and benchmarking for fast-scaling recruitment agencies.',
      features: [
        'Up to 15 Team Members',
        'Unlimited Active Job Openings',
        '2,500 Candidate Resumes / mo',
        'Deep JD Requirement & Alias Extraction',
        'Candidate Benchmarking & Match Radar',
        'Client Candidate Share Portals',
        'Priority AI Processing Queue',
        'Dedicated Account Manager & SLA Support',
      ],
      popular: true,
      cta: 'Choose Professional Plan',
    },
    {
      id: 'ENTERPRISE' as const,
      name: 'Enterprise Plan',
      badge: 'Corporate Scale',
      priceINR: 'Custom',
      priceUSD: 'Custom',
      period: 'tailored billing',
      description: 'Custom architecture, dedicated SLAs, and custom LLM tuning for corporate talent acquisition.',
      features: [
        'Unlimited Recruiters & Team Members',
        'Unlimited Jobs & Candidate Resumes',
        'Custom ATS & HRIS API Integrations',
        'Proprietary AI Scoring Weights & Logic',
        'SOC-2 Compliant Tenant Data Isolation',
        'Custom SLAs & 24/7 Phone / WhatsApp Support',
      ],
      popular: false,
      cta: 'Contact Enterprise Sales',
    },
  ];

  const handleSelectPlan = (planId: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE') => {
    setSelectedPlan(planId);
    setShowInquiryModal(true);
    setIsSuccess(false);
    setError('');
  };

  const handleSubmitInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      await fetchApi(
        '/auth/subscription-inquiry',
        {
          method: 'POST',
          body: JSON.stringify({
            plan: selectedPlan,
            phone,
            notes,
          }),
        },
        token
      );
      setIsSuccess(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to submit request. Please reach out to operations@tasknera.com directly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-md overflow-y-auto flex flex-col justify-between selection:bg-brand-orange selection:text-white">
      {/* Top Bar */}
      <header className="w-full bg-white/95 border-b border-slate-200 py-3.5 px-6 sm:px-12 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <Logo href="/home" size="sm" variant="dark" />
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600">
            <span>Signed in as:</span>
            <strong className="text-slate-900 font-semibold">{user?.email}</strong>
          </div>
          <button
            onClick={logout}
            className="text-xs font-bold text-slate-600 hover:text-rose-600 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Banner Alert Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-extrabold uppercase tracking-wider mb-4 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span>14-Day Complimentary Trial Ended</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight mb-4">
            Select Your Subscription Model
          </h1>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Your 14-day free trial has expired. To continue utilizing HireIQ for candidate evaluations, automated resume screening, and client submissions, choose an enterprise subscription plan below.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch mb-12">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col justify-between bg-white rounded-3xl p-7 sm:p-8 transition-all duration-200 ${
                plan.popular
                  ? 'border-2 border-brand-orange shadow-[0_20px_50px_rgba(249,115,22,0.22)] md:-translate-y-2'
                  : 'border border-slate-200/90 shadow-xl hover:shadow-2xl'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-brand-orange text-white text-[11px] font-black uppercase tracking-wider shadow-md">
                  ★ Most Recommended ★
                </div>
              )}

              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    {plan.badge}
                  </span>
                </div>

                <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
                  {plan.name}
                </h2>

                <p className="text-slate-500 text-xs leading-relaxed mb-6">
                  {plan.description}
                </p>

                {/* Price Display */}
                <div className="flex items-baseline gap-1.5 mb-6 pb-6 border-b border-slate-100">
                  <span className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                    {plan.priceINR}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    ({plan.priceUSD}) {plan.period}
                  </span>
                </div>

                {/* Features list */}
                <div className="space-y-3 mb-8">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    Plan Highlights:
                  </div>
                  {plan.features.map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700">
                      <span className="w-4 h-4 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-[11px] font-black flex-shrink-0 mt-0.5 border border-emerald-200">
                        ✓
                      </span>
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={() => handleSelectPlan(plan.id)}
                className={`w-full py-3.5 px-4 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  plan.popular
                    ? 'bg-brand-orange hover:bg-brand-orange-hover text-white shadow-orange hover:shadow-orange-lg'
                    : 'bg-slate-900 hover:bg-slate-800 text-white shadow-md'
                }`}
              >
                <span>{plan.cta}</span>
                <span>→</span>
              </button>
            </div>
          ))}
        </div>

        {/* Quick Contact & Instant Activation Footer */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-6 sm:p-8 text-white flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="text-lg font-bold">Need Immediate Access or Custom Invoicing?</h3>
            <p className="text-xs text-slate-300">
              Our operations team can activate your account instantly via WhatsApp, phone, or direct bank transfer.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="tel:+919312506515"
              className="px-4 py-2.5 rounded-xl bg-white text-slate-900 font-bold text-xs hover:bg-slate-100 transition-colors flex items-center gap-2 shadow-sm"
            >
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span>+91 9312506515</span>
            </a>
            <a
              href="mailto:operations@tasknera.com?subject=Subscription%20Plan%20Inquiry%20-%20HireIQ"
              className="px-4 py-2.5 rounded-xl bg-brand-orange hover:bg-brand-orange-hover text-white font-bold text-xs transition-colors flex items-center gap-2 shadow-orange"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span>operations@tasknera.com</span>
            </a>
          </div>
        </div>
      </main>

      {/* Plan Inquiry Modal */}
      {showInquiryModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="h-1.5 bg-gradient-to-r from-brand-orange via-amber-500 to-[#00D2B4] w-full" />

            <div className="p-7">
              <div className="flex items-center justify-between mb-4">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-extrabold uppercase tracking-wider">
                  Plan Request
                </div>
                <button
                  type="button"
                  onClick={() => setShowInquiryModal(false)}
                  className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {isSuccess ? (
                <div className="text-center py-4">
                  <div className="w-14 h-14 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-3xl flex items-center justify-center text-2xl mx-auto mb-3 shadow-sm">
                    ✓
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mb-2">Subscription Request Received</h3>
                  <p className="text-slate-600 text-xs leading-relaxed mb-6">
                    Thank you! Our operations team has received your request for the <strong>{selectedPlan} Plan</strong>. We will contact you at <strong>{phone || user?.email}</strong> shortly with your invoice and activation details.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowInquiryModal(false)}
                    className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    Close Window
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitInquiry} className="space-y-4">
                  <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">
                      Confirm Subscription Plan
                    </h3>
                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                      You are requesting activation for the <strong className="text-brand-orange">{selectedPlan} Plan</strong>.
                    </p>
                  </div>

                  {error && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                      {error}
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Selected Tier
                    </label>
                    <select
                      value={selectedPlan}
                      onChange={(e) => setSelectedPlan(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange"
                    >
                      <option value="STARTER">Starter Plan (₹3,999 / $49 mo)</option>
                      <option value="PROFESSIONAL">Professional Plan (₹9,999 / $119 mo) - Recommended</option>
                      <option value="ENTERPRISE">Enterprise Plan (Custom SLA & Scale)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Contact Phone / WhatsApp
                    </label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Notes or Billing Preferences <span className="text-slate-400 font-normal lowercase">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Need annual GST invoice, 10 recruiter accounts"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3 px-4 bg-brand-orange hover:bg-brand-orange-hover disabled:opacity-60 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-orange cursor-pointer flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <span>Submitting Request...</span>
                      ) : (
                        <>
                          <span>Submit Activation Request</span>
                          <span>→</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full py-4 px-6 text-center text-xs text-slate-400 border-t border-slate-800 bg-slate-950/60">
        © {new Date().getFullYear()} HireIQ by TaskNera. Enterprise Recruitment Intelligence Platform.
      </footer>
    </div>
  );
};

