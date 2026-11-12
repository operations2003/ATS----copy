'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import HeroSection from './components/HeroSection';
import { useAuth } from '@/context/AuthContext';
import { AuthModal } from '@/components/AuthModal';
import BookDemoModal from '@/components/BookDemoModal';

const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Fixed Scoring Framework',
    desc: 'Same JD + CV + rules = same score, every time. No AI guessing.',
    stat: '100% Deterministic',
    statColor: 'text-green-600 bg-green-50 border-green-200',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    title: 'Evidence-Based Matching',
    desc: 'Every match shows the exact CV text used as evidence.',
    stat: 'Fully Auditable',
    statColor: 'text-blue-600 bg-blue-50 border-blue-200',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    title: 'Mandatory Rule Engine',
    desc: 'Failed mandatory requirement? Flagged immediately, regardless of overall score.',
    stat: 'Hard Rules Applied',
    statColor: 'text-red-600 bg-red-50 border-red-200',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'ATS Compatibility Score',
    desc: 'Separate from JD match — tells you if the CV is optimized, not just if the candidate fits.',
    stat: 'Separate Score',
    statColor: 'text-purple-600 bg-purple-50 border-purple-200',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: 'Bulk Evaluation',
    desc: 'Upload 50 CVs against one JD. Ranked, filtered, and ready to action.',
    stat: 'Up to 50 CVs',
    statColor: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    ),
    title: 'Client Submission Summary',
    desc: 'One-click professional summary ready to send to the client.',
    stat: 'One Click',
    statColor: 'text-teal-600 bg-teal-50 border-teal-200',
  },
];

const testimonials = [
  {
    quote: 'HireIQ by TaskNera reduced our time-to-hire by 60%. The scoring is consistent and every decision is backed by evidence.',
    author: 'Sarah Mitchell',
    role: 'Head of HR, TechCorp',
    avatar: 'SM',
  },
  {
    quote: 'Best recruitment evaluation tool we have used. The mandatory rule engine saves us from submitting the wrong candidates.',
    author: 'James Chen',
    role: 'Talent Acquisition Lead, StartupXYZ',
    avatar: 'JC',
  },
];

