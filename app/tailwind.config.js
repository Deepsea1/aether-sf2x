/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
  			// Aether deep-space surfaces + text scale — see src/index.css :root and
  			// src/lib/design/tokens.js. Every value here is a var() so the CSS, the JS
  			// tokens and the WebGL layer can never hold three different opinions.
  			aether: {
  				void: 'var(--aether-void)',
  				surface: 'var(--aether-surface)',
  				raised: 'var(--aether-raised)',
  				inset: 'var(--aether-inset)',
  				focus: 'var(--aether-focus)',
  				line: 'var(--aether-line)',
  				'line-strong': 'var(--aether-line-strong)',
  				// Text scale. `muted` is #78879E (5.26:1 on the card) — reach for this
  				// rather than slate-500, which measures 4.03:1 and fails AA here.
  				text: 'var(--aether-text)',
  				'text-dim': 'var(--aether-text-dim)',
  				'text-muted': 'var(--aether-text-muted)'
  			},
  			// Epistemic state colours. Never use one of these without its icon + label
  			// (the visual law) — reach for <EpistemicBadge /> first.
  			state: {
  				supported: 'var(--state-supported)',
  				qualified: 'var(--state-qualified)',
  				contested: 'var(--state-contested)',
  				unsupported: 'var(--state-unsupported)',
  				unknown: 'var(--state-unknown)',
  				hypothesis: 'var(--state-hypothesis)',
  				stale: 'var(--state-stale)',
  				revoked: 'var(--state-revoked)',
  				blocked: 'var(--state-blocked)'
  			}
  		},
  		fontFamily: {
  			heading: ['var(--font-heading)'],
  			body: ['var(--font-body)'],
  			display: ['var(--font-display)'],
  			mono: ['var(--font-mono)']
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			// Ambient motion for the cosmos/proof surfaces. All three are neutralised by the
  			// prefers-reduced-motion block in src/index.css — they carry mood, never meaning.
  			'aether-scan': {
  				'0%': { transform: 'translateY(-110%)', opacity: '0' },
  				'12%': { opacity: '1' },
  				'88%': { opacity: '1' },
  				'100%': { transform: 'translateY(110%)', opacity: '0' }
  			},
  			'aether-pulse': {
  				'0%, 100%': { opacity: '0.45' },
  				'50%': { opacity: '1' }
  			},
  			'aether-drift': {
  				from: { transform: 'translate3d(0, 0, 0)' },
  				to: { transform: 'translate3d(-2%, 1.5%, 0)' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'aether-scan': 'aether-scan 5.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  			'aether-pulse': 'aether-pulse 2.6s ease-in-out infinite',
  			'aether-drift': 'aether-drift 24s ease-in-out infinite alternate'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
