import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { TOOL_META, CATEGORY_STYLES, type ToolId, type ToolCategory } from './toolMeta';

// ═════════════════════════════════════════════════════════════════════════════
// Tool Shell — shared building blocks that give every tool the same frame:
//   <ToolPage>        consistent width + padding
//   <ToolHeader>      icon tile · title · description · actions
//   <ToolTabs>        segmented filter control with optional counts
//   <ToolButton>      primary / secondary / ghost / danger buttons
//   <ToolEmptyState>  dashed empty placeholder with a call to action
// ═════════════════════════════════════════════════════════════════════════════

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

// ── ToolIconTile ────────────────────────────────────────────────────────────

export const ToolIconTile: React.FC<{
  icon: LucideIcon;
  category: ToolCategory;
  size?: 'sm' | 'md';
  className?: string;
}> = ({ icon: Icon, category, size = 'md', className }) => (
  <span
    aria-hidden="true"
    className={cx(
      'inline-flex items-center justify-center shrink-0 ring-1 ring-inset',
      size === 'md' ? 'w-10 h-10 rounded-xl' : 'w-8 h-8 rounded-lg',
      CATEGORY_STYLES[category].tile,
      className,
    )}
  >
    <Icon size={size === 'md' ? 20 : 16} strokeWidth={2} />
  </span>
);

// ── ToolPage ────────────────────────────────────────────────────────────────

/**
 * Standard page frame for a tool.
 * - `standard` (default): centered, max 72rem — list/grid ("collection") tools.
 * - `full`: edge-to-edge — master-detail and editor layouts that manage their own panes.
 */
export const ToolPage: React.FC<{
  children: React.ReactNode;
  width?: 'standard' | 'full';
  className?: string;
}> = ({ children, width = 'standard', className }) => (
  <div className={cx('w-full px-6 lg:px-8 py-6', width === 'standard' && 'max-w-6xl mx-auto', className)}>
    {children}
  </div>
);

// ── ToolHeader ──────────────────────────────────────────────────────────────

interface ToolHeaderProps {
  /** Pull icon, title, description and category from TOOL_META. */
  tool?: ToolId;
  icon?: LucideIcon;
  title?: React.ReactNode;
  description?: React.ReactNode;
  category?: ToolCategory;
  /** Small inline element after the title (e.g. a count pill). */
  badge?: React.ReactNode;
  /** Right-aligned actions (buttons). */
  actions?: React.ReactNode;
  /**
   * `compact` is for narrow sidebars in master-detail layouts:
   * smaller tile, no description, no bottom margin.
   */
  variant?: 'default' | 'compact';
  className?: string;
}

export const ToolHeader: React.FC<ToolHeaderProps> = ({
  tool, icon, title, description, category, badge, actions, variant = 'default', className,
}) => {
  const meta = tool ? TOOL_META[tool] : undefined;
  const Icon = icon ?? meta?.icon;
  const resolvedCategory = category ?? meta?.category ?? 'communicate';
  const resolvedTitle = title ?? meta?.label;
  const resolvedDescription = description === undefined ? meta?.description : description;
  const compact = variant === 'compact';

  return (
    <header
      className={cx(
        'flex flex-wrap items-center justify-between',
        compact ? 'gap-2' : 'gap-4 mb-6',
        className,
      )}
    >
      <div className={cx('flex items-center min-w-0', compact ? 'gap-2.5' : 'gap-3.5')}>
        {Icon && <ToolIconTile icon={Icon} category={resolvedCategory} size={compact ? 'sm' : 'md'} />}
        <div className="min-w-0">
          <h1
            className={cx(
              'flex items-center gap-2 text-slate-900 dark:text-white tracking-tight',
              compact ? 'text-base font-semibold' : 'text-2xl font-semibold',
            )}
          >
            <span className="truncate">{resolvedTitle}</span>
            {badge}
          </h1>
          {!compact && resolvedDescription && (
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{resolvedDescription}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
};

// ── ToolButton ──────────────────────────────────────────────────────────────

type ToolButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_VARIANTS: Record<ToolButtonVariant, string> = {
  primary:   'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 disabled:hover:bg-indigo-600',
  secondary: 'bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700',
  ghost:     'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
  danger:    'bg-rose-600 text-white shadow-sm hover:bg-rose-700 disabled:hover:bg-rose-600',
};

export const ToolButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ToolButtonVariant;
    icon?: LucideIcon;
    size?: 'sm' | 'md';
  }
> = ({ variant = 'primary', icon: Icon, size = 'md', className, children, type = 'button', ...rest }) => (
  <button
    type={type}
    className={cx(
      'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-colors',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      size === 'md' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs',
      BUTTON_VARIANTS[variant],
      className,
    )}
    {...rest}
  >
    {Icon && <Icon size={size === 'md' ? 16 : 14} aria-hidden="true" />}
    {children}
  </button>
);

// ── ToolTabs ────────────────────────────────────────────────────────────────

export interface ToolTabItem<T extends string> {
  value: T;
  label: React.ReactNode;
  count?: number;
  icon?: LucideIcon;
}

/** Segmented filter control. Uses aria-pressed since it filters one list. */
export function ToolTabs<T extends string>({
  tabs, value, onChange, ariaLabel, className,
}: {
  tabs: ToolTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx('inline-flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl', className)}
    >
      {tabs.map(t => {
        const active = t.value === value;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(t.value)}
            className={cx(
              'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500',
              active
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200',
            )}
          >
            {Icon && <Icon size={14} aria-hidden="true" />}
            {t.label}
            {t.count !== undefined && (
              <span
                className={cx(
                  'text-xs px-1.5 py-0.5 rounded-full font-semibold tabular-nums',
                  active
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                    : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── ToolEmptyState ──────────────────────────────────────────────────────────

export const ToolEmptyState: React.FC<{
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, title, description, action, className }) => (
  <div
    className={cx(
      'flex flex-col items-center text-center py-16 px-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl',
      className,
    )}
  >
    <Icon size={36} className="text-slate-300 dark:text-slate-600 mb-3" aria-hidden="true" />
    <p className="font-medium text-slate-700 dark:text-slate-300">{title}</p>
    {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
