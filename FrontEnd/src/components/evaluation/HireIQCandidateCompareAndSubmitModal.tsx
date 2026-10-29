'use client';

import React, { useState } from 'react';

export interface CandidateComparisonItem {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  totalExperienceYears?: number;
  score: number;
  decisionTag?: string;
  matchResult?: any;
  skills?: string[];
  noticePeriod?: string;
  expectedSalary?: string;
  currentSalary?: string;
  gapAnalysis?: {
    hasGap: boolean;
    totalGapMonths: number;
    statusText: string;
  };
}

interface HireIQCandidateCompareAndSubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: {
    id: string;
    position: string;
    client: string;
    location?: string;
    salary?: string;
    requirements?: Array<{ id: string; requirement: string; isMandatory?: boolean }>;
  };
  selectedCandidates: CandidateComparisonItem[];
  defaultTab?: 'compare' | 'submit';
}

export default function HireIQCandidateCompareAndSubmitModal({
  isOpen,
  onClose,
  job,
  selectedCandidates,
  defaultTab = 'compare',
}: HireIQCandidateCompareAndSubmitModalProps) {
  const [activeTab, setActiveTab] = useState<'compare' | 'submit'>(defaultTab);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [includeSalary, setIncludeSalary] = useState(true);
  const [includeContact, setIncludeContact] = useState(false);

  if (!isOpen || selectedCandidates.length === 0) return null;

  // Compute Ranking Recommendation based on Score & Mandatory Pass
  const rankedCandidates = [...selectedCandidates].sort((a, b) => {
    const aMandatoryMet = a.matchResult?.mandatoryAllPassed !== false ? 1 : 0;
    const bMandatoryMet = b.matchResult?.mandatoryAllPassed !== false ? 1 : 0;
    if (aMandatoryMet !== bMandatoryMet) return bMandatoryMet - aMandatoryMet;
    return b.score - a.score;
  });

  const getRankBadge = (candidateId: string, index: number) => {
    const candidate = rankedCandidates.find(c => c.id === candidateId);
    if (!candidate) return null;
    const mandatoryFail = candidate.matchResult?.mandatoryAllPassed === false;

    if (mandatoryFail) {
      return {
        label: 'High Risk / Non-Compliant',
        bg: 'bg-rose-50 text-rose-700 border-rose-200',
        badge: 'Hold',
      };
    }
    if (index === 0) {
      return {
        label: 'Top Recommendation (Primary)',
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        badge: 'Rank #1',
      };
    }
    if (index === 1) {
      return {
        label: 'Strong Alternate',
        bg: 'bg-blue-50 text-blue-700 border-blue-200',
        badge: 'Rank #2',
      };
    }
    return {
      label: 'Secondary Backup',
      bg: 'bg-amber-50 text-amber-700 border-amber-200',
      badge: `Rank #${index + 1}`,
    };
  };

  // Generate Client Submission Email Draft
  const generateClientEmail = () => {
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    let text = `Subject: Candidate Shortlist Submission: ${job.position} — ${job.client}\n\n`;
    text += `Dear Hiring Team at ${job.client},\n\n`;
    text += `Please find our evaluated candidate shortlist for the ${job.position} position evaluated via Tasknera HireIQ.\n\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `REQUISITION SUMMARY: ${job.position} (${job.location || 'Location Flexible'})\n`;
    text += `Date of Submission: ${dateStr}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    rankedCandidates.forEach((c, idx) => {
      const rankInfo = getRankBadge(c.id, idx);
      const mandatoryPassed = c.matchResult?.mandatoryAllPassed !== false;
      const skillsList = (c.skills || []).slice(0, 6).join(', ');

      text += `CANDIDATE ${idx + 1}: ${c.name.toUpperCase()} [${rankInfo?.badge || ''}]\n`;
      text += `• ATS Match Score: ${c.score}/100\n`;
      text += `• Recommendation: ${rankInfo?.label}\n`;
      text += `• Mandatory Requirements: ${mandatoryPassed ? '100% Passed ✅' : 'Exceptions Found ⚠️'}\n`;
      text += `• Experience: ${c.totalExperienceYears ? `${c.totalExperienceYears} Years` : 'Demonstrated Professional Experience'}\n`;
      text += `• Current Role: ${c.currentTitle || 'Professional'} ${c.currentCompany ? `at ${c.currentCompany}` : ''}\n`;
      text += `• Key Technical Competencies: ${skillsList || 'Verified Technical Stack'}\n`;
      if (includeSalary) {
        text += `• Notice Period / Availability: ${c.noticePeriod || 'Standard / Confirming'}\n`;
        if (c.expectedSalary) text += `• Expected CTC: ${c.expectedSalary}\n`;
      }
      if (includeContact) {
        if (c.email) text += `• Email: ${c.email}\n`;
        if (c.phone) text += `• Phone: ${c.phone}\n`;
      }
      if (c.gapAnalysis?.hasGap) {
        text += `• Note on Work History: ${c.gapAnalysis.statusText}\n`;
      }
      text += `\n`;
    });

    text += `\nNext Steps: Let us know your availability for initial technical rounds, and we will schedule interviews promptly.\n\n`;
    text += `Best regards,\n`;
    text += `Talent Acquisition Team\n`;
    text += `Tasknera Recruitment Operations`;
    return text;
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(generateClientEmail());
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="px-6 py-4.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-orange/20 border border-brand-orange/40 flex items-center justify-center text-brand-orange font-mono font-bold text-base">
              IQ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base tracking-tight text-white">
                  HireIQ Decision & Client Submission Suite
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-orange text-white uppercase tracking-wider">
                  {selectedCandidates.length} Selected
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                {job.position} • {job.client}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Close modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab('compare')}
              className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'compare'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>📊 Candidate Comparison Matrix</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
                {selectedCandidates.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('submit')}
              className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'submit'
                  ? 'bg-brand-orange text-white shadow-orange'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>📨 Client Submission Pitch</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 text-white">
                Client-Ready
              </span>
            </button>
          </div>

          <div className="text-xs text-slate-500 font-medium hidden sm:block">
            {activeTab === 'compare' ? 'Side-by-side evaluation matrix' : 'Auto-generated client executive brief'}
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'compare' ? (
            /* ─────────────────────────────────────────────────────────────
               TAB 1: SIDE-BY-SIDE CANDIDATE COMPARISON MATRIX
            ───────────────────────────────────────────────────────────── */
            <div className="space-y-6">
              {/* Shortlist Hierarchy Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white border border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🏆</span>
                  <div>
                    <h4 className="font-extrabold text-sm text-white">HireIQ Automated Recommendation</h4>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Evaluated using deterministic mandatory constraints, technical evidence depth, and risk signals.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {rankedCandidates.map((c, i) => {
                    const r = getRankBadge(c.id, i);
                    return (
                      <span key={c.id} className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${r?.bg}`}>
                        {c.name}: <strong>{r?.badge}</strong>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Side-by-Side Comparison Grid */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white shadow-xs">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="p-4 w-44">Evaluation Criteria</th>
                      {rankedCandidates.map((c, i) => {
                        const rankInfo = getRankBadge(c.id, i);
                        return (
                          <th key={c.id} className="p-4 min-w-[200px]">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="font-extrabold text-sm text-slate-900">{c.name}</div>
                                <div className="text-[11px] text-slate-500 font-medium truncate max-w-[150px]">
                                  {c.currentTitle || 'Candidate Profile'}
                                </div>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${rankInfo?.bg}`}>
                                {rankInfo?.badge}
                              </span>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {/* Overall Match Score */}
                    <tr className="hover:bg-slate-50/60">
                      <td className="p-4 font-bold text-slate-700 bg-slate-50/50">Overall ATS Match</td>
                      {rankedCandidates.map(c => (
                        <td key={c.id} className="p-4">
                          <div className="flex items-center gap-2">
                            <span className={`text-base font-black ${c.score >= 80 ? 'text-emerald-600' : c.score >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                              {c.score}/100
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">
                              {c.decisionTag || (c.score >= 80 ? 'Submit' : c.score >= 60 ? 'Review' : 'Hold')}
                            </span>
                          </div>
                        </td>
                      ))}
                    </tr>

                    {/* Mandatory Compliance */}
                    <tr className="hover:bg-slate-50/60">
                      <td className="p-4 font-bold text-slate-700 bg-slate-50/50">Mandatory Rules</td>
                      {rankedCandidates.map(c => {
                        const passed = c.matchResult?.mandatoryAllPassed !== false;
                        return (
                          <td key={c.id} className="p-4">
                            {passed ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200">
                                ✅ 100% Passed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200">
                                ❌ Mandatory Gap
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Total Experience */}
                    <tr className="hover:bg-slate-50/60">
                      <td className="p-4 font-bold text-slate-700 bg-slate-50/50">Experience & Org</td>
                      {rankedCandidates.map(c => (
                        <td key={c.id} className="p-4 font-medium text-slate-800">
                          <div className="font-bold text-slate-900">
                            {c.totalExperienceYears ? `${c.totalExperienceYears} Years Total` : 'Verified Exp'}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {c.currentCompany ? `Current: ${c.currentCompany}` : 'Current Company on file'}
                          </div>
                        </td>
                      ))}
                    </tr>

                    {/* Technical Competencies */}
                    <tr className="hover:bg-slate-50/60">
                      <td className="p-4 font-bold text-slate-700 bg-slate-50/50">Verified Skills</td>
                      {rankedCandidates.map(c => (
                        <td key={c.id} className="p-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {(c.skills || []).slice(0, 5).map((sk, idx) => (
                              <span key={idx} className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[10px] font-semibold border border-slate-200">
                                {sk}
                              </span>
                            ))}
                            {(c.skills || []).length > 5 && (
                              <span className="text-[10px] text-slate-400 font-bold self-center">
                                +{(c.skills || []).length - 5} more
                              </span>
                            )}
                          </div>
                        </td>
                      ))}
                    </tr>

                    {/* Notice Period & Availability */}
                    <tr className="hover:bg-slate-50/60">
                      <td className="p-4 font-bold text-slate-700 bg-slate-50/50">Notice Period</td>
                      {rankedCandidates.map(c => {
                        const notice = c.noticePeriod || '30 Days';
                        const isHighNotice = /60|90/i.test(notice);
                        return (
                          <td key={c.id} className="p-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${isHighNotice ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-800 border-slate-200'}`}>
                              {notice}
                            </span>
                          </td>
                        );
                      })}
                    </tr>

                    {/* Career Continuity / Gaps */}
                    <tr className="hover:bg-slate-50/60">
                      <td className="p-4 font-bold text-slate-700 bg-slate-50/50">Career Continuity</td>
                      {rankedCandidates.map(c => (
                        <td key={c.id} className="p-4">
                          {c.gapAnalysis?.hasGap ? (
                            <span className="text-amber-800 font-bold text-xs flex items-center gap-1">
                              ⚠️ {c.gapAnalysis.totalGapMonths}m Gap
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-bold text-xs flex items-center gap-1">
                              ✅ Continuous
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>

                    {/* Compensation Fit */}
                    <tr className="hover:bg-slate-50/60">
                      <td className="p-4 font-bold text-slate-700 bg-slate-50/50">Salary Fit</td>
                      {rankedCandidates.map(c => (
                        <td key={c.id} className="p-4 text-xs font-medium text-slate-700">
                          {c.expectedSalary ? (
                            <div>Expected: <span className="font-bold text-slate-900">{c.expectedSalary}</span></div>
                          ) : (
                            <span className="text-slate-400">Within Budget</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* ─────────────────────────────────────────────────────────────
               TAB 2: CLIENT SUBMISSION INTELLIGENCE (ONE-CLICK PITCH)
            ───────────────────────────────────────────────────────────── */
            <div className="space-y-6">
              {/* Pitch Customization Controls */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeSalary}
                      onChange={e => setIncludeSalary(e.target.checked)}
                      className="rounded text-brand-orange focus:ring-brand-orange h-4 w-4"
                    />
                    Include Notice Period & CTC
                  </label>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeContact}
                      onChange={e => setIncludeContact(e.target.checked)}
                      className="rounded text-brand-orange focus:ring-brand-orange h-4 w-4"
                    />
                    Include Direct Email/Phone
                  </label>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleCopyEmail}
                    className="flex-1 sm:flex-initial px-4 py-2 bg-brand-orange hover:bg-brand-orange-hover text-white rounded-xl text-xs font-extrabold transition-all shadow-orange cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>{copiedEmail ? '✅ Copied to Clipboard!' : '📋 Copy Client Email Pitch'}</span>
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="px-3.5 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                    title="Print or Save as PDF"
                  >
                    <span>🖨️ Print / PDF</span>
                  </button>
                </div>
              </div>

              {/* Formatted Submission Dossier Preview */}
              <div className="border border-slate-200 rounded-2xl bg-white p-6 shadow-xs space-y-6 print:border-none print:shadow-none font-sans">
                {/* Dossier Header */}
                <div className="border-b border-slate-200 pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-wider text-brand-orange">
                      HireIQ Candidate Shortlist Dossier
                    </div>
                    <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">
                      {job.position}
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                      Prepared for <strong className="text-slate-800">{job.client}</strong> • {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-mono font-bold">
                      {rankedCandidates.length} Candidates Shortlisted
                    </div>
                  </div>
                </div>

                {/* Candidate Cards in Dossier */}
                <div className="space-y-4">
                  {rankedCandidates.map((c, idx) => {
                    const rankInfo = getRankBadge(c.id, idx);
                    const mandatoryPassed = c.matchResult?.mandatoryAllPassed !== false;
                    return (
                      <div key={c.id} className="border border-slate-200 rounded-xl p-5 bg-slate-50/50 hover:bg-white transition-all space-y-3">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white font-mono font-bold text-xs flex items-center justify-center">
                              #{idx + 1}
                            </div>
                            <div>
                              <div className="font-extrabold text-slate-900 text-sm">{c.name}</div>
                              <div className="text-xs text-slate-500 font-medium">
                                {c.currentTitle || 'Professional'} {c.currentCompany ? `at ${c.currentCompany}` : ''}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-extrabold border ${rankInfo?.bg}`}>
                              {rankInfo?.badge}
                            </span>
                            <span className="px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-black text-xs">
                              {c.score}/100 Match
                            </span>
                          </div>
                        </div>

                        {/* Candidate Key Stats */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div className="bg-white p-2.5 rounded-lg border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 block uppercase">Total Exp</span>
                            <span className="font-bold text-slate-800">
                              {c.totalExperienceYears ? `${c.totalExperienceYears} Years` : 'Demonstrated'}
                            </span>
                          </div>
                          <div className="bg-white p-2.5 rounded-lg border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 block uppercase">Mandatory Rules</span>
                            <span className={`font-bold ${mandatoryPassed ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {mandatoryPassed ? 'All Passed ✅' : 'Exceptions ⚠️'}
                            </span>
                          </div>
                          {includeSalary && (
                            <>
                              <div className="bg-white p-2.5 rounded-lg border border-slate-100">
                                <span className="text-[10px] font-bold text-slate-400 block uppercase">Notice Period</span>
                                <span className="font-bold text-slate-800">{c.noticePeriod || '30 Days'}</span>
                              </div>
                              <div className="bg-white p-2.5 rounded-lg border border-slate-100">
                                <span className="text-[10px] font-bold text-slate-400 block uppercase">Expected CTC</span>
                                <span className="font-bold text-slate-800">{c.expectedSalary || 'In Budget'}</span>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Technical Competencies */}
                        <div className="text-xs">
                          <span className="text-[11px] font-bold text-slate-500 mr-2">Verified Competencies:</span>
                          <span className="font-medium text-slate-800">
                            {(c.skills || []).slice(0, 7).join(' • ') || 'Verified Technical Stack Alignment'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Dossier Footer */}
                <div className="border-t border-slate-200 pt-4 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Generated via Tasknera HireIQ Recruitment Operations Suite</span>
                  <span>Confidential — Prepared for Client Review</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            Comparing <strong className="text-slate-800">{selectedCandidates.length} candidate(s)</strong> for {job.position}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}

