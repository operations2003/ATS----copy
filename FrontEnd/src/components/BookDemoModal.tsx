'use client';

import React, { useState } from 'react';

interface BookDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BookDemoModal: React.FC<BookDemoModalProps> = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    teamSize: '11-50',
    phone: '',
    preferredDate: '',
    notes: '',
  });

  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const targetEmail = 'operations@tasknera.com';

  const constructMailto = () => {
    const subject = encodeURIComponent(
      `HireIQ Demo Session Request - ${formData.company || 'Enterprise Candidate'}`
    );
    const bodyContent = [
      `Hi HireIQ Operations Team,`,
      ``,
      `I would like to request a 1-on-1 demo session for HireIQ.`,
      ``,
      `--- Demo Request Details ---`,
      `Name: ${formData.name || 'Not provided'}`,
      `Work Email: ${formData.email || 'Not provided'}`,
      `Company: ${formData.company || 'Not provided'}`,
      `Recruitment Team Size: ${formData.teamSize}`,
      `Phone / WhatsApp: ${formData.phone || 'Not provided'}`,
      `Preferred Date & Time: ${formData.preferredDate || 'Flexible / Next available'}`,
      `Specific Requirements / Notes:`,
      formData.notes || 'Interested in AI resume screening, evidence-based matching, and bias-free evaluation.',
      ``,
      `Thank you!`,
    ].join('\n');

    return `mailto:${targetEmail}?subject=${subject}&body=${encodeURIComponent(bodyContent)}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mailtoUri = constructMailto();
    
    // Launch mail client directly
    window.location.href = mailtoUri;
    setSubmitted(true);
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(targetEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const resetForm = () => {
    setSubmitted(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh] transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-orange flex items-center justify-center shadow-orange flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                Schedule a Demo Session
              </h2>
              <p className="text-xs text-slate-300">
                Direct walkthrough with our operations team
              </p>
            </div>
          </div>
          <button
            onClick={resetForm}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {submitted ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Demo Request Prepared!
                </h3>
                <p className="text-xs text-slate-600 max-w-sm mx-auto mt-1 leading-relaxed">
                  Your email client has been opened with your pre-filled request addressed to{' '}
                  <strong className="text-slate-900 font-semibold">{targetEmail}</strong>.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-xs space-y-2">
                <div className="flex justify-between items-center text-slate-500">
                  <span>Target Recipient:</span>
                  <span className="font-semibold text-slate-800">{targetEmail}</span>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Company:</span>
                  <span className="font-semibold text-slate-800">{formData.company || 'Not specified'}</span>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Preferred Slot:</span>
                  <span className="font-semibold text-slate-800">{formData.preferredDate || 'Flexible'}</span>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <a
                  href={constructMailto()}
                  className="w-full sm:w-auto px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-bold rounded-xl transition-all shadow-orange text-center"
                >
                  Re-open Email App
                </a>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors text-center"
                >
                  {copied ? '✓ Email Copied!' : 'Copy Email Address'}
                </button>
              </div>

              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-slate-400 hover:text-slate-600 block mx-auto pt-2"
              >
                Close window
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-orange-50/70 border border-orange-200/80 rounded-xl p-3 text-xs text-slate-700 flex items-start gap-2.5">
                <svg className="w-4 h-4 text-brand-orange flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="leading-relaxed">
                  Booking requests are routed directly to our operations team at{' '}
                  <span className="font-bold text-slate-900">{targetEmail}</span>. We typically respond within 2–4 hours.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Your Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Alex Morgan"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20 outline-none text-slate-800 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Work Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="alex@company.com"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20 outline-none text-slate-800 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Company / Agency Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    placeholder="e.g. Acme Talent Partners"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20 outline-none text-slate-800 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Recruiting Team Size
                  </label>
                  <select
                    value={formData.teamSize}
                    onChange={(e) => setFormData({ ...formData, teamSize: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20 outline-none text-slate-800 bg-white transition-all"
                  >
                    <option value="1-5">1 – 5 Recruiters</option>
                    <option value="6-20">6 – 20 Recruiters</option>
                    <option value="21-50">21 – 50 Recruiters</option>
                    <option value="50+">50+ Enterprise Team</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone / WhatsApp <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20 outline-none text-slate-800 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Preferred Date & Time
                  </label>
                  <input
                    type="text"
                    value={formData.preferredDate}
                    onChange={(e) => setFormData({ ...formData, preferredDate: e.target.value })}
                    placeholder="e.g. Next Tuesday 2:00 PM EST"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20 outline-none text-slate-800 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Specific Requirements or Questions <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Tell us what roles you hire for or any specific ATS challenges..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20 outline-none text-slate-800 transition-all resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-bold rounded-xl transition-all shadow-orange hover:shadow-orange-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>Submit Demo Request to Operations Team</span>
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                <span>Or email directly:</span>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="text-brand-orange hover:underline font-medium inline-flex items-center gap-1"
                >
                  <span>operations@tasknera.com</span>
                  {copied ? <span className="text-emerald-600 font-bold">(Copied!)</span> : <span>(Copy)</span>}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookDemoModal;
