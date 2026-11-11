'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import BookDemoModal from '@/components/BookDemoModal';

interface HeroSectionProps {
  onBookDemo?: () => void;
}

const HeroSection: React.FC<HeroSectionProps> = ({ onBookDemo }) => {
  const [visible, setVisible] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(0);
  const [internalDemoOpen, setInternalDemoOpen] = useState(false);

  const handleBookDemo = () => {
    if (onBookDemo) {
      onBookDemo();
    } else {
      setInternalDemoOpen(true);
    }
  };

  useEffect(() => { setVisible(true); }, []);

  const candidates = [
    { 
      name: 'Sarah Mitchell',  
      role: 'Lead SAP CO Consultant',    
      match: 94, 
      mandatory: '5/5', 
      decision: 'SUBMIT',         
      decisionCls: 'bg-status-submit-bg text-status-submit-text border-status-submit-border',
      evidence: '11+ yrs SAP FICO/COPA, 4 S/4HANA global rollouts, verified CPA & SAP CO certification.'
    },
    { 
      name: 'Michael Chen',    
      role: 'Senior SAP Consultant',        
      match: 76, 
      mandatory: '4/5', 
      decision: 'REVIEW',         
      decisionCls: 'bg-status-review-bg text-status-review-text border-status-review-border',
      evidence: '7 yrs SAP CO experience. Needs clarification on recent S/4HANA migration leadership.'
    },
    { 
      name: 'Jennifer Lopez',  
      role: 'Junior SAP Analyst',   
      match: 52, 
      mandatory: '1/5', 
      decision: 'DO NOT SUBMIT',  
      decisionCls: 'bg-status-reject-bg text-status-reject-text border-status-reject-border',
      evidence: 'Missing mandatory requirement: Minimum 5 years hands-on Profitability Analysis (CO-PA).'
    },
  ];

  const steps = [
    { n: '01', label: 'Upload JD', desc: 'Paste or upload JD text, docx, or pdf', active: true, icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { n: '02', label: 'Review Criteria', desc: 'Confirm mandatory rules & weights', active: true, icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
    { n: '03', label: 'Upload CVs', desc: 'Single or bulk batch up to 50 resumes', active: true, icon: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12' },
    { n: '04', label: 'Deterministic Scoring', desc: 'Auditable, evidence-backed evaluation', active: true, icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  ];

  const scoreColor = (n: number) =>
    n >= 80 ? 'text-green-600' : n >= 65 ? 'text-amber-600' : 'text-red-500';

  const barColor = (n: number) =>
    n >= 80 ? 'bg-green-500' : n >= 65 ? 'bg-amber-500' : 'bg-red-400';

  return (
    <section className="bg-brand-bg relative overflow-hidden bg-radial-orange-subtle">
      {/* Decorative ambient glowing orb */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-brand-orange/5 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* ── Hero split ── */}
      <div className="max-w-screen-xl mx-auto px-6 pt-24 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">

          {/* Left Hero Content */}
          <div className={`lg:col-span-6 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-brand-orange-pale border border-brand-orange-border rounded-full text-xs font-semibold text-brand-orange mb-6 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-brand-orange animate-ping" />
              Recruitment Intelligence
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[52px] font-extrabold text-brand-charcoal leading-[1.15] tracking-tight mb-6">
              Evaluate Candidates With{' '}
              <span className="orange-gradient-text">Evidence.</span>
              <br />
              <span className="text-brand-charcoal-2 font-bold">Never Guesswork.</span>
            </h1>

            <p className="text-brand-charcoal-3 text-lg leading-relaxed mb-8 max-w-xl">
              A deterministic scoring engine ensuring identical evaluations for identical requirements. Every single match score is validated with extracted citations from candidate resumes.
            </p>

            <div className="flex flex-wrap items-center gap-3.5 mb-6">
              <button
                type="button"
                onClick={handleBookDemo}
                className="flex items-center gap-2.5 px-6 py-3.5 bg-brand-orange hover:bg-brand-orange-hover text-white font-bold rounded-xl transition-all shadow-orange hover:shadow-orange-lg hover:-translate-y-0.5 text-sm cursor-pointer group"
              >
                <svg className="w-4 h-4 text-white group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Book a Demo Session</span>
              </button>
              <Link
                href="/jobs/create"
                className="flex items-center gap-2 px-6 py-3.5 bg-brand-white hover:bg-brand-bg-2 border border-brand-border text-brand-charcoal font-semibold rounded-xl transition-all hover:-translate-y-0.5 text-sm shadow-xs"
              >
                Start Free Evaluation
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link
                href="/dashboard"
                className="flex items-center gap-2 px-5 py-3.5 text-slate-600 hover:text-slate-900 text-sm font-semibold transition-colors"
              >
                Explore Dashboard →
              </Link>
            </div>

            {/* Direct contact note for enterprise/Capterra visitors */}
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-8">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Enterprise demo scheduling &amp; queries:</span>
              <Link 
                href="/contact" 
                className="font-bold text-brand-orange hover:underline flex items-center gap-1"
              >
                <span>Contact Operations Team</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-5 text-xs sm:text-sm font-medium text-brand-charcoal-3">
              {['100% Deterministic', 'Direct CV Citations', 'Zero AI Hallucination'].map((b, i) => (
                <div key={i} className="flex items-center gap-2 bg-white/80 px-3 py-1.5 rounded-lg border border-brand-border/60 shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                  {b}
                </div>
              ))}
            </div>
          </div>

          {/* Right — Interactive Live Evaluation Preview Card */}
          <div className={`lg:col-span-6 transition-all duration-700 delay-200 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            <div className="bg-brand-white border border-brand-border rounded-3xl shadow-xl overflow-hidden ring-1 ring-black/5 card-hover-lift">

              {/* Card header */}
              <div className="px-6 py-4 border-b border-brand-border bg-gradient-to-r from-brand-charcoal to-brand-charcoal-2 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-brand-orange flex items-center justify-center font-bold text-xs text-white shadow-orange">
                    JD
                  </div>
                  <div>
                    <h3 className="text-sm font-bold leading-tight">SAP CO Lead Consultant</h3>
                    <p className="text-[11px] text-white/70">TechCorp Global • Job #JD-408</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 rounded-full text-[11px] font-medium text-white/90">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Live Match Mode
                </div>
              </div>

              {/* Column headings */}
              <div className="grid grid-cols-12 px-6 py-3 border-b border-brand-border bg-brand-bg/70 text-[11px] font-bold text-brand-charcoal-3 uppercase tracking-wider">
                <div className="col-span-5">Candidate Profile</div>
                <div className="col-span-3 text-center">Match Index</div>
                <div className="col-span-2 text-center">Mandatory</div>
                <div className="col-span-2 text-right">Action</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-brand-border">
                {candidates.map((c, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedCandidate(i)}
                    className={`grid grid-cols-12 px-6 py-4 items-center cursor-pointer transition-all ${
                      selectedCandidate === i
                        ? 'bg-brand-orange-pale/50 border-l-4 border-l-brand-orange'
                        : 'hover:bg-brand-bg/50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="col-span-5 flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 transition-colors ${
                        selectedCandidate === i ? 'bg-brand-orange text-white' : 'bg-brand-bg-2 text-brand-charcoal'
                      }`}>
                        {c.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-brand-charcoal text-sm font-bold truncate">{c.name}</div>
                        <div className="text-brand-charcoal-3 text-xs truncate">{c.role}</div>
                      </div>
                    </div>

                    <div className="col-span-3 text-center">
                      <div className="flex items-baseline justify-center gap-0.5">
                        <span className={`text-base font-extrabold ${scoreColor(c.match)}`}>{c.match}</span>
                        <span className="text-brand-charcoal-3 text-xs font-semibold">/100</span>
                      </div>
                      <div className="w-16 h-1.5 bg-brand-bg-2 rounded-full mx-auto mt-1 overflow-hidden">
                        <div className={`h-full rounded-full ${barColor(c.match)} transition-all duration-500`} style={{ width: `${c.match}%` }} />
                      </div>
                    </div>

                    <div className="col-span-2 text-center">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                        c.mandatory.startsWith('5') ? 'bg-emerald-50 text-emerald-700' : c.mandatory.startsWith('4') ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {c.mandatory}
                      </span>
                    </div>

                    <div className="col-span-2 text-right">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${c.decisionCls}`}>
                        {c.decision === 'DO NOT SUBMIT' ? 'REJECT' : c.decision}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Selected Candidate Evidence Citation Preview */}
              <div className="p-4 bg-brand-bg border-t border-brand-border flex items-start gap-3">
                <div className="w-5 h-5 rounded-md bg-brand-orange text-white flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">
                  ✓
                </div>
                <div>
                  <div className="text-[11px] font-bold text-brand-charcoal uppercase tracking-wider mb-0.5 flex items-center gap-2">
                    <span>Evidence Citation for {candidates[selectedCandidate].name}</span>
                    <span className="text-brand-orange font-semibold lowercase">({candidates[selectedCandidate].match}% confidence)</span>
                  </div>
                  <p className="text-xs text-brand-charcoal-2 italic leading-relaxed">
                    "{candidates[selectedCandidate].evidence}"
                  </p>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* ── Workflow Steps Cards ── */}
      <div className="bg-brand-white border-t border-brand-border">
        <div className="max-w-screen-xl mx-auto px-6 py-16">
          <div className="text-center max-w-xl mx-auto mb-12">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-orange-pale rounded-full text-xs font-bold text-brand-orange uppercase tracking-wider mb-2">
              Workflow
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-charcoal mb-2">How HireIQ by TaskNera Operates</h2>
            <p className="text-brand-charcoal-3 text-sm">Four automated steps from raw job description to client-ready evaluation reports</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((s, i) => (
              <div
                key={i}
                className="group relative bg-brand-bg hover:bg-white p-6 rounded-2xl border border-brand-border hover:border-brand-orange-border transition-all duration-300 card-hover-lift"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-orange-pale group-hover:bg-brand-orange text-brand-orange group-hover:text-white flex items-center justify-center transition-colors mb-4 shadow-xs">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={s.icon} />
                  </svg>
                </div>
                <div className="text-[11px] font-extrabold text-brand-orange uppercase tracking-widest mb-1">Step {s.n}</div>
                <h4 className="text-base font-bold text-brand-charcoal mb-1.5">{s.label}</h4>
                <p className="text-xs text-brand-charcoal-3 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <BookDemoModal
        isOpen={internalDemoOpen}
        onClose={() => setInternalDemoOpen(false)}
      />
    </section>
  );
};

export default HeroSection;
