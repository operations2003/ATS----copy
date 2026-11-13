'use client';

import React, { useState, useEffect } from 'react';

export interface ClientLifecycleData {
  interviewRound1: string;     // 20. Interview Round 1
  interviewRound2: string;     // 21. Interview Round 2
  finalInterview: string;      // 22. Final Interview
  offerStatus: string;         // 23. Offer Status
  joiningDate: string;         // 24. Joining Date
  joiningStatus: string;       // 25. Joining Status
  rejectionReason: string;     // 26. Rejection Reason
  lastFollowUpDate: string;    // 27. Last Follow-up Date
  nextFollowUpDate: string;    // 28. Next Follow-up Date
  response: string;            // 29. Response / Notes
  overallStatus: string;       // 30. Overall Status
  clientReviewerName?: string; // e.g. "Hiring Manager"
}

interface ClientLifecycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: any;
  clientName: string;
  onSave: (data: ClientLifecycleData) => void;
}

const OVERALL_STATUS_OPTIONS = [
  'Shared with Client',
  'Round 1 Phase Scheduled',
  'Round 2 Phase Scheduled',
  'Interview Completed',
  'Selected / Offer',
  'Offered',
  'Joined',
  'Offer Declined',
  'On Hold',
  'Not a Fit',
];

const ROUND1_PRESETS = [
  'Ready for Client Scheduling',
  'Round 1 Technical Scheduled',
  'Round 1 Cleared — Recommended for Round 2',
  'Round 1 Cleared with High Remarks',
  'Round 1 Did Not Pass / Unsuccessful',
  'Waived / Sourced Direct to Round 2',
];

const ROUND2_PRESETS = [
  'Pending Round 1 Completion',
  'Round 2 Managerial Scheduled',
  'Round 2 Cleared — Finalist',
  'Round 2 Did Not Pass',
  'Waived / Proceeding to Offer',
];

const FINAL_INTERVIEW_PRESETS = [
  'Pending',
  'Final Leadership Round Scheduled',
  'Completed — Recommended for Offer',
  'Completed — On Hold',
  'Final Round Rejected',
  'Not Applicable',
];

const OFFER_STATUS_PRESETS = [
  'Pending Client Shortlist Review',
  'In Compensation / Budget Evaluation',
  'Offer Prepared & Under Approval',
  'Offer Extended to Candidate',
  'Offer Accepted by Candidate',
  'Offer Declined by Candidate',
  'Offer Withdrawn',
  'Not Offered',
];

const JOINING_STATUS_PRESETS = [
  'Pending Offer Acceptance',
  'Offer Accepted — Awaiting Joining',
  'Joined Company',
  'Notice Period Delayed',
  'Candidate Backed Out',
  'Background Verification in Progress',
];

const REJECTION_REASON_PRESETS = [
  'None (Profile Meets Mandatory Benchmarks)',
  'Technical Evaluation Gap / Core Skill Depth',
  'Budget / CTC Expectation Mismatch',
  'Notice Period Too Long for Project Timeline',
  'Culture & Leadership Alignment Gap',
  'Candidate Accepted Another Offer',
  'Position Placed on Hold / Scope Changed',
];

