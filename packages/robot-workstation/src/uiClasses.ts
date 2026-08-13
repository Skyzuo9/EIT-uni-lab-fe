type ButtonTone = 'primary' | 'secondary' | 'danger'
type ButtonSize = 'default' | 'compact' | 'icon'
type PillTone = 'info' | 'success' | 'warning' | 'neutral'

const BUTTON_BASE = [
  'box-border inline-flex min-h-9 items-center justify-center gap-[7px] rounded-[var(--unilab-radius-control)] border px-3',
  'cursor-pointer font-[var(--unilab-font-sans)] text-[13px] leading-[1.2] font-semibold',
  'transition-colors duration-[var(--unilab-motion-fast)] motion-reduce:transition-none',
  '[&>svg]:size-4',
  'focus-visible:[outline:3px_solid_var(--unilab-color-focus)] focus-visible:outline-offset-2',
  'disabled:cursor-not-allowed disabled:bg-[var(--unilab-color-bg-muted)] disabled:text-[var(--unilab-color-text-subtle)] disabled:opacity-[0.72]',
].join(' ')

const BUTTON_TONE: Record<ButtonTone, string> = {
  primary:
    'border-[var(--unilab-color-device)] bg-[var(--unilab-color-device)] text-white [&:hover:not(:disabled)]:border-[#0b625c] [&:hover:not(:disabled)]:bg-[#0b625c]',
  secondary:
    'border-[var(--unilab-color-border-strong)] bg-[var(--unilab-color-surface)] text-[var(--unilab-color-text)] [&:hover:not(:disabled)]:border-[var(--unilab-color-primary)]',
  danger:
    'border-[#fca5a5] bg-[var(--unilab-color-danger-soft)] text-[var(--unilab-color-danger)] [&:hover:not(:disabled)]:border-[var(--unilab-color-primary)]',
}

const BUTTON_SIZE: Record<ButtonSize, string> = {
  default: '',
  compact: 'min-h-[30px] px-[9px]',
  icon: 'min-h-[30px] w-[30px] border-transparent bg-transparent p-0 text-[var(--unilab-color-text-muted)]',
}

const PILL_BASE =
  'inline-flex min-h-[22px] w-fit items-center gap-[5px] whitespace-nowrap rounded-full px-[7px] py-0.5 text-xs leading-[1.2] font-semibold'

const PILL_TONE: Record<PillTone, string> = {
  info: 'bg-[var(--unilab-color-primary-soft)] text-[var(--unilab-color-primary)]',
  success: 'bg-[var(--unilab-color-success-soft)] text-[#166534]',
  warning: 'bg-[var(--unilab-color-warning-soft)] text-[var(--unilab-color-warning)]',
  neutral: 'bg-[var(--unilab-color-bg-muted)] text-[var(--unilab-color-text-muted)]',
}

/** 共享的原子样式只保留为静态 Tailwind 类，确保构建期可以完整扫描。 */
export const uiClass = {
  compactEmptyState: 'px-2 py-6 text-center text-xs text-[var(--unilab-color-text-muted)]',
  dialogActions: 'flex justify-end gap-2 border-t border-[var(--unilab-color-border)] px-3.5 pt-3',
  dialogBackdrop: 'fixed inset-0 z-[100] grid place-items-center bg-[rgb(15_23_42_/_48%)] p-6 max-[720px]:items-end max-[720px]:p-0',
  headerActions: 'flex flex-wrap justify-end gap-2 max-[720px]:justify-start',
  moduleHeader:
    'mb-3 flex items-start justify-between gap-4 max-[720px]:grid [&_h1]:mb-1 [&_h1]:text-xl [&_h1]:leading-[1.35] [&_h1]:font-bold [&_h1]:tracking-[-0.015em] [&_h1]:text-[var(--unilab-color-text)] max-[480px]:[&_h1]:text-lg [&_p]:m-0 [&_p]:max-w-[72ch] [&_p]:text-xs [&_p]:leading-[1.55] [&_p]:text-[var(--unilab-color-text-muted)]',
  modulePage: 'box-border min-h-full min-w-0 p-5 max-[940px]:p-3.5 max-[720px]:p-3 max-[480px]:p-2.5',
  mono: 'font-[var(--unilab-font-mono)] tabular-nums',
  notice:
    'mb-3 flex min-h-[34px] items-center gap-2 rounded-[var(--unilab-radius-control)] border border-[#fed7aa] bg-[var(--unilab-color-warning-soft)] px-2.5 py-[7px] text-[13px] leading-[1.45] text-[#8a4b08] max-[720px]:items-start [&>svg]:size-4 [&>svg]:shrink-0',
  panel:
    'min-w-0 overflow-hidden rounded-[var(--unilab-radius-lg)] border border-[var(--unilab-color-border)] bg-[var(--unilab-color-surface)]',
  panelBody: 'p-3',
  panelHeader:
    'flex min-h-12 items-center justify-between gap-3 border-b border-[var(--unilab-color-border)] px-3 py-[9px] [&>div]:min-w-0 [&_h2]:m-0 [&_h2]:text-[13px] [&_h2]:font-semibold [&_h2]:text-[var(--unilab-color-text)] [&_small]:mt-0.5 [&_small]:block [&_small]:text-xs [&_small]:text-[var(--unilab-color-text-muted)]',
  rowActions: 'flex gap-0.5 [&_button:disabled]:opacity-[0.38]',
  screenReaderOnly: 'sr-only',
  tableScroll: 'min-w-0 overflow-auto',
} as const

/** 返回按钮的稳定 Tailwind 类集合；业务组件只选择语义和尺寸。 */
export function buttonClass(tone: ButtonTone = 'secondary', size: ButtonSize = 'default'): string {
  return `${BUTTON_BASE} ${BUTTON_TONE[tone]} ${BUTTON_SIZE[size]}`
}

/** 返回状态标签的稳定 Tailwind 类集合。 */
export function pillClass(tone: PillTone): string {
  return `${PILL_BASE} ${PILL_TONE[tone]}`
}

/** 给动态状态标签复用结构，不抢占其由模块 SCSS 决定的语义颜色。 */
export const pillBaseClass = PILL_BASE
