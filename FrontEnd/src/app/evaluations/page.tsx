'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';

export interface EvaluationItem {
  id: string;
  evaluationId?: string;
  candidateId?: string;
  candidate: string;
  role: string;
  job: string;
  jobId: string;
  company: string;
  date: string;
  score: number;
  ats: number;
  matchLevel?: string;
  mandatory: string;
  mandatoryFailed: boolean;
  decision: 'SUBMIT' | 'REVIEW' | 'DO NOT SUBMIT';
  by: string;
}

const decisionStyle = (d: string) =>
  d === 'SUBMIT'
    ? 'bg-status-submit-bg text-status-submit-text border-status-submit-border'
    : d === 'REVIEW'
    ? 'bg-status-review-bg text-status-review-text border-status-review-border'
    : 'bg-status-reject-bg text-status-reject-text border-status-reject-border';

const scoreColor = (n: number) =>
  n >= 80 ? 'text-emerald-600' : n >= 65 ? 'text-amber-500' : 'text-red-500';

const scoreBg = (n: number) =>
  n >= 80 ? 'bg-emerald-500' : n >= 65 ? 'bg-amber-400' : 'bg-red-400';

const avatarColor = (name: string) => {
  const colors = [
    'bg-brand-orange-pale text-brand-orange',
    'bg-violet-50 text-violet-600',
    'bg-blue-50 text-blue-600',
    'bg-emerald-50 text-emerald-600',
    'bg-amber-50 text-amber-600',
    'bg-rose-50 text-rose-600',
    'bg-teal-50 text-teal-600',
  ];
  const charCode = name && name.length > 0 ? name.charCodeAt(0) : 65;
  return colors[charCode % colors.length];
};

