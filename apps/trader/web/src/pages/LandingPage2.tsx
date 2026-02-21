import { useState } from 'react'
import { Link } from 'react-router-dom'

const FEATURES = [
	{ id: '01', label: 'Routing', description: 'Smart order splitting across deployer markets' },
	{ id: '02', label: 'Collateral', description: 'Cross-collateral with automatic swaps' },
	{ id: '03', label: 'Aggregation', description: 'Real-time book aggregation for deeper liquidity' },
]

const SHOWCASE_IMAGES = [
	{ src: '/jt/1.png', title: 'Agent Delegation', category: 'Security' },
	{ src: '/jt/2.png', title: 'Order Routing', category: 'Execution' },
	{ src: '/jt/3.png', title: 'Book Depth', category: 'Liquidity' },
	{ src: '/jt/4.png', title: 'Fill Monitoring', category: 'Analytics' },
	{ src: '/jt/5.png', title: 'Aggregated Books', category: 'Data' },
]

export function LandingPage2() {
	const [activeFeature, setActiveFeature] = useState(0)
	const [currentSlide, setCurrentSlide] = useState(0)

	const nextSlide = () => setCurrentSlide((p) => (p + 1) % SHOWCASE_IMAGES.length)
	const prevSlide = () => setCurrentSlide((p) => (p - 1 + SHOWCASE_IMAGES.length) % SHOWCASE_IMAGES.length)

	return (
		<div className='landing-editorial min-h-screen bg-surface-0 text-text-primary'>
			{/* ══════ TOP NAV BAR ══════ */}
			<header className='landing-top-bar'>
				<nav className='flex items-center gap-8' />
				<div className='landing-title-bar'>
					<span className='landing-display-xl'>Prime</span>
					<span className='landing-title-rule' />
					<span className='landing-display-xl'>Brokerage</span>
				</div>
			</header>

			{/* ══════ MAIN GRID ══════ */}
			<main className='landing-grid'>
				{/* ── Left sidebar ── */}
				<aside className='landing-sidebar-left'>
					<div className='landing-meta-label'>Hyperliquid</div>
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
					<div className='landing-hero-image-wrap'>
						<img
							src={SHOWCASE_IMAGES[currentSlide].src}
							alt={SHOWCASE_IMAGES[currentSlide].title}
							className='landing-hero-image'
						/>
					</div>
				</div>

				{/* ── Right sidebar ── */}
				<aside className='landing-sidebar-right'>
					<div className='landing-meta-block'>
						<div className='landing-meta-title'>
							{SHOWCASE_IMAGES[currentSlide].title}
						</div>
						<div className='landing-meta-row'>
							<span className='landing-meta-key'>[Type]</span>
							<span className='landing-meta-value'>SDK</span>
						</div>
						<div className='landing-meta-row'>
							<span className='landing-meta-key'>[Category]</span>
							<span className='landing-meta-value'>DeFi</span>
						</div>
						<div className='landing-meta-row'>
							<span className='landing-meta-key'>[Chain]</span>
							<span className='landing-meta-value'>Hyperliquid</span>
						</div>
						<div className='landing-meta-row'>
							<span className='landing-meta-key'>[Status]</span>
							<span className='landing-meta-value'>Live</span>
						</div>
					</div>

					<div className='landing-right-text'>
						<p>Smart order routing splits your trade across multiple deployer markets for optimal fills.</p>
						<p>Cross-collateral trading lets you trade any market with any token. Auto-swaps handle conversions.</p>
						<p>Agent wallets trade on your behalf but can never withdraw your funds. Self-custody stays intact.</p>
					</div>
				</aside>
			</main>

			{/* ══════ BOTTOM BAR ══════ */}
			<footer className='landing-bottom' id='contact'>
				{/* Left: contact info */}
				<div className='landing-contact'>
					<div className='landing-contact-row'>
						<span className='landing-contact-key'>[Docs]</span>
						<a href='https://github.com/mehranhydary/hl-prime' className='landing-contact-value' target='_blank' rel='noopener noreferrer'>
							github.com/mehranhydary/hl-prime
						</a>
					</div>
					<div className='landing-contact-row'>
						<span className='landing-contact-key'>[Chain]</span>
						<span className='landing-contact-value'>Hyperliquid L1</span>
					</div>
				</div>

				{/* Center: large name */}
				<div className='landing-name-block'>
					<span className='landing-display-xxl'>
						Hyper<em>liquid</em>
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
		</div>
	)
}
