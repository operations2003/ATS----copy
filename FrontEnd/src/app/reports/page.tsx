'use client';

import React, { useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function ReportsPage() {
  const [period, setPeriod] = useState('30');

  const pipeline = [
    { stage: 'Submitted to Client', count: 776, color: 'bg-emerald-500', max: 776 },
    { stage: 'Client Interview Stage', count: 312, color: 'bg-blue-500', max: 776 },
    { stage: 'Technical Assessment', count: 184, color: 'bg-indigo-500', max: 776 },
    { stage: 'Final Offers Issued', count: 142, color: 'bg-teal-500', max: 776 },
  ];

  const topJobs = [
    { title: 'SAP CO Lead Consultant', company: 'TechCorp Industries', evaluated: 42, avgScore: 84, submitted: 18 },
    { title: 'Lead S/4HANA Architect', company: 'Global Logistics Inc', evaluated: 28, avgScore: 81, submitted: 12 },
    { title: 'Senior Backend Engineer', company: 'TaskNera Enterprise', evaluated: 65, avgScore: 88, submitted: 26 },
    { title: 'Financial Systems Analyst', company: 'Pinnacle Financial', evaluated: 19, avgScore: 76, submitted: 7 },
  ];

  return (
    <div className="min-h-screen bg-[#EEF2F6] text-[#1E293B] flex flex-col selection:bg-brand-orange-pale selection:text-brand-orange">
      <Header />
      <main className="max-w-screen-xl mx-auto px-6 pt-24 pb-16 flex-1 w-full">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-orange-pale border border-brand-orange-border rounded-full text-xs font-bold text-brand-orange mb-2">
              <span className="w-2 h-2 rounded-full bg-brand-orange" />
              Internal Recruitment Analytics
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1E293B] tracking-tight">Pipeline Performance &amp; Metrics</h1>
            <p className="text-sm text-slate-500 mt-1">Real-time candidate conversion ratios, job velocity, and deterministic match analytics</p>
          </div>
          
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 shadow-xs cursor-pointer"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time records</option>
          </select>
        </div>

        {/* Funnel & Position Pipelines */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">

          {/* Pipeline Funnel */}
          <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-slate-900 font-bold text-sm">Submission Conversion Funnel</h2>
                <span className="text-xs font-bold text-brand-orange bg-brand-orange-pale px-2.5 py-0.5 rounded-full">
                  776 Active
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-6">Stage-by-stage candidate progression across all active jobs & JDs</p>

              <div className="space-y-5">
                {pipeline.map((p, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5 text-xs">
                      <span className="text-slate-700 font-semibold">{p.stage}</span>
                      <span className="text-slate-900 font-bold">{p.count} candidates</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${p.color} transition-all duration-700`} style={{ width: `${(p.count / p.max) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Overall Funnel Velocity</span>
              <span className="font-bold text-emerald-600">42% Conversion Rate</span>
            </div>
          </div>

          {/* Top Jobs */}
          <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-slate-900 font-bold text-sm">Top Position Pipelines</h2>
                <span className="text-xs text-slate-500 font-medium">Updated 5 min ago</span>
              </div>
              <p className="text-xs text-slate-500 mb-5">Evaluation volume, mean deterministic score, and client submission readiness</p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-[#F1F5F9] text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-3 rounded-l-xl">Job Position</th>
                      <th className="py-3 text-center">Evaluated</th>
                      <th className="py-3 text-center">Mean Score</th>
                      <th className="px-4 py-3 text-right rounded-r-xl">Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {topJobs.map((j, i) => (
                      <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-4">
                          <div className="text-slate-900 font-bold text-xs sm:text-sm">{j.title}</div>
                          <div className="text-slate-500 text-xs mt-0.5">{j.company}</div>
                        </td>
                        <td className="py-4 text-center text-slate-800 font-bold">{j.evaluated}</td>
                        <td className="py-4 text-center">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                            j.avgScore >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : j.avgScore >= 65 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {j.avgScore}%
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-emerald-600">{j.submitted} profiles</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Active Job Volume</span>
              <span className="font-semibold text-slate-700">4 Core Position Pipelines</span>
            </div>
          </div>
        </div>

      </main>
      <Footer />
    </div>
  );
}

