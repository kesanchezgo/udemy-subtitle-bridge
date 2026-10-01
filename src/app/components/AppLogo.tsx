import React from "react";

export function KinemaMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <rect width="48" height="48" rx="14" fill="var(--kinema-accent,#6d4aff)" />
      <rect x="12" y="9" width="7" height="30" rx="3.5" fill="#fff" />
      <path
        d="M21 24.5 L35 38.5"
        stroke="#fff"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M19 25 L34 10.5"
        stroke="#d4c9ff"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function FrameMarks() {
  return (
    <>
      <span aria-hidden="true" className="kx-fm kx-fm-tl" />
      <span aria-hidden="true" className="kx-fm kx-fm-tr" />
      <span aria-hidden="true" className="kx-fm kx-fm-bl" />
      <span aria-hidden="true" className="kx-fm kx-fm-br" />
    </>
  );
}

export function KinemaBrand({
  className = "",
  compact = false,
  dense = false,
}: {
  className?: string;
  compact?: boolean;
  dense?: boolean;
}) {
  if (dense) {
    return (
      <span
        role="img"
        aria-label="Kinema · by Kivara"
        className={`inline-flex shrink-0 items-center gap-2.5 font-[family-name:var(--kinema-font)] ${className}`}
      >
        <KinemaMark className="h-[calc(34px*var(--usb-scale,1))] w-[calc(34px*var(--usb-scale,1))]" />
        <span className="flex flex-col items-start gap-1">
          <span className="text-[length:calc(20px*var(--usb-scale,1))] font-bold leading-none tracking-tight text-[var(--kinema-wordmark,#f7f7f8)]">
            Kinema
          </span>
          <span className="text-[10px] tracking-widest font-semibold uppercase text-[var(--kinema-signature,#aaa8ad)]" style={{ fontSize: "calc(10px * var(--usb-scale,1))" }}>
            by Kivara
          </span>
        </span>
      </span>
    );
  }

  if (compact) {
    return (
      <span
        role="img"
        aria-label="Kinema · by Kivara"
        className={`inline-flex shrink-0 flex-col items-center gap-3 font-[family-name:var(--kinema-font)] ${className}`}
      >
        <KinemaMark className="h-[calc(38px*var(--usb-scale,1))] w-[calc(38px*var(--usb-scale,1))]" />
        <span className="flex rotate-180 items-center gap-2 leading-none [writing-mode:vertical-rl]">
          <span className="text-[length:var(--kinema-compact-size,18px)] font-bold tracking-tight text-[var(--kinema-wordmark,#f7f7f8)]">
            Kinema
          </span>
          <span className="text-[length:var(--kinema-accent-dot,14px)] font-bold text-[var(--kinema-accent,#6d4aff)]">
            ·
          </span>
          <span className="text-[length:var(--kinema-signature-size,12px)] font-medium tracking-[0.14em] text-[var(--kinema-signature,#aaa8ad)]">
            by Kivara
          </span>
        </span>
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label="Kinema · by Kivara"
      className={`inline-flex shrink-0 items-center gap-3 font-[family-name:var(--kinema-font)] ${className}`}
    >
      <KinemaMark className="h-[calc(46px*var(--usb-scale,1))] w-[calc(46px*var(--usb-scale,1))]" />
      <span className="flex flex-col items-start gap-1.5">
        <span className="text-[length:var(--kinema-name-size,28px)] font-bold leading-none tracking-tight text-[var(--kinema-wordmark,#f7f7f8)]">
          Kinema
        </span>
        <span className="flex items-center gap-1.5 leading-none">
          <span className="h-[5px] w-[5px] rounded-full bg-[var(--kinema-accent,#6d4aff)]" />
          <span className="text-[length:var(--kinema-signature-size,12px)] font-medium tracking-[0.14em] text-[var(--kinema-signature,#aaa8ad)]">
            by Kivara
          </span>
        </span>
      </span>
    </span>
  );
}
