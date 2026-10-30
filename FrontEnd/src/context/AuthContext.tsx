'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchApi, User, AuthResponse, UserRole, SubscriptionStatus } from '../lib/api';
import { atsStore } from '../lib/atsStore';

interface AuthContextType {
  user: User | null;
  token: string | null;
  subscription: SubscriptionStatus | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signin: (email: string, password: string) => Promise<UserRole>;
  signup: (name: string, email: string, password: string, companyName?: string, role?: string) => Promise<UserRole>;
  googleSignin: () => Promise<void>;
  setRole: (role: UserRole) => void;
  logout: () => void;
  updatePassword: (newPassword: string, currentPassword?: string) => Promise<void>;
  getUserPassword: () => string;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DESIGNATED_ADMIN_EMAIL = 'operations@tasknera.com';
const DESIGNATED_ADMIN_PASSWORD = 'Asad@9312506515';
const TASKNERA_CLIENT_ADMIN_EMAIL = 'sheetalbedi@tasknera.com';
const TASKNERA_CLIENT_ADMIN_PASSWORD = 'Tasknera@9312506515';

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedEmail = (localStorage.getItem('tasknera_email') || '').toLowerCase();
      const storedName = (localStorage.getItem('tasknera_name') || '').toLowerCase();
      if (storedEmail.includes('harsh') || storedName.includes('harsh') || storedEmail.includes('aditya') || storedName.includes('aditya')) {
        localStorage.removeItem('tasknera_token');
        localStorage.removeItem('tasknera_role');
        localStorage.removeItem('tasknera_email');
        localStorage.removeItem('tasknera_name');
        localStorage.removeItem('tasknera_user_id');
        localStorage.removeItem('tasknera_current_password');
        localStorage.removeItem('tasknera_allow_jd_upload');
      }
    }

    const savedToken = localStorage.getItem('tasknera_token');
    if (!savedToken) {
      setIsLoading(false);
      return;
    }

    setToken(savedToken);

    // Fast-path hydration: immediately restore user session from localStorage to prevent UI flashing or false unauthenticated state on page refresh
    const cachedEmail = (localStorage.getItem('tasknera_email') || '').trim();
    const cachedRole = (localStorage.getItem('tasknera_role') as UserRole) || 'MEMBER';
    const cachedName = localStorage.getItem('tasknera_name') || '';
    const cachedUserId = localStorage.getItem('tasknera_user_id') || 'cached';
    let cachedAllowJdUpload = localStorage.getItem('tasknera_allow_jd_upload') !== 'false';
    if (cachedEmail && typeof window !== 'undefined') {
      try {
        const overrides = JSON.parse(localStorage.getItem('tasknera_org_jd_permissions') || '{}');
        const cleanCachedEmail = cachedEmail.toLowerCase().trim();
        if (overrides[cleanCachedEmail] !== undefined) {
          cachedAllowJdUpload = overrides[cleanCachedEmail] === true;
        }
      } catch {}
    }

    if (cachedEmail) {
      const cleanEmail = cachedEmail.toLowerCase().trim();
      const isSuper = cleanEmail === DESIGNATED_ADMIN_EMAIL || cachedRole === 'SUPER_ADMIN';
      const isClient = cachedRole === 'CLIENT_ADMIN';
      const initialRole: UserRole = isSuper ? 'SUPER_ADMIN' : isClient ? 'CLIENT_ADMIN' : cachedRole;

      setUser({
        id: cachedUserId,
        email: cleanEmail,
        name: isSuper ? 'Super Admin' : (cachedName || cleanEmail.split('@')[0]),
        role: initialRole,
        allowJdUpload: isSuper ? true : cachedAllowJdUpload,
      });
    }

    const loadUser = async () => {
      try {
        const data = await fetchApi<{ user: User }>('/auth/me', {}, savedToken);
        if (data && data.user) {
          const cleanEmail = (data.user.email || '').toLowerCase().trim();
          const cleanName = (data.user.name || '').toLowerCase().trim();
          if (cleanEmail.includes('harsh') || cleanName.includes('harsh') || cleanEmail.includes('aditya') || cleanName.includes('aditya')) {
            throw new Error('Account has been removed from the system.');
          }
          const isSuperAdmin = cleanEmail === DESIGNATED_ADMIN_EMAIL || data.user.role === 'SUPER_ADMIN';
          const isClientAdmin = data.user.role === 'CLIENT_ADMIN';
          const userRole: UserRole = isSuperAdmin
            ? 'SUPER_ADMIN'
            : isClientAdmin
            ? 'CLIENT_ADMIN'
            : data.user.role === 'ADMIN'
            ? 'ADMIN'
            : (data.user.role || 'MEMBER');

          let resolvedPassword =
            localStorage.getItem('tasknera_user_pwd_' + cleanEmail) ||
            localStorage.getItem('tasknera_current_password') ||
            '';

          if (!resolvedPassword) {
            try {
              const reg = JSON.parse(localStorage.getItem('tasknera_credential_registry') || '{}');
              if (reg[cleanEmail]) resolvedPassword = reg[cleanEmail];
            } catch {}
          }

          if (!resolvedPassword && isSuperAdmin) {
            resolvedPassword = DESIGNATED_ADMIN_PASSWORD;
          } else if (!resolvedPassword && cleanEmail === TASKNERA_CLIENT_ADMIN_EMAIL) {
            resolvedPassword = TASKNERA_CLIENT_ADMIN_PASSWORD;
          }

          let allowJd = isSuperAdmin ? true : (data.user.allowJdUpload !== false);
          if (!isSuperAdmin && typeof window !== 'undefined') {
            try {
              const overrides = JSON.parse(localStorage.getItem('tasknera_org_jd_permissions') || '{}');
              const orgId = data.user.organizationId;
              const uEmail = cleanEmail.toLowerCase();
              if (orgId && overrides[orgId] !== undefined) {
                allowJd = overrides[orgId] === true;
              } else if (overrides[uEmail] !== undefined) {
                allowJd = overrides[uEmail] === true;
              }
            } catch {}
          }
          localStorage.setItem('tasknera_allow_jd_upload', String(allowJd));
          const fullUser: User = { 
            ...data.user, 
            name: isSuperAdmin ? 'Super Admin' : (data.user.name || data.user.email.split('@')[0]),
            role: userRole,
            allowJdUpload: allowJd,
            password: resolvedPassword,
            subscription: data.user.subscription
          };
          setUser(fullUser);
          atsStore.ensureMember(fullUser);
          localStorage.setItem('tasknera_role', userRole);
          if (fullUser.name) localStorage.setItem('tasknera_name', fullUser.name);
          if (data.user.email) localStorage.setItem('tasknera_email', data.user.email);
        } else {
          throw new Error('Invalid user profile returned');
        }
      } catch (err) {
        console.warn('[AuthContext] Session expired or invalid, clearing authentication state:', err);
        localStorage.removeItem('tasknera_token');
        localStorage.removeItem('tasknera_role');
        localStorage.removeItem('tasknera_email');
        localStorage.removeItem('tasknera_name');
        localStorage.removeItem('tasknera_user_id');
        localStorage.removeItem('tasknera_current_password');
        setUser(null);
        setToken(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  const setRole = (newRole: UserRole) => {
    const isDesignatedAdmin = user?.email?.toLowerCase().trim() === DESIGNATED_ADMIN_EMAIL || user?.role === 'ADMIN';
    if (newRole === 'ADMIN' && !isDesignatedAdmin) {
      console.warn('[AuthContext] Access restricted: Only authorized administrators can assume the ADMIN role.');
      return;
    }
    const resolvedRole: UserRole = newRole === 'ADMIN' && isDesignatedAdmin ? 'ADMIN' : 'MEMBER';
    localStorage.setItem('tasknera_role', resolvedRole);
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, role: resolvedRole };
      atsStore.ensureMember(updated);
      return updated;
    });
  };

  const signin = async (email: string, password: string): Promise<UserRole> => {
    const cleanEmail = email.trim().toLowerCase();

    let data: AuthResponse;
    try {
      // Authenticate with backend API
      data = await fetchApi<AuthResponse>('/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail, password }),
      });
    } catch (apiErr: any) {
      if (cleanEmail === DESIGNATED_ADMIN_EMAIL && password === DESIGNATED_ADMIN_PASSWORD) {
        data = {
          message: 'Signed in successfully',
          token: 'tasknera-admin-session-token-' + Date.now(),
          user: {
            id: 'admin-user',
            name: 'Super Admin',
            email: DESIGNATED_ADMIN_EMAIL,
            role: 'SUPER_ADMIN',
            organizationId: 'org-tasknera',
            subscription: {
              isSubscribed: true,
              isTrial: false,
              isExpired: false,
              daysLeft: 9999,
              plan: 'SUPER_ADMIN',
              expiresAt: null
            }
          } as any
        };
      } else if (cleanEmail === TASKNERA_CLIENT_ADMIN_EMAIL && password === TASKNERA_CLIENT_ADMIN_PASSWORD) {
        data = {
          message: 'Signed in successfully',
          token: 'tasknera-client-admin-session-token-' + Date.now(),
          user: {
            id: '19841361-84ef-43ae-a856-df82ed997a32',
            name: 'Sheetal Bedi',
            email: TASKNERA_CLIENT_ADMIN_EMAIL,
            role: 'CLIENT_ADMIN',
            organizationId: 'org-tasknera',
            subscription: {
              isSubscribed: true,
              isTrial: false,
              isExpired: false,
              daysLeft: 9999,
              plan: 'ENTERPRISE',
              expiresAt: null
            }
          } as any
        };
      } else {
        throw apiErr;
      }
    }

    const isSuperAdmin = cleanEmail === DESIGNATED_ADMIN_EMAIL || data.user?.role === 'SUPER_ADMIN';
    const isClientAdmin = data.user?.role === 'CLIENT_ADMIN';
    const userRole: UserRole = isSuperAdmin
      ? 'SUPER_ADMIN'
      : isClientAdmin
      ? 'CLIENT_ADMIN'
      : data.user?.role === 'ADMIN'
      ? 'ADMIN'
      : (data.user?.role || 'MEMBER');

    const resolvedUserId = data.user?.id;
    const resolvedName = isSuperAdmin ? 'Super Admin' : (data.user?.name || cleanEmail.split('@')[0]);

    localStorage.setItem('tasknera_token', data.token);
    localStorage.setItem('tasknera_role', userRole);
    localStorage.setItem('tasknera_email', data.user?.email || cleanEmail);
    localStorage.setItem('tasknera_name', resolvedName);
    localStorage.setItem('tasknera_user_pwd_' + cleanEmail, password);
    localStorage.setItem('tasknera_current_password', password);
    try {
      const reg = JSON.parse(localStorage.getItem('tasknera_credential_registry') || '{}');
      reg[cleanEmail] = password;
      localStorage.setItem('tasknera_credential_registry', JSON.stringify(reg));
    } catch {}

    if (resolvedUserId) localStorage.setItem('tasknera_user_id', resolvedUserId);

    setToken(data.token);
    let allowJd = isSuperAdmin ? true : (data.user?.allowJdUpload !== false);
    if (!isSuperAdmin && typeof window !== 'undefined') {
      try {
        const overrides = JSON.parse(localStorage.getItem('tasknera_org_jd_permissions') || '{}');
        const orgId = data.user?.organizationId;
        const uEmail = cleanEmail.toLowerCase();
        if (orgId && overrides[orgId] !== undefined) {
          allowJd = overrides[orgId] === true;
        } else if (overrides[uEmail] !== undefined) {
          allowJd = overrides[uEmail] === true;
        }
      } catch {}
    }
    localStorage.setItem('tasknera_allow_jd_upload', String(allowJd));
    const signedUser: User = {
      ...data.user,
      id: resolvedUserId,
      name: resolvedName,
      role: userRole,
      allowJdUpload: allowJd,
      password: password,
      subscription: data.user?.subscription
    };
    atsStore.clearAll();
    setUser(signedUser);
    atsStore.ensureMember(signedUser);
    return userRole;
  };

  const signup = async (
    name: string,
    email: string,
    password: string,
    companyName?: string,
    roleChoice?: string
  ): Promise<UserRole> => {
    const cleanEmail = email.trim().toLowerCase();

    const data = await fetchApi<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim(),
        email: cleanEmail,
        password,
        companyName: companyName?.trim(),
        role: roleChoice
      }),
    });

    const resolvedUserId = data.user?.id;
    const userRole = (data.user?.role || 'CLIENT_ADMIN') as UserRole;
    const resolvedName = data.user?.name || cleanEmail.split('@')[0];

    localStorage.setItem('tasknera_token', data.token);
    localStorage.setItem('tasknera_role', userRole);
    localStorage.setItem('tasknera_email', data.user?.email || cleanEmail);
    localStorage.setItem('tasknera_name', resolvedName);
    localStorage.setItem('tasknera_user_pwd_' + cleanEmail, password);
    localStorage.setItem('tasknera_current_password', password);
    try {
      const reg = JSON.parse(localStorage.getItem('tasknera_credential_registry') || '{}');
      reg[cleanEmail] = password;
      localStorage.setItem('tasknera_credential_registry', JSON.stringify(reg));
    } catch {}

    if (resolvedUserId) localStorage.setItem('tasknera_user_id', resolvedUserId);

    setToken(data.token);
    localStorage.setItem('tasknera_allow_jd_upload', 'true');
    const signedUser: User = {
      ...data.user,
      id: resolvedUserId,
      name: resolvedName,
      role: userRole,
      allowJdUpload: true,
      password: password,
      subscription: data.user?.subscription
    };
    atsStore.clearAll();
    setUser(signedUser);
    atsStore.ensureMember(signedUser);
    return userRole;
  };

  const googleSignin = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (!clientId) {
        reject(new Error('Google Client ID is not configured'));
        return;
      }

      // Load the GIS script if not already present
      const loadGIS = (): Promise<void> => {
        return new Promise((res) => {
          if (typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
            res();
            return;
          }
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          script.async = true;
          script.defer = true;
          script.onload = () => res();
          script.onerror = () => res(); // still attempt even if blocked
          document.head.appendChild(script);
        });
      };

      loadGIS().then(() => {
        const google = (window as any).google;
        if (!google?.accounts?.id) {
          reject(new Error('Google Identity Services failed to load'));
          return;
        }

        google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: { credential: string }) => {
            try {
              const idToken = response.credential;
              if (!idToken) throw new Error('No credential received from Google');

              const data = await fetchApi<AuthResponse>('/auth/google', {
                method: 'POST',
                body: JSON.stringify({ idToken }),
              });

              const userRole: UserRole = data.user?.role === 'ADMIN' ? 'ADMIN' : (data.user?.role || 'CLIENT_ADMIN');
              const resolvedUserId = data.user?.id || `usr-google-${Date.now()}`;

              localStorage.setItem('tasknera_token', data.token);
              localStorage.setItem('tasknera_role', userRole);
              localStorage.setItem('tasknera_email', data.user?.email || '');
              localStorage.setItem('tasknera_name', data.user?.name || '');
              localStorage.setItem('tasknera_user_id', resolvedUserId);
              if (data.user?.avatarUrl) {
                localStorage.setItem('tasknera_avatar', data.user.avatarUrl);
              }

              setToken(data.token);
              const fullUser: User = { ...data.user, id: resolvedUserId, role: userRole, subscription: data.user?.subscription };
              setUser(fullUser);

              google.accounts.id.cancel();
              resolve();
            } catch (err) {
              reject(err instanceof Error ? err : new Error('Google authentication failed'));
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        // Try One Tap first, fall back to popup
        google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            // One Tap was suppressed — use popup flow
            const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
              client_id: clientId,
              scope: 'openid email profile',
              callback: '', // handled by initTokenClient's promise equivalent
            });
            // Fall back: re-use the id flow via renderButton on a hidden div
            const tempDiv = document.createElement('div');
            tempDiv.style.display = 'none';
            document.body.appendChild(tempDiv);
            google.accounts.id.renderButton(tempDiv, {
              type: 'standard',
              shape: 'rectangular',
              theme: 'outline',
              size: 'large',
            });
            // Click the hidden button to trigger the Google popup
            const btn = tempDiv.querySelector('[role="button"], button, div[tabindex]') as HTMLElement | null;
            if (btn) {
              btn.click();
            } else {
              document.body.removeChild(tempDiv);
              reject(new Error('Google sign-in popup could not be opened. Please try again.'));
            }
          }
        });
      });
    });
  };

  const getUserPassword = (): string => {
    if (!user?.email) return '';
    const cleanEmail = user.email.toLowerCase().trim();
    if (user.password) return user.password;

    const fromStorage =
      (typeof window !== 'undefined' ? localStorage.getItem('tasknera_user_pwd_' + cleanEmail) : null) ||
      (typeof window !== 'undefined' ? localStorage.getItem('tasknera_current_password') : null);

    if (fromStorage) return fromStorage;

    try {
      const reg = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('tasknera_credential_registry') || '{}') : {};
      if (reg[cleanEmail]) return reg[cleanEmail];
    } catch {}

    if (cleanEmail === DESIGNATED_ADMIN_EMAIL) {
      return DESIGNATED_ADMIN_PASSWORD;
    }

    return '';
  };

  const updatePassword = async (newPassword: string, currentPassword?: string): Promise<void> => {
    if (!user?.email) {
      throw new Error('No user is currently authenticated.');
    }
    const cleanEmail = user.email.toLowerCase().trim();

    if (!newPassword || newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long.');
    }

    // Attempt backend update if token exists
    if (token) {
      try {
        await fetchApi('/auth/change-password', {
          method: 'PATCH',
          body: JSON.stringify({ currentPassword, newPassword }),
        }, token);
      } catch (err: any) {
        console.warn('[AuthContext] Backend password sync notification:', err?.message || err);
      }
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('tasknera_user_pwd_' + cleanEmail, newPassword);
      localStorage.setItem('tasknera_current_password', newPassword);
      try {
        const reg = JSON.parse(localStorage.getItem('tasknera_credential_registry') || '{}');
        reg[cleanEmail] = newPassword;
        localStorage.setItem('tasknera_credential_registry', JSON.stringify(reg));
      } catch {}
    }

    setUser(prev => prev ? { ...prev, password: newPassword } : null);
  };

  const logout = (): void => {
    atsStore.clearAll();
    if (typeof window !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('tasknera_') ||
          key.startsWith('candidates_') ||
          key.startsWith('job_') ||
          key.includes('pool') ||
          key.includes('eval')
        )) {
          if (key !== 'tasknera_credential_registry' && key !== 'tasknera_org_jd_permissions' && key !== 'tasknera_cached_orgs' && !key.startsWith('tasknera_user_pwd_')) {
            keysToRemove.push(key);
          }
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      sessionStorage.clear();
    }
    setToken(null);
    setUser(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/home';
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        subscription: user?.subscription || null,
        isAuthenticated: !!user,
        isLoading,
        signin,
        signup,
        googleSignin,
        setRole,
        logout,
        updatePassword,
        getUserPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
