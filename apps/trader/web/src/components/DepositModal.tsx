import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useTheme } from '../lib/theme-context'

interface DepositModalProps {
	address: string
	onClose: () => void
}

export function DepositModal({ address, onClose }: DepositModalProps) {
	const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
	const [copied, setCopied] = useState(false)
	const { theme } = useTheme()

	useEffect(() => {
		QRCode.toDataURL(address, {
			margin: 2,
			width: 400,
			color: {
				dark: theme === 'dark' ? '#e2e8f0' : '#111827',
				light: '#00000000',
			},
		}).then(setQrDataUrl)
	}, [address, theme])

	const copyAddress = async () => {
		await navigator.clipboard.writeText(address)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<div
			className='fixed inset-0 z-[10001] flex items-center justify-center'
			onClick={onClose}
		>
			{/* Backdrop */}
			<div className='absolute inset-0 bg-black/60 backdrop-blur-sm' />

			{/* Modal */}
			<div
				className='relative bg-surface-1 border border-border w-full max-w-sm mx-4 p-6'
				onClick={(e) => e.stopPropagation()}
			>
				{/* Close button */}
				<button
					onClick={onClose}
					className='absolute top-3 right-3 text-text-muted hover:text-text-primary transition-colors'
				>
					<svg
						className='w-5 h-5'
						fill='none'
						viewBox='0 0 24 24'
						stroke='currentColor'
						strokeWidth={2}
					>
						<path
							strokeLinecap='round'
							strokeLinejoin='round'
							d='M6 18L18 6M6 6l12 12'
						/>
					</svg>
				</button>

				<h2 className='text-lg font-semibold text-text-primary font-heading mb-1'>
					Deposit
				</h2>
				<p className='text-text-muted text-xs mb-5'>
					Send supported assets on Hyperliquid to your address below.
				</p>

				<div className='flex flex-col items-center gap-4'>
					{/* QR Code */}
					{qrDataUrl ? (
						<img
							src={qrDataUrl}
							alt='Deposit QR code'
							className='w-[200px] h-[200px]'
						/>
					) : (
						<div className='w-[200px] h-[200px] animate-pulse bg-surface-3' />
					)}

					{/* Address */}
					<div className='w-full'>
						<label className='text-[10px] text-text-muted uppercase tracking-wider mb-1 block'>
							Your Address
						</label>
						<div className='flex items-center gap-2'>
							<span className='flex-1 bg-surface-2 border border-border px-3 py-2 text-xs text-text-primary break-all select-all'>
								{address}
							</span>
							<button
								onClick={copyAddress}
								className='shrink-0 bg-surface-2 hover:bg-surface-3 border border-border px-3 py-2 text-xs text-text-muted transition-colors'
							>
								{copied ? 'Copied' : 'Copy'}
							</button>
						</div>
					</div>

					{/* Info */}
					<div className='w-full bg-accent-muted border border-accent/20 p-3 text-xs text-text-muted leading-relaxed'>
						<div className='flex items-center gap-1.5 mb-2.5'>
							<span className='font-semibold text-accent'>
								Network:
							</span>
							<span className='text-text-primary'>
								Hyperliquid L1
							</span>
						</div>
						<div>
							<span className='font-semibold text-accent block mb-1.5'>
								Accepted assets
							</span>
							<div className='flex flex-wrap gap-1.5'>
								{(
									['USDC', 'USDT', 'USDE', 'USDH'] as const
								).map((asset) => (
									<span
										key={asset}
										className='inline-flex items-center gap-1.5 bg-surface-2 border border-border px-2 py-1 text-[11px] text-text-primary'
									>
										<img
											src={`/collateral/${asset.toLowerCase()}.png`}
											alt={asset}
											className='w-4 h-4 rounded-full'
										/>
										{asset}
									</span>
								))}
							</div>
						</div>
						<span className='text-text-dim mt-2.5 block text-[10px]'>
							Other networks are not supported at this time.
						</span>
					</div>
				</div>
			</div>
		</div>
	)
}
