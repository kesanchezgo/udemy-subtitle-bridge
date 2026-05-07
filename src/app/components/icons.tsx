import type { PropsWithChildren } from 'react';

type IconProps = {
  className?: string;
};

function SvgIcon({ className, children }: PropsWithChildren<IconProps>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function ZapIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M13 2 4 14h6l-1 8 11-14h-6l1-6z" />
    </SvgIcon>
  );
}

export function BookOpenIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H12v15H6.5A2.5 2.5 0 0 0 4 21.5z" />
      <path d="M20 6.5A2.5 2.5 0 0 0 17.5 4H12v15h5.5A2.5 2.5 0 0 1 20 21.5z" />
    </SvgIcon>
  );
}

export function MessageIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="3" y="5" width="18" height="11" rx="2" />
      <path d="M7 19 12 16h5a2 2 0 0 0 2-2" />
    </SvgIcon>
  );
}

export function SquareIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="5" y="5" width="14" height="14" rx="3" />
      <path d="M8 8h8v8H8z" />
    </SvgIcon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-1.4 3.4 2 2 0 0 1-1.4-.6l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 0 1-2.8 0 2 2 0 0 1 0-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 0 1 4.2 4.7a2 2 0 0 1 2.8 0l.1.1a1.7 1.7 0 0 0 1.9.3h.1A1.7 1.7 0 0 0 10 4V4a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 0 1 2.8 0 2 2 0 0 1 0 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </SvgIcon>
  );
}

export function BrainIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M8 7.5A2.5 2.5 0 0 1 10.5 5h3A2.5 2.5 0 0 1 16 7.5V8a3 3 0 0 1 1.5 2.6c0 1-.5 1.9-1.3 2.5.5.5.8 1.2.8 2 0 1.6-1.3 2.9-2.9 2.9H9.9A2.9 2.9 0 0 1 7 15.1c0-.8.3-1.5.8-2A3 3 0 0 1 6.5 10.6 3 3 0 0 1 8 8z" />
      <path d="M9 8.5V6.9" />
      <path d="M15 8.5V6.9" />
      <path d="M9 12h6" />
      <path d="M10 15h4" />
    </SvgIcon>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 2l1.3 4.3L18 7.6l-4.7 1.3L12 13l-1.3-4.1L6 7.6l4.7-1.3z" />
      <path d="M19 13l.8 2.4L22 16.2l-2.2.8L19 19l-.8-2.2-2.2-.8 2.2-.8z" />
      <path d="M4.5 13.5l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8z" />
    </SvgIcon>
  );
}

export function WandIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M3 21 21 3" />
      <path d="M8.5 4.5 11 7" />
      <path d="M14 10 16.5 12.5" />
      <path d="M12 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
    </SvgIcon>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </SvgIcon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m5 13 4 4 10-10" />
    </SvgIcon>
  );
}

export function CircleIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="8" />
    </SvgIcon>
  );
}

export function LoaderIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
    </SvgIcon>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m8 10 4 4 4-4" />
    </SvgIcon>
  );
}

export function TrendingIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4 16 10 10 14 14 20 8" />
      <path d="M20 12V8h-4" />
    </SvgIcon>
  );
}

export function DatabaseIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </SvgIcon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8.2h.01" />
    </SvgIcon>
  );
}

export function FileDownIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M14 3v5h5" />
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M12 12v5" />
      <path d="m9.5 14.5 2.5 2.5 2.5-2.5" />
    </SvgIcon>
  );
}

export function PackageIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M3.5 7.5 12 3l8.5 4.5V16L12 21l-8.5-5z" />
      <path d="M12 3v18" />
      <path d="M3.5 7.5 12 12l8.5-4.5" />
    </SvgIcon>
  );
}

export function RotateIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M20 7v5h-5" />
      <path d="M19 13a7 7 0 1 1-2-5" />
    </SvgIcon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4z" />
    </SvgIcon>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m9 6 9 6-9 6z" />
    </SvgIcon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M20 12a8 8 0 0 1-13.7 5.7" />
      <path d="M4 12a8 8 0 0 1 13.7-5.7" />
      <path d="M4 4v4h4" />
      <path d="M20 20v-4h-4" />
    </SvgIcon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 4.9 2.3 18a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-13.1a2 2 0 0 0-3.4 0z" />
    </SvgIcon>
  );
}

export function RadioIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M5 12a7 7 0 0 1 14 0" />
      <path d="M3 12a9 9 0 0 1 18 0" />
    </SvgIcon>
  );
}

export function MoveIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="m8 8 4-4 4 4" />
      <path d="m8 16 4 4 4-4" />
      <path d="m8 8-4 4 4 4" />
      <path d="m16 8 4 4-4 4" />
    </SvgIcon>
  );
}

export function FlipIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4 12h16" />
      <path d="M8 8 4 12l4 4" />
      <path d="M16 8 20 12l-4 4" />
    </SvgIcon>
  );
}
