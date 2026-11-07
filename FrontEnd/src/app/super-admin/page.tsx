'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';
import { ClientOrganization, fetchApi } from '@/lib/api';

export default function SuperAdminPage() {
  const { user, isAuthenticated } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [organizations, setOrganizations] = useState<ClientOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'organizations' | 'stats' | 'audit'>('organizations');

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLimitsModal, setShowLimitsModal] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [showResetPwdModal, setShowResetPwdModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<ClientOrganization | null>(null);

  // Client Details & JD Management
  const [clientJobs, setClientJobs] = useState<any[]>([]);
  const [loadingClientJobs, setLoadingClientJobs] = useState(false);
  const [togglingPermission, setTogglingPermission] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  // Success credential alert after creating
  const [createdAdminCreds, setCreatedAdminCreds] = useState<{ orgName: string; email: string; password: string } | null>(null);

  // Form states for Create Organization
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgEmail, setNewOrgEmail] = useState('');
  const [newOrgPhone, setNewOrgPhone] = useState('');
  const [newOrgAddress, setNewOrgAddress] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newMaxUsers, setNewMaxUsers] = useState(5);
  const [newMaxRecruiters, setNewMaxRecruiters] = useState(5);
  const [newMaxActiveJobs, setNewMaxActiveJobs] = useState(20);
  const [newMaxResumes, setNewMaxResumes] = useState(500);
  const [newSubPlan, setNewSubPlan] = useState('STARTER');
  const [newBillingCycle, setNewBillingCycle] = useState('monthly');
  const [newSubExpiry, setNewSubExpiry] = useState('');
  const [newAllowJdUpload, setNewAllowJdUpload] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  // Form states for Edit Limits
  const [editMaxUsers, setEditMaxUsers] = useState(5);
  const [editMaxRecruiters, setEditMaxRecruiters] = useState(5);
  const [editMaxActiveJobs, setEditMaxActiveJobs] = useState(20);
  const [editMaxResumes, setEditMaxResumes] = useState(500);
  const [editLimitsLoading, setEditLimitsLoading] = useState(false);
  const [editLimitsError, setEditLimitsError] = useState('');

  // Form states for Subscription
  const [subPlan, setSubPlan] = useState('STARTER');
  const [subCycle, setSubCycle] = useState('monthly');
  const [subExpiry, setSubExpiry] = useState('');
  const [subStatus, setSubStatus] = useState<'ACTIVE' | 'SUSPENDED' | 'EXPIRED'>('ACTIVE');
  const [subLoading, setSubLoading] = useState(false);

  // Form states for Reset Password
  const [resetPwdValue, setResetPwdValue] = useState('');
  const [resetPwdLoading, setResetPwdLoading] = useState(false);
  const [resetPwdSuccess, setResetPwdSuccess] = useState('');
  const [resetPwdError, setResetPwdError] = useState('');

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      try {
        const cached = JSON.parse(localStorage.getItem('tasknera_cached_orgs') || '[]');
        const localOverrides = JSON.parse(localStorage.getItem('tasknera_org_jd_permissions') || '{}');
        if (Array.isArray(cached) && cached.length > 0) {
          const merged = cached.map((o: any) => {
            const adminEmail = (o.clientAdmin?.email || '').toLowerCase().trim();
            const orgName = (o.name || '').toLowerCase().trim();
            if (localOverrides[o.id] !== undefined) {
              return { ...o, allowJdUpload: localOverrides[o.id] };
            } else if (adminEmail && localOverrides[adminEmail] !== undefined) {
              return { ...o, allowJdUpload: localOverrides[adminEmail] };
            } else if (orgName && localOverrides[orgName] !== undefined) {
              return { ...o, allowJdUpload: localOverrides[orgName] };
            }
            return o;
          });
          setOrganizations(merged);
        }
      } catch {}
    }
  }, []);

  const isSuperAdmin =
    user?.role === 'SUPER_ADMIN' ||
    user?.email?.toLowerCase().trim() === 'operations@tasknera.com' ||
    user?.email?.toLowerCase().trim() === 'admin@gmail.com';

  const loadData = async () => {
    try {
      setLoading(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      if (!token) {
        setLoading(false);
        return;
      }

      // Fetch organizations
      const orgRes = await fetchApi<{ organizations: ClientOrganization[] }>(
        '/super-admin/organizations',
        {},
        token
      );

      let localOverrides: Record<string, boolean> = {};
      if (typeof window !== 'undefined') {
        try {
          localOverrides = JSON.parse(localStorage.getItem('tasknera_org_jd_permissions') || '{}');
        } catch {}
      }

      if (orgRes && Array.isArray(orgRes.organizations) && orgRes.organizations.length > 0) {
        const mergedOrgs = orgRes.organizations.map((o) => {
          const adminEmail = (o.clientAdmin?.email || '').toLowerCase().trim();
          const orgName = (o.name || '').toLowerCase().trim();
          if (localOverrides[o.id] !== undefined) {
            return { ...o, allowJdUpload: localOverrides[o.id] };
          } else if (adminEmail && localOverrides[adminEmail] !== undefined) {
            return { ...o, allowJdUpload: localOverrides[adminEmail] };
          } else if (orgName && localOverrides[orgName] !== undefined) {
            return { ...o, allowJdUpload: localOverrides[orgName] };
          }
          return o;
        });
        setOrganizations(mergedOrgs);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('tasknera_cached_orgs', JSON.stringify(mergedOrgs));
          } catch {}
        }
      } else if (typeof window !== 'undefined') {
        try {
          const cached = JSON.parse(localStorage.getItem('tasknera_cached_orgs') || '[]');
          if (Array.isArray(cached) && cached.length > 0) {
            const mergedCached = cached.map((o: any) => {
              if (localOverrides[o.id] !== undefined) {
                return { ...o, allowJdUpload: localOverrides[o.id] };
              }
              return o;
            });
            setOrganizations(mergedCached);
          }
        } catch {}
      }

      // Fetch stats
      const statsRes = await fetchApi<{ stats: any }>('/super-admin/stats', {}, token);
      if (statsRes && statsRes.stats) {
        setStats(statsRes.stats);
      }

      // Fetch audit logs
      const auditRes = await fetchApi<{ logs: any[] }>('/super-admin/audit-logs', {}, token);
      if (auditRes && Array.isArray(auditRes.logs)) {
        setAuditLogs(auditRes.logs);
      }
    } catch (err: any) {
      console.error('[Super Admin] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mounted && isAuthenticated && isSuperAdmin) {
      loadData();
    }
  }, [mounted, isAuthenticated, isSuperAdmin]);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreateLoading(true);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      const res = await fetchApi<{ organization: any; clientAdmin: any }>(
        '/super-admin/organizations',
        {
          method: 'POST',
          body: JSON.stringify({
            name: newOrgName.trim(),
            companyEmail: newOrgEmail.trim() || undefined,
            contactPhone: newOrgPhone.trim() || undefined,
            address: newOrgAddress.trim() || undefined,
            adminName: newAdminName.trim(),
            adminEmail: newAdminEmail.trim(),
            adminPassword: newAdminPassword,
            allowJdUpload: newAllowJdUpload,
            maxUsers: Number(newMaxUsers),
            maxRecruiters: Number(newMaxRecruiters),
            maxActiveJobs: Number(newMaxActiveJobs),
            maxResumesPerMonth: Number(newMaxResumes),
            subscriptionPlan: newSubPlan,
            billingCycle: newBillingCycle,
            subscriptionExpiry: newSubExpiry ? new Date(newSubExpiry).toISOString() : undefined
          })
        },
        token
      );

      setCreatedAdminCreds({
        orgName: newOrgName.trim(),
        email: newAdminEmail.trim(),
        password: newAdminPassword
      });

      // Reset form
      setNewOrgName('');
      setNewOrgEmail('');
      setNewOrgPhone('');
      setNewOrgAddress('');
      setNewAdminName('');
      setNewAdminEmail('');
      setNewAdminPassword('');
      setNewAllowJdUpload(true);
      setShowCreateModal(false);
      await loadData();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create organization');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleUpdateLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    setEditLimitsError('');
    setEditLimitsLoading(true);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      await fetchApi(
        `/super-admin/organizations/${selectedOrg.id}/limits`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            maxUsers: Number(editMaxUsers),
            maxRecruiters: Number(editMaxRecruiters),
            maxActiveJobs: Number(editMaxActiveJobs),
            maxResumesPerMonth: Number(editMaxResumes)
          })
        },
        token
      );

      setShowLimitsModal(false);
      await loadData();
    } catch (err: any) {
      setEditLimitsError(err.message || 'Failed to update limits');
    } finally {
      setEditLimitsLoading(false);
    }
  };

  const handleUpdateSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    setSubLoading(true);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      await fetchApi(
        `/super-admin/organizations/${selectedOrg.id}/subscription`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            subscriptionPlan: subPlan,
            billingCycle: subCycle,
            status: subStatus,
            subscriptionExpiry: subExpiry ? new Date(subExpiry).toISOString() : null
          })
        },
        token
      );

      setShowSubModal(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update subscription');
    } finally {
      setSubLoading(false);
    }
  };

  const handleToggleStatus = async (org: ClientOrganization) => {
    const nextStatus = org.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const confirmMsg =
      nextStatus === 'SUSPENDED'
        ? `Are you sure you want to suspend "${org.name}"? All users in this client company will be immediately blocked from signing in.`
        : `Reactivate organization "${org.name}"?`;

    if (!confirm(confirmMsg)) return;

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      await fetchApi(
        `/super-admin/organizations/${org.id}/toggle-status`,
        {
          method: 'POST',
          body: JSON.stringify({ status: nextStatus })
        },
        token
      );
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle status');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    setResetPwdLoading(true);
    setResetPwdError('');
    setResetPwdSuccess('');

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      const res = await fetchApi<{ message: string }>(
        `/super-admin/organizations/${selectedOrg.id}/reset-admin-password`,
        {
          method: 'POST',
          body: JSON.stringify({ newPassword: resetPwdValue })
        },
        token
      );

      setResetPwdSuccess(res.message || 'Password reset successfully.');
      setResetPwdValue('');
      setTimeout(() => {
        setShowResetPwdModal(false);
        setResetPwdSuccess('');
      }, 2000);
    } catch (err: any) {
      setResetPwdError(err.message || 'Failed to reset password');
    } finally {
      setResetPwdLoading(false);
    }
  };

  const openClientDetailsModal = async (org: ClientOrganization) => {
    let localOverrides: Record<string, boolean> = {};
    if (typeof window !== 'undefined') {
      try {
        localOverrides = JSON.parse(localStorage.getItem('tasknera_org_jd_permissions') || '{}');
      } catch {}
    }
    const adminEmail = (org.clientAdmin?.email || '').toLowerCase().trim();
    const orgName = (org.name || '').toLowerCase().trim();
    const currentPermission =
      localOverrides[org.id] !== undefined
        ? localOverrides[org.id]
        : (adminEmail && localOverrides[adminEmail] !== undefined
            ? localOverrides[adminEmail]
            : (orgName && localOverrides[orgName] !== undefined
                ? localOverrides[orgName]
                : org.allowJdUpload));
    const effectiveOrg = { ...org, allowJdUpload: currentPermission !== false };

    setSelectedOrg(effectiveOrg);
    setShowDetailsModal(true);
    setDetailsError('');
    setLoadingClientJobs(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      const res = await fetchApi<{ jobs: any[] }>(
        `/jobs?organizationId=${org.id}`,
        {},
        token
      );
      setClientJobs(res?.jobs || []);
    } catch (err: any) {
      console.warn('Failed to load client jobs:', err);
      setClientJobs([]);
    } finally {
      setLoadingClientJobs(false);
    }
  };

  const handleToggleJdPermission = async (org: ClientOrganization) => {
    let localOverrides: Record<string, boolean> = {};
    if (typeof window !== 'undefined') {
      try {
        localOverrides = JSON.parse(localStorage.getItem('tasknera_org_jd_permissions') || '{}');
      } catch {}
    }
    const adminEmail = (org.clientAdmin?.email || '').toLowerCase().trim();
    const orgName = (org.name || '').toLowerCase().trim();
    const currentPermission =
      localOverrides[org.id] !== undefined
        ? localOverrides[org.id]
        : (adminEmail && localOverrides[adminEmail] !== undefined
            ? localOverrides[adminEmail]
            : (orgName && localOverrides[orgName] !== undefined
                ? localOverrides[orgName]
                : (org.allowJdUpload !== false)));
    const nextVal = !currentPermission;

    setTogglingPermission(true);
    setDetailsError('');

    // 1. Immediately persist in localStorage
    if (typeof window !== 'undefined') {
      try {
        localOverrides[org.id] = nextVal;
        if (adminEmail) localOverrides[adminEmail] = nextVal;
        if (orgName) localOverrides[orgName] = nextVal;
        localStorage.setItem('tasknera_org_jd_permissions', JSON.stringify(localOverrides));
      } catch {}
    }

    // 2. Immediately update state
    const updatedOrg = { ...org, allowJdUpload: nextVal };
    setSelectedOrg(updatedOrg);
    setOrganizations(prev => {
      const nextOrgs = prev.map(o => o.id === org.id ? { ...o, allowJdUpload: nextVal } : o);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('tasknera_cached_orgs', JSON.stringify(nextOrgs));
        } catch {}
      }
      return nextOrgs;
    });

    // 3. Dispatch to API
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null;
      await fetchApi(
        `/super-admin/organizations/${org.id}/jd-permission`,
        {
          method: 'PATCH',
          body: JSON.stringify({ allowJdUpload: nextVal })
        },
        token
      );
    } catch (err: any) {
      console.warn('Backend sync warning for JD permission:', err);
    } finally {
      setTogglingPermission(false);
    }
  };

  const openLimitsModal = (org: ClientOrganization) => {
    setSelectedOrg(org);
    setEditMaxUsers(org.maxUsers);
    setEditMaxRecruiters(org.maxRecruiters);
    setEditMaxActiveJobs(org.maxActiveJobs);
    setEditMaxResumes(org.maxResumesPerMonth);
    setEditLimitsError('');
    setShowLimitsModal(true);
  };

  const openSubModal = (org: ClientOrganization) => {
    setSelectedOrg(org);
    setSubPlan(org.subscriptionPlan);
    setSubCycle(org.billingCycle);
    setSubStatus(org.status);
    setSubExpiry(org.subscriptionExpiry ? org.subscriptionExpiry.split('T')[0] : '');
    setShowSubModal(true);
  };

  const openResetPwdModal = (org: ClientOrganization) => {
    setSelectedOrg(org);
    setResetPwdValue('');
    setResetPwdError('');
    setResetPwdSuccess('');
    setShowResetPwdModal(true);
  };

  const filteredOrgs = organizations.filter((org) => {
    const matchesSearch =
      org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (org.companyEmail && org.companyEmail.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (org.clientAdmin?.email && org.clientAdmin.email.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || org.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (!mounted) return null;

  if (!isAuthenticated || !isSuperAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        <Header />
        <main className="flex-1 flex items-center justify-center p-6 mt-16">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m11-3.5a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Super Admin Access Restricted</h2>
            <p className="text-sm text-slate-600 mb-6">
              This portal is restricted to the platform owner. Please sign in with your Super Administrator credentials.
            </p>
            <a
              href="/home"
              className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl transition-colors shadow-sm"
            >
              Return to Platform Home
            </a>
          </div>
        </main>
      <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        
        {/* Top Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8 bg-gradient-to-r from-violet-900 via-indigo-900 to-slate-900 p-6 sm:p-8 rounded-3xl text-white shadow-xl">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 text-xs font-semibold uppercase tracking-wider mb-2 border border-violet-500/30">
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse"></span>
              SaaS Multi-Tenant Management
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Super Administrator Control Center</h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Provision client organizations, configure user & recruiter quotas, oversee subscriptions, and manage tenant security policies.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-orange hover:bg-orange-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-orange-500/25 transition-all cursor-pointer transform active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span>Provision New Client</span>
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition-all cursor-pointer"
              title="Refresh Data"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Temporary Credential Alert */}
        {createdAdminCreds && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-bold text-emerald-900">
                  Client Admin provisioned for "{createdAdminCreds.orgName}"!
                </h4>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Share these credentials securely with the client administrator:
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-mono bg-white px-3 py-1.5 rounded-lg border border-emerald-200">
                  <span><strong>Email:</strong> {createdAdminCreds.email}</span>
                  <span><strong>Password:</strong> {createdAdminCreds.password}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setCreatedAdminCreds(null)}
              className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold px-2 py-1"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Overview Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Client Orgs</div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{stats?.totalOrganizations ?? organizations.length}</div>
            <div className="text-xs text-emerald-600 mt-1 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              {stats?.activeOrganizations ?? organizations.filter(o => o.status === 'ACTIVE').length} Active
            </div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Platform Users</div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{stats?.totalUsers ?? '...'}</div>
            <div className="text-xs text-slate-500 mt-1">Across all organizations</div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Requisitions</div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{stats?.totalJobs ?? '...'}</div>
            <div className="text-xs text-indigo-600 mt-1 font-medium">Platform JDs live</div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Candidates</div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{stats?.totalCandidates ?? '...'}</div>
            <div className="text-xs text-violet-600 mt-1 font-medium">{stats?.totalEvaluations ?? 0} AI evaluations</div>
          </div>
        </div>

        {/* Tabs & Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('organizations')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'organizations'
                  ? 'bg-slate-900 text-white shadow'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              Client Organizations ({organizations.length})
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'audit'
                  ? 'bg-slate-900 text-white shadow'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              Security Audit Logs ({auditLogs.length})
            </button>
          </div>

          {activeTab === 'organizations' && (
            <div className="flex items-center gap-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search client or admin..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-56 text-xs px-3 py-2 pl-8 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 font-medium text-slate-700"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="EXPIRED">Expired</option>
              </select>
            </div>
          )}
        </div>

        {/* Tab 1: Organizations Table */}
        {activeTab === 'organizations' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-5 py-3.5">Organization / Plan</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">User Quota</th>
                    <th className="px-5 py-3.5">Recruiter Limit</th>
                    <th className="px-5 py-3.5">Active Jobs</th>
                    <th className="px-5 py-3.5">Client Admin</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrgs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                        {loading ? 'Loading client organizations...' : 'No client organizations found.'}
                      </td>
                    </tr>
                  ) : (
                    filteredOrgs.map((org) => {
                      const userPct = Math.min(100, Math.round((org.currentUsers / (org.maxUsers || 1)) * 100));
                      const isNearLimit = userPct >= 80;
                      const isAtLimit = org.currentUsers >= org.maxUsers;

                      return (
                        <tr key={org.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-5 py-4">
                            <div className="font-bold text-slate-900 text-sm">{org.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="inline-block px-2 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold text-[10px] tracking-wide">
                                {org.subscriptionPlan === 'STARTER' ? 'Starter (500/mo)' : org.subscriptionPlan === 'PROFESSIONAL' ? 'Pro (2,500/mo)' : org.subscriptionPlan}
                              </span>
                              <span className="text-[11px] text-slate-400">ID: {org.id}</span>
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                                org.status === 'ACTIVE'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : org.status === 'SUSPENDED'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  org.status === 'ACTIVE'
                                    ? 'bg-emerald-500'
                                    : org.status === 'SUSPENDED'
                                    ? 'bg-amber-500'
                                    : 'bg-red-500'
                                }`}
                              ></span>
                              {org.status}
                            </span>
                          </td>

                          {/* Critical User Limit Column */}
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-between text-xs font-semibold text-slate-800 mb-1">
                              <span>
                                {org.currentUsers} / {org.maxUsers} Users
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  isAtLimit
                                    ? 'bg-red-100 text-red-700 font-bold'
                                    : isNearLimit
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {org.availableUserSlots} slots left
                              </span>
                            </div>
                            <div className="w-32 bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  isAtLimit
                                    ? 'bg-red-500'
                                    : isNearLimit
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${userPct}%` }}
                              ></div>
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            <div className="font-semibold text-slate-800">
                              {org.currentRecruiters} / {org.maxRecruiters}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {org.availableRecruiterSlots} slots left
                            </div>
                          </td>

                          <td className="px-5 py-4">
                            <div className="font-semibold text-slate-800">
                              {org.currentActiveJobs} / {org.maxActiveJobs} Jobs
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium">
                              {(org.currentMonthResumes ?? 0).toLocaleString()} / {(org.maxResumesPerMonth ?? 500).toLocaleString()} CVs/mo
                            </div>
                          </td>

                          <td className="px-5 py-4 cursor-pointer group" onClick={() => openClientDetailsModal(org)}>
                            <div className="font-medium text-slate-900 group-hover:text-violet-700 transition flex items-center gap-1.5">
                              <span>{org.clientAdmin?.name || 'Admin'}</span>
                              <span className="text-[10px] text-violet-500 opacity-0 group-hover:opacity-100 transition">Details →</span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {org.clientAdmin?.email || org.companyEmail || 'No email set'}
                            </div>
                            <div className="mt-1">
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                  org.allowJdUpload !== false
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${org.allowJdUpload !== false ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                                JD Upload: {org.allowJdUpload !== false ? 'Yes' : 'No (Super Admin Only)'}
                              </span>
                            </div>
                          </td>

                          <td className="px-5 py-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {/* Manage JDs & Details */}
                              <button
                                onClick={() => openClientDetailsModal(org)}
                                className="px-2.5 py-1.5 text-violet-700 bg-violet-50 hover:bg-violet-100 font-semibold rounded-lg border border-violet-200 transition-colors cursor-pointer flex items-center gap-1"
                                title="Open Client Admin Details & Job Description Management"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span>Manage JDs</span>
                              </button>

                              {/* Edit Limits */}
                              <button
                                onClick={() => openLimitsModal(org)}
                                className="px-2.5 py-1.5 text-violet-700 hover:bg-violet-50 font-semibold rounded-lg border border-violet-200 transition-colors cursor-pointer"
                                title="Edit User Credential Limits Anytime"
                              >
                                Edit Limits
                              </button>

                              {/* Manage Sub */}
                              <button
                                onClick={() => openSubModal(org)}
                                className="px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 font-semibold rounded-lg border border-slate-200 transition-colors cursor-pointer"
                                title="Manage Subscription & Expiry"
                              >
                                Plan
                              </button>

                              {/* Reset Pwd */}
                              <button
                                onClick={() => openResetPwdModal(org)}
                                className="px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 font-semibold rounded-lg border border-slate-200 transition-colors cursor-pointer"
                                title="Reset Client Admin Password"
                              >
                                Reset Pwd
                              </button>

                              {/* Toggle Status */}
                              <button
                                onClick={() => handleToggleStatus(org)}
                                className={`px-2.5 py-1.5 font-semibold rounded-lg border transition-colors cursor-pointer ${
                                  org.status === 'ACTIVE'
                                    ? 'text-amber-700 hover:bg-amber-50 border-amber-200'
                                    : 'text-emerald-700 hover:bg-emerald-50 border-emerald-200'
                                }`}
                                title={org.status === 'ACTIVE' ? 'Suspend Organization' : 'Activate Organization'}
                              >
                                {org.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Security Audit Logs */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Security & Organization Audit Trail</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time immutable log of tenant provisioning, limit adjustments, status changes, and administrator password resets.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-5 py-3">Timestamp</th>
                    <th className="px-5 py-3">Action</th>
                    <th className="px-5 py-3">Organization</th>
                    <th className="px-5 py-3">Actor</th>
                    <th className="px-5 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-slate-400 font-sans">
                        No audit events recorded yet.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-slate-500 font-sans">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-5 py-3 font-semibold text-slate-900 font-sans">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px]">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-slate-700 font-sans">
                          {log.organization?.name || log.organizationId || 'Global'}
                        </td>
                        <td className="px-5 py-3 text-slate-500 font-sans">
                          {log.user?.email || 'Super Admin'}
                        </td>
                        <td className="px-5 py-3 text-[11px] text-slate-600">
                          {log.details ? JSON.stringify(log.details) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </main>

      {/* MODAL 1: Provision New Client Organization */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 sm:p-8 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Provision New Client Organization</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Creates tenant container, initial Client Admin, and configures account limits.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg p-1"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateOrg} className="space-y-5">
              {/* Section 1: Company Profile */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  1. Company Profile
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Company Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Acme Corporation"
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Company Corporate Email</label>
                    <input
                      type="email"
                      placeholder="contact@acme.com"
                      value={newOrgEmail}
                      onChange={(e) => setNewOrgEmail(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
                    <input
                      type="tel"
                      placeholder="+1 (555) 000-0000"
                      value={newOrgPhone}
                      onChange={(e) => setNewOrgPhone(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Headquarters Location</label>
                    <input
                      type="text"
                      placeholder="e.g. San Francisco, CA"
                      value={newOrgAddress}
                      onChange={(e) => setNewOrgAddress(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Initial Client Admin Credentials */}
              <div className="pt-2 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  2. Initial Client Admin Account
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="Jane Doe"
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Email *</label>
                    <input
                      type="email"
                      required
                      placeholder="jane.doe@acme.com"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Temporary Password *</label>
                    <input
                      type="text"
                      required
                      minLength={8}
                      placeholder="Min 8 characters"
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:bg-white focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                </div>

                {/* JD Upload Permission Field */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-900">
                      JD Upload Permission *
                    </label>
                    <span className="text-[10px] text-violet-700 bg-violet-50 font-semibold px-2 py-0.5 rounded">
                      Super Admin Controlled
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-2.5">
                    Select whether this Client Admin is permitted to create and upload Job Descriptions (JDs) or if only the Super Admin can do so.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        newAllowJdUpload
                          ? 'bg-violet-50/80 border-violet-400 ring-1 ring-violet-400'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="newJdUploadPermission"
                        checked={newAllowJdUpload === true}
                        onChange={() => setNewAllowJdUpload(true)}
                        className="mt-0.5 text-violet-600 focus:ring-violet-500 cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span>Yes</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">Allowed</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                          Client Admin can create and upload Job Descriptions (JDs).
                        </p>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        !newAllowJdUpload
                          ? 'bg-amber-50/80 border-amber-400 ring-1 ring-amber-400'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="newJdUploadPermission"
                        checked={newAllowJdUpload === false}
                        onChange={() => setNewAllowJdUpload(false)}
                        className="mt-0.5 text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span>No</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">Super Admin Only</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                          Only the Super Admin can create and upload JDs for that client. The Client Admin must not be able to upload or create JDs.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Section 3: Quotas & Resource Limits (Critical) */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-violet-900 uppercase tracking-wider">
                    3. User Credential & Quota Limits
                  </h4>
                  <span className="text-[11px] text-violet-700 bg-violet-50 px-2 py-0.5 rounded font-medium">
                    Editable anytime by Super Admin
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Max Total Users *
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={500}
                      value={newMaxUsers}
                      onChange={(e) => setNewMaxUsers(Number(e.target.value))}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-violet-500"
                    />
                    <span className="text-[10px] text-slate-400 block mt-0.5">Includes Client Admin</span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Max Recruiters
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={500}
                      value={newMaxRecruiters}
                      onChange={(e) => setNewMaxRecruiters(Number(e.target.value))}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-violet-500"
                    />
                    <span className="text-[10px] text-slate-400 block mt-0.5">Recruiter accounts</span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Max Active Jobs
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={1000}
                      value={newMaxActiveJobs}
                      onChange={(e) => setNewMaxActiveJobs(Number(e.target.value))}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-violet-500"
                    />
                    <span className="text-[10px] text-slate-400 block mt-0.5">Active requisitions</span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Resumes / Mo
                    </label>
                    <input
                      type="number"
                      required
                      min={10}
                      max={50000}
                      value={newMaxResumes}
                      onChange={(e) => setNewMaxResumes(Number(e.target.value))}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-violet-500"
                    />
                    <span className="text-[10px] text-slate-400 block mt-0.5">AI parsing quota</span>
                  </div>
                </div>
              </div>

              {/* Section 4: Subscription Plan */}
              <div className="pt-2 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  4. Subscription Plan & Term
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Subscription Plan</label>
                    <select
                      value={newSubPlan}
                      onChange={(e) => setNewSubPlan(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-violet-500 font-medium"
                    >
                      <option value="STARTER">Starter Pack (500 resumes/month)</option>
                      <option value="PROFESSIONAL">Professional Pack (2,500 resumes/month)</option>
                      <option value="ENTERPRISE">Enterprise Pack (Unlimited resumes)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Cycle</label>
                    <select
                      value={newBillingCycle}
                      onChange={(e) => setNewBillingCycle(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-violet-500 font-medium"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="annual">Annual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Expiry Date (Optional)</label>
                    <input
                      type="date"
                      value={newSubExpiry}
                      onChange={(e) => setNewSubExpiry(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2.5 bg-brand-orange hover:bg-orange-600 text-white font-semibold rounded-xl text-xs shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  {createLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Provisioning Client...</span>
                    </>
                  ) : (
                    <span>Create Client & Client Admin</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Dynamically Edit Limits (Super Admin superpower) */}
      {showLimitsModal && selectedOrg && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div>
                <div className="text-xs text-violet-700 font-bold uppercase tracking-wider">Dynamic Quota Control</div>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">Edit Limits for "{selectedOrg.name}"</h3>
              </div>
              <button onClick={() => setShowLimitsModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <p className="text-xs text-slate-600 mb-5">
              Adjusting limits takes effect immediately. The Client Admin can immediately provision accounts up to the new user limit.
            </p>

            {editLimitsError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl font-medium">
                {editLimitsError}
              </div>
            )}

            <form onSubmit={handleUpdateLimits} className="space-y-4">
              <div className="p-4 bg-violet-50/60 border border-violet-100 rounded-2xl">
                <label className="block text-xs font-bold text-violet-950 mb-1">
                  Maximum User Accounts (Total Quota) *
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    required
                    min={Math.max(1, selectedOrg.currentUsers)}
                    max={1000}
                    value={editMaxUsers}
                    onChange={(e) => setEditMaxUsers(Number(e.target.value))}
                    className="w-32 text-sm font-bold px-3 py-2 bg-white border border-violet-200 rounded-xl focus:ring-2 focus:ring-violet-500"
                  />
                  <div className="text-xs text-violet-800">
                    Currently utilizing <strong>{selectedOrg.currentUsers}</strong> accounts.
                  </div>
                </div>
                <span className="text-[11px] text-violet-600 block mt-1">
                  Quota includes Client Admin and all team members.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Max Recruiters</label>
                  <input
                    type="number"
                    min={1}
                    value={editMaxRecruiters}
                    onChange={(e) => setEditMaxRecruiters(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Max Active Jobs</label>
                  <input
                    type="number"
                    min={1}
                    value={editMaxActiveJobs}
                    onChange={(e) => setEditMaxActiveJobs(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Resumes / Mo</label>
                  <input
                    type="number"
                    min={10}
                    value={editMaxResumes}
                    onChange={(e) => setEditMaxResumes(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowLimitsModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLimitsLoading}
                  className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl text-xs shadow transition-all cursor-pointer"
                >
                  {editLimitsLoading ? 'Updating Limits...' : 'Save New Limits'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Manage Subscription & Status */}
      {showSubModal && selectedOrg && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Manage Subscription</h3>
                <p className="text-xs text-slate-500 mt-0.5">{selectedOrg.name}</p>
              </div>
              <button onClick={() => setShowSubModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleUpdateSub} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subscription Plan</label>
                <select
                  value={subPlan}
                  onChange={(e) => setSubPlan(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="STARTER">Starter Pack (500 resumes/month)</option>
                  <option value="PROFESSIONAL">Professional Pack (2,500 resumes/month)</option>
                  <option value="ENTERPRISE">Enterprise Pack (Unlimited resumes)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Cycle</label>
                <select
                  value={subCycle}
                  onChange={(e) => setSubCycle(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Organization Status</label>
                <select
                  value={subStatus}
                  onChange={(e) => setSubStatus(e.target.value as any)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                  <option value="EXPIRED">EXPIRED</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subscription Expiry Date</label>
                <input
                  type="date"
                  value={subExpiry}
                  onChange={(e) => setSubExpiry(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSubModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={subLoading}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs shadow transition-all cursor-pointer"
                >
                  {subLoading ? 'Saving...' : 'Update Subscription'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Reset Client Admin Password */}
      {showResetPwdModal && selectedOrg && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Reset Client Admin Password</h3>
                <p className="text-xs text-slate-500 mt-0.5">{selectedOrg.clientAdmin?.email || selectedOrg.name}</p>
              </div>
              <button onClick={() => setShowResetPwdModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {resetPwdError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl font-medium">
                {resetPwdError}
              </div>
            )}

            {resetPwdSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 text-xs rounded-xl font-medium">
                {resetPwdSuccess}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Secure Password *</label>
                <input
                  type="text"
                  required
                  minLength={8}
                  placeholder="Enter at least 8 characters"
                  value={resetPwdValue}
                  onChange={(e) => setResetPwdValue(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:bg-white focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowResetPwdModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetPwdLoading}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-xs shadow transition-all cursor-pointer"
                >
                  {resetPwdLoading ? 'Resetting Password...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

        {/* Client Admin Details & Job Description Management Modal */}
      {showDetailsModal && selectedOrg && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 my-8">
            {/* Header */}
            <div className="flex items-start justify-between pb-5 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-600"></span>
                  <span className="text-xs font-bold text-violet-700 uppercase tracking-wider">Client Admin Details</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    selectedOrg.status === 'ACTIVE'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {selectedOrg.status}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 uppercase">
                    {selectedOrg.subscriptionPlan} Plan
                  </span>
                </div>
                <h3 className="text-2xl font-extrabold text-slate-900 mt-1">
                  {selectedOrg.name}
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Client ID: {selectedOrg.id}
                </p>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Error banner if any */}
            {detailsError && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {detailsError}
              </div>
            )}

            {/* Client & Admin Information Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Client Admin Account</span>
                <div className="text-sm font-bold text-slate-900">{selectedOrg.clientAdmin?.name || 'Administrator'}</div>
                <div className="text-xs text-slate-600 font-mono mt-0.5 truncate">{selectedOrg.clientAdmin?.email || selectedOrg.companyEmail || 'No email set'}</div>
                <div className="text-[10px] text-slate-400 mt-2">Member since {new Date(selectedOrg.createdAt).toLocaleDateString()}</div>
              </div>

              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Company Contact</span>
                <div className="text-xs text-slate-700"><strong className="text-slate-900">Phone:</strong> {selectedOrg.contactPhone || 'Not set'}</div>
                <div className="text-xs text-slate-700 mt-1"><strong className="text-slate-900">Address:</strong> {selectedOrg.address || 'Not set'}</div>
                <div className="text-xs text-slate-700 mt-1"><strong className="text-slate-900">Billing:</strong> {selectedOrg.billingCycle}</div>
              </div>

              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Requisition Quotas</span>
                <div className="text-xs text-slate-700 font-semibold">Active Jobs: {selectedOrg.currentActiveJobs} / {selectedOrg.maxActiveJobs}</div>
                <div className="text-xs text-slate-700 font-semibold mt-1">Users: {selectedOrg.currentUsers} / {selectedOrg.maxUsers}</div>
                <div className="text-xs text-slate-700 font-semibold mt-1">Recruiters: {selectedOrg.currentRecruiters} / {selectedOrg.maxRecruiters}</div>
              </div>
            </div>

            {/* DEDICATED SECTION: Job Description Management */}
            <div className="mt-6 pt-6 border-t border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-extrabold text-slate-900">
                      Job Description Management
                    </h4>
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                        selectedOrg.allowJdUpload !== false
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${selectedOrg.allowJdUpload !== false ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                      Permission: {selectedOrg.allowJdUpload !== false ? 'Enabled (Client Can Upload)' : 'Disabled (Super Admin Only)'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedOrg.allowJdUpload !== false
                      ? 'The Client Admin has permission to create and upload Job Descriptions. The Super Admin also retains full upload capability.'
                      : 'JD Upload is restricted. Only the Super Admin can create and upload Job Descriptions for this client. The Client Admin cannot upload JDs.'}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Permission Toggle Button */}
                  <button
                    onClick={() => handleToggleJdPermission(selectedOrg)}
                    disabled={togglingPermission}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      selectedOrg.allowJdUpload !== false
                        ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                    }`}
                    title="Change JD Upload Permission"
                  >
                    {togglingPermission
                      ? 'Updating...'
                      : selectedOrg.allowJdUpload !== false
                      ? 'Restrict: Set to Super Admin Only'
                      : 'Allow: Enable Client Upload'}
                  </button>

                  {/* Super Admin Upload Action */}
                  <a
                    href={`/jobs/create?organizationId=${encodeURIComponent(selectedOrg.id)}&clientName=${encodeURIComponent(selectedOrg.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Upload JD for this Client</span>
                  </a>
                </div>
              </div>

              {/* JDs List for this Client */}
              <div className="bg-slate-50/80 rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200/80 bg-slate-100/60 flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Client Requisitions & JDs ({clientJobs.length})
                  </div>
                  <button
                    onClick={() => openClientDetailsModal(selectedOrg)}
                    className="text-[11px] text-violet-700 hover:text-violet-900 font-semibold cursor-pointer"
                  >
                    Refresh List
                  </button>
                </div>

                {loadingClientJobs ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Loading client job requisitions...
                  </div>
                ) : clientJobs.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="w-10 h-10 rounded-full bg-slate-200/60 text-slate-400 flex items-center justify-center mx-auto mb-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="text-sm font-bold text-slate-800">No Job Descriptions uploaded for this client yet</div>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      Use the <strong>"Upload JD for this Client"</strong> button above to upload and evaluate candidate resumes deterministically for {selectedOrg.name}.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200/60 max-h-72 overflow-y-auto">
                    {clientJobs.map((job) => (
                      <div key={job.id} className="p-4 hover:bg-white transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs sm:text-sm">{job.position || job.title}</span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                              job.status === 'active' || job.status === 'Active'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {job.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                            <span>{job.location || 'Remote / Unspecified'}</span>
                            <span>•</span>
                            <span>{job.work_mode || job.mode || 'Hybrid'}</span>
                            <span>•</span>
                            <span>{job.requirements?.length ?? 0} evaluated criteria</span>
                            <span>•</span>
                            <span>Created {job.created_at || job.created ? new Date(job.created_at || job.created).toLocaleDateString() : 'Recently'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <a
                            href={`/jobs/${job.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                          >
                            View Job
                          </a>
                          <a
                            href={`/jobs/${job.id}/candidates`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100 transition"
                          >
                            Candidate Pool
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowDetailsModal(false)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

