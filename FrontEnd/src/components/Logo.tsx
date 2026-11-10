'use client';

import React from 'react';
import Link from 'next/link';

interface LogoProps {
  href?: string;
  size?: 'sm' | 'md' | 'lg';
  /** 'dark' = charcoal text (on light bg), 'light' = white text (on dark bg) */
  variant?: 'dark' | 'light';
  showTagline?: boolean;
}

const Logo: React.FC<LogoProps> = ({ href = '/home', size = 'md', variant = 'dark', showTagline = true }) => {
  const iconSize  = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-12 h-12' : 'w-9 h-9';
  const textSize  = size === 'sm' ? 'text-lg sm:text-xl'  : size === 'lg' ? 'text-3xl'  : 'text-2xl';
  const tagSize   = size === 'sm' ? 'text-[8px]' : size === 'lg' ? 'text-[10px]' : 'text-[8.5px]';
  const taskColor = variant === 'light' ? 'text-white' : 'text-[#101828]';
  const tagColor  = variant === 'light' ? 'text-[#98A2B3]' : 'text-[#667085]';

  const mark = (
    <div className="flex items-center gap-3 select-none group">
      {/* Official TaskNera Logo Icon */}
      <div className={`${iconSize} flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/tasknera-logo-symbol.png"
          alt="HireIQ by TaskNera"
          className="w-full h-full object-contain"
        />
      </div>

      {/* Wordmark & Hierarchy */}
      <div className="flex flex-col justify-center leading-none">
        {/* Brand Name */}
        <div className={`font-black tracking-tight ${textSize} leading-none flex items-center`}>
          <span className={taskColor}>Hire</span>
          <span className="text-[#3563E9]">IQ</span>
        </div>

        {/* Tagline */}
        {showTagline && (
          <span
            className={`font-bold tracking-[0.14em] uppercase ${tagSize} ${tagColor} mt-1.5 leading-none`}
          >
            Recruitment Intelligence
          </span>
        )}
      </div>
    </div>
  );

  return href ? <Link href={href}>{mark}</Link> : mark;
};

export default Logo;
