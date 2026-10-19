/** Los tokens viven como variables CSS en src/styles/tokens.css (UX.md 4.1-4.3). */
const v = (name) => `var(--${name})`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    screens: { sm: '480px', md: '768px', lg: '1024px' },
    extend: {
      colors: {
        bg: v('bg'),
        'bg-muted': v('bg-muted'),
        surface: v('surface'),
        border: v('border'),
        'border-subtle': v('border-subtle'),
        text: v('text'),
        'text-muted': v('text-muted'),
        primary: v('primary'),
        'primary-hover': v('primary-hover'),
        'on-primary': v('on-primary'),
        success: v('success'),
        'success-bg': v('success-bg'),
        danger: v('danger'),
        'danger-bg': v('danger-bg'),
        warning: v('warning'),
        'warning-bg': v('warning-bg'),
        'focus-ring': v('focus-ring'),
        // Color dinamico del comercio (se fija por estilo en linea: style={{'--brand': ...}})
        brand: v('brand'),
        'on-brand': v('on-brand'),
        'brand-ui': v('brand-ui'),
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        xs: ['12px', '16px'],
        sm: ['14px', '20px'],
        base: ['16px', '24px'],
        lg: ['18px', '28px'],
        xl: ['22px', '28px'],
        '2xl': ['28px', '34px'],
      },
      borderRadius: { control: '10px', card: '16px', chip: '999px' },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / .08)' },
      maxWidth: { landing: '420px' },
    },
  },
  plugins: [],
}
