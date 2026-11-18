import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 shadow-[0_8px_30px_-12px_rgb(var(--accent))]',
  secondary: 'bg-surface-2 text-fg hover:bg-border',
  outline: 'border border-border bg-transparent hover:bg-surface-2',
  ghost: 'bg-transparent hover:bg-surface-2',
  danger: 'bg-danger text-white hover:brightness-110',
};
const sizes = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: keyof typeof sizes;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant = 'primary', size = 'md', ...props }, ref) {
  return <button ref={ref} className={cn('inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50', variants[variant], sizes[size], className)} {...props} />;
});

export function ButtonLink({ href, className, variant = 'primary', size = 'md', children, ...rest }: { href: string; className?: string; variant?: Variant; size?: keyof typeof sizes; children: ReactNode; prefetch?: boolean; 'aria-label'?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition', variants[variant], sizes[size], className)} {...rest}>
      {children}
    </Link>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn('h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn('w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none', className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn('h-10 rounded-xl border border-border bg-surface px-3 text-sm text-fg focus:border-accent focus:outline-none', className)} {...props} />;
});

export function Label({ htmlFor, children, className }: { htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('mb-1 block text-sm font-medium', className)}>
      {children}
    </label>
  );
}

export function Card({ className, children, as: As = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' | 'li' }) {
  return <As className={cn('rounded-2xl border border-border bg-surface p-5', className)}>{children}</As>;
}

const badgeTones = {
  neutral: 'bg-surface-2 text-muted',
  accent: 'bg-accent/15 text-accent',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
};
export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', badgeTones[tone], className)}>{children}</span>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <div aria-hidden className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent/10 text-2xl">◇</div>
      <h2 className="text-lg font-bold">{title}</h2>
      {children && <div className="mt-2 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Stars({ value, count, size = 'sm' }: { value: number; count?: number; size?: 'sm' | 'md' }) {
  const full = Math.round(value);
  return (
    <span className={cn('inline-flex items-center gap-1', size === 'md' ? 'text-base' : 'text-xs')} aria-label={`Rated ${value.toFixed(1)} out of 5${count !== undefined ? ` from ${count} reviews` : ''}`}>
      <span aria-hidden className="text-warning tracking-tight">{'★'.repeat(full)}<span className="text-border">{'★'.repeat(5 - full)}</span></span>
      {count !== undefined && <span className="text-muted">({count})</span>}
    </span>
  );
}

export function Alert({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
  const t = { neutral: 'border-border bg-surface-2', success: 'border-success/40 bg-success/10', warning: 'border-warning/40 bg-warning/10', danger: 'border-danger/40 bg-danger/10' }[tone];
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-xl border px-4 py-3 text-sm', t)}>{children}</div>;
}
