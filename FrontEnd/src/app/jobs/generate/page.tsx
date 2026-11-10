'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';

type Draft = { title: string; summary: string; responsibilities: string[]; mandatory: string[]; preferred: string[]; common: string[] };
const roleSuggestions = (title: string) => {
  const t = title.toLowerCase();
  if (/data scientist|machine learning|ml engineer/.test(t)) return {
    mandatory: ['Strong Python programming and SQL', 'Experience preparing, analyzing, and validating datasets', 'Experience building and evaluating statistical or machine learning models'],
    preferred: ['Experience deploying models or data products to cloud environments', 'Familiarity with PyTorch, TensorFlow, or scikit-learn', 'Experience communicating analytical findings to non-technical stakeholders'],
    common: ['Clear written and verbal communication', 'Structured problem-solving and attention to data quality', 'Ability to collaborate with product and engineering teams'],
  };
  if (/hr |human resource|recruit|talent acquisition/.test(t)) return {
    mandatory: ['Experience coordinating recruitment, candidate screening, and interviews', 'Working knowledge of recruitment processes and employment documentation', 'Ability to maintain accurate and confidential candidate records'],
    preferred: ['Experience using an applicant tracking system (ATS)', 'Experience supporting hiring managers and workforce planning', 'Familiarity with applicable employment practices'],
    common: ['Strong candidate communication and relationship-building', 'Organization and follow-through across multiple open roles', 'Sound judgment and discretion with sensitive information'],
  };
  if (/software|developer|engineer|backend|frontend|full.?stack/.test(t)) return {
    mandatory: ['Professional experience building and maintaining production software', 'Proficiency in the programming language and tools relevant to this role', 'Experience with code reviews, automated testing, and version control'],
    preferred: ['Experience designing or integrating APIs and distributed services', 'Experience deploying applications to a cloud platform', 'Familiarity with CI/CD and observability practices'],
    common: ['Strong debugging and problem-solving skills', 'Clear communication in a collaborative engineering team', 'Ability to document technical decisions and deliver iteratively'],
  };
  return {
    mandatory: ['Relevant experience delivering the core responsibilities of this role', 'Demonstrated proficiency in the role-specific tools and skills described by the hiring team', 'Ability to meet the essential requirements and working arrangements stated for this position'],
    preferred: ['Experience in the employer’s industry or a similar operating environment', 'Relevant professional certification or equivalent practical experience', 'Experience improving processes and measuring outcomes'],
    common: ['Clear written and verbal communication', 'Organized, dependable approach to managing priorities', 'Collaborative problem-solving and sound professional judgment'],
  };
};

const listFrom = (value: unknown, fallback: string[]) => Array.isArray(value) && value.length ? value.map((x: any) => typeof x === 'string' ? x : x?.name || x?.requirement).filter(Boolean) : fallback;

