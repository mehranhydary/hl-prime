import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle'

const FEATURES = [
	{ id: '01', label: 'Routing', description: 'Smart order splitting across deployer markets for the best fill price.' },
	{ id: '02', label: 'Collateral', description: 'Cross-collateral with automatic swaps. Trade any market with any token.' },
	{ id: '03', label: 'Aggregation', description: 'Real-time book aggregation across deployers for deeper liquidity.' },
	{ id: '04', label: 'Delegation', description: 'Agent wallets trade on your behalf but can never withdraw your funds.' },
	{ id: '05', label: 'HIP-3', description: 'Access native perps and HIP-3 deployer markets in one interface.' },
	{ id: '06', label: 'Monitoring', description: 'Track every order leg. See fills, resting orders, and execution quality.' },
]

const SHOWCASE_IMAGES = [
	{
		src: '/jt/1.png',
		title: 'Agent Delegation',
		category: 'Security',
		description: 'Generate an agent wallet and approve it via EIP-712 signing. The agent trades on your behalf but can never withdraw. Your keys stay safe.',
	},
	{
		src: '/jt/2.png',
		title: 'Order Routing',
		category: 'Execution',
		description: 'When multiple deployer markets exist for the same asset, Prime splits your order across them to minimize slippage and get the best aggregate fill.',
	},
	{
		src: '/jt/3.png',
		title: 'Book Depth',
		category: 'Liquidity',
		description: 'See aggregated orderbook depth across all deployers. Deeper liquidity means tighter spreads and better fills for your trades.',
	},
	{
		src: '/jt/4.png',
		title: 'Fill Monitoring',
		category: 'Analytics',
		description: 'Track every order leg in real-time. Monitor fills, resting orders, and execution quality across all your positions.',
	},
	{
		src: '/jt/5.png',
		title: 'Aggregated Books',
		category: 'Data',
		description: 'Unified orderbooks from multiple deployers displayed in one view. Compare depth, spreads, and liquidity at a glance.',
	},
]

const STATS = [
	{ value: '150+', label: 'Markets' },
	{ value: 'Cross', label: 'Collateral' },
	{ value: 'Self', label: 'Custody' },
	{ value: '0', label: 'KYC' },
]

const COMPARISON = [
	{ feature: 'Self-Custody', prime: true, cex: false },
	{ feature: 'Smart Routing', prime: true, cex: false },
	{ feature: 'Cross-Collateral', prime: true, cex: false },
	{ feature: 'HIP-3 Markets', prime: true, cex: false },
	{ feature: 'No KYC', prime: true, cex: false },
	{ feature: 'Low Fees', prime: true, cex: false },
]

