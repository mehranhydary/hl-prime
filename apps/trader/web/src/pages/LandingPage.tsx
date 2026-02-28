import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle'
/* ── Feature cards with photo backgrounds ── */
const FEATURE_CARDS = [
	{
		title: 'Smart Order Routing',
		description:
			'Split orders across deployer markets for the best fill price.',
		img: '/jt/2.png',
	},
	{
		title: 'Cross-Collateral Trading',
		description:
			'Trade any market with any collateral. Auto swaps handle the rest.',
		img: '/jt/8.png',
	},
	{
		title: 'Native + HIP-3 Markets',
		description:
			'Access native perps and HIP-3 deployer markets in one interface.',
		img: '/jt/7.png',
	},
	{
		title: 'Agent Wallet Delegation',
		description:
			'Agents trade on your behalf. They can never withdraw your funds.',
		img: '/jt/1.png',
	},
	{
		title: 'Execution Monitoring',
		description:
			'Track every order leg. See fills, resting orders, and execution quality.',
		img: '/jt/4.png',
	},
	{
		title: 'Real-Time Book Aggregation',
		description:
			'Aggregated orderbooks from multiple deployers for deeper liquidity.',
		img: '/jt/5.png',
	},
]

/* ── Comparison table ── */
const COMPARISON = [
	{ feature: 'Self-Custody', prime: true, cex: false },
	{ feature: 'Smart Order Routing', prime: true, cex: false },
	{ feature: 'Cross-Collateral', prime: true, cex: 'Limited' },
	{ feature: 'HIP-3 Markets', prime: true, cex: false },
	{ feature: 'Agent Delegation', prime: true, cex: false },
	{ feature: 'No KYC Required', prime: true, cex: false },
	{ feature: 'Real-Time Execution', prime: true, cex: true },
	{ feature: 'Low Fees', prime: true, cex: 'Varies' },
]

/* ── FAQ items ── */
const FAQ_ITEMS = [
	{
		q: 'What is Prime?',
		a: 'Prime is a prime brokerage SDK and trading interface built on Hyperliquid. It provides smart order routing, cross-collateral trading, and orderbook aggregation across native and HIP-3 deployer markets.',
	},
	{
		q: 'Is Prime decentralized?',
		a: "Yes. Prime runs entirely on Hyperliquid's decentralized infrastructure. Your funds stay in your own wallet, and agent wallets can only trade — they can never withdraw your assets.",
	},
	{
		q: 'What markets can I trade?',
		a: 'You can trade all native Hyperliquid perpetuals (BTC, ETH, SOL, etc.) as well as HIP-3 deployer markets including real-world assets like AAPL, TSLA, NVDA, GOLD, and more.',
	},
	{
		q: 'How does agent delegation work?',
		a: 'You generate an agent wallet and approve it from your master wallet via EIP-712 signing. The agent wallet can place and cancel orders on your behalf, but cannot withdraw funds. Your keys stay safe.',
	},
	{
		q: 'What is smart order routing?',
		a: "When multiple deployer markets exist for the same asset, Prime's router splits your order across them to minimize slippage and get the best aggregate fill price.",
	},
	{
		q: 'Do I need to deposit collateral for HIP-3 markets?',
		a: 'HIP-3 markets may require specific collateral tokens. Prime automatically handles collateral swaps — if you hold USDC, it can swap to the required token before placing your trade.',
	},
]