export default function ClientLifecycleModal({
  isOpen,
  onClose,
  candidate,
  clientName,
  onSave,
}: ClientLifecycleModalProps) {
  const [formData, setFormData] = useState<ClientLifecycleData>({
    interviewRound1: '',
    interviewRound2: '',
    finalInterview: '',
    offerStatus: '',
    joiningDate: '',
    joiningStatus: '',
    rejectionReason: '',
    lastFollowUpDate: '',
    nextFollowUpDate: '',
    response: '',
    overallStatus: 'Shared with Client',
    clientReviewerName: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!candidate || !isOpen) return;

    const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const inThreeDaysStr = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    setFormData({
      interviewRound1: candidate.interviewRound1 || 'Ready for Client Scheduling',
      interviewRound2: candidate.interviewRound2 || 'Pending Round 1 Completion',
      finalInterview: candidate.finalInterview || 'Pending',
      offerStatus: candidate.offerStatus || 'Pending Client Shortlist Review',
      joiningDate: candidate.joiningDate || '30 Days Post Offer Release',
      joiningStatus: candidate.joiningStatus || 'Pending Offer Acceptance',
      rejectionReason: candidate.rejectionReason || 'None (Profile Meets Mandatory Benchmarks)',
      lastFollowUpDate: candidate.lastFollowUpDate || todayStr,
      nextFollowUpDate: candidate.nextFollowUpDate || inThreeDaysStr,
      response: candidate.response || 'Actively Available & Highly Interested',
      overallStatus: candidate.overallStatus || candidate.currentStatus || 'Shared with Client',
      clientReviewerName: '',
    });
  }, [candidate, isOpen]);

  if (!isOpen || !candidate) return null;

  const handleChange = (field: keyof ClientLifecycleData, val: string) => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  const handleQuickPreset = (field: keyof ClientLifecycleData, val: string) => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      onSave(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/65 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden my-6 max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50/70 via-slate-50 to-white shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[#EFF4FF] text-[#3563E9] flex items-center justify-center border border-[#D1E0FF] shadow-xs shrink-0">
              <span className="text-xl">📅</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#EFF4FF] text-[#3563E9] border border-[#D1E0FF]">
                  Client Portal Action
                </span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs font-bold text-slate-600">{clientName}</span>
              </div>
              <h3 className="text-base font-bold text-[#101828] mt-0.5">
                Fill Interview &amp; Lifecycle Stages (Fields 20 – 30)
              </h3>
              <p className="text-xs text-[#667085]">
                Candidate: <strong className="text-slate-900">{candidate.name || candidate.candidateName}</strong>
                {candidate.currentDesignation && ` • ${candidate.currentDesignation}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 flex items-center justify-center text-sm font-bold cursor-pointer transition-colors shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto text-xs flex-1">
          {/* Helper Notice */}
          <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-3.5 flex items-start gap-2.5">
            <span className="text-base shrink-0">ℹ️</span>
            <div className="text-xs text-blue-950 space-y-0.5">
              <p className="font-bold">Direct Client Decision Ownership</p>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                As the client hiring manager or interviewer, you own the evaluation lifecycle. Updates made here reflect immediately in your candidate dossier, spreadsheet view, and notify the agency delivery team.
              </p>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              SECTION 1: INTERVIEW ROUNDS (Fields 20, 21, 22)
          ───────────────────────────────────────────────────────────── */}
          <div className="space-y-4 bg-[#F8F9FC] p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-[#3563E9] flex items-center gap-1.5">
                <span>🎙️ Interview Evaluation Rounds</span>
              </h4>
              <span className="text-[10px] font-bold text-slate-500">Fields 20, 21, 22</span>
            </div>

            {/* Field 20: Interview Round 1 */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">
                20. Interview Round 1 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.interviewRound1}
                onChange={e => handleChange('interviewRound1', e.target.value)}
                placeholder="e.g. Scheduled for 15 Nov, 3:00 PM with Senior Architect"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 focus:outline-none focus:border-[#3563E9] text-xs"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] font-bold text-slate-400 self-center">Presets:</span>
                {ROUND1_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleQuickPreset('interviewRound1', preset)}
                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white border border-slate-200 hover:border-[#3563E9] hover:text-[#3563E9] text-slate-600 transition cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Field 21: Interview Round 2 */}
            <div className="space-y-1.5 pt-2">
              <label className="block text-xs font-bold text-slate-800">
                21. Interview Round 2
              </label>
              <input
                type="text"
                value={formData.interviewRound2}
                onChange={e => handleChange('interviewRound2', e.target.value)}
                placeholder="e.g. Scheduled for 18 Nov / Cleared / Pending Round 1"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 focus:outline-none focus:border-[#3563E9] text-xs"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] font-bold text-slate-400 self-center">Presets:</span>
                {ROUND2_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleQuickPreset('interviewRound2', preset)}
                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white border border-slate-200 hover:border-[#3563E9] hover:text-[#3563E9] text-slate-600 transition cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Field 22: Final Interview */}
            <div className="space-y-1.5 pt-2">
              <label className="block text-xs font-bold text-slate-800">
                22. Final Interview
              </label>
              <input
                type="text"
                value={formData.finalInterview}
                onChange={e => handleChange('finalInterview', e.target.value)}
                placeholder="e.g. Completed — Recommended for Offer / Pending"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 focus:outline-none focus:border-[#3563E9] text-xs"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] font-bold text-slate-400 self-center">Presets:</span>
                {FINAL_INTERVIEW_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleQuickPreset('finalInterview', preset)}
                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white border border-slate-200 hover:border-[#3563E9] hover:text-[#3563E9] text-slate-600 transition cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              SECTION 2: OFFER, JOINING & REJECTION (Fields 23, 24, 25, 26)
          ───────────────────────────────────────────────────────────── */}
          <div className="space-y-4 bg-[#F8F9FC] p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-[#3563E9] flex items-center gap-1.5">
                <span>💼 Offer &amp; Onboarding Details</span>
              </h4>
              <span className="text-[10px] font-bold text-slate-500">Fields 23, 24, 25, 26</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Field 23: Offer Status */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-800">
                  23. Offer Status <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.offerStatus}
                  onChange={e => handleChange('offerStatus', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 text-xs focus:outline-none focus:border-[#3563E9]"
                >
                  {OFFER_STATUS_PRESETS.map((opt, i) => (
                    <option key={i} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* Field 24: Joining Date */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-800">
                  24. Joining Date
                </label>
                <input
                  type="text"
                  value={formData.joiningDate}
                  onChange={e => handleChange('joiningDate', e.target.value)}
                  placeholder="e.g. 01 Dec 2026 or 30 Days Post Offer"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 text-xs focus:outline-none focus:border-[#3563E9]"
                />
              </div>

              {/* Field 25: Joining Status */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-800">
                  25. Joining Status
                </label>
                <select
                  value={formData.joiningStatus}
                  onChange={e => handleChange('joiningStatus', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 text-xs focus:outline-none focus:border-[#3563E9]"
                >
                  {JOINING_STATUS_PRESETS.map((opt, i) => (
                    <option key={i} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* Field 26: Rejection Reason */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-800">
                  26. Rejection Reason (If Applicable)
                </label>
                <select
                  value={formData.rejectionReason}
                  onChange={e => handleChange('rejectionReason', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 text-xs focus:outline-none focus:border-[#3563E9]"
                >
                  {REJECTION_REASON_PRESETS.map((opt, i) => (
                    <option key={i} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              SECTION 3: FOLLOW-UPS, RESPONSE & OVERALL (Fields 27, 28, 29, 30)
          ───────────────────────────────────────────────────────────── */}
          <div className="space-y-4 bg-[#F8F9FC] p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-[#3563E9] flex items-center gap-1.5">
                <span>📋 Follow-ups, Candidate Response &amp; Overall Decision</span>
              </h4>
              <span className="text-[10px] font-bold text-slate-500">Fields 27, 28, 29, 30</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Field 27: Last Follow-up */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-800">
                  27. Last Follow-up Date
                </label>
                <input
                  type="text"
                  value={formData.lastFollowUpDate}
                  onChange={e => handleChange('lastFollowUpDate', e.target.value)}
                  placeholder="e.g. 12 Nov 2026"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 text-xs focus:outline-none focus:border-[#3563E9]"
                />
              </div>

              {/* Field 28: Next Follow-up */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-800">
                  28. Next Follow-up Date
                </label>
                <input
                  type="text"
                  value={formData.nextFollowUpDate}
                  onChange={e => handleChange('nextFollowUpDate', e.target.value)}
                  placeholder="e.g. 16 Nov 2026 or Scheduled Next Week"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 text-xs focus:outline-none focus:border-[#3563E9]"
                />
              </div>
            </div>

            {/* Field 29: Response (Notes from candidate interaction or client feedback) */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-800">
                29. Response / Evaluation Remarks from Hiring Team
              </label>
              <textarea
                rows={2}
                value={formData.response}
                onChange={e => handleChange('response', e.target.value)}
                placeholder="e.g. Candidate demonstrated strong domain knowledge in system design. Ready for offer approval."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-900 text-xs focus:outline-none focus:border-[#3563E9]"
              />
            </div>

            {/* Field 30: Overall Status */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-800">
                30. Overall Status Decision <span className="text-rose-500">*</span>
              </label>
              <select
                value={formData.overallStatus}
                onChange={e => handleChange('overallStatus', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#3563E9] bg-white font-bold text-[#101828] text-xs focus:outline-none ring-2 ring-blue-100"
              >
                {OVERALL_STATUS_OPTIONS.map((status, i) => (
                  <option key={i} value={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Client Submitter Identity */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-800">
              Your Name / Title (Logged in Audit Trail)
            </label>
            <input
              type="text"
              value={formData.clientReviewerName}
              onChange={e => handleChange('clientReviewerName', e.target.value)}
              placeholder="e.g. Shubham (Hiring Lead) or Alex Rivera"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:border-[#3563E9]"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-[#3563E9] hover:bg-[#2851D6] text-white rounded-xl text-xs font-bold shadow-sm hover:shadow-md cursor-pointer transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <span>{isSubmitting ? 'Saving...' : '✓ Save Interview & Lifecycle Updates'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

