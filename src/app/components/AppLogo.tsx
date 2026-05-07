import { useId } from 'react';

type AppLogoProps = {
	className?: string;
	size?: number;
	iconOnly?: boolean;
};

export function AppLogo({ className = '', size = 24, iconOnly = false }: AppLogoProps) {
	const uid = useId().replace(/:/g, 'u');

	const icon = (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={iconOnly ? className : 'relative z-10 w-full h-full'}
			style={iconOnly ? { width: size, height: size, display: 'block' } : { display: 'block' }}
		>
			<defs>
				<linearGradient id={`${uid}-arc`} x1="3.5" y1="2.5" x2="20.5" y2="21" gradientUnits="userSpaceOnUse">
					<stop offset="0%" stopColor="#4C1D95" />
					<stop offset="45%" stopColor="#7C3AED" />
					<stop offset="100%" stopColor="#0EA5E9" />
				</linearGradient>
				<linearGradient id={`${uid}-es`} x1="14" y1="15" x2="22.5" y2="15" gradientUnits="userSpaceOnUse">
					<stop offset="0%" stopColor="#8B5CF6" />
					<stop offset="100%" stopColor="#22D3EE" />
				</linearGradient>
				<radialGradient id={`${uid}-glow`} cx="12" cy="15" r="4" gradientUnits="userSpaceOnUse">
					<stop offset="0%" stopColor="#A78BFA" stopOpacity="0.95" />
					<stop offset="55%" stopColor="#7C3AED" stopOpacity="0.35" />
					<stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
				</radialGradient>
			</defs>

			<path d="M 3.5 21 C 3.5 9 7.5 2.5 12 2.5 C 16.5 2.5 20.5 9 20.5 21" stroke={`url(#${uid}-arc)`} strokeWidth="1.5" strokeLinecap="round" fill="none" />
			<line x1="1.5" y1="15" x2="9.8" y2="15" stroke="#EFF6FF" strokeWidth="1.4" strokeLinecap="round" opacity="0.82" />
			<line x1="14.2" y1="15" x2="22.5" y2="15" stroke={`url(#${uid}-es)`} strokeWidth="1.4" strokeLinecap="round" />
			<line x1="2.5" y1="18.5" x2="7.5" y2="18.5" stroke="#EFF6FF" strokeWidth="1" strokeLinecap="round" opacity="0.18" />
			<line x1="16.5" y1="18.5" x2="21.5" y2="18.5" stroke={`url(#${uid}-es)`} strokeWidth="1" strokeLinecap="round" opacity="0.22" />
			<circle cx="12" cy="15" r="3" fill={`url(#${uid}-glow)`} opacity="0.75" />
			<circle cx="12" cy="15" r="1.35" fill="#FFFFFF" opacity="0.92" />
		</svg>
	);

	if (iconOnly) {
		return icon;
	}

	return (
		<div
			className={`relative flex items-center justify-center shrink-0 overflow-hidden ${className}`}
			style={{
				width: size,
				height: size,
				borderRadius: Math.max(7, size * 0.2),
				background: 'linear-gradient(150deg, #0d0720 0%, #07070f 50%, #030e17 100%)',
				boxShadow: '0 4px 18px rgba(76, 29, 149, 0.22), 0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.055)'
			}}
		>
			<div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 55% at 30% 20%, rgba(109,40,217,0.22) 0%, transparent 100%)' }} />
			<div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 65% 55% at 78% 85%, rgba(8,145,178,0.16) 0%, transparent 100%)' }} />
			<div className="absolute inset-0 rounded-[inherit] pointer-events-none" style={{ padding: '1px', background: 'linear-gradient(150deg, rgba(109,40,217,0.65) 0%, rgba(14,165,233,0.04) 45%, rgba(14,165,233,0.55) 100%)', WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude' }} />
			<div className="absolute top-0 inset-x-3 h-px pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)' }} />
			<div className="relative flex items-center justify-center w-[70%] h-[70%]">
				{icon}
			</div>
		</div>
	);
}
