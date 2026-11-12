import React from 'react';
import Link from 'next/link';
import Logo from './Logo';

interface FooterNavLink {
  label: string;
  href: string;
}

const FOOTER_NAV: {
  product: FooterNavLink[];
  resources: FooterNavLink[];
  company: FooterNavLink[];
} = {
  product: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Jobs', href: '/jobs' },
    { label: 'Candidates', href: '/candidates' },
    { label: 'Evaluations', href: '/evaluations' },
  ],
  resources: [
    { label: 'Documentation', href: '/home' },
    { label: 'Admin Hub', href: '/admin' },
  ],
  company: [
    { label: 'Settings', href: '/settings' },
    { label: 'Book a Demo Session', href: '/contact' },
    { label: 'Contact Us', href: '/contact' },
  ],
};

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#0C111D] text-[#98A2B3] border-t border-[#1D2939] mt-auto selection:bg-[#EFF4FF] selection:text-[#3563E9]">
      {/* Main Footer Container */}
      <div className="max-w-7xl mx-auto px-6 pt-12 pb-8">
        <div className="flex flex-col lg:flex-row justify-between items-start gap-10 lg:gap-16">
          {/* Brand Column (Left) */}
          <div className="max-w-md">
            <Logo href="/home" size="md" variant="light" />
            <p className="text-sm font-semibold text-slate-200 mt-4 tracking-tight">
              Autonomous Talent Evaluation &amp; Bias-Guard Engine
            </p>
            <p className="text-xs text-[#98A2B3] mt-1.5 leading-relaxed">
              Evidence-based candidate evaluation for smarter, faster hiring.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1D2939] border border-[#344054] text-[11px] font-medium text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-[#15966A]"></span>
                Enterprise Recruitment Platform
              </span>
            </div>
          </div>

          {/* Navigation Columns (Right) */}
          <nav aria-label="Footer Navigation" className="grid grid-cols-2 sm:grid-cols-3 gap-8 sm:gap-12 lg:gap-16 w-full lg:w-auto">
            {/* Product Links */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100 mb-3">
                Product
              </h3>
              <ul className="space-y-2.5">
                {FOOTER_NAV.product.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-xs text-slate-400 hover:text-brand-orange transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:rounded"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources Links */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100 mb-3">
                Resources
              </h3>
              <ul className="space-y-2.5">
                {FOOTER_NAV.resources.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-xs text-slate-400 hover:text-brand-orange transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:rounded"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company Links */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100 mb-3">
                Company
              </h3>
              <ul className="space-y-2.5">
                {FOOTER_NAV.company.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-xs text-slate-400 hover:text-brand-orange transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:rounded"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>

        {/* Subtle Divider & Legal / Copyright Row */}
        <div className="mt-10 pt-6 border-t border-slate-800/90 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>© {currentYear} HireIQ by TaskNera. Recruitment Intelligence. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <span className="hover:text-slate-200 transition-colors cursor-pointer">
              Privacy Policy
            </span>
            <span className="hover:text-slate-200 transition-colors cursor-pointer">
              Terms of Service
            </span>
            <span className="hover:text-slate-200 transition-colors cursor-pointer">
              Security
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
