/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Hire IQ Enterprise SaaS Theme Tokens ─────────────────────────
        primary: {
          navy:          '#101828',
          'navy-dark':   '#0C111D',
          'navy-surface':'#1D2939',
          'navy-border': '#344054',
          blue:          '#3563E9',
          'blue-hover':  '#2851D6',
          'blue-light':  '#EFF4FF',
          'blue-border': '#D1E0FF',
          DEFAULT:       '#3563E9',
        },
        page:            '#F7F8FC',
        card:            '#FFFFFF',
        text: {
          main:          '#182230',
          secondary:     '#667085',
          muted:         '#98A2B3',
        },
        border: {
          DEFAULT:       '#EAECF0',
          subtle:        '#F2F4F7',
          strong:        '#D0D5DD',
        },
        success: {
          DEFAULT:       '#15966A',
          hover:         '#0F7652',
          light:         '#ECFDF3',
          border:        '#D1FADF',
        },
        warning: {
          DEFAULT:       '#E9A23B',
          hover:         '#C88528',
          light:         '#FEF6EE',
          border:        '#FEDF89',
        },
        danger: {
          DEFAULT:       '#D94848',
          hover:         '#B93838',
          light:         '#FEF3F2',
          border:        '#FECDCA',
        },

        // ── Backward-compatible brand mappings for existing components ────
        brand: {
          // Re-mapped to Royal Blue & Enterprise Navy
          orange:        '#3563E9',
          'orange-hover':'#2851D6',
          'orange-light':'#4E77EC',
          'orange-pale': '#EFF4FF',
          'orange-border':'#D1E0FF',
          blue:          '#3563E9',
          'blue-hover':  '#2851D6',
          'blue-pale':   '#EFF4FF',
          navy:          '#101828',
          charcoal:      '#101828',
          'charcoal-2':  '#182230',
          'charcoal-3':  '#667085',
          bg:            '#F7F8FC',
          'bg-2':        '#EAECF0',
          'bg-card':     '#FFFFFF',
          'bg-elevated': '#F9FAFB',
          white:         '#FFFFFF',
          surface:       '#F9FAFB',
          border:        '#EAECF0',
          'border-2':    '#D0D5DD',
        },
        // ── Status Tokens ───────────────────────────────────────────────
        status: {
          'submit-bg':     '#ECFDF3',
          'submit-text':   '#15966A',
          'submit-border': '#D1FADF',
          'review-bg':     '#FEF6EE',
          'review-text':   '#E9A23B',
          'review-border': '#FEDF89',
          'reject-bg':     '#FEF3F2',
          'reject-text':   '#D94848',
          'reject-border': '#FECDCA',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        '2xs':  '0 1px 2px rgba(16, 24, 40, 0.04)',
        xs:     '0 1px 2px rgba(16, 24, 40, 0.05)',
        sm:     '0 1px 3px rgba(16, 24, 40, 0.08), 0 1px 2px rgba(16, 24, 40, 0.04)',
        card:   '0 1px 3px rgba(16, 24, 40, 0.06), 0 1px 2px rgba(16, 24, 40, 0.04)',
        md:     '0 4px 8px -2px rgba(16, 24, 40, 0.08), 0 2px 4px -2px rgba(16, 24, 40, 0.04)',
        lg:     '0 12px 24px -4px rgba(16, 24, 40, 0.08), 0 4px 8px -2px rgba(16, 24, 40, 0.03)',
        xl:     '0 20px 32px -6px rgba(16, 24, 40, 0.1), 0 8px 12px -4px rgba(16, 24, 40, 0.04)',
        blue:   '0 4px 14px rgba(53, 99, 233, 0.28)',
        'blue-lg': '0 10px 25px -3px rgba(53, 99, 233, 0.32)',
        'blue-glow': '0 0 30px -5px rgba(53, 99, 233, 0.3)',
        orange: '0 4px 14px rgba(53, 99, 233, 0.25)',
        'orange-lg': '0 10px 25px -3px rgba(53, 99, 233, 0.3)',
      },
      borderRadius: {
        lg:  '10px',
        xl:  '12px',
        '2xl': '14px',
        '3xl': '16px',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseSlow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
      animation: {
        float: 'float 4s ease-in-out infinite',
        'pulse-slow': 'pulseSlow 3s ease-in-out infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        scan: 'scanline 2s linear infinite',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms'),
  ],
};