export default function GenerateJdPage() {
  const { token, user, isAuthenticated } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [workMode, setWorkMode] = useState('Hybrid');
  const [salary, setSalary] = useState('');
  const [experience, setExperience] = useState('');
  const [immediateJoiner, setImmediateJoiner] = useState('No preference');
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState('');

  const jdText = useMemo(() => {
    if (!draft) return '';
    return [draft.title, '', 'About the role', draft.summary, '', 'Responsibilities', ...draft.responsibilities.map(x => `• ${x}`), '', 'Mandatory requirements', ...draft.mandatory.map(x => `• ${x}`), '', 'Preferred requirements', ...draft.preferred.map(x => `• ${x}`), '', 'Common capabilities', ...draft.common.map(x => `• ${x}`), '', `Location: ${location || 'To be discussed'} | Work mode: ${workMode}`, salary ? `Salary range: ${salary}` : '', experience ? `Experience: ${experience}` : '', immediateJoiner !== 'No preference' ? `Immediate joiner: ${immediateJoiner}` : ''].filter(x => x !== undefined).join('\n');
  }, [draft, location, workMode, salary, experience, immediateJoiner]);

  const generate = async (e: React.FormEvent) => {
    e.preventDefault(); setMessage('');
    if (!title.trim() || notes.trim().length < 20) { setMessage('Add a role title and at least a couple of sentences describing the job.'); return; }
    setIsGenerating(true);
    const base = roleSuggestions(title);
    let parsed: any = null;
    if (isAuthenticated && (token || (typeof window !== 'undefined' && localStorage.getItem('tasknera_token')))) {
      try {
        const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
        const response = await fetch(`${api}/jobs/parse`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || localStorage.getItem('tasknera_token')}` }, body: JSON.stringify({ text: `Job title: ${title}\nLocation: ${location}\nWork mode: ${workMode}\nSalary: ${salary}\nExperience: ${experience}\nImmediate joiner: ${immediateJoiner}\nHiring manager description: ${notes}` }) });
        const payload = await response.json();
        if (response.ok && payload.success) parsed = payload.data || payload;
      } catch { /* Use the local role-aware draft if the service is unavailable. */ }
    }
    const normalized = parsed?.normalizedJd || parsed?.normalized_jd || {};
    const parsedRequirements = parsed?.requirements || [];
    const mandatoryExtracted = parsedRequirements.filter((r: any) => r.is_mandatory || r.mandatory).map((r: any) => r.requirement);
    const preferredExtracted = parsedRequirements.filter((r: any) => !(r.is_mandatory || r.mandatory)).map((r: any) => r.requirement);
    const summary = normalized.summary || `Join the team as ${title.trim()} and help deliver the outcomes described below. ${notes.trim()}`;
    setDraft({
      title: normalized.job_title || title.trim(), summary,
      responsibilities: listFrom(normalized.responsibilities, [notes.trim(), 'Partner with relevant teams and stakeholders to plan, deliver, and improve work outcomes.', 'Communicate progress, risks, and recommendations clearly.']),
      mandatory: listFrom(normalized.mandatory_requirements, mandatoryExtracted.length ? mandatoryExtracted : base.mandatory),
      preferred: listFrom(normalized.preferred_requirements, preferredExtracted.length ? preferredExtracted : base.preferred),
      common: [...base.common],
    });
    setMessage(parsed ? 'Draft generated using the JD analysis service. Review suggested requirements before publishing.' : 'Draft generated with role-based suggestions. Review and tailor requirements before publishing.');
    setIsGenerating(false);
  };

  const updateList = (key: 'responsibilities' | 'mandatory' | 'preferred' | 'common', index: number, value: string) => setDraft(d => d ? ({ ...d, [key]: d[key].map((item, i) => i === index ? value : item) }) : d);
  const addItem = (key: 'responsibilities' | 'mandatory' | 'preferred' | 'common') => setDraft(d => d ? ({ ...d, [key]: [...d[key], ''] }) : d);
  const removeItem = (key: 'responsibilities' | 'mandatory' | 'preferred' | 'common', index: number) => setDraft(d => d ? ({ ...d, [key]: d[key].filter((_, i) => i !== index) }) : d);
  const downloadWord = () => {
    if (!draft) return;
    const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    const section = (name: string, items: string[]) => `<h2>${name}</h2><ul>${items.filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    const html = `<html><meta charset="utf-8"><body><h1>${esc(draft.title)}</h1><p>${esc(draft.summary)}</p><p><b>Location:</b> ${esc(location || 'To be discussed')} &nbsp; <b>Work mode:</b> ${esc(workMode)}${salary ? ` &nbsp; <b>Salary:</b> ${esc(salary)}` : ''}</p>${section('Responsibilities', draft.responsibilities)}${section('Mandatory requirements', draft.mandatory)}${section('Preferred requirements', draft.preferred)}${section('Common capabilities', draft.common)}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'application/msword' })); const a = document.createElement('a'); a.href = url; a.download = `${draft.title.replace(/[^a-z0-9]+/gi, '-')}-JD.doc`; a.click(); URL.revokeObjectURL(url);
  };
  const useDraft = () => {
    if (!draft) return;
    const company = (user as any)?.organizationName || (user as any)?.organization?.name || '';
    sessionStorage.setItem('tasknera_generated_jd', JSON.stringify({ position: draft.title, location, workMode, salary, jdText, client: company, requirements: [...draft.mandatory.map(requirement => ({ requirement, mandatory: true })), ...draft.preferred.map(requirement => ({ requirement, mandatory: false }))] }));
    router.push('/jobs/create?fromGenerated=1');
  };

  return <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans"><Header /><main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
    <Link href="/jobs" className="text-sm font-semibold text-slate-500 hover:text-orange-600">← Back to Jobs</Link>
    <div className="mt-5 mb-7"><p className="text-xs tracking-[.18em] uppercase font-bold text-orange-600">AI assisted drafting</p><h1 className="mt-2 text-3xl font-extrabold">Create a structured job description</h1><p className="mt-2 text-slate-500">Describe the role in plain language. We’ll organize it into a reviewable JD with role relevant requirement suggestions.</p></div>
    <form onSubmit={generate} className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-sm space-y-5">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <label className="text-sm font-semibold">Job title<input value={title} onChange={e => setTitle(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal" placeholder="e.g. Senior Backend Engineer" /></label>
        <label className="text-sm font-semibold">Location<input value={location} onChange={e => setLocation(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal" placeholder="Bengaluru, India" /></label>
        <label className="text-sm font-semibold">Work arrangement<select value={workMode} onChange={e => setWorkMode(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal"><option>Hybrid</option><option>Remote</option><option>Onsite</option></select></label>
        <label className="text-sm font-semibold">Salary range<input value={salary} onChange={e => setSalary(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal" placeholder="₹24–32 LPA" /></label>
        <label className="text-sm font-semibold">Experience<input value={experience} onChange={e => setExperience(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal" placeholder="e.g. 5–8 years" /></label>
        <label className="text-sm font-semibold">Immediate joiner<select value={immediateJoiner} onChange={e => setImmediateJoiner(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal"><option>No preference</option><option>Yes, required</option><option>Preferred, not required</option><option>No</option></select></label>
      </div>
      <label className="block text-sm font-semibold">Describe the role in your own words<textarea rows={5} value={notes} onChange={e => setNotes(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal resize-y" placeholder="We need an experienced backend engineer to build APIs for our recruitment platform. They will work with product and frontend teams, own services in Node.js and PostgreSQL, improve reliability, and help deploy on AWS. This is a hybrid role in Bengaluru..." /></label>
      <p className="text-xs text-slate-500">Company name is taken from your workspace when you continue to create the requisition. Requirements are suggestions; review them for your role and local hiring policies.</p>
      {message && <div className="rounded-xl bg-[#EFF4FF] border border-[#D1E0FF] p-3 text-sm text-slate-700">{message}</div>}
      <button disabled={isGenerating} className="rounded-xl bg-[#3563E9] hover:bg-[#2851D6] disabled:opacity-60 px-5 py-3 text-white font-bold">{isGenerating ? 'Generating draft…' : 'Generate JD'}</button>
    </form>
    {draft && <section className="mt-7 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="p-5 sm:p-7 border-b border-slate-100 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest font-bold text-emerald-700">Generated draft · editable</p><h2 className="text-2xl font-bold mt-1">{draft.title}</h2></div><div className="flex gap-2"><button onClick={() => window.print()} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold">Download PDF</button><button onClick={downloadWord} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold">Download Word</button><button onClick={useDraft} className="rounded-lg bg-[#3563E9] hover:bg-[#2851D6] px-4 py-2 text-sm font-bold text-white">Use this JD</button></div></div>
      <div id="generated-jd" className="p-5 sm:p-7 space-y-6"><div><h3 className="font-bold mb-2">Role summary</h3><textarea value={draft.summary} onChange={e => setDraft({ ...draft, summary: e.target.value })} className="w-full min-h-24 rounded-lg border border-slate-200 p-3 text-sm" /></div>
      {(['responsibilities', 'mandatory', 'preferred', 'common'] as const).map(key => { const labels = { responsibilities: 'Responsibilities', mandatory: 'Mandatory requirements', preferred: 'Preferred requirements', common: 'Common capabilities' }; return <div key={key}><div className="flex justify-between items-center mb-2"><h3 className="font-bold">{labels[key]}</h3><button type="button" onClick={() => addItem(key)} className="text-sm font-semibold text-[#3563E9] hover:underline">+ Add item</button></div><div className="space-y-2">{draft[key].map((item, index) => <div key={`${key}-${index}`} className="flex gap-2"><input value={item} onChange={e => updateList(key, index, e.target.value)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" /><button type="button" onClick={() => removeItem(key, index)} aria-label="Remove item" className="px-3 text-slate-400 hover:text-rose-600">×</button></div>)}</div></div>; })}
      </div>
    </section>}
    <style jsx global>{`@media print { body * { visibility:hidden !important } #generated-jd, #generated-jd * { visibility:visible !important } #generated-jd { position:absolute; inset:0; width:100%; padding:24px !important; } #generated-jd textarea, #generated-jd input { border:0 !important; resize:none; } header, button { display:none !important } }`}</style>
  </main><Footer /></div>;
}
