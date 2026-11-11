import { type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useRef, useEffect } from 'react';
import { Check, ChevronRight, Minus, Plus, Star, AlertTriangle, Info, CheckCircle2, XCircle } from 'lucide-react';
import type { User } from '../lib/types';
import { initials } from '../lib/utils';

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'danger-ghost' | 'success';
export function Button({
  variant = 'primary', size, block, round, loading, className = '', children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant; size?: 'sm' | 'lg'; block?: boolean; round?: boolean; loading?: boolean;
}) {
  return (
    <button
      className={`btn ${variant} ${size ?? ''} ${block ? 'block' : ''} ${round ? 'round' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className={`spinner ${variant === 'primary' || variant === 'danger' || variant === 'success' ? 'white' : ''}`} style={{ width: 17, height: 17 }} />}
      {children}
    </button>
  );
}

export function IconButton({ label, badge, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; badge?: number }) {
  return (
    <button className={`icon-btn ${className}`} aria-label={label} title={label} {...rest}>
      {children}
      {badge !== undefined && badge > 0 && <span className="dot">{badge > 9 ? '9+' : badge}</span>}
    </button>
  );
}

export function Field({ label, error, hint, required, children }: { label?: string; error?: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="field">
      {label && <label>{label}{required && <span className="error-text"> *</span>}</label>}
      {children}
      {error ? <span className="error-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Input({ invalid, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={`input ${invalid ? 'invalid' : ''} ${className}`} {...rest} />;
}

export function Select({ invalid, className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select className={`select ${invalid ? 'invalid' : ''} ${className}`} {...rest}>{children}</select>;
}

export function Textarea({ invalid, className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={`textarea ${invalid ? 'invalid' : ''} ${className}`} {...rest} />;
}

export function Card({ clickable, navy, soft, flat, className = '', style, children, onClick }: {
  clickable?: boolean; navy?: boolean; soft?: boolean; flat?: boolean; className?: string; style?: CSSProperties; children: ReactNode; onClick?: () => void;
}) {
  return (
    <div
      className={`card ${clickable ? 'clickable' : ''} ${navy ? 'navy' : ''} ${soft ? 'soft' : ''} ${flat ? 'flat' : ''} ${className}`}
      style={style}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
    >
      {children}
    </div>
  );
}

export function Badge({ variant = '', children }: { variant?: '' | 'success' | 'warning' | 'error' | 'neutral' | 'navy' | 'demo'; children: ReactNode }) {
  return <span className={`badge ${variant}`}>{children}</span>;
}

export function Avatar({ user, name, hue, size = 'md', verified, photoUrl }: {
  user?: Pick<User, 'fullName' | 'avatarHue' | 'photoUrl'> | null; name?: string; hue?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl'; verified?: boolean; photoUrl?: string | null;
}) {
  const display = user?.fullName ?? name ?? '?';
  const h = user?.avatarHue ?? hue ?? 230;
  const photo = user?.photoUrl ?? photoUrl;
  return (
    <span className={`avatar ${size}`} style={{ ['--hue' as string]: h }} aria-hidden>
      {photo ? <img src={photo} alt="" /> : initials(display)}
      {verified && <span className="verified-dot"><Check size={9} strokeWidth={4} /></span>}
    </span>
  );
}

export function Stars({ value, size = 14, onChange, showValue }: { value: number; size?: number; onChange?: (v: number) => void; showValue?: boolean }) {
  return (
    <span className={`stars ${onChange ? 'interactive' : ''}`} role={onChange ? 'radiogroup' : undefined} aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`star ${i <= Math.round(value) ? '' : 'empty'}`}
          onClick={onChange ? () => onChange(i) : undefined}
          role={onChange ? 'radio' : undefined}
          aria-checked={onChange ? i === Math.round(value) : undefined}
          tabIndex={onChange ? 0 : undefined}
          onKeyDown={onChange ? (e) => { if (e.key === 'Enter' || e.key === ' ') onChange(i); } : undefined}
        >
          <Star size={size} fill={i <= Math.round(value) ? 'currentColor' : 'none'} strokeWidth={1.8} />
        </span>
      ))}
      {showValue && <span className="small bold" style={{ color: 'var(--text)', marginInlineStart: 4 }}>{value > 0 ? value.toFixed(1) : '—'}</span>}
    </span>
  );
}

export function Chip({ active, soft, static: isStatic, onClick, children }: { active?: boolean; soft?: boolean; static?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`chip ${active ? 'active' : ''} ${soft ? 'soft' : ''} ${isStatic ? 'static' : ''}`} onClick={onClick} tabIndex={isStatic ? -1 : 0}>
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: ReactNode }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: string }) {
  return (
    <div className="toggle-row">
      <span className="toggle-label">
        <span className="small bold">{label}</span>
        {hint && <span className="tiny muted">{hint}</span>}
      </span>
      <button type="button" className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)} />
    </div>
  );
}

export function Stepper({ value, min = 1, max = 8, onChange }: { value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  return (
    <span className="stepper">
      <button type="button" aria-label="−" disabled={value <= min} onClick={() => onChange(value - 1)}><Minus size={16} /></button>
      <span className="value">{value}</span>
      <button type="button" aria-label="+" disabled={value >= max} onClick={() => onChange(value + 1)}><Plus size={16} /></button>
    </span>
  );
}

export function Progress({ value }: { value: number }) {
  return <div className="progress" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><div className="bar" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

export function StepsDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="steps-dots" aria-label={`${current + 1} / ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`dot ${i < current ? 'done' : ''} ${i === current ? 'current' : ''}`} />
      ))}
    </div>
  );
}

