import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'dv-bg':      'var(--dv-bg)',
        'dv-surface': 'var(--dv-surface)',
        'dv-border':  'var(--dv-border)',
        'dv-text':    'var(--dv-text)',
        'dv-muted':   'var(--dv-muted)',
        'dv-accent':  'var(--dv-accent)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
export default config;
