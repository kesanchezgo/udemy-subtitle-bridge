import React from 'react';

type SwitchProps = {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	className?: string;
};

export function Switch({ checked, onCheckedChange, className = '' }: SwitchProps) {
	return (
		<button
			type="button"
			aria-pressed={checked}
			data-state={checked ? 'checked' : 'unchecked'}
			onClick={() => onCheckedChange(!checked)}
			className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors ${checked ? 'bg-violet-600' : 'bg-white/15'} ${className}`}
		>
			<span
				data-state={checked ? 'checked' : 'unchecked'}
				className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
			/>
		</button>
	);
}