export function ListRow({ icon, title, subtitle, end, onClick, danger, static: isStatic }: {
  icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; end?: ReactNode; onClick?: () => void; danger?: boolean; static?: boolean;
}) {
  return (
    <button type="button" className={`list-row ${danger ? 'danger' : ''} ${isStatic ? 'static' : ''}`} onClick={onClick} tabIndex={isStatic ? -1 : 0}>
      {icon && <span className="row" style={{ color: danger ? 'var(--error)' : 'var(--navy)' }}>{icon}</span>}
      <span className="grow col" style={{ gap: 1 }}>
        <span className="small bold">{title}</span>
        {subtitle && <span className="tiny muted">{subtitle}</span>}
      </span>
      {end ?? (onClick && !isStatic ? <span className="chevron"><ChevronRight size={18} /></span> : null)}
    </button>
  );
}

export function Banner({ kind = 'info', children }: { kind?: 'info' | 'warning' | 'error' | 'success'; children: ReactNode }) {
  const Icon = kind === 'warning' ? AlertTriangle : kind === 'error' ? XCircle : kind === 'success' ? CheckCircle2 : Info;
  return (
    <div className={`banner ${kind}`} role={kind === 'error' ? 'alert' : 'note'}>
      <span className="banner-icon"><Icon size={16} /></span>
      <span>{children}</span>
    </div>
  );
}

export function SectionTitle({ title, action, onAction }: { title: ReactNode; action?: string; onAction?: () => void }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {action && <button type="button" onClick={onAction}>{action}</button>}
    </div>
  );
}

export function PinDisplay({ pin }: { pin: string }) {
  return (
    <div className="pin-display" aria-label={`PIN ${pin}`}>
      {pin.split('').map((d, i) => <span key={i} className="pin-digit">{d}</span>)}
    </div>
  );
}

export function PinInput({ value, onChange, length = 4 }: { value: string; onChange: (v: string) => void; length?: number }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => { refs.current[0]?.focus(); }, []);
  const digits = value.padEnd(length, ' ').slice(0, length).split('');
  return (
    <div className="pin-input">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric"
          maxLength={1}
          value={d.trim()}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(-1);
            const arr = value.padEnd(length, ' ').split('');
            arr[i] = v || ' ';
            onChange(arr.join('').replace(/ /g, '').slice(0, length));
            if (v && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[i].trim() && i > 0) refs.current[i - 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card col gap-12">
      <div className="row gap-12">
        <div className="skeleton" style={{ width: 46, height: 46, borderRadius: '50%' }} />
        <div className="col grow" style={{ gap: 6 }}>
          <div className="skeleton" style={{ height: 13, width: '55%' }} />
          <div className="skeleton" style={{ height: 11, width: '35%' }} />
        </div>
      </div>
      <div className="skeleton" style={{ height: 52 }} />
      <div className="row between">
        <div className="skeleton" style={{ height: 14, width: '40%' }} />
        <div className="skeleton" style={{ height: 20, width: '22%' }} />
      </div>
    </div>
  );
}

export function Spinner({ white }: { white?: boolean }) {
  return <span className={`spinner ${white ? 'white' : ''}`} role="status" aria-label="loading" />;
}

export function SuccessCheck() {
  return (
    <svg className="success-check" viewBox="0 0 88 88" aria-hidden>
      <circle cx="44" cy="44" r="40" />
      <path d="M28 45 L40 57 L61 34" />
    </svg>
  );
}