/* ── FAQ Accordion Item ── */
function FaqItem({ q, a }: { q: string; a: string }) {
	const [open, setOpen] = useState(false)
	return (
		<div className='border-b border-border'>
			<button
				onClick={() => setOpen(!open)}
				className='w-full flex items-center justify-between py-5 text-left group cursor-pointer'
			>
				<span className='text-text-primary text-base font-medium group-hover:text-accent transition-colors'>
					{q}
				</span>
				<svg
					viewBox='0 0 24 24'
					fill='none'
					stroke='currentColor'
					strokeWidth={2}
					className={`w-4 h-4 text-text-muted flex-shrink-0 ml-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
				>
					<path
						strokeLinecap='round'
						strokeLinejoin='round'
						d='m19.5 8.25-7.5 7.5-7.5-7.5'
					/>
				</svg>
			</button>
			<div
				className='overflow-hidden transition-all duration-300'
				style={{ maxHeight: open ? 200 : 0, opacity: open ? 1 : 0 }}
			>
				<p className='pb-5 text-text-muted text-sm leading-relaxed'>
					{a}
				</p>
			</div>
		</div>
	)
}

/* ══════════════════════════════════════════════════════════
   Landing Page
   ══════════════════════════════════════════════════════════ */
export function LandingPage() {
	return (
		<div className='min-h-screen bg-surface-0 text-text-primary overflow-hidden'>
			{/* ─── Floating Header ─── */}
			<header
				className='fixed top-0 left-0 right-0 z-50 backdrop-blur-md'
				style={{
					background:
						'color-mix(in srgb, var(--color-surface-0) 80%, transparent)',
				}}
			>
				<div className='max-w-6xl mx-auto px-6 h-16 flex items-center justify-between'>
					<div className='flex items-center gap-6'>
						<Link to='/' className='flex items-center gap-2'>
							<span className='text-3xl leading-none text-accent font-logo'>
								P
							</span>
						</Link>
						<nav className='hidden sm:flex items-center gap-4 text-xs text-text-muted'>
							<a
								href='#features'
								className='hover:text-text-primary transition-colors'
							>
								Features
							</a>
							<a
								href='#compare'
								className='hover:text-text-primary transition-colors'
							>
								Compare
							</a>
							<a
								href='#faq'
								className='hover:text-text-primary transition-colors'
							>
								FAQ
							</a>
						</nav>
					</div>
					<div className='flex items-center gap-3'>
						<ThemeToggle />
						<Link
							to='/markets'
							className='bg-accent hover:bg-accent/90 text-surface-0 text-sm font-medium px-5 py-2 transition-colors'
						>
							Launch App
						</Link>
					</div>
				</div>
			</header>

			{/* ─── Hero ─── */}
			<section className='relative pt-40 pb-24 px-6'>
				{/* Glow background */}
				<div
					className='absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] pointer-events-none'
					style={{
						background:
							'radial-gradient(ellipse at center, rgba(80,227,181,0.10) 0%, transparent 70%)',
					}}
				/>
				<div className='relative max-w-3xl mx-auto text-center'>
					<div className='inline-flex items-center gap-2 px-3 py-1 mb-6 border border-border text-xs text-text-muted rounded-full'>
						<span className='w-1.5 h-1.5 rounded-full bg-long animate-pulse' />
						Built on Hyperliquid
					</div>
					<h1 className='text-5xl sm:text-7xl font-bold leading-[1.05] tracking-tight mb-6 font-heading'>
						Trade smarter
						<br />
						<span className='landing-gradient-text'>
							across every market
						</span>
					</h1>
					<p className='text-lg sm:text-xl text-text-muted max-w-xl mx-auto mb-10 leading-relaxed'>
						Prime brokerage for Hyperliquid. Smart order routing,
						cross-collateral trading, and real-time book aggregation
						— all from one interface.
					</p>
					<div className='flex items-center justify-center gap-4'>
						<Link
							to='/markets'
							className='bg-accent hover:bg-accent/90 text-surface-0 font-medium px-8 py-3 text-base transition-colors'
						>
							Start Trading
						</Link>
						<a
							href='#features'
							className='border border-border hover:border-text-dim text-text-secondary font-medium px-8 py-3 text-base transition-colors'
						>
							Learn More
						</a>
					</div>
				</div>
			</section>

			{/* ─── Features — colorful card grid ─── */}
			<section id='features' className='py-24 px-6'>
				<div className='max-w-3xl mx-auto'>
					<div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
						{FEATURE_CARDS.map((card) => (
							<div
								key={card.title}
								className='relative overflow-hidden aspect-square flex flex-col justify-end transition-transform hover:scale-[1.01]'
							>
								{/* Background image with green hue shift */}
								<div
									className='absolute inset-0 z-0'
									style={{
										backgroundImage: `url(${card.img})`,
										backgroundSize: 'cover',
										backgroundPosition: 'center',
										filter: 'saturate(0.6) sepia(0.3) hue-rotate(90deg) brightness(0.9)',
									}}
								/>
								{/* Green tint overlay */}
								<div
									className='absolute inset-0 z-[1] pointer-events-none'
									style={{
										background: 'rgba(30, 160, 100, 0.45)',
										mixBlendMode: 'color',
									}}
								/>
								{/* Bottom text with scrim */}
								<div
									className='relative z-10 p-6'
									style={{
										background:
											'linear-gradient(to top, rgba(10,26,20,0.7) 0%, rgba(10,26,20,0.3) 60%, transparent 100%)',
									}}
								>
									<h3 className='text-xl sm:text-2xl font-bold text-white leading-tight mb-1 font-heading'>
										{card.title}
									</h3>
									<p className='text-sm text-white/80 leading-relaxed max-w-xs'>
										{card.description}
									</p>
								</div>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ─── Stats ─── */}
			<section className='py-16 px-6 border-y border-border'>
				<div className='max-w-4xl mx-auto grid grid-cols-3 gap-8 text-center'>
					<div>
						<div className='text-3xl sm:text-4xl font-bold text-accent mb-1 font-heading'>
							50+
						</div>
						<div className='text-xs sm:text-sm text-text-muted uppercase tracking-wider'>
							Perp Markets
						</div>
					</div>
					<div>
						<div className='text-3xl sm:text-4xl font-bold text-accent mb-1 font-heading'>
							100+
						</div>
						<div className='text-xs sm:text-sm text-text-muted uppercase tracking-wider'>
							HIP-3 Assets
						</div>
					</div>
					<div>
						<div className='text-3xl sm:text-4xl font-bold text-accent mb-1 font-heading'>
							0
						</div>
						<div className='text-xs sm:text-sm text-text-muted uppercase tracking-wider'>
							KYC Required
						</div>
					</div>
				</div>
			</section>

			{/* ─── Comparison ─── */}
			<section id='compare' className='py-24 px-6'>
				<div className='max-w-3xl mx-auto'>
					<div className='text-center mb-12'>
						<h2 className='text-3xl sm:text-4xl font-bold mb-4 font-heading'>
							Better than CEX
						</h2>
						<p className='text-text-muted text-lg'>
							DeFi transparency with a trading experience that
							rivals centralized exchanges.
						</p>
					</div>
					<div className='border border-border overflow-hidden'>
						{/* Header row */}
						<div className='grid grid-cols-3 bg-surface-2 text-xs uppercase tracking-wider text-text-dim font-medium'>
							<div className='px-5 py-3'>Feature</div>
							<div className='px-5 py-3 text-center'>Prime</div>
							<div className='px-5 py-3 text-center'>CEX</div>
						</div>
						{COMPARISON.map((row, i) => (
							<div
								key={row.feature}
								className={`grid grid-cols-3 text-sm ${i % 2 === 0 ? 'bg-surface-1' : 'bg-surface-0'}`}
							>
								<div className='px-5 py-3.5 text-text-secondary'>
									{row.feature}
								</div>
								<div className='px-5 py-3.5 text-center'>
									{row.prime === true ? (
										<span className='text-long'>
											&#10003;
										</span>
									) : (
										<span className='text-text-dim'>
											&mdash;
										</span>
									)}
								</div>
								<div className='px-5 py-3.5 text-center'>
									{row.cex === true ? (
										<span className='text-long'>
											&#10003;
										</span>
									) : row.cex === false ? (
										<span className='text-short'>
											&#10005;
										</span>
									) : (
										<span className='text-text-dim'>
											{row.cex}
										</span>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ─── FAQ ─── */}
			<section id='faq' className='py-24 px-6 border-t border-border'>
				<div className='max-w-2xl mx-auto'>
					<h2 className='text-3xl sm:text-4xl font-bold text-center mb-12 font-heading'>
						FAQ
					</h2>
					<div>
						{FAQ_ITEMS.map((item) => (
							<FaqItem key={item.q} q={item.q} a={item.a} />
						))}
					</div>
				</div>
			</section>

			{/* ─── CTA ─── */}
			<section className='py-24 px-6'>
				<div className='max-w-2xl mx-auto text-center'>
					<h2 className='text-3xl sm:text-4xl font-bold mb-4 font-heading'>
						Ready to trade?
					</h2>
					<p className='text-text-muted text-lg mb-8'>
						Connect your wallet and start trading on Hyperliquid.
					</p>
					<Link
						to='/markets'
						className='inline-block bg-accent hover:bg-accent/90 text-surface-0 font-medium px-10 py-3.5 text-base transition-colors'
					>
						Launch App
					</Link>
				</div>
			</section>

			{/* ─── Footer ─── */}
			<footer className='border-t border-border py-10 px-6'>
				<div className='max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4'>
					<div className='flex items-center gap-2'>
						<span className='text-2xl text-accent font-logo'>
							P
						</span>
						<span className='text-sm text-text-dim'>Prime</span>
					</div>
					<div className='flex items-center gap-6 text-xs text-text-dim'>
						<a
							href='#features'
							className='hover:text-text-muted transition-colors'
						>
							Features
						</a>
						<a
							href='#compare'
							className='hover:text-text-muted transition-colors'
						>
							Compare
						</a>
						<a
							href='#faq'
							className='hover:text-text-muted transition-colors'
						>
							FAQ
						</a>
					</div>
					<div className='text-xs text-text-dim'>
						&copy; {new Date().getFullYear()} Prime
					</div>
				</div>
			</footer>
		</div>
	)
}
