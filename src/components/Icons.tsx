// 앱 전체에서 쓰는 아이콘. 24px 격자, 2px 선, 각진 끝 하나의 체계로 직접 그렸다.

type IconProps = { className?: string; title?: string };

function Svg({ className, title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className ?? "h-4 w-4"}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 8.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7zM12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </Svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />
    </Svg>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 11a8 8 0 10-2.4 5.7M20 5v6h-6" />
    </Svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4l9 16H3L12 4zM12 10v4M12 17v.5" />
    </Svg>
  );
}

/** 앱 표식: 시간표 격자의 네 칸 (색은 과목 색 첫 세 가지 + 빈 칸) */
export function TimetableMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-6 w-6"} aria-hidden>
      <rect x="2" y="2" width="9" height="9" fill="#2459C8" />
      <rect x="13" y="2" width="9" height="9" fill="#127A55" />
      <rect x="2" y="13" width="9" height="9" fill="#9A5B00" />
      <rect x="13.5" y="13.5" width="8" height="8" fill="none" stroke="#C9D2E3" strokeWidth="1" />
    </svg>
  );
}