export function LandingPage2() {
	const [activeFeature, setActiveFeature] = useState(0)
	const [currentSlide, setCurrentSlide] = useState(0)

	const nextSlide = useCallback(
		() => setCurrentSlide((p) => (p + 1) % SHOWCASE_IMAGES.length),
		[],
	)
	const prevSlide = useCallback(
		() => setCurrentSlide((p) => (p - 1 + SHOWCASE_IMAGES.length) % SHOWCASE_IMAGES.length),
		[],
	)

	// Keyboard navigation: left/right arrows
	useEffect(() => {
		function handleKey(e: KeyboardEvent) {
			if (e.key === 'ArrowRight') nextSlide()
			else if (e.key === 'ArrowLeft') prevSlide()
		}
		window.addEventListener('keydown', handleKey)
		return () => window.removeEventListener('keydown', handleKey)
	}, [nextSlide, prevSlide])

	const slide = SHOWCASE_IMAGES[currentSlide]

	return (
		<div className='landing-editorial min-h-screen bg-surface-0 text-text-primary'>
			{/* ══════ TOP NAV BAR ══════ */}
			<header className='landing-top-bar'>
				<div className='flex items-center gap-6'>
					<Link to='/' className='flex items-center gap-2'>
						<span className='text-2xl leading-none text-accent font-logo'>P</span>
					</Link>
					<nav className='hidden sm:flex items-center gap-4'>
						<a href='#features' className='landing-nav-link'>Features</a>
						<a href='#compare' className='landing-nav-link'>Compare</a>
						<a href='#contact' className='landing-nav-link'>Contact</a>
					</nav>
				</div>
				<div className='landing-title-bar'>
					<span className='landing-display-xl'>Prime</span>
					<span className='landing-title-rule' />
					<span className='landing-display-xl text-text-muted' style={{ fontSize: 'clamp(14px, 2.5vw, 24px)', fontWeight: 300, letterSpacing: '0.06em' }}>
						built on Hyperliquid
					</span>
				</div>
				<div className='flex items-center gap-3'>
					<ThemeToggle />
					<Link to='/markets' className='landing-cta-header'>
						Launch App
					</Link>
				</div>
			</header>

			{/* ══════ MAIN GRID ══════ */}
			<main className='landing-grid' id='features'>
				{/* ── Left sidebar ── */}
				<aside className='landing-sidebar-left'>
					<div className='landing-meta-label'>Hyperliquid Prime Brokerage</div>
					<div className='landing-feature-list'>
						{FEATURES.map((f, i) => (
							<button
								key={f.id}
								onClick={() => setActiveFeature(i)}
								className={`landing-feature-item ${activeFeature === i ? 'active' : ''}`}
							>
								<span className='landing-feature-id'>[{f.id}]</span>
								<span className='landing-feature-label'>{f.label}</span>
							</button>
						))}
					</div>
					<p className='landing-feature-desc'>
						{FEATURES[activeFeature].description}
					</p>
				</aside>

				{/* ── Center hero ── */}
				<div className='landing-hero'>
					{/* Glow gradient */}
					<div className='landing-hero-glow' />

					{/* Built on Hyperliquid badge */}
					<div className='landing-hero-badge'>
						<span className='landing-hero-badge-dot' />
						Built on Hyperliquid
					</div>

					{/* Slide image with fade transition */}
					<div className='landing-hero-image-wrap'>
						{SHOWCASE_IMAGES.map((img, i) => (
							<img
								key={img.src}
								src={img.src}
								alt={img.title}
								className={`landing-hero-image ${i === currentSlide ? 'active' : ''}`}
							/>
						))}
					</div>
				</div>

				{/* ── Right sidebar ── */}
				<aside className='landing-sidebar-right'>
					<div className='landing-meta-block'>
						<div className='landing-meta-title'>
							{slide.title}
						</div>
						<div className='landing-meta-row'>
							<span className='landing-meta-key'>[Category]</span>
							<span className='landing-meta-value'>{slide.category}</span>
						</div>
						<div className='landing-meta-row'>
							<span className='landing-meta-key'>[Chain]</span>
							<span className='landing-meta-value'>Hyperliquid L1</span>
						</div>
						<div className='landing-meta-row'>
							<span className='landing-meta-key'>[Markets]</span>
							<span className='landing-meta-value'>Native + HIP-3</span>
						</div>
						<div className='landing-meta-row'>
							<span className='landing-meta-key'>[Custody]</span>
							<span className='landing-meta-value'>Self-Custody</span>
						</div>
					</div>

					<div className='landing-right-text'>
						<p>{slide.description}</p>
					</div>

					{/* Stats strip */}
					<div className='landing-stats-strip'>
						{STATS.map((s) => (
							<div key={s.label} className='landing-stat'>
								<span className='landing-stat-value'>{s.value}</span>
								<span className='landing-stat-label'>{s.label}</span>
							</div>
						))}
					</div>
				</aside>
			</main>

			{/* ══════ COMPARISON STRIP ══════ */}
			<section className='landing-compare' id='compare'>
				<div className='landing-compare-header'>
					<span className='landing-compare-title'>Prime vs CEX</span>
				</div>
				<div className='landing-compare-grid'>
					{COMPARISON.map((row) => (
						<div key={row.feature} className='landing-compare-cell'>
							<span className='landing-compare-feature'>{row.feature}</span>
							<span className='landing-compare-check'>&#10003;</span>
							<span className='landing-compare-x'>&#10005;</span>
						</div>
					))}
				</div>
			</section>

			{/* ══════ BOTTOM BAR ══════ */}
			<footer className='landing-bottom' id='contact'>
				{/* Left: contact info + social links */}
				<div className='landing-contact'>
					<div className='landing-contact-row'>
						<span className='landing-contact-key'>[Source]</span>
						<a href='https://github.com/mehranhydary/hl-prime' className='landing-contact-value landing-contact-link' target='_blank' rel='noopener noreferrer'>
							GitHub
						</a>
					</div>
					<div className='landing-contact-row'>
						<span className='landing-contact-key'>[Chain]</span>
						<span className='landing-contact-value'>Hyperliquid L1</span>
					</div>
					<div className='landing-contact-row'>
						<span className='landing-contact-key'>[Type]</span>
						<span className='landing-contact-value'>Prime Brokerage SDK</span>
					</div>
					{/* Social links */}
					<div className='landing-social-links'>
						<a href='https://x.com/mehranhydary' target='_blank' rel='noopener noreferrer' className='landing-social-link' title='X / Twitter'>
							<svg width='14' height='14' viewBox='0 0 24 24' fill='currentColor'>
								<path d='M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' />
							</svg>
						</a>
						<a href='https://github.com/mehranhydary/hl-prime' target='_blank' rel='noopener noreferrer' className='landing-social-link' title='GitHub'>
							<svg width='14' height='14' viewBox='0 0 24 24' fill='currentColor'>
								<path d='M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z' />
							</svg>
						</a>
					</div>
				</div>

				{/* Center: logo + branding */}
				<div className='landing-name-block'>
					<span className='text-accent font-logo' style={{ fontSize: 'clamp(48px, 8vw, 120px)', lineHeight: 1 }}>
						P
					</span>
					<span className='landing-name-rule' />
					<span className='landing-display-xxl'>
						Prime
					</span>
				</div>

				{/* Right: CTA + navigation */}
				<div className='landing-bottom-right'>
					<Link to='/markets' className='landing-cta'>
						Launch App
					</Link>
					<div className='landing-slide-nav'>
						<button onClick={prevSlide} className='landing-slide-btn'>
							&larr; Prev
						</button>
						<span className='landing-slide-counter'>
							{String(currentSlide + 1).padStart(2, '0')} / {String(SHOWCASE_IMAGES.length).padStart(2, '0')}
						</span>
						<button onClick={nextSlide} className='landing-slide-btn'>
							Next &rarr;
						</button>
					</div>
				</div>
			</footer>

			{/* ══════ MOBILE STICKY CTA ══════ */}
			<div className='landing-mobile-cta'>
				<Link to='/markets' className='landing-mobile-cta-btn'>
					Launch App
				</Link>
			</div>
		</div>
	)
}