export default function HomePage() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [biasGuardActive, setBiasGuardActive] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'scoring' | 'auditing' | 'speed'>('all');
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  const handleCta = (path: string) => {
    if (isAuthenticated) router.push(path);
    else setAuthModalOpen(true);
  };

  const filteredFeatures = activeTab === 'all' 
    ? features 
    : activeTab === 'scoring' 
    ? [features[0], features[2], features[3]]
    : activeTab === 'auditing'
    ? [features[1], features[2], features[5]]
    : [features[4], features[5], features[0]];

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col selection:bg-brand-orange-pale selection:text-brand-orange">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <HeroSection onBookDemo={() => setDemoModalOpen(true)} />

        {/* Features Interactive Showcase */}
        <section className="bg-brand-white border-t border-brand-border py-24 relative overflow-hidden">
          <div className="max-w-screen-xl mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-orange-pale border border-brand-orange-border/70 rounded-full text-xs font-bold text-brand-orange uppercase tracking-wider mb-3">
                Core Capabilities
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-brand-charcoal tracking-tight mb-3">
                Engineered for Enterprise Talent Acquisition
              </h2>
              <p className="text-brand-charcoal-3 text-base leading-relaxed">
                Not a generative AI chatbot making subjective decisions. HireIQ by TaskNera uses an auditable, deterministic framework with direct resume proof.
              </p>

              {/* Filter Pills */}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
                {[
                  { id: 'all', label: 'All Capabilities' },
                  { id: 'scoring', label: 'Scoring Engine' },
                  { id: 'auditing', label: 'Compliance & Audit' },
                  { id: 'speed', label: 'Speed & Scale' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      activeTab === tab.id
                        ? 'bg-brand-orange text-white shadow-orange scale-105'
                        : 'bg-brand-bg text-brand-charcoal-2 hover:bg-brand-bg-2 hover:text-brand-charcoal border border-brand-border'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredFeatures.map((f, i) => (
                <div
                  key={i}
                  className="group bg-brand-bg hover:bg-white border border-brand-border hover:border-brand-orange-border rounded-2xl p-7 transition-all duration-300 card-hover-lift flex flex-col justify-between"
                >
                  <div>
                    <div className="w-12 h-12 rounded-xl bg-brand-orange-pale group-hover:bg-brand-orange text-brand-orange group-hover:text-white flex items-center justify-center mb-5 transition-all shadow-xs">
                      {f.icon}
                    </div>
                    <h3 className="text-base font-bold text-brand-charcoal mb-2.5">{f.title}</h3>
                    <p className="text-xs sm:text-sm text-brand-charcoal-3 leading-relaxed mb-6">{f.desc}</p>
                  </div>
                  <div className="pt-4 border-t border-brand-border/60 flex items-center justify-between">
                    <span className={`inline-flex px-3 py-1 rounded-lg text-xs font-bold border ${f.statColor}`}>
                      {f.stat}
                    </span>
                    <span className="text-[11px] font-semibold text-brand-charcoal-3 group-hover:text-brand-orange transition-colors flex items-center gap-1">
                      Learn more →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bias Guard Interactive Showcase */}
        <section className="bg-gradient-to-b from-brand-bg via-white to-brand-bg border-t border-brand-border py-24 relative overflow-hidden">
          {/* Subtle colorful ambient background glow */}
          <div className="absolute top-1/2 -left-20 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-1/2 -right-20 -translate-y-1/2 w-96 h-96 bg-brand-orange/10 rounded-full blur-3xl pointer-events-none" />

          <div className="max-w-screen-xl mx-auto px-6 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              
              {/* Left explanation */}
              <div className="lg:col-span-6">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-bold text-emerald-700 uppercase tracking-wider mb-4 shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Ethical AI & EEOC Compliance
                </div>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-brand-charcoal tracking-tight leading-tight mb-4">
                  Eliminate Subconscious Bias With <span className="orange-gradient-text">Bias Guard™</span>
                </h2>
                <p className="text-brand-charcoal-3 text-base leading-relaxed mb-6">
                  Ensure equal opportunity and regulatory alignment. With one click, candidate identifiers (name, photo, gender, age, and university prestige) are anonymized during initial evaluation stages, focusing solely on verified competency.
                </p>

                <div className="space-y-3.5 mb-8">
                  {[
                    { text: 'Automated PII Redaction before scoring algorithm executes', color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
                    { text: 'Competency-first ranking based strictly on validated JD requirements', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
                    { text: 'Full audit logging for EEOC and corporate diversity compliance', color: 'text-brand-orange bg-brand-orange-pale border-brand-orange-border' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 bg-white/80 p-3 rounded-xl border border-brand-border/80 shadow-xs">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5 border ${item.color}`}>
                        ✓
                      </div>
                      <span className="text-sm font-semibold text-brand-charcoal-2">{item.text}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-brand-border shadow-sm max-w-md">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-800 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold text-brand-charcoal">Toggle Bias Guard Preview</div>
                    <div className="text-[11px] text-brand-charcoal-3">Switch between Anonymized & Identified mode</div>
                  </div>
                  <button
                    onClick={() => setBiasGuardActive(!biasGuardActive)}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 shadow-inner ${
                      biasGuardActive ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-slate-300'
                    }`}
                    aria-label="Toggle Bias Guard"
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${
                        biasGuardActive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Right: Live Interactive Card Transformation */}
              <div className="lg:col-span-6">
                <div className="relative group">
                  {/* Decorative glowing gradient ring */}
                  <div className={`absolute -inset-1 rounded-[28px] opacity-75 blur-xl transition-all duration-500 ${
                    biasGuardActive 
                      ? 'bg-gradient-to-r from-emerald-500/30 via-indigo-500/20 to-teal-500/30' 
                      : 'bg-gradient-to-r from-orange-500/30 via-amber-500/20 to-rose-500/30'
                  }`} />

                  {/* Main Card Container */}
                  <div className="relative bg-white/95 backdrop-blur-xl border border-brand-border/90 rounded-3xl p-7 shadow-2xl card-hover-lift overflow-hidden">
                    
                    {/* Top ambient color accent line */}
                    <div className={`absolute top-0 left-0 right-0 h-1.5 transition-all duration-500 ${
                      biasGuardActive 
                        ? 'bg-gradient-to-r from-indigo-600 via-emerald-500 to-teal-400' 
                        : 'bg-gradient-to-r from-brand-orange via-amber-500 to-orange-400'
                    }`} />

                    {/* Card Header */}
                    <div className="flex items-center justify-between pb-5 border-b border-brand-border/80 mb-5">
                      <div className="flex items-center gap-3.5">
                        {/* Profile Avatar (No question marks - Clean Shield or Initials) */}
                        {biasGuardActive ? (
                          <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-indigo-200 ring-2 ring-indigo-500/30 shadow-md flex flex-col items-center justify-center transition-all">
                            <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            <span className="text-[9px] font-mono font-bold tracking-widest text-indigo-300 uppercase mt-0.5">#804</span>
                          </div>
                        ) : (
                          <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-brand-orange via-orange-500 to-amber-500 text-white ring-2 ring-orange-400/40 shadow-md shadow-orange/20 flex items-center justify-center font-black text-lg transition-all">
                            AL
                          </div>
                        )}

                        <div>
                          <div className="text-base sm:text-lg font-extrabold text-brand-charcoal flex items-center gap-2 flex-wrap">
                            <span>{biasGuardActive ? 'Candidate #804 (Anonymized)' : 'Alexander Laurent'}</span>
                            {biasGuardActive ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold shadow-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Protected
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold shadow-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                Verified
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-medium text-brand-charcoal-3 flex items-center gap-1 mt-0.5">
                            <svg className="w-3.5 h-3.5 text-brand-charcoal-3/70 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>{biasGuardActive ? 'Senior Full-Stack Architect • [Location Redacted]' : 'Senior Full-Stack Architect • Austin, TX'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <div className="text-2xl sm:text-3xl font-black bg-gradient-to-br from-brand-orange via-orange-500 to-amber-500 bg-clip-text text-transparent">
                          96%
                        </div>
                        <div className="text-[10px] uppercase font-extrabold tracking-wider text-brand-charcoal-3">
                          Match Score
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar & Key Requirement Checklist */}
                    <div className="space-y-4 mb-5">
                      <div>
                        <div className="text-xs font-bold text-brand-charcoal mb-2 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Core Requirement Verification
                          </span>
                          <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                            6/6 Mandatory Met (100%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden p-0.5 border border-slate-200/60">
                          <div className="bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 h-full rounded-full transition-all duration-700 shadow-sm" style={{ width: '100%' }} />
                        </div>
                      </div>

                      {/* Verified Skills Tags */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {['React 19 Architecture', 'Distributed Systems', 'TypeScript / Node', 'System Design'].map((skill, sIdx) => (
                          <span key={sIdx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50/80 border border-emerald-200/80 text-[11px] font-semibold text-emerald-800">
                            <span className="text-emerald-600 font-bold">✓</span>
                            {skill}
                          </span>
                        ))}
                      </div>

                      {/* Demonstrated Skill Box with colorful gradient backdrop */}
                      <div className="bg-gradient-to-r from-indigo-50/70 via-blue-50/40 to-slate-50 rounded-2xl p-4 border-l-4 border-l-brand-orange border-y border-r border-indigo-100/80 shadow-xs space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-brand-charcoal flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-brand-orange" />
                            <strong className="text-brand-charcoal">Demonstrated Skill:</strong> Distributed Systems & React Architecture
                          </span>
                          <span className="text-[10px] font-mono text-brand-charcoal-3 bg-white border border-brand-border px-2 py-0.5 rounded-md font-semibold">
                            CV Citation Verified
                          </span>
                        </div>
                        <div className="text-xs text-brand-charcoal-2 italic pl-3 border-l-2 border-brand-orange/40 leading-relaxed font-medium">
                          "Architected micro-frontend platform handling 14M daily queries with 99.99% availability."
                        </div>
                      </div>
                    </div>

                    {/* Card Footer Action */}
                    <div className="flex items-center justify-between text-xs pt-3 border-t border-brand-border/80 flex-wrap gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-brand-charcoal-3 font-semibold">Evaluation Status:</span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-extrabold rounded-lg text-xs shadow-xs tracking-wider uppercase">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          SUBMIT TO CLIENT
                        </span>
                      </div>
                      <button
                        onClick={() => handleCta('/candidates')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-brand-charcoal to-slate-800 hover:from-brand-orange hover:to-orange-600 text-white font-bold rounded-xl text-xs transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
                      >
                        <span>Audit Full Profile</span>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="bg-brand-white border-t border-brand-border py-24">
          <div className="max-w-screen-xl mx-auto px-6">
            <div className="text-center max-w-xl mx-auto mb-14">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-orange-pale rounded-full text-xs font-bold text-brand-orange uppercase tracking-wider mb-2">
                User Testimonials
              </div>
              <h2 className="text-3xl font-extrabold text-brand-charcoal mb-2">Trusted by Leading Hiring Teams</h2>
              <p className="text-brand-charcoal-3 text-sm">See how recruiters and agency heads transform their candidate quality</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {testimonials.map((t, i) => (
                <div key={i} className="bg-brand-bg border border-brand-border rounded-3xl p-8 shadow-sm hover:shadow-md transition-all card-hover-lift flex flex-col justify-between">
                  <p className="text-brand-charcoal text-sm sm:text-base leading-relaxed italic mb-6">
                    "{t.quote}"
                  </p>
                  <div className="flex items-center gap-3.5 pt-4 border-t border-brand-border/60">
                    <div className="w-11 h-11 rounded-2xl bg-brand-orange text-white font-extrabold text-sm flex items-center justify-center flex-shrink-0 shadow-orange">
                      {t.avatar}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-brand-charcoal">{t.author}</div>
                      <div className="text-xs font-medium text-brand-charcoal-3">{t.role}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Enterprise Demo CTA Banner for Capterra & Direct Inquiries */}
        <section className="bg-gradient-to-br from-brand-charcoal via-slate-900 to-brand-charcoal text-white py-16 border-t border-slate-800">
          <div className="max-w-screen-xl mx-auto px-6 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs font-semibold text-brand-orange mb-4 border border-white/15">
              <span className="w-2 h-2 rounded-full bg-brand-orange animate-ping" />
              Direct Operations Consultation
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
              See HireIQ in Action on Your Real Resumes
            </h2>
            <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto mb-8 leading-relaxed">
              Book a live 20-minute walkthrough tailored to your talent acquisition workflows. 
              Our team will benchmark your current hiring rubrics against our deterministic scoring engine.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setDemoModalOpen(true)}
                className="flex items-center gap-2.5 px-7 py-3.5 bg-brand-orange hover:bg-brand-orange-hover text-white font-bold rounded-xl transition-all shadow-orange hover:shadow-orange-lg hover:-translate-y-0.5 text-sm cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Book a Demo Session</span>
              </button>
              <Link
                href="/contact"
                className="flex items-center gap-2 px-6 py-3.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold rounded-xl transition-all text-sm"
              >
                <svg className="w-4 h-4 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>Contact Operations Desk</span>
              </Link>
            </div>
          </div>
        </section>

      </main>

      <Footer />

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode="signin"
      />
      <BookDemoModal
        isOpen={demoModalOpen}
        onClose={() => setDemoModalOpen(false)}
      />
    </div>
  );
}
