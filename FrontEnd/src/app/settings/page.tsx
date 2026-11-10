'use client';

import React, { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';

const alertOptions = [
  { label: 'Evaluation Batch Complete', desc: 'Receive instant ping when multi-CV batch finishes scoring' },
  { label: 'Mandatory Requirement Failure Alert', desc: 'Instant flag when a top-tier candidate fails a hard constraint' },
  { label: 'High Match Candidate Discovered (90%+)', desc: 'Highlight top 1% candidates directly to hiring manager' },
  { label: 'Weekly EEOC & Bias Guard Report', desc: 'Aggregated statistical parity audit emailed every Monday' },
  { label: 'Recruiter Decision Override Log', desc: 'Alert when a recruiter changes automated SUBMIT/REJECT status' },
];

const defaultAlerts = alertOptions.map(() => true);

export default function SettingsPage() {
  const { user, getUserPassword, updatePassword } = useAuth();
  const settingsKey = `tasknera_settings_${user?.organizationId || user?.email || 'default'}`;
  const [activeTab, setActiveTab] = useState<'scoring' | 'account' | 'notifications'>('scoring');
  const [showPassword, setShowPassword] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [accountStatus, setAccountStatus] = useState('');
  const [accountError, setAccountError] = useState('');
  const [isUpdatingAccount, setIsUpdatingAccount] = useState(false);
  const [alerts, setAlerts] = useState<boolean[]>(defaultAlerts);

  const [scoring, setScoring] = useState({
    mandatoryWeight: 50,
    skillsWeight: 20,
    experienceWeight: 15,
    responsibilitiesWeight: 10,
    preferredWeight: 5,
    strictMandatory: true,
    autoRejectOnFailure: true,
    semanticMatching: true,
    minConfidence: 'MEDIUM' as 'HIGH' | 'MEDIUM' | 'LOW',
  });

  const [saved, setSaved] = useState(false);
  const totalWeight = scoring.mandatoryWeight + scoring.skillsWeight + scoring.experienceWeight + scoring.responsibilitiesWeight + scoring.preferredWeight;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(settingsKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed.scoring) setScoring(current => ({ ...current, ...parsed.scoring }));
      if (Array.isArray(parsed.alerts)) setAlerts(defaultAlerts.map((_, index) => parsed.alerts[index] !== false));
    } catch { /* Use the defaults when stored settings are unreadable. */ }
  }, [settingsKey]);

  const persistSettings = (nextScoring = scoring, nextAlerts = alerts) => {
    try { localStorage.setItem(settingsKey, JSON.stringify({ scoring: nextScoring, alerts: nextAlerts })); } catch { /* Keep the in-memory controls usable if storage is unavailable. */ }
  };

  const toggleScoring = (key: 'strictMandatory' | 'autoRejectOnFailure' | 'semanticMatching') => {
    setScoring(current => {
      const next = { ...current, [key]: !current[key] };
      persistSettings(next, alerts);
      return next;
    });
  };

  const toggleAlert = (index: number) => {
    setAlerts(current => {
      const next = current.map((enabled, i) => i === index ? !enabled : enabled);
      persistSettings(scoring, next);
      return next;
    });
  };

  const handleSave = () => {
    persistSettings();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveAlerts = () => {
    persistSettings();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs = [
    { id: 'scoring', label: 'Scoring Defaults & Rules' },
    { id: 'account', label: 'My Profile & Credentials' },
    { id: 'notifications', label: 'Alerts & Webhooks' },
  ] as const;


  return (
    <div className="min-h-screen bg-brand-bg flex flex-col selection:bg-brand-orange-pale selection:text-brand-orange">
      <Header />
      <main className="max-w-4xl mx-auto px-6 pt-24 pb-16 flex-1 w-full">

        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-orange-pale rounded-full text-xs font-bold text-brand-orange mb-2">
            <span className="w-2 h-2 rounded-full bg-brand-orange" />
            System Governance & ATS Configuration
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-brand-charcoal tracking-tight">System Settings</h1>
          <p className="text-sm text-brand-charcoal-3 mt-1">Configure evaluation algorithms, default rule weights, bias guard thresholds, and integrations</p>
        </div>

        {/* Tabs */}
        <div className="flex max-w-full items-center gap-2 overflow-x-auto bg-white border border-brand-border rounded-2xl p-1.5 w-fit mb-8 shadow-xs">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-brand-orange text-white shadow-orange'
                  : 'text-brand-charcoal-2 hover:text-brand-charcoal hover:bg-brand-bg'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* SCORING TAB */}
        {activeTab === 'scoring' && (
          <div className="space-y-6">

            {/* Default Scoring Weights */}
            <div className="bg-white border border-brand-border rounded-3xl p-7 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-brand-charcoal font-bold text-base">Default Category Weights</h2>
                <span className={`text-xs font-extrabold px-3 py-1 rounded-full ${totalWeight === 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                  Total: {totalWeight}/100 pts
                </span>
              </div>
              <p className="text-brand-charcoal-3 text-xs mb-6">These weights apply to all evaluations unless specifically overridden by a Client Profile.</p>

              <div className="space-y-4">
                {[
                  { label: 'Mandatory Requirements Compliance', key: 'mandatoryWeight', desc: 'Did candidate meet all hard requirements?', color: 'bg-emerald-500' },
                  { label: 'Core Technical Skills Match', key: 'skillsWeight', desc: 'Frameworks, programming languages, and cloud tools', color: 'bg-brand-orange' },
                  { label: 'Relevant Domain Experience', key: 'experienceWeight', desc: 'Years in target industry and seniority depth', color: 'bg-blue-500' },
                  { label: 'Responsibilities Alignment', key: 'responsibilitiesWeight', desc: 'Daily duties and system ownership proof', color: 'bg-purple-500' },
                  { label: 'Preferred & Nice-to-Have Skills', key: 'preferredWeight', desc: 'Secondary bonus qualifications and certs', color: 'bg-amber-500' },
                ].map(row => (
                  <div key={row.key} className="flex items-center gap-4 bg-brand-bg/70 p-4 rounded-2xl border border-brand-border/60">
                    <div className="flex-1">
                      <div className="text-brand-charcoal text-xs font-bold">{row.label}</div>
                      <div className="text-brand-charcoal-3 text-[11px] mt-0.5">{row.desc}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min="0" max="100"
                        value={scoring[row.key as keyof typeof scoring] as number}
                        onChange={e => setScoring({ ...scoring, [row.key]: parseInt(e.target.value) || 0 })}
                        className="w-16 bg-white border border-brand-border rounded-xl px-2 py-1.5 text-xs font-bold text-brand-charcoal text-center focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                      />
                      <span className="text-brand-charcoal-3 text-xs font-semibold">pts</span>
                    </div>
                    <div className="w-24">
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${row.color}`}
                          style={{ width: `${Math.min(100, (scoring[row.key as keyof typeof scoring] as number))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {totalWeight !== 100 && (
                <div className="mt-4 text-red-700 text-xs bg-red-50 border border-red-200 rounded-xl px-4 py-3 font-semibold">
                  ⚠️ Category weights must total exactly 100 points. Currently: {totalWeight} points.
                </div>
              )}
            </div>

            {/* Evaluation Rules */}
            <div className="bg-white border border-brand-border rounded-3xl p-7 shadow-sm">
              <h2 className="text-brand-charcoal font-bold text-base mb-4">Algorithm & Rule Engine Controls</h2>
              <div className="space-y-4">
                {[
                  { label: 'Strict Mandatory Enforcement', key: 'strictMandatory', desc: 'Any failed mandatory requirement caps candidate match score at 40%' },
                  { label: 'Auto-Disqualify on Mandatory Failure', key: 'autoRejectOnFailure', desc: 'Automatically set candidate decision to DO NOT SUBMIT' },
                  { label: 'Contextual Semantic Matching', key: 'semanticMatching', desc: 'Resolve synonyms (e.g., "GCP" = "Google Cloud Platform", "K8s" = "Kubernetes")' },
                ].map(row => (
                  <div key={row.key} className="flex min-w-0 items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl bg-brand-bg/70 border border-brand-border/60">
                    <div className="min-w-0 flex-1">
                      <p className="text-brand-charcoal text-xs font-bold break-words">{row.label}</p>
                      <p className="text-brand-charcoal-3 text-[11px] mt-0.5 break-words">{row.desc}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(scoring[row.key as keyof typeof scoring])}
                      aria-label={row.label}
                      onClick={() => toggleScoring(row.key as 'strictMandatory' | 'autoRejectOnFailure' | 'semanticMatching')}
                      className={`relative block flex-none w-11 h-6 min-w-11 p-0 border-0 rounded-full transition-colors cursor-pointer overflow-hidden ${
                        scoring[row.key as keyof typeof scoring] ? 'bg-brand-orange' : 'bg-slate-300'
                      }`}
                    >
                      <span className={`absolute left-0.5 top-0.5 block w-5 h-5 bg-white rounded-full transition-transform shadow-xs ${
                        scoring[row.key as keyof typeof scoring] ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                ))}

                <div className="flex min-w-0 flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl bg-brand-bg/70 border border-brand-border/60">
                  <div className="min-w-0 flex-1">
                    <p className="text-brand-charcoal text-xs font-bold break-words">Evidence Minimum Confidence Filter</p>
                    <p className="text-brand-charcoal-3 text-[11px] mt-0.5 break-words">Extracted citations below this threshold will require human recruiter confirmation</p>
                  </div>
                  <select
                    value={scoring.minConfidence}
                    onChange={e => setScoring(current => ({ ...current, minConfidence: e.target.value as any }))}
                    className="w-full min-w-0 max-w-full sm:w-64 sm:flex-none bg-white border border-brand-border text-brand-charcoal font-bold text-xs rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer shadow-xs"
                  >
                    <option value="HIGH">High Confidence Only (90%+)</option>
                    <option value="MEDIUM">Medium & Above (75%+)</option>
                    <option value="LOW">All Discovered Evidence</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Match Level Thresholds */}
            <div className="bg-white border border-brand-border rounded-3xl p-7 shadow-sm">
              <h2 className="text-brand-charcoal font-bold text-base mb-1">Standardized Decision Bands</h2>
              <p className="text-brand-charcoal-3 text-xs mb-5">Calibrated candidate recommendation bands</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { range: '90–100%', label: 'STRONG MATCH (SUBMIT)', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                  { range: '80–89%', label: 'GOOD MATCH (SUBMIT)', color: 'text-blue-700 bg-blue-50 border-blue-200' },
                  { range: '70–79%', label: 'MANUAL REVIEW', color: 'text-amber-700 bg-amber-50 border-amber-200' },
                  { range: '60–69%', label: 'MARGINAL FIT', color: 'text-orange-700 bg-orange-50 border-orange-200' },
                  { range: 'Below 60%', label: 'DISQUALIFIED', color: 'text-red-700 bg-red-50 border-red-200' },
                ].map((t, i) => (
                  <div key={i} className={`p-3.5 rounded-2xl border ${t.color} flex items-center justify-between text-xs`}>
                    <span className="font-extrabold">{t.range}</span>
                    <span className="font-bold text-[11px]">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleSave}
                disabled={totalWeight !== 100}
                className="flex items-center gap-2 px-7 py-3.5 bg-brand-orange hover:bg-brand-orange-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all shadow-orange hover:shadow-orange-lg cursor-pointer"
              >
                {saved ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    Settings Successfully Saved
                  </>
                ) : 'Save System Settings'}
              </button>
            </div>
          </div>
        )}

        {/* ACCOUNT TAB */}
        {activeTab === 'account' && (
          <div className="bg-white border border-brand-border rounded-3xl p-7 shadow-sm space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-brand-charcoal font-bold text-base">My Profile & Active Credentials</h2>
                <span className="text-[11px] font-extrabold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  ● Active Session
                </span>
              </div>
              <p className="text-brand-charcoal-3 text-xs mt-1">Review your login username, official password, and system permissions.</p>
            </div>

            {accountStatus && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{accountStatus}</span>
              </div>
            )}

            {accountError && (
              <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{accountError}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-brand-charcoal mb-1.5">Full Name</label>
                <input
                  type="text"
                  readOnly
                  value={user?.name || (user?.email ? user.email.split('@')[0] : 'User')}
                  className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-xs font-semibold text-brand-charcoal focus:outline-none"
                />
              </div>

              {/* Username row */}
              <div>
                <label className="block text-xs font-bold text-brand-charcoal mb-1.5">Username</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={user?.email ? user.email.split('@')[0] : ''}
                    className="flex-1 bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-xs font-mono font-bold text-brand-charcoal focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const uname = user?.email ? user.email.split('@')[0] : '';
                      if (uname) {
                        navigator.clipboard.writeText(uname);
                        setCopiedKey('username');
                        setTimeout(() => setCopiedKey(null), 2000);
                      }
                    }}
                    className="px-4 py-2.5 bg-white border border-brand-border hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 flex-shrink-0"
                  >
                    <span>{copiedKey === 'username' ? '✓ Copied' : 'Copy Username'}</span>
                  </button>
                </div>
              </div>

              {/* Email row */}
              <div>
                <label className="block text-xs font-bold text-brand-charcoal mb-1.5">Enterprise Email</label>
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    readOnly
                    value={user?.email || ''}
                    className="flex-1 bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-xs font-semibold text-brand-charcoal focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (user?.email) {
                        navigator.clipboard.writeText(user.email);
                        setCopiedKey('email');
                        setTimeout(() => setCopiedKey(null), 2000);
                      }
                    }}
                    className="px-4 py-2.5 bg-white border border-brand-border hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 flex-shrink-0"
                  >
                    <span>{copiedKey === 'email' ? '✓ Copied' : 'Copy Email'}</span>
                  </button>
                </div>
              </div>

              {/* Password row */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-brand-charcoal">Account Password</label>
                  <span className="text-[11px] text-slate-500">Stored credentials</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      readOnly
                      value={getUserPassword() || user?.password || '••••••••••••'}
                      className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-xs font-mono font-bold text-brand-charcoal focus:outline-none pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const pwd = getUserPassword() || user?.password || '';
                      if (pwd) {
                        navigator.clipboard.writeText(pwd);
                        setCopiedKey('password');
                        setTimeout(() => setCopiedKey(null), 2000);
                      }
                    }}
                    className="px-4 py-2.5 bg-white border border-brand-border hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 flex-shrink-0"
                  >
                    <span>{copiedKey === 'password' ? '✓ Copied' : 'Copy Password'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Change Password Sub-section */}
            <div className="pt-5 border-t border-brand-border">
              <h3 className="text-brand-charcoal text-xs font-bold mb-3 uppercase tracking-wider">Change Account Password</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-brand-charcoal mb-1.5">Current Password</label>
                  <input
                    type="password"
                    value={currentPasswordInput}
                    onChange={e => setCurrentPasswordInput(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-xs font-semibold text-brand-charcoal focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-charcoal mb-1.5">New Password (8+ chars)</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Enter new secure password"
                    className="w-full bg-brand-bg border border-brand-border rounded-xl px-4 py-2.5 text-xs font-semibold text-brand-charcoal focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="button"
                disabled={isUpdatingAccount || !newPassword}
                onClick={async () => {
                  setAccountError('');
                  setAccountStatus('');
                  if (newPassword.length < 8) {
                    setAccountError('New password must be at least 8 characters long.');
                    return;
                  }
                  setIsUpdatingAccount(true);
                  try {
                    await updatePassword(newPassword, currentPasswordInput || undefined);
                    setAccountStatus('Password updated successfully!');
                    setNewPassword('');
                    setCurrentPasswordInput('');
                    setTimeout(() => setAccountStatus(''), 3000);
                  } catch (err: any) {
                    setAccountError(err?.message || 'Failed to update password.');
                  } finally {
                    setIsUpdatingAccount(false);
                  }
                }}
                className="px-6 py-3 bg-brand-orange hover:bg-brand-orange-hover disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-orange cursor-pointer"
              >
                {isUpdatingAccount ? 'Updating...' : 'Update Password & Credentials'}
              </button>
            </div>
          </div>
        )}


        {/* NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
          <div className="bg-white border border-brand-border rounded-3xl p-4 sm:p-7 shadow-sm overflow-hidden">
            <h2 className="text-brand-charcoal font-bold text-base mb-5">Automated Alert Dispatch Rules</h2>
            <div className="space-y-4">
              {alertOptions.map((n, i) => (
                <div key={n.label} className="flex min-w-0 items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl bg-brand-bg/70 border border-brand-border/60">
                  <div className="min-w-0 flex-1">
                    <p className="text-brand-charcoal text-xs font-bold break-words">{n.label}</p>
                    <p className="text-brand-charcoal-3 text-[11px] mt-0.5 break-words">{n.desc}</p>
                  </div>
                  <button type="button" role="switch" aria-checked={alerts[i]} aria-label={n.label} onClick={() => toggleAlert(i)} className={`relative block flex-none w-11 h-6 min-w-11 p-0 border-0 rounded-full transition-colors cursor-pointer overflow-hidden ${alerts[i] ? 'bg-brand-orange' : 'bg-slate-300'}`}>
                    <span className={`absolute left-0.5 top-0.5 block w-5 h-5 bg-white rounded-full shadow-xs transition-transform ${alerts[i] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-6">
              <button type="button" onClick={handleSaveAlerts} className="px-6 py-3 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-bold rounded-xl transition-all shadow-orange cursor-pointer">
                {saved ? 'Alert Settings Saved' : 'Save Alert Settings'}
              </button>
            </div>
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
}


