import React from 'react';

type SliderProps = {
	value: number[];
	onValueChange: (value: number[]) => void;
	min: number;
	max: number;
	step: number;
	className?: string;
};

export function Slider({ value, onValueChange, min, max, step, className = '' }: SliderProps) {
	const current = value[0] ?? min;
	const percent = ((current - min) / (max - min || 1)) * 100;

	return (
		<div className={`relative flex items-center ${className}`}>
			<div data-slot="track" className="relative h-1.5 w-full rounded-full bg-white/10">
				<div data-slot="range" className="absolute left-0 top-0 h-full rounded-full bg-violet-500" style={{ width: `${percent}%` }} />
				<div
					data-slot="thumb"
					className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-violet-500 bg-white shadow"
					style={{ left: `calc(${percent}% - 7px)` }}
				/>
				<input
					type="range"
					min={min}
					max={max}
					step={step}
					value={current}
					onChange={(event) => onValueChange([Number(event.target.value)])}
					className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
				/>
			</div>
		</div>
	);
}