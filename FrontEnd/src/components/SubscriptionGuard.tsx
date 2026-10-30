'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { SubscriptionModelModal } from './SubscriptionModelModal';

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

const PUBLIC_PATHS = [
  '/',
  '/home',
  '/signin',
  '/signup',
  '/how-scoring-works',
];

export const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({ children }) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();

  // If still loading auth state, allow page hydration
  if (isLoading) {
    return <>{children}</>;
  }

  // Public routes should never be blocked by subscription
  const isPublicRoute =
    PUBLIC_PATHS.includes(pathname || '') ||
    (pathname && (pathname.startsWith('/share') || pathname.startsWith('/apply') || pathname.startsWith('/api')));

  if (isPublicRoute) {
    return <>{children}</>;
  }

  // If user is authenticated and their 14-day free trial has expired
  if (isAuthenticated && user?.subscription?.isExpired) {
    return (
      <>
        <SubscriptionModelModal />
        <div className="hidden" aria-hidden="true">
          {children}
        </div>
      </>
    );
  }

  return <>{children}</>;
};

