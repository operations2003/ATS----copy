'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';
import { UserRole, OrganizationQuota } from '@/lib/api';
import { atsStore, AuditEvent, RecruiterMetric, JobItem, CandidateItem } from '@/lib/atsStore';
import RecruiterPerformancePipelineTracker from '@/components/admin/RecruiterPerformancePipelineTracker';

export default function AdminPage() {
  const router = useRouter();
  const { user, setRole, signin, isLoading: authLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [quota, setQuota] = useState<OrganizationQuota | null>(null);
  const [loadingQuota, setLoadingQuota] = useState(false);
  const [podFilter, setPodFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [searchRecruiter, setSearchRecruiter] = useState('');

  // Modals & detail view
  const [selectedRecruiter, setSelectedRecruiter] = useState<RecruiterMetric | null>(null);
  const [showRecruiterModal, setShowRecruiterModal] = useState(false);

  // Add Member Modal State
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [showNewMemberPassword, setShowNewMemberPassword] = useState(false);
  const [newMemberTeamSelect, setNewMemberTeamSelect] = useState('General');
  const [newMemberCustomTeam, setNewMemberCustomTeam] = useState('');
  const [newMemberRoleSelect, setNewMemberRoleSelect] = useState('General');
  const [newMemberCustomRole, setNewMemberCustomRole] = useState('');
  const [newMemberSkills, setNewMemberSkills] = useState('');
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [addMemberError, setAddMemberError] = useState('');
  const [addMemberSuccess, setAddMemberSuccess] = useState('');

  // Edit Member Modal State
  const [memberToEdit, setMemberToEdit] = useState<RecruiterMetric | null>(null);
  const [showEditMemberModal, setShowEditMemberModal] = useState(false);
  const [editMemberName, setEditMemberName] = useState('');
  const [editMemberEmail, setEditMemberEmail] = useState('');
  const [editMemberPassword, setEditMemberPassword] = useState('');
  const [showEditMemberPassword, setShowEditMemberPassword] = useState(false);
  const [editMemberTeamSelect, setEditMemberTeamSelect] = useState('General');
  const [editMemberCustomTeam, setEditMemberCustomTeam] = useState('');
  const [editMemberRoleSelect, setEditMemberRoleSelect] = useState('General');
  const [editMemberCustomRole, setEditMemberCustomRole] = useState('');
  const [editMemberSkills, setEditMemberSkills] = useState('');
  const [editMemberLoading, setEditMemberLoading] = useState(false);
  const [editMemberError, setEditMemberError] = useState('');
  const [editMemberSuccess, setEditMemberSuccess] = useState('');

  // Delete Member Confirmation State
  const [memberToDelete, setMemberToDelete] = useState<RecruiterMetric | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');

  // Live state from Store
  const [recruiters, setRecruiters] = useState<RecruiterMetric[]>([]);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [overviewStats, setOverviewStats] = useState<{
    totalResumesSeen: number;
    totalShortlisted: number;
    conversionRate: number;
    meanScore?: number | null;
  } | null>(null);

  const [loadingMembers, setLoadingMembers] = useState(false);

  const isPurgedMember = (email?: string, name?: string): boolean => {
    const e = String(email || '').toLowerCase().trim();
    const n = String(name || '').toLowerCase().trim();
    if (e === 'operations@tasknera.com' || e === 'admin@gmail.com' || e === 'admin@tasknera.com' || e === 'sheetalbedi@tasknera.com') return true;
    if (e.includes('harsh') || n.includes('harsh')) return true;
    if (e.includes('aditya') || n.includes('aditya')) return true;
    return false;
  };

  const syncData = () => {
    setRecruiters(atsStore.getRecruiters().filter(r => !isPurgedMember(r.email, r.name) && r.role !== 'ADMIN' && (r as any).role !== 'CLIENT_ADMIN' && (r as any).role !== 'SUPER_ADMIN'));
    setJobs(atsStore.getJobs().filter(j => !isPurgedMember(j.assignedRecruiter, j.assignedRecruiter)));
    setCandidates(atsStore.getCandidates().filter(c => !isPurgedMember(c.assignedRecruiter, c.assignedRecruiter)));
    setAuditEvents(atsStore.getAuditEvents().filter(a => !isPurgedMember(a.user, a.user)));
  };

  const fetchLiveTAMembers = async () => {
    try {
      setLoadingMembers(true);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      const res = await fetch(`${backendUrl}/users/ta-members`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.overviewStats) {
          setOverviewStats(data.overviewStats);
        }
        if (Array.isArray(data.members)) {
          // Cascade delete purged members from backend database if found
          data.members.forEach(async (m: any) => {
            if (isPurgedMember(m.email, m.name) && m.email?.toLowerCase().trim() !== 'operations@tasknera.com' && m.email?.toLowerCase().trim() !== 'admin@gmail.com' && m.email?.toLowerCase().trim() !== 'admin@tasknera.com' && m.email?.toLowerCase().trim() !== 'sheetalbedi@tasknera.com') {
              try {
                await fetch(`${backendUrl}/users/${encodeURIComponent(m.id)}?email=${encodeURIComponent(m.email)}`, {
                  method: 'DELETE',
                  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
                });
              } catch (_) {}
            }
          });

          const nonAdmin = data.members.filter((m: any) => !isPurgedMember(m.email, m.name) && m.role !== 'ADMIN' && m.role !== 'CLIENT_ADMIN' && m.role !== 'SUPER_ADMIN');
          atsStore.setRecruitersFromDatabase(nonAdmin);
          setRecruiters(nonAdmin);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch live TA members from database:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const fetchQuota = async () => {
    try {
      setLoadingQuota(true);
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      if (!token) return;
      const res = await fetch(`${backendUrl}/users/quota`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.quota) {
          setQuota(data.quota);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch quota:', err);
    } finally {
      setLoadingQuota(false);
    }
  };

  const handleInitiateEdit = (member: RecruiterMetric) => {
    setMemberToEdit(member);
    setEditMemberName(member.name || '');
    setEditMemberEmail(member.email || '');

    const currentTeam = member.team?.trim() || 'General';
    if (currentTeam === 'General') {
      setEditMemberTeamSelect('General');
      setEditMemberCustomTeam('');
    } else {
      setEditMemberTeamSelect('__CUSTOM__');
      setEditMemberCustomTeam(currentTeam);
    }

    const currentRole = (member.customRole || member.displayRole || (member.role === 'TEAM_LEAD' ? 'Team Lead' : 'General')).trim();
    if (member.role === 'TEAM_LEAD' || currentRole.toLowerCase() === 'team lead') {
      setEditMemberRoleSelect('TEAM_LEAD');
      setEditMemberCustomRole('');
    } else if (currentRole.toLowerCase() === 'general' || currentRole.toLowerCase() === 'ta member' || currentRole.toLowerCase() === 'recruiter') {
      setEditMemberRoleSelect('General');
      setEditMemberCustomRole('');
    } else {
      setEditMemberRoleSelect('__CUSTOM__');
      setEditMemberCustomRole(currentRole);
    }

    setEditMemberSkills(
      Array.isArray(member.topSkills) && member.topSkills.length > 0
        ? member.topSkills.join(', ')
        : Array.isArray(member.strengths) && member.strengths.length > 0
        ? member.strengths.join(', ')
        : ''
    );

    let existingPassword = '';
    if (typeof window !== 'undefined' && member.email) {
      const cleanEmail = member.email.toLowerCase().trim();
      existingPassword = localStorage.getItem('tasknera_user_pwd_' + cleanEmail) || '';
      if (!existingPassword) {
        try {
          const reg = JSON.parse(localStorage.getItem('tasknera_credential_registry') || '{}');
          existingPassword = reg[cleanEmail] || '';
        } catch {}
      }
    }
    setEditMemberPassword(existingPassword);
    setShowEditMemberPassword(false);
    setEditMemberError('');
    setEditMemberSuccess('');
    setShowEditMemberModal(true);
  };

  const handleSaveEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberToEdit) return;

    setEditMemberError('');
    setEditMemberSuccess('');

    if (!editMemberName.trim() || !editMemberEmail.trim()) {
      setEditMemberError('Name and corporate email are required.');
      return;
    }

    if (editMemberPassword && editMemberPassword.trim().length > 0 && editMemberPassword.trim().length < 8) {
      setEditMemberError('Password must be at least 8 characters long if provided.');
      return;
    }

    setEditMemberLoading(true);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      const cleanNewEmail = editMemberEmail.trim().toLowerCase();
      const cleanOldEmail = memberToEdit.email.trim().toLowerCase();

      const finalTeam = (editMemberTeamSelect === '__CUSTOM__' ? editMemberCustomTeam.trim() : editMemberTeamSelect.trim()) || 'General';
      const finalRoleBackend = editMemberRoleSelect === 'TEAM_LEAD' ? 'TEAM_LEADER' : 'MEMBER';
      const finalCustomRole = (editMemberRoleSelect === '__CUSTOM__' ? editMemberCustomRole.trim() : (editMemberRoleSelect === 'TEAM_LEAD' ? 'Team Lead' : 'General')) || 'General';

      // Call backend API update
      const updateEndpoint = `${backendUrl}/users/${encodeURIComponent(memberToEdit.id)}?email=${encodeURIComponent(cleanOldEmail)}`;
      try {
        const res = await fetch(updateEndpoint, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            name: editMemberName.trim(),
            email: cleanNewEmail,
            currentEmail: cleanOldEmail,
            password: editMemberPassword.trim() ? editMemberPassword.trim() : undefined,
            role: finalRoleBackend,
            team: finalTeam,
            customRole: finalCustomRole,
            teamId: null,
          })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 400 && data.error) {
            throw new Error(data.error);
          }
        }
      } catch (backendErr: any) {
        if (backendErr?.message && !backendErr.message.includes('fetch')) {
          throw backendErr;
        }
        console.warn('Backend update server non-critical error or offline:', backendErr);
      }

      // Update password in local credential registry
      if (editMemberPassword.trim() && typeof window !== 'undefined') {
        localStorage.setItem('tasknera_user_pwd_' + cleanNewEmail, editMemberPassword.trim());
        try {
          const reg = JSON.parse(localStorage.getItem('tasknera_credential_registry') || '{}');
          if (cleanOldEmail !== cleanNewEmail) {
            delete reg[cleanOldEmail];
          }
          reg[cleanNewEmail] = editMemberPassword.trim();
          localStorage.setItem('tasknera_credential_registry', JSON.stringify(reg));
        } catch {}
      }

      const skillsArray = editMemberSkills
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      // Update in atsStore
      atsStore.updateRecruiter(memberToEdit.id, {
        name: editMemberName.trim(),
        email: cleanNewEmail,
        role: editMemberRoleSelect === 'TEAM_LEAD' ? 'TEAM_LEAD' : 'RECRUITER_MEMBER',
        team: finalTeam,
        customRole: finalCustomRole,
        displayRole: finalCustomRole,
        topSkills: skillsArray.length > 0 ? skillsArray : memberToEdit.topSkills,
        strengths: skillsArray.length > 0 ? skillsArray : memberToEdit.strengths,
      }, cleanOldEmail);

      // Refresh live member list and sync
      await fetchLiveTAMembers();
      await fetchQuota();
      syncData();

      // If drill-down modal had this member selected, update selectedRecruiter
      if (selectedRecruiter?.id === memberToEdit.id || selectedRecruiter?.email.toLowerCase() === cleanOldEmail) {
        setSelectedRecruiter(prev => prev ? {
          ...prev,
          name: editMemberName.trim(),
          email: cleanNewEmail,
          role: editMemberRoleSelect === 'TEAM_LEAD' ? 'TEAM_LEAD' : 'RECRUITER_MEMBER',
          team: finalTeam,
          customRole: finalCustomRole,
          displayRole: finalCustomRole,
          topSkills: skillsArray.length > 0 ? skillsArray : prev.topSkills,
        } : null);
      }

      setEditMemberSuccess(`Member ${editMemberName.trim()} updated successfully!`);
      setTimeout(() => {
        setShowEditMemberModal(false);
        setMemberToEdit(null);
        setEditMemberSuccess('');
      }, 1000);
    } catch (err: any) {
      setEditMemberError(err?.message || 'Failed to update member profile.');
    } finally {
      setEditMemberLoading(false);
    }
  };

  const handleInitiateDelete = (member: RecruiterMetric) => {
    setMemberToDelete(member);
    setDeleteError('');
    setDeleteSuccess('');
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!memberToDelete) return;
    setDeleteLoading(true);
    setDeleteError('');
    setDeleteSuccess('');

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;

      const deleteEndpoint = `${backendUrl}/users/${encodeURIComponent(memberToDelete.id)}?email=${encodeURIComponent(memberToDelete.email)}`;
      const res = await fetch(deleteEndpoint, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete member from database.');
      }

      // Purge locally from atsStore as well
      atsStore.deleteRecruiter(memberToDelete.id, memberToDelete.name, memberToDelete.email);

      // Refresh live member list and sync
      await fetchLiveTAMembers();
      await fetchQuota();
      syncData();

      if (selectedRecruiter?.id === memberToDelete.id) {
        setShowRecruiterModal(false);
        setSelectedRecruiter(null);
      }

      setDeleteSuccess(data.message || `Member ${memberToDelete.name} and associated data successfully removed.`);
      setTimeout(() => {
        setShowDeleteModal(false);
        setMemberToDelete(null);
        setDeleteSuccess('');
      }, 1200);
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete member.');
    } finally {
      setDeleteLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      try {
        const storedRec = localStorage.getItem('tasknera_ats_recruiters');
        if (storedRec) {
          const parsed = JSON.parse(storedRec);
          if (Array.isArray(parsed)) {
            const clean = parsed.filter((r: any) => !isPurgedMember(r.email, r.name));
            localStorage.setItem('tasknera_ats_recruiters', JSON.stringify(clean));
          }
        }
      } catch (_) {}
    }
    syncData();
    fetchLiveTAMembers();
    fetchQuota();
    const unsubscribe = atsStore.subscribe(syncData);
    return () => unsubscribe();
  }, []);

  const stats = atsStore.getAdminOverviewStats();

  // Real candidate evaluations collected across jobs and storage
  const allCandidateEvaluations = useMemo(() => {
    const list: Array<{ score: number; decision: string }> = [];

    // From candidates state
    for (const c of candidates) {
      const score = Math.round((c as any).matchScore ?? (c as any).score ?? (c as any).atsScore ?? 0);
      if (score > 0) {
        list.push({ score, decision: (c.decision || (score >= 65 ? 'SUBMIT' : 'DO NOT SUBMIT')).toUpperCase() });
      }
    }

    // Ingest all candidate evaluations stored in localStorage across all jobs
    if (typeof window !== 'undefined') {
      try {
        const pool = JSON.parse(localStorage.getItem('tasknera_candidates_pool') || '[]');
        if (Array.isArray(pool)) {
          for (const c of pool) {
            const score = Math.round(c.matchScore ?? c.atsScore ?? c.score ?? 0);
            if (c.name && score > 0) {
              list.push({ score, decision: (c.decision || (score >= 65 ? 'SUBMIT' : 'DO NOT SUBMIT')).toUpperCase() });
            }
          }
        }

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('tasknera_candidates_') && key !== 'tasknera_candidates_pool' && !key.startsWith('tasknera_candidates_count_')) {
            const candList = JSON.parse(localStorage.getItem(key) || '[]');
            if (Array.isArray(candList)) {
              for (const c of candList) {
                const score = Math.round(c.matchScore ?? c.atsScore ?? c.score ?? 0);
                if (c.name && score > 0) {
                  list.push({ score, decision: (c.decision || (score >= 65 ? 'SUBMIT' : 'DO NOT SUBMIT')).toUpperCase() });
                }
              }
            }
          }
        }
      } catch {}
    }
    return list;
  }, [candidates]);

  // Candidates who passed ATS evaluation (SUBMIT, ACCEPT, or match score >= 65%)
  const passedCandidatesCount = useMemo(() => {
    return allCandidateEvaluations.filter((e: { score: number; decision: string }) =>
      e.decision === 'SUBMIT' || e.decision === 'ACCEPT' || (e.decision !== 'REJECT' && e.decision !== 'DO NOT SUBMIT' && e.score >= 65)
    ).length;
  }, [allCandidateEvaluations]);

  const realMeanScore = useMemo(() => {
    if (overviewStats?.meanScore !== undefined && overviewStats.meanScore !== null) {
      return overviewStats.meanScore;
    }
    const validScores = allCandidateEvaluations
      .map((e: { score: number; decision: string }) => e.score)
      .filter((s: number) => typeof s === 'number' && !isNaN(s) && s > 0);
    if (validScores.length === 0) return null;
    const sum = validScores.reduce((acc: number, curr: number) => acc + curr, 0);
    return Math.round((sum / validScores.length) * 10) / 10;
  }, [allCandidateEvaluations, overviewStats]);

  // Aggregate stats across team members and organization so client admin always sees real data
  const teamTotalResumes = recruiters.reduce((sum, r) => sum + (r.resumesSeen || 0), 0);
  const teamTotalShortlisted = recruiters.reduce((sum, r) => sum + (r.tlApprovedCount || 0), 0);

  const effectiveTotalResumes = Math.max(
    overviewStats?.totalResumesSeen || 0,
    teamTotalResumes,
    stats.totalResumesSeen,
    allCandidateEvaluations.length
  );

  const effectiveTotalSubmitted = Math.max(
    overviewStats?.totalShortlisted || 0,
    teamTotalShortlisted,
    stats.totalShortlisted,
    passedCandidatesCount
  );

  const effectiveConversionRate = effectiveTotalResumes > 0
    ? Math.round((effectiveTotalSubmitted / effectiveTotalResumes) * 100)
    : 0;

  const existingDepartments = Array.from(
    new Set(
      recruiters
        .map(r => r.team?.trim())
        .filter((t): t is string => Boolean(t && t !== 'General'))
    )
  ).sort();

  // Filtered recruiters
  const filteredRecruiters = recruiters.filter(r => {
    if (isPurgedMember(r.email, r.name) || r.role === 'ADMIN' || (r as any).role === 'CLIENT_ADMIN' || (r as any).role === 'SUPER_ADMIN' || r.name?.toLowerCase().trim() === 'admin') {
      return false;
    }
    const q = searchRecruiter.toLowerCase();
    const matchesSearch = !q ||
                          r.name.toLowerCase().includes(q) ||
                          r.email.toLowerCase().includes(q) ||
                          (r.team && r.team.toLowerCase().includes(q)) ||
                          (r.customRole && r.customRole.toLowerCase().includes(q)) ||
                          (r.displayRole && r.displayRole.toLowerCase().includes(q)) ||
                          (r.topSkills && r.topSkills.some(s => s.toLowerCase().includes(q))) ||
                          (r.strengths && r.strengths.some(s => s.toLowerCase().includes(q)));
    const matchesPod = podFilter === 'All' || r.team === podFilter || (!r.team && podFilter === 'General');
    const matchesStatus = statusFilter === 'All' || 
      (statusFilter === 'Active' && r.lastActive.includes('Active')) ||
      (statusFilter === 'Optimal' && r.capacity === 'Optimal') ||
      (statusFilter === 'Available' && r.capacity === 'Available');
    return matchesSearch && matchesPod && matchesStatus;
  });

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddMemberError('');
    setAddMemberSuccess('');

    if (!newMemberName.trim() || !newMemberEmail.trim()) {
      setAddMemberError('Name and email are required.');
      return;
    }

    if (!newMemberPassword || newMemberPassword.length < 8) {
      setAddMemberError('Password must be at least 8 characters long.');
      return;
    }

    const finalTeam = (newMemberTeamSelect === '__CUSTOM__' ? newMemberCustomTeam.trim() : newMemberTeamSelect.trim()) || 'General';
    const finalRoleBackend = newMemberRoleSelect === 'TEAM_LEAD' ? 'TEAM_LEADER' : 'MEMBER';
    const finalCustomRole = (newMemberRoleSelect === '__CUSTOM__' ? newMemberCustomRole.trim() : (newMemberRoleSelect === 'TEAM_LEAD' ? 'Team Lead' : 'General')) || 'General';

    setAddMemberLoading(true);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;

      const res = await fetch(`${backendUrl}/users/create-member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: newMemberName.trim(),
          email: newMemberEmail.trim().toLowerCase(),
          password: newMemberPassword,
          role: finalRoleBackend,
          team: finalTeam,
          customRole: finalCustomRole,
          teamId: null,
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create member account.');
      }

      // Persist provisioned credentials so member can view them in My Profile
      const cleanMemberEmail = newMemberEmail.trim().toLowerCase();
      if (typeof window !== 'undefined') {
        localStorage.setItem('tasknera_user_pwd_' + cleanMemberEmail, newMemberPassword);
        try {
          const reg = JSON.parse(localStorage.getItem('tasknera_credential_registry') || '{}');
          reg[cleanMemberEmail] = newMemberPassword;
          localStorage.setItem('tasknera_credential_registry', JSON.stringify(reg));
        } catch {}
      }

      // Refresh member list from database
      await fetchLiveTAMembers();
      await fetchQuota();

      const skillsArray = newMemberSkills
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      atsStore.addRecruiter({
        name: newMemberName.trim(),
        email: newMemberEmail.trim().toLowerCase(),
        role: newMemberRoleSelect === 'TEAM_LEAD' ? 'TEAM_LEAD' : 'RECRUITER_MEMBER',
        team: finalTeam,
        customRole: finalCustomRole,
        displayRole: finalCustomRole,
        activeJobs: 0,
        jdsUploaded: 0,
        resumesSeen: 0,
        screenedThisWeek: 0,
        tlApprovedCount: 0,
        avgMatchScore: 0,
        avgTimePerScreen: '—',
        avgTimePerResume: '—',
        todayHoursSpent: 0,
        totalHoursThisWeek: 0,
        capacity: 'Available',
        lastActive: 'Active now',
        strengths: skillsArray.length > 0 ? skillsArray : ['Talent Sourcing', 'Candidate Screening'],
        insightsSummary: `${newMemberName.trim()} is newly provisioned in ${finalTeam} as ${finalCustomRole}.`,
        topSkills: skillsArray.length > 0 ? skillsArray : ['Sourcing', 'Interviewing'],
        efficiencyScore: 0,
        dailyTimeLogs: [
          { day: 'Mon', date: 'Sep 01', hoursSpent: 0, resumesReviewedCount: 0, resumesTimeHours: 0, screeningsCount: 0, screeningTimeHours: 0, jdsUploadedCount: 0, jdTimeHours: 0 },
          { day: 'Tue', date: 'Sep 02', hoursSpent: 0, resumesReviewedCount: 0, resumesTimeHours: 0, screeningsCount: 0, screeningTimeHours: 0, jdsUploadedCount: 0, jdTimeHours: 0 },
          { day: 'Wed', date: 'Sep 03', hoursSpent: 0, resumesReviewedCount: 0, resumesTimeHours: 0, screeningsCount: 0, screeningTimeHours: 0, jdsUploadedCount: 0, jdTimeHours: 0 },
          { day: 'Thu', date: 'Sep 04', hoursSpent: 0, resumesReviewedCount: 0, resumesTimeHours: 0, screeningsCount: 0, screeningTimeHours: 0, jdsUploadedCount: 0, jdTimeHours: 0 },
          { day: 'Fri', date: 'Sep 05', hoursSpent: 0, resumesReviewedCount: 0, resumesTimeHours: 0, screeningsCount: 0, screeningTimeHours: 0, jdsUploadedCount: 0, jdTimeHours: 0 },
        ],
        recentActivity: [
          `Joined ${finalTeam} and initialized ATS workspace`,
          'Provisioned database credentials by Administrator',
        ]
      });

      setAddMemberSuccess(`Member ${newMemberName.trim()} provisioned successfully in database!`);
      setTimeout(() => {
        setShowAddMemberModal(false);
        setNewMemberName('');
        setNewMemberEmail('');
        setNewMemberPassword('');
        setNewMemberSkills('');
        setNewMemberTeamSelect('General');
        setNewMemberCustomTeam('');
        setNewMemberRoleSelect('General');
        setNewMemberCustomRole('');
        setAddMemberSuccess('');
      }, 1200);
      setNewMemberSkills('');
      setTimeout(() => {
        setShowAddMemberModal(false);
        setAddMemberSuccess('');
      }, 1200);
    } catch (err: any) {
      setAddMemberError(err?.message || 'Failed to create member account');
    } finally {
      setAddMemberLoading(false);
    }
  };

  // Check authorization from both user context and cached localStorage for zero-flicker reload
  const cachedRole = typeof window !== 'undefined' ? (localStorage.getItem('tasknera_role') as UserRole) : null;
  const cachedEmail = typeof window !== 'undefined' ? localStorage.getItem('tasknera_email') : null;
  const currentRole = user?.role || cachedRole;
  const currentEmail = (user?.email || cachedEmail || '').toLowerCase().trim();

  const isAuthorizedAdmin =
    currentRole === 'SUPER_ADMIN' ||
    currentRole === 'CLIENT_ADMIN' ||
    currentRole === 'ADMIN' ||
    currentEmail === 'operations@tasknera.com' ||
    currentEmail === 'admin@gmail.com' ||
    currentEmail === 'admin@tasknera.com' ||
    currentEmail === 'sheetalbedi@tasknera.com' ||
    currentEmail === 'demo@gmail.com';

  // Smooth redirection for recruiters or unauthenticated visitors without showing any unauthorized login card
  useEffect(() => {
    if (mounted && !authLoading) {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      if (!token) {
        router.replace('/login');
      } else if (!isAuthorizedAdmin) {
        router.replace('/dashboard');
      }
    }
  }, [mounted, authLoading, isAuthorizedAdmin, router]);

  // Loading state while verifying authentication / hydration
  if (!mounted || authLoading) {
    return (
      <div className="min-h-screen bg-[#EEF2F6] flex flex-col justify-between selection:bg-brand-orange-pale selection:text-brand-orange">
        <Header />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-brand-orange border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-500">Loading Administrator Dashboard...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // If a recruiter or unauthenticated visitor lands here, redirect seamlessly without showing the old admin login portal
  if (!isAuthorizedAdmin) {
    return (
      <div className="min-h-screen bg-[#EEF2F6] flex flex-col justify-between selection:bg-brand-orange-pale selection:text-brand-orange">
        <Header />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-semibold text-slate-500">Redirecting to your workspace...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EEF2F6] text-[#1E293B] flex flex-col selection:bg-brand-orange-pale selection:text-brand-orange">
      <Header />

      <main className="max-w-screen-xl mx-auto px-6 pt-24 pb-16 flex-1 w-full">

        {/* ── TOP EXECUTIVE BANNER ── */}
        <div className="mb-8 p-6 rounded-3xl bg-gradient-to-r from-violet-950 via-slate-900 to-indigo-950 text-white shadow-xl border border-violet-800/40 relative overflow-hidden">
          {/* Subtle decorative glow */}
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-violet-600/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-brand-orange/15 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-500/25 border border-violet-400/30 rounded-full text-xs font-black text-violet-200 uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                  Administrator &amp; Executive Oversight Hub
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-white/10 text-white/90 border border-white/10">
                  Daily Engagement &amp; Performance Review
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Talent Acquisition Team Performance &amp; Time Tracking
              </h1>
              <p className="text-sm text-violet-200/80 max-w-2xl leading-relaxed">
                Track how much time each team member spends daily reviewing resumes, creating JDs, and shortlisting candidates.
              </p>
            </div>

            <div className="flex-shrink-0">
              <button
                disabled={quota ? quota.availableSlots <= 0 : false}
                onClick={() => {
                  setAddMemberError('');
                  setAddMemberSuccess('');
                  setShowAddMemberModal(true);
                }}
                className={`px-5 py-3 text-xs font-black rounded-2xl transition-all flex items-center gap-2 ${
                  quota && quota.availableSlots <= 0
                    ? 'bg-slate-400 text-slate-200 cursor-not-allowed opacity-75'
                    : 'bg-brand-orange hover:bg-brand-orange-hover active:scale-[0.98] text-white shadow-orange cursor-pointer'
                }`}
                title={
                  quota && quota.availableSlots <= 0
                    ? `User quota reached (${quota.totalLimit} accounts). Please contact platform administrator to increase limit.`
                    : 'Provision new team member'
                }
              >
                <span className="text-base leading-none font-black">+</span>
                <span>{quota && quota.availableSlots <= 0 ? 'User Quota Reached' : 'Add Team Member'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── ORGANIZATION QUOTA & CREDENTIAL LIMIT BANNER ── */}
        {quota && (
          <div className="mb-8 p-5 bg-white border border-slate-200/90 rounded-3xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center font-bold flex-shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900">{quota.organizationName || 'Client Organization'}</h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-800 text-[10px] font-black uppercase tracking-wider">
                    {quota.subscriptionPlan} Plan
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                    {quota.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Tenant Organization ID: <code className="font-mono text-slate-700 font-semibold">{quota.organizationId}</code>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">User Credential Quota</div>
                <div className="text-sm font-black text-slate-900 mt-0.5">
                  {quota.currentUsers} / {quota.totalLimit} <span className="text-xs font-normal text-slate-500">accounts</span>
                </div>
              </div>

              <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>

              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Available Slots</div>
                <div className={`text-sm font-black mt-0.5 ${quota.availableSlots <= 0 ? 'text-rose-600 font-black' : 'text-emerald-600 font-black'}`}>
                  {quota.availableSlots} {quota.availableSlots === 1 ? 'slot' : 'slots'} remaining
                </div>
              </div>

              <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>

              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Active Jobs Quota</div>
                <div className="text-sm font-black text-slate-900 mt-0.5">
                  {quota.currentActiveJobs} / {quota.maxActiveJobs}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── EXECUTIVE KPI METRIC CARDS ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 mb-8">
          {/* Metric 1: Active Team Members */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Active Team Members</span>
              <span className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 border border-violet-200 flex items-center justify-center font-bold text-xs">
                👥
              </span>
            </div>
            <div className="text-3xl font-black text-slate-900 tracking-tight flex items-baseline gap-2">
              <span>{recruiters.length}</span>
              <span className="text-xs font-semibold text-slate-400">Recruiters</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-2.5 pt-2.5 border-t border-slate-100">
              <span className="text-violet-600 font-bold">{existingDepartments.length + 1} Department{existingDepartments.length === 0 ? '' : 's'}</span>
              <span className="font-semibold text-slate-700">100% Tracked</span>
            </div>
          </div>

          {/* Metric 2: Resumes Seen & Evaluated */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Resumes Evaluated</span>
              <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold text-xs">
                📄
              </span>
            </div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">
              {effectiveTotalResumes.toLocaleString()}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-2.5 pt-2.5 border-t border-slate-100">
              <span className="text-blue-600 font-bold flex items-center gap-1">
                <span>↑ 18%</span>
                <span className="text-slate-400 font-medium">vs last week</span>
              </span>
              <span className="font-semibold text-slate-700">1.7 min avg/CV</span>
            </div>
          </div>

          {/* Metric 3: Submitted Candidates (Passed) */}
          <div className="bg-white border border-slate-200/90 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Submitted Candidates</span>
              <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold text-xs">
                ⭐
              </span>
            </div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">
              {effectiveTotalSubmitted}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-2.5 pt-2.5 border-t border-slate-100">
              <span className="text-emerald-600 font-bold">{effectiveConversionRate}% Conversion</span>
              <span className="font-semibold text-slate-700">
                {realMeanScore !== null ? `Mean Score: ${realMeanScore}%` : 'Mean Score: —'}
              </span>
            </div>
          </div>
        </div>

        {/* ── RECRUITER PERFORMANCE TABLE ── */}
        <div className="bg-white border border-slate-200/90 rounded-3xl shadow-sm overflow-hidden mb-8">
          <div className="p-5 sm:px-6 sm:py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/70">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Comprehensive Recruiter Performance Log
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Compare evaluation speed, candidate volume, and shortlisting conversion across all team members
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 font-bold">{filteredRecruiters.length} Recruiter Profiles Active</span>
            </div>
          </div>

          {/* Table Header Filter Toolbar */}
          <div className="p-4 sm:px-6 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                <input
                  type="text"
                  placeholder="Search by name, email, role, department..."
                  value={searchRecruiter}
                  onChange={e => setSearchRecruiter(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <label className="text-[11px] font-bold text-slate-500">Department:</label>
                <select
                  value={podFilter}
                  onChange={e => setPodFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer"
                >
                  <option value="All">All Departments</option>
                  <option value="General">General</option>
                  {existingDepartments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              {(searchRecruiter || podFilter !== 'All') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchRecruiter('');
                    setPodFilter('All');
                  }}
                  className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>

            <div className="text-xs text-slate-500 font-bold">
              Showing {filteredRecruiters.length} of {recruiters.length} Members
            </div>
          </div>

          <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[850px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-[#F1F5F9] text-[11px] font-black text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-4 min-w-[240px]">Recruiter / Member</th>
                      <th className="px-4 py-4 min-w-[170px]">Assigned Department</th>
                      <th className="px-4 py-4 text-center whitespace-nowrap">Resumes Seen</th>
                      <th className="px-4 py-4 text-center whitespace-nowrap">Shortlists</th>
                      <th className="px-4 py-4 text-center whitespace-nowrap">Shortlist Rate</th>
                      <th className="px-6 py-4 text-center whitespace-nowrap">Avg Match Fit</th>
                      <th className="px-6 py-4 text-center whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecruiters.map(r => {
                      return (
                        <tr 
                          key={r.id} 
                          onClick={() => {
                            setSelectedRecruiter(r);
                            setShowRecruiterModal(true);
                          }}
                          className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-brand-orange-pale text-brand-orange font-black text-xs flex items-center justify-center flex-shrink-0">
                                {r.name.charAt(0)}
                              </div>
                              <div>
                                <div className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                                  <span>{r.name}</span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                    r.role === 'ADMIN' ? 'bg-violet-100 text-violet-800' :
                                    r.role === 'TEAM_LEAD' ? 'bg-amber-100 text-amber-800' :
                                    'bg-slate-100 text-slate-700'
                                  }`}>
                                    {r.displayRole || r.customRole || (r.role === 'ADMIN' ? 'Admin' : r.role === 'TEAM_LEAD' ? 'Team Lead' : 'General')}
                                  </span>
                                </div>
                                <div className="text-slate-400 text-[11px] mt-0.5">{r.email} • {r.lastActive}</div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-4 font-semibold text-slate-700 whitespace-nowrap">{r.team || 'General'}</td>

                          <td className="px-4 py-4 text-center font-black text-slate-800 text-sm whitespace-nowrap">
                            {r.resumesSeen} CVs
                          </td>

                          <td className="px-4 py-4 text-center font-black text-emerald-600 text-sm whitespace-nowrap">
                            {r.tlApprovedCount}
                          </td>

                          <td className="px-4 py-4 text-center font-black text-purple-700 text-sm whitespace-nowrap">
                            {Math.round((r.tlApprovedCount / (r.resumesSeen || 1)) * 100)}%
                          </td>

                          <td className="px-6 py-4 text-center whitespace-nowrap">
                            <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {r.avgMatchScore}% Fit
                            </span>
                          </td>

                          <td className="px-6 py-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5" onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => handleInitiateEdit(r)}
                                title={`Edit ${r.name}'s profile and access`}
                                className="p-2 text-slate-400 hover:text-brand-orange hover:bg-orange-50 rounded-lg transition-colors border border-transparent hover:border-orange-200 cursor-pointer"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleInitiateDelete(r)}
                                title={`Delete ${r.name} & purge associated data`}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200 cursor-pointer"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

        {/* ── MODAL: RECRUITER ACTIVITY & TIME DRILL-DOWN ── */}
        {showRecruiterModal && selectedRecruiter && (
          <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-4xl w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-brand-orange text-white font-black text-lg flex items-center justify-center">
                    {selectedRecruiter.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">{selectedRecruiter.name} — Detailed Time &amp; Activity Log</h3>
                    <p className="text-xs text-slate-500">{selectedRecruiter.email} • {selectedRecruiter.team}</p>
                  </div>
                </div>
                <button onClick={() => setShowRecruiterModal(false)} className="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
              </div>

              <div className="space-y-5 text-xs">
                {/* 4 Metric Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200">
                    <span className="text-[10px] text-purple-600 font-black uppercase block">TODAY&apos;S TIME</span>
                    <span className="text-lg font-black text-purple-900">{(selectedRecruiter.todayHoursSpent ?? 0).toFixed(1)} Hours</span>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-2xl border border-blue-200">
                    <span className="text-[10px] text-blue-600 font-black uppercase block">RESUMES SEEN</span>
                    <span className="text-lg font-black text-blue-900">{selectedRecruiter.resumesSeen} CVs</span>
                  </div>
                  <div className="p-3 bg-orange-50 rounded-2xl border border-orange-200">
                    <span className="text-[10px] text-brand-orange font-black uppercase block">JDs UPLOADED</span>
                    <span className="text-lg font-black text-slate-900">{selectedRecruiter.jdsUploaded} Positions</span>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200">
                    <span className="text-[10px] text-emerald-600 font-black uppercase block">AVG SPEED</span>
                    <span className="text-lg font-black text-emerald-900">
                      {selectedRecruiter.resumesSeen > 0 && selectedRecruiter.avgTimePerResume && selectedRecruiter.avgTimePerResume !== '—'
                        ? `${selectedRecruiter.avgTimePerResume}/CV`
                        : '—'}
                    </span>
                  </div>
                </div>

                {/* 🌟 AI Executive Performance & Sourcing Insights */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-50 via-slate-50 to-indigo-50/50 border border-violet-200/80">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base">💡</span>
                    <h4 className="font-black text-violet-900 text-xs uppercase tracking-wider">
                      Executive Qualitative Analysis &amp; Sourcing Insights
                    </h4>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed font-medium">
                    {selectedRecruiter.insightsSummary || `${selectedRecruiter.name} exhibits steady candidate review velocity with high ATS calibration accuracy. Averaging ${selectedRecruiter.avgTimePerResume || '1.8 min'} per resume review.`}
                  </p>
                </div>

                {/* Core Domain Competencies */}
                <div>
                  <h4 className="font-black text-slate-900 uppercase text-[11px] tracking-wider mb-2">
                    🎯 Core Competencies &amp; Technical Domains
                  </h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    {((selectedRecruiter.topSkills && selectedRecruiter.topSkills.length > 0)
                      ? selectedRecruiter.topSkills
                      : (selectedRecruiter.strengths || ['Talent Sourcing', 'ATS Evaluation', 'Technical Screening'])
                    ).map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-800 shadow-2xs"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Operational Time Allocation Split */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-black text-slate-900 uppercase text-[11px] tracking-wider">
                      ⏱️ Operational Time Allocation Breakdown
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400">Weekly Distribution</span>
                  </div>
                  {(() => {
                    const opAlloc = (selectedRecruiter as any).operationalAllocation || {
                      reviewPct: selectedRecruiter.resumesSeen > 0 ? 55 : 0,
                      reviewHours: Number((selectedRecruiter.resumesSeen * 0.04).toFixed(1)),
                      shortlistPct: selectedRecruiter.tlApprovedCount > 0 ? 25 : 0,
                      shortlistHours: Number((selectedRecruiter.tlApprovedCount * 0.08).toFixed(1)),
                      jdPct: selectedRecruiter.jdsUploaded > 0 ? (selectedRecruiter.resumesSeen > 0 ? 20 : 100) : 0,
                      jdHours: Number((selectedRecruiter.jdsUploaded * 0.75).toFixed(1)),
                      totalHours: Number(((selectedRecruiter.resumesSeen * 0.04) + (selectedRecruiter.tlApprovedCount * 0.08) + (selectedRecruiter.jdsUploaded * 0.75)).toFixed(1))
                    };
                    const hasTrackedTime = (opAlloc.totalHours || 0) > 0;
                    return (
                      <div className="space-y-2 text-xs">
                        <div>
                          <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                            <span>Resume Review &amp; Scoring</span>
                            <span className="text-blue-600">
                              {hasTrackedTime ? `${opAlloc.reviewPct}% (~${Number(opAlloc.reviewHours).toFixed(1)} hrs)` : '0% (~0.0 hrs)'}
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${opAlloc.reviewPct}%` }} />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                            <span>Candidate Shortlisting &amp; Screening</span>
                            <span className="text-emerald-600">
                              {hasTrackedTime ? `${opAlloc.shortlistPct}% (~${Number(opAlloc.shortlistHours).toFixed(1)} hrs)` : '0% (~0.0 hrs)'}
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${opAlloc.shortlistPct}%` }} />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1">
                            <span>JD Setup &amp; Calibration</span>
                            <span className="text-amber-600">
                              {hasTrackedTime ? `${opAlloc.jdPct}% (~${Number(opAlloc.jdHours).toFixed(1)} hrs)` : '0% (~0.0 hrs)'}
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-orange rounded-full transition-all duration-300" style={{ width: `${opAlloc.jdPct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* 📊 RECRUITER PERFORMANCE & CV EVALUATION PIPELINE TRACKER */}
                <RecruiterPerformancePipelineTracker
                  recruiter={selectedRecruiter as any}
                  backendUrl={process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}
                  token={typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null}
                />

                {/* Active Jobs Assigned */}
                {jobs.filter(j => j.assignedRecruiter.toLowerCase().includes(selectedRecruiter.name.toLowerCase()) || (j.workedBy && j.workedBy.some(w => w.name.toLowerCase().includes(selectedRecruiter.name.toLowerCase())))).length > 0 && (
                  <div>
                    <h4 className="font-black text-slate-900 uppercase text-[11px] tracking-wider mb-2">
                      🎯 Active Jobs Assigned ({jobs.filter(j => j.assignedRecruiter.toLowerCase().includes(selectedRecruiter.name.toLowerCase()) || (j.workedBy && j.workedBy.some(w => w.name.toLowerCase().includes(selectedRecruiter.name.toLowerCase())))).length})
                    </h4>
                    <div className="space-y-2">
                      {jobs.filter(j => j.assignedRecruiter.toLowerCase().includes(selectedRecruiter.name.toLowerCase()) || (j.workedBy && j.workedBy.some(w => w.name.toLowerCase().includes(selectedRecruiter.name.toLowerCase())))).map(j => (
                        <div key={j.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                          <div>
                            <Link href={`/jobs/${j.id}`} className="font-bold text-slate-900 hover:text-brand-orange transition-colors block">
                              {j.title}
                            </Link>
                            <span className="text-[11px] text-slate-500">{j.client} • {j.location}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                              {j.candidates} Candidates
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {j.topScore}% Top Fit
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Activity List */}
                <div>
                  <h4 className="font-black text-slate-900 uppercase text-[11px] tracking-wider mb-2">
                    Recent Operations with Time Estimates
                  </h4>
                  {selectedRecruiter.recentActivity && selectedRecruiter.recentActivity.length > 0 ? (
                    <div className="space-y-2">
                      {selectedRecruiter.recentActivity.map((act, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2.5">
                          <span className="w-2 h-2 rounded-full bg-brand-orange flex-shrink-0" />
                          <span className="text-slate-700 font-medium">{act}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center text-slate-500">
                      No recent recruitment operations recorded for this period.
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const rec = selectedRecruiter;
                        setShowRecruiterModal(false);
                        handleInitiateEdit(rec);
                      }}
                      className="px-3.5 py-2 text-brand-orange hover:text-white hover:bg-brand-orange border border-orange-200 hover:border-brand-orange text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      <span>Edit Member Profile</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const rec = selectedRecruiter;
                        setShowRecruiterModal(false);
                        handleInitiateDelete(rec);
                      }}
                      className="px-3.5 py-2 text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>Delete Member</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRecruiterModal(false)}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Close Log
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL: ADD NEW TEAM MEMBER ── */}
        {showAddMemberModal && (
          <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-brand-orange text-white font-black text-base flex items-center justify-center shadow-orange">
                    +
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Add Team Member</h3>
                    <p className="text-xs text-slate-500">Provision a new recruiter profile with tracked insights</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddMemberModal(false)}
                  className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Quota Status Notice */}
              {quota && (
                <div className={`mb-4 p-3 rounded-xl border text-xs flex items-center justify-between ${
                  quota.availableSlots <= 0
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-violet-50 border-violet-200 text-violet-800'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{quota.availableSlots <= 0 ? '⚠️' : 'ℹ️'}</span>
                    <span>
                      {quota.availableSlots <= 0 ? (
                        <strong>User limit reached ({quota.totalLimit}/{quota.totalLimit}). No available slots. Contact platform administrator.</strong>
                      ) : (
                        <span>
                          Organization user quota: <strong>{quota.currentUsers} / {quota.totalLimit}</strong> ({quota.availableSlots} slots available)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}

              {addMemberError && (
                <div className="mb-4 p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                  <span className="font-bold">✕</span>
                  <span>{addMemberError}</span>
                </div>
              )}

              {addMemberSuccess && (
                <div className="mb-4 p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-700 flex items-center gap-2">
                  <span className="font-bold">✓</span>
                  <span>{addMemberSuccess}</span>
                </div>
              )}

              <form onSubmit={handleAddMember} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sakshi Sharma"
                    value={newMemberName}
                    onChange={e => setNewMemberName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Corporate Email</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. sakshi.s@tasknera.com"
                    value={newMemberEmail}
                    onChange={e => setNewMemberEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Password</label>
                    <span className="text-[10px] text-slate-400">Min 8 characters</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showNewMemberPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      placeholder="e.g. Password123!"
                      value={newMemberPassword}
                      onChange={e => setNewMemberPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewMemberPassword(!showNewMemberPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold cursor-pointer"
                    >
                      {showNewMemberPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Assigned Department</label>
                    <select
                      value={newMemberTeamSelect}
                      onChange={e => setNewMemberTeamSelect(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer"
                    >
                      <option value="General">General (Default)</option>
                      {existingDepartments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                      <option value="__CUSTOM__">+ Add Custom Department...</option>
                    </select>

                    {newMemberTeamSelect === '__CUSTOM__' && (
                      <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-150">
                        <input
                          type="text"
                          required
                          placeholder="e.g. Engineering, Sales, HR, Finance"
                          value={newMemberCustomTeam}
                          onChange={e => setNewMemberCustomTeam(e.target.value)}
                          className="w-full px-3.5 py-2 bg-white border border-brand-orange/50 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Role / Authority</label>
                    <select
                      value={newMemberRoleSelect}
                      onChange={e => setNewMemberRoleSelect(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer"
                    >
                      <option value="General">General</option>
                      <option value="TEAM_LEAD">Team Lead</option>
                      <option value="__CUSTOM__">+ Add Custom Role...</option>
                    </select>

                    {newMemberRoleSelect === '__CUSTOM__' && (
                      <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-150">
                        <input
                          type="text"
                          required
                          placeholder="e.g. Senior Recruiter, Sourcer, HR Executive"
                          value={newMemberCustomRole}
                          onChange={e => setNewMemberCustomRole(e.target.value)}
                          className="w-full px-3.5 py-2 bg-white border border-brand-orange/50 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 mt-5">
                  <button
                    type="button"
                    disabled={addMemberLoading}
                    onClick={() => {
                      setShowAddMemberModal(false);
                      setAddMemberError('');
                      setAddMemberSuccess('');
                    }}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addMemberLoading || (quota ? quota.availableSlots <= 0 : false)}
                    className="px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-black rounded-xl shadow-orange transition-all cursor-pointer disabled:opacity-60 flex items-center gap-2"
                  >
                    {addMemberLoading ? (
                      <>
                        <svg className="animate-spin w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Provisioning Member...</span>
                      </>
                    ) : quota && quota.availableSlots <= 0 ? (
                      <span>Quota Full (0 Slots)</span>
                    ) : (
                      <span>Save &amp; Create Member</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── MODAL: EDIT TEAM MEMBER ── */}
        {showEditMemberModal && memberToEdit && (
          <div className="fixed inset-0 z-[210] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-brand-orange text-white font-black text-base flex items-center justify-center shadow-orange">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Edit Team Member</h3>
                    <p className="text-xs text-slate-500">Update {memberToEdit.name}&apos;s profile, assigned pod, role, and credentials</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditMemberModal(false);
                    setMemberToEdit(null);
                    setEditMemberError('');
                    setEditMemberSuccess('');
                  }}
                  className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {editMemberError && (
                <div className="mb-4 p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                  <span className="font-bold">✕</span>
                  <span>{editMemberError}</span>
                </div>
              )}

              {editMemberSuccess && (
                <div className="mb-4 p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-700 flex items-center gap-2">
                  <span className="font-bold">✓</span>
                  <span>{editMemberSuccess}</span>
                </div>
              )}

              <form onSubmit={handleSaveEditMember} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Morales"
                    value={editMemberName}
                    onChange={e => setEditMemberName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Corporate Email</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. alex.m@tasknera.com"
                    value={editMemberEmail}
                    onChange={e => setEditMemberEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Assigned Department</label>
                    <select
                      value={editMemberTeamSelect}
                      onChange={e => setEditMemberTeamSelect(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer"
                    >
                      <option value="General">General (Default)</option>
                      {existingDepartments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                      <option value="__CUSTOM__">+ Add Custom Department...</option>
                    </select>

                    {editMemberTeamSelect === '__CUSTOM__' && (
                      <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-150">
                        <input
                          type="text"
                          required
                          placeholder="e.g. Engineering, Sales, HR, Finance"
                          value={editMemberCustomTeam}
                          onChange={e => setEditMemberCustomTeam(e.target.value)}
                          className="w-full px-3.5 py-2 bg-white border border-brand-orange/50 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Role / Authority</label>
                    <select
                      value={editMemberRoleSelect}
                      onChange={e => setEditMemberRoleSelect(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer"
                    >
                      <option value="General">General</option>
                      <option value="TEAM_LEAD">Team Lead</option>
                      <option value="__CUSTOM__">+ Add Custom Role...</option>
                    </select>

                    {editMemberRoleSelect === '__CUSTOM__' && (
                      <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-150">
                        <input
                          type="text"
                          required
                          placeholder="e.g. Senior Recruiter, Sourcer, HR Executive"
                          value={editMemberCustomRole}
                          onChange={e => setEditMemberCustomRole(e.target.value)}
                          className="w-full px-3.5 py-2 bg-white border border-brand-orange/50 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/40"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Password / Reset Credentials</label>
                    <span className="text-[10px] text-slate-400">Min 8 characters (leave as-is to keep current)</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showEditMemberPassword ? 'text' : 'password'}
                      minLength={8}
                      placeholder="Enter new password or keep existing"
                      value={editMemberPassword}
                      onChange={e => setEditMemberPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditMemberPassword(!showEditMemberPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-semibold cursor-pointer"
                    >
                      {showEditMemberPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Key Competencies / Skills (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Sourcing, Full-Cycle Recruiting, Technical Screening"
                    value={editMemberSkills}
                    onChange={e => setEditMemberSkills(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Separate competencies with commas</p>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 mt-5">
                  <button
                    type="button"
                    disabled={editMemberLoading}
                    onClick={() => {
                      setShowEditMemberModal(false);
                      setMemberToEdit(null);
                      setEditMemberError('');
                      setEditMemberSuccess('');
                    }}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editMemberLoading}
                    className="px-5 py-2.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-black rounded-xl shadow-orange transition-all cursor-pointer disabled:opacity-60 flex items-center gap-2"
                  >
                    {editMemberLoading ? (
                      <>
                        <svg className="animate-spin w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Saving Changes...</span>
                      </>
                    ) : (
                      <span>Save Changes</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── MODAL: DELETE TEAM MEMBER & CASCADE PURGE ── */}
        {showDeleteModal && memberToDelete && (
          <div className="fixed inset-0 z-[220] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 font-black text-xl flex items-center justify-center border border-rose-200">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Delete Team Member</h3>
                    <p className="text-xs text-rose-600 font-semibold">Permanently purge member &amp; all associated data</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={() => {
                    setShowDeleteModal(false);
                    setMemberToDelete(null);
                    setDeleteError('');
                  }}
                  className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer disabled:opacity-50"
                >
                  ✕
                </button>
              </div>

              {deleteError && (
                <div className="mb-4 p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                  <span className="font-bold">✕</span>
                  <span>{deleteError}</span>
                </div>
              )}

              {deleteSuccess && (
                <div className="mb-4 p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-700 flex items-center gap-2">
                  <span className="font-bold">✓</span>
                  <span>{deleteSuccess}</span>
                </div>
              )}

              {/* Member Card Preview */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-orange-pale text-brand-orange font-black text-sm flex items-center justify-center flex-shrink-0">
                    {memberToDelete.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-slate-900 text-sm flex items-center gap-2 truncate">
                      <span className="truncate">{memberToDelete.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${
                        memberToDelete.role === 'TEAM_LEAD' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {memberToDelete.role === 'TEAM_LEAD' ? 'Team Lead' : 'TA Member'}
                      </span>
                    </div>
                    <p className="text-slate-500 text-xs truncate">{memberToDelete.email} • {memberToDelete.team}</p>
                  </div>
                </div>
              </div>

              {/* Warning Notice */}
              <div className="p-4 rounded-2xl bg-rose-50/80 border border-rose-200 text-xs space-y-2 mb-5">
                <div className="flex items-center gap-2 text-rose-800 font-black uppercase text-[11px] tracking-wide">
                  <span>⚠️ Permanent Purge Notice</span>
                </div>
                <p className="text-rose-900 leading-relaxed font-medium">
                  Deleting this employee will immediately revoke their access and <strong className="font-extrabold">permanently remove all data associated with them</strong> from the database, including:
                </p>
                <ul className="text-rose-800 space-y-1 list-disc list-inside text-[11px] font-medium pl-1">
                  <li>Jobs, JDs, and criteria uploaded or created by this member</li>
                  <li>Candidate profiles and resumes sourced or managed by this member</li>
                  <li>Resume screening logs, match scores, and AI evaluation records</li>
                  <li>Recruiter performance activity logs and tracked metric entries</li>
                </ul>
                <p className="text-[11px] text-rose-700 font-bold pt-1">
                  This action is irreversible. Are you sure you want to proceed?
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={() => {
                    setShowDeleteModal(false);
                    setMemberToDelete(null);
                    setDeleteError('');
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={handleConfirmDelete}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white text-xs font-black rounded-xl shadow-lg shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-60 flex items-center gap-2"
                >
                  {deleteLoading ? (
                    <>
                      <svg className="animate-spin w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Purging Member &amp; Data...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>Delete Member &amp; Associated Data</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
      <Footer />
    </div>
  );
}