export default function EvaluationsPage() {
  const { user } = useAuth();
  const [evaluations, setEvaluations] = useState<EvaluationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'All' | 'SUBMIT' | 'REVIEW' | 'DO NOT SUBMIT'>('All');
  const [sort, setSort] = useState<'score' | 'date'>('score');

  const [scope, setScope] = useState<'mine' | 'all'>('mine');

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

  const fetchEvaluations = useCallback(async () => {
    try {
      setLoading(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      const headers: Record<string, string> = {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const isCompanyAdmin = user?.role === 'ADMIN' || user?.role === 'CLIENT_ADMIN' || user?.role === 'SUPER_ADMIN';
      const url = scope === 'all' && isCompanyAdmin
        ? `${backendUrl}/evaluations?view=all`
        : `${backendUrl}/evaluations?scope=mine`;

      const evalRes = await fetch(url, { headers });
      if (evalRes.ok) {
        const evalData = await evalRes.json();
        if (Array.isArray(evalData.evaluations)) {
          setEvaluations(evalData.evaluations);
          return;
        }
      }
      setEvaluations([]);
    } catch (err) {
      console.warn('Evaluations fetch error:', err);
      setEvaluations([]);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, user, scope]);

  useEffect(() => {
    fetchEvaluations();
  }, [fetchEvaluations]);

  const counts = {
    All:            evaluations.length,
    SUBMIT:         evaluations.filter(e => e.decision === 'SUBMIT').length,
    REVIEW:         evaluations.filter(e => e.decision === 'REVIEW').length,
    'DO NOT SUBMIT':evaluations.filter(e => e.decision === 'DO NOT SUBMIT').length,
  };

  const filtered = evaluations
    .filter(e => {
      const q = search.toLowerCase();
      return (
        (e.candidate.toLowerCase().includes(q) || e.job.toLowerCase().includes(q) || e.company.toLowerCase().includes(q)) &&
        (filter === 'All' || e.decision === filter)
      );
    })
    .sort((a, b) => sort === 'score' ? b.score - a.score : 0);

  const avgScore = evaluations.length > 0
    ? Math.round(evaluations.reduce((a, e) => a + e.score, 0) / evaluations.length)
    : 0;

  return (
    <div className="min-h-screen bg-[#EEF2F6] text-[#1E293B] flex flex-col selection:bg-brand-orange-pale selection:text-brand-orange">
      <Header />
      <main className="max-w-screen-xl mx-auto px-6 pt-24 pb-16 flex-1 w-full">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-orange-pale border border-brand-orange-border rounded-full text-xs font-bold text-brand-orange mb-2">
              <span className="w-2 h-2 rounded-full bg-brand-orange" />
              Evaluation Audit Log
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1E293B] tracking-tight">Evaluations & Citations</h1>
            <p className="text-sm text-slate-500 mt-1">Deterministic matching breakdown, candidate-to-JD evidence verification, and submission decisions</p>
          </div>
          <div className="flex items-center gap-3">
            {(user?.role === 'ADMIN' || user?.role === 'CLIENT_ADMIN' || user?.role === 'SUPER_ADMIN') && (
              <div className="flex items-center p-1 bg-slate-200/80 rounded-xl border border-slate-300">
                <button
                  onClick={() => setScope('mine')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    scope === 'mine'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  My Work
                </button>
                <button
                  onClick={() => setScope('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    scope === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Team Work
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Evaluations', value: counts.All, color: 'text-slate-900', badge: 'bg-slate-100 text-slate-700 border-slate-200', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
            { label: 'Submit Ready', value: counts.SUBMIT, color: 'text-emerald-700', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
            { label: 'Needs Review', value: counts.REVIEW, color: 'text-amber-700', badge: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
            { label: 'Rejected', value: counts['DO NOT SUBMIT'], color: 'text-rose-700', badge: 'bg-rose-50 text-rose-700 border-rose-200', icon: 'M6 18L18 6M6 6l12 12' },
            { label: 'Mean Score', value: `${avgScore}%`, color: 'text-brand-orange', badge: 'bg-brand-orange-pale text-brand-orange border-brand-orange-border', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
          ].map((s, i) => (
            <div key={i} className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs transition-all hover:shadow-sm hover:border-slate-300">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{s.label}</span>
                <span className={`w-7 h-7 rounded-xl border ${s.badge} flex items-center justify-center flex-shrink-0 shadow-2xs`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={s.icon} />
                  </svg>
                </span>
              </div>
              <div className={`text-2xl font-black ${s.color} tracking-tight`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filter Bar */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 mb-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative flex-1 w-full md:max-w-md">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by candidate name, job title, or client..."
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            {(['All', 'SUBMIT', 'REVIEW', 'DO NOT SUBMIT'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filter === f
                    ? 'bg-brand-orange text-white shadow-orange'
                    : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200/70'
                }`}
              >
                {f === 'DO NOT SUBMIT' ? 'REJECT' : f} <span className="ml-1 opacity-70">({counts[f]})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="bg-white border border-slate-200/90 rounded-3xl p-16 text-center shadow-sm">
            <div className="w-10 h-10 border-3 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-bold text-slate-700">Loading candidate evaluations...</p>
            <p className="text-xs text-slate-400 mt-1">Connecting to ATS evaluation database</p>
          </div>
        ) : filtered.length > 0 ? (
          /* Evaluations Table */
          <div className="bg-white border border-slate-200/90 rounded-3xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#F1F5F9] text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-4">Candidate & Job</th>
                    <th className="px-4 py-4 text-center">JD Match</th>

                    <th className="px-4 py-4 text-center">ATS Format</th>
                    <th className="px-4 py-4 text-center">Mandatory Met</th>
                    <th className="px-4 py-4 text-center">Decision</th>
                    <th className="px-6 py-4 text-right">Audit Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filtered.map((e, idx) => (
                    <tr key={`${e.id}-${e.jobId}-${idx}`} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl font-extrabold text-sm flex items-center justify-center flex-shrink-0 ${avatarColor(e.candidate)} shadow-xs`}>
                            {e.candidate.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <Link href={`/jobs/${e.jobId}/candidates`} className="font-bold text-[#1E293B] group-hover:text-brand-orange transition-colors">
                              {e.candidate}
                            </Link>
                            <div className="text-xs text-slate-500">{e.job} • {e.company}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className={`text-base font-extrabold ${scoreColor(e.score)}`}>
                          {e.score}%
                        </div>
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full mx-auto mt-1 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${scoreBg(e.score)}`}
                            style={{ width: `${Math.min(100, Math.max(0, e.score))}%` }}
                          />
                        </div>
                        {e.matchLevel && (
                          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-tight block mt-1">
                            {e.matchLevel}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-xs font-bold text-slate-700">{e.ats}%</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold ${
                          !e.mandatoryFailed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {e.mandatory}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex px-2.5 py-1 rounded-md text-[10px] font-extrabold border ${decisionStyle(e.decision)}`}>
                          {e.decision === 'DO NOT SUBMIT' ? 'REJECT' : e.decision}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/evaluations/${e.evaluationId || e.id}?jobId=${e.jobId}`}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-2xs hover:shadow-xs cursor-pointer"
                        >
                          <span>Inspect Audit</span>
                          <span className="text-slate-400">→</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200/90 rounded-3xl text-center py-20 px-6 shadow-sm mt-4">
            <div className="w-16 h-16 rounded-2xl bg-brand-orange-pale text-brand-orange flex items-center justify-center mx-auto mb-4 shadow-xs">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[#1E293B] mb-2">No Evaluations Available</h3>
            <p className="text-slate-500 text-xs max-w-md mx-auto mb-6">
              Upload candidate CVs to your active jobs to run automated deterministic scoring, requirement matching, and evidence verification.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/jobs"
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors"
              >
                View Active Jobs
              </Link>
              <Link
                href="/jobs/create"
                className="px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-bold rounded-xl transition-all shadow-orange"
              >
                Upload New JD
              </Link>
            </div>
          </div>

        )}
      </main>
      <Footer />
    </div>
  );
}
