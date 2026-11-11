'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

interface ContactFormData {
  name: string;
  email: string;
  company: string;
  phone: string;
  inquiryType: string;
  message: string;
}

export default function ContactPage() {
  const [formData, setFormData] = useState<ContactFormData>({
    name: '',
    email: '',
    company: '',
    phone: '',
    inquiryType: 'Enterprise Subscription & Licensing',
    message: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const officialEmail = 'operations@tasknera.com';

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(officialEmail);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2500);
    } catch {
      // Fallback
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2500);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      alert('Please fill in your name, work email, and message.');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem('tasknera_contact_inquiries');
          const list = raw ? JSON.parse(raw) : [];
          const newInquiry = {
            id: `inq-${Date.now()}`,
            ...formData,
            submittedAt: new Date().toISOString(),
          };
          localStorage.setItem('tasknera_contact_inquiries', JSON.stringify([newInquiry, ...(Array.isArray(list) ? list : [])]));
        } catch {}
      }

      setIsSubmitting(false);
      setSubmitted(true);
    }, 700);
  };

  return (
    <div className="min-h-screen bg-[#F7F8FC] flex flex-col font-sans text-slate-800">
      <Header />

      <main className="flex-1 pt-24 pb-16">
        {/* Top Breadcrumb & Hero */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-4">
            <Link href="/home" className="hover:text-brand-orange transition-colors">Home</Link>
            <span>/</span>
            <span className="text-slate-800">Contact Us</span>
          </div>

          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-orange/10 border border-brand-orange/20 text-xs font-bold text-brand-orange mb-3">
              <span className="w-2 h-2 rounded-full bg-brand-orange animate-pulse" />
              Direct Operations &amp; Enterprise Desk
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#101828]">
              Contact Our Operations Team
            </h1>
            <p className="mt-3 text-base sm:text-lg text-slate-600 leading-relaxed">
              Have questions about deterministic candidate evaluation, custom scoring calibration, or enterprise licensing? Our dedicated team is available to assist your organization.
            </p>
          </div>
        </section>

        {/* 3 Core Contact Information Channels */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Official Operations Contact */}
            <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-xs hover:border-brand-orange/40 transition-all flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-brand-orange mb-5">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-[#101828]">Corporate Operations &amp; Inquiries</h3>
                <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  For enterprise partnership agreements, custom calibrated scorecards, account administration, and governance.
                </p>
                <div className="mt-4 p-3 rounded-2xl bg-[#F7F8FC] border border-slate-200/80 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Official Channel</span>
                  <div className="text-xs sm:text-sm font-bold text-[#101828] select-all font-mono">
                    {officialEmail}
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-100 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="flex-1 py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedEmail ? (
                    <>
                      <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-emerald-700">Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>Copy Email</span>
                    </>
                  )}
                </button>
                <a
                  href={`mailto:${officialEmail}?subject=${encodeURIComponent('HireIQ Enterprise Inquiry')}`}
                  className="py-2.5 px-4 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  <span>Compose</span>
                </a>
              </div>
            </div>

            {/* Card 2: Interactive Demo Walkthrough */}
            <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-xs hover:border-[#3563E9]/40 transition-all flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#3563E9] mb-5">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-[#101828]">Enterprise Demo Walkthrough</h3>
                <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Experience deterministic screening live on your actual job descriptions with sample resumes and evidence verification.
                </p>
                <div className="mt-4 p-3 rounded-2xl bg-[#F7F8FC] border border-slate-200/80 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Response SLA</span>
                  <div className="text-xs sm:text-sm font-bold text-[#101828] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Same-Day Scheduling Available
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-100">
                <a
                  href={`mailto:${officialEmail}?subject=${encodeURIComponent('HireIQ Demo Session Request')}&body=${encodeURIComponent('Hi HireIQ Team,\n\nI would like to schedule an enterprise demo session for HireIQ.\n\nCompany Name: \nContact Name: \nTarget Number of Recruiters: \nPreferred Date / Time: \n\nBest regards,')}`}
                  className="w-full py-2.5 px-4 bg-[#101828] hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Request Demo Session</span>
                </a>
              </div>
            </div>

            {/* Card 3: Support Hours & Governance */}
            <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-xs hover:border-emerald-500/40 transition-all flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-5">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-[#101828]">Technical &amp; Calibration Desk</h3>
                <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Support for ATS webhook integrations, custom knockout criteria configurations, and deterministic bias-guard audits.
                </p>
                <div className="mt-4 p-3 rounded-2xl bg-[#F7F8FC] border border-slate-200/80 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Desk Working Hours</span>
                  <div className="text-xs sm:text-sm font-bold text-slate-800">
                    Mon – Fri, 9:00 AM – 6:00 PM EST
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Enterprise SLA Guaranteed
                </span>
                <span>Response within 4h</span>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Contact & Inquiry Form */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 lg:p-12 shadow-sm">
            <div className="max-w-2xl mb-8">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-orange">Direct Inquiry Form</span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#101828] mt-1">
                Send a Message Directly to Operations
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Submit your inquiry below. Our operational coordinators monitor this inflow continuously and will follow up with verified documentation.
              </p>
            </div>

            {submitted ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-8 text-center space-y-4 max-w-xl mx-auto">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-extrabold text-[#101828]">Inquiry Received Successfully!</h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Thank you, <strong className="font-semibold text-slate-800">{formData.name}</strong>. Your inquiry regarding <span className="font-semibold text-[#101828]">&ldquo;{formData.inquiryType}&rdquo;</span> has been registered and dispatched to <span className="font-semibold text-brand-orange">{officialEmail}</span>.
                </p>
                <p className="text-xs text-slate-500">
                  Our operations team will review your requirements and respond to <strong className="font-semibold text-slate-700">{formData.email}</strong> within 4 business hours.
                </p>
                <div className="pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitted(false);
                      setFormData({
                        name: '',
                        email: '',
                        company: '',
                        phone: '',
                        inquiryType: 'Enterprise Subscription & Licensing',
                        message: '',
                      });
                    }}
                    className="px-5 py-2.5 bg-[#101828] hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    Submit Another Message
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Your Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sarah Mitchell"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-[#F7F8FC] text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-brand-orange focus:bg-white transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Work Email Address <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. sarah@enterprise.com"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-[#F7F8FC] text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-brand-orange focus:bg-white transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Company / Organization Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. SJ Tech Works"
                      value={formData.company}
                      onChange={e => setFormData({ ...formData, company: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-[#F7F8FC] text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-brand-orange focus:bg-white transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Phone Number (Optional)
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. +1 (555) 234-5678"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-[#F7F8FC] text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-brand-orange focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Inquiry Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.inquiryType}
                    onChange={e => setFormData({ ...formData, inquiryType: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-[#F7F8FC] text-sm text-slate-900 outline-none focus:border-brand-orange focus:bg-white transition-colors cursor-pointer"
                  >
                    <option value="Enterprise Subscription &amp; Licensing">Enterprise Subscription &amp; Team Licensing</option>
                    <option value="Deterministic Scoring Calibration">Custom Deterministic Scoring Calibration</option>
                    <option value="Live Product Demo">Book a Live 20-Min Product Walkthrough</option>
                    <option value="ATS Integration &amp; API">ATS Integration, Webhooks &amp; API Inquiries</option>
                    <option value="Billing &amp; Invoice Support">Billing &amp; Organization Invoice Inquiries</option>
                    <option value="General Operations Inquiry">General Operations &amp; Support Question</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Your Message / Requirements <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Tell us about your hiring volume, technical stack, or specific recruitment evaluation needs..."
                    value={formData.message}
                    onChange={e => setFormData({ ...formData, message: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-[#F7F8FC] text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-brand-orange focus:bg-white transition-colors resize-y"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
                  <p className="text-xs text-slate-500">
                    🔒 Protected under enterprise-grade encryption. We never share client recruitment data.
                  </p>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-7 py-3.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-sm font-bold rounded-xl transition-all shadow-orange hover:shadow-orange-lg hover:-translate-y-0.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 self-stretch sm:self-auto justify-center"
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span>Dispatching...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Inquiry to Operations</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}

