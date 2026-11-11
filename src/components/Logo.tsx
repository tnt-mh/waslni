export function LogoMark({ size = 40, tone = 'navy' }: { size?: number; tone?: 'navy' | 'white' }) {
  const pin = tone === 'navy' ? '#000080' : '#ffffff';
  const road = tone === 'navy' ? '#ffffff' : '#000080';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <path
        d="M32 3.5C19.6 3.5 9.5 13.6 9.5 26c0 16.6 22.5 34.5 22.5 34.5S54.5 42.6 54.5 26C54.5 13.6 44.4 3.5 32 3.5Z"
        fill={pin}
      />
      <path d="M23.5 45.5C23.5 35.5 27 27 32 19.5" stroke={road} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M40.5 45.5C40.5 35.5 37 27 32 19.5" stroke={road} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M32 45.5V25" stroke={road} strokeWidth="2.6" strokeLinecap="round" strokeDasharray="4.2 4.6" />
    </svg>
  );
}

export function Logo({ size = 36, tone = 'navy', wordmark = true }: { size?: number; tone?: 'navy' | 'white'; wordmark?: boolean }) {
  return (
    <span className="row gap-8" style={{ gap: size * 0.22 }}>
      <LogoMark size={size} tone={tone} />
      {wordmark && (
        <span style={{
          fontSize: size * 0.68, fontWeight: 800, letterSpacing: '-0.03em',
          color: tone === 'navy' ? '#05052e' : '#ffffff', lineHeight: 1,
        }}>
          Waslni
        </span>
      )}
    </span>
  );
}