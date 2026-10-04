/** Defines the semantic theme utilities used by application components. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-raised': 'rgb(var(--color-surface-raised) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        'accent-contrast': 'rgb(var(--color-accent-contrast) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        chart: 'rgb(var(--color-chart) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}
