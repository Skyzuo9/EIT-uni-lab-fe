import { useId, useState } from 'react'

import styles from './PlatformCapabilityNotice.module.scss'

const WORKBENCH_START_COMMAND = 'pnpm workbench'

export interface PlatformCapabilityNoticeProps {
  title: string
  description: string
  dependency: string
}

/** 为普通浏览器中的桌面限定能力提供统一、可执行的交接入口。 */
export default function PlatformCapabilityNotice({
  title,
  description,
  dependency
}: PlatformCapabilityNoticeProps): React.JSX.Element {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const headingId = useId()

  const handleCopy = async (): Promise<void> => {
    try {
      await copyText(WORKBENCH_START_COMMAND)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  return (
    <section className={styles.notice} aria-labelledby={headingId}>
      <div className={styles.mark} aria-hidden="true">
        <DesktopIcon />
      </div>
      <h1 id={headingId}>{title}</h1>
      <p className={styles.description}>{description}</p>
      <div className={styles.handoff}>
        <code>{WORKBENCH_START_COMMAND}</code>
        <button type="button" onClick={() => void handleCopy()}>
          {copyState === 'copied' ? '已复制' : '复制本地启动命令'}
        </button>
      </div>
      <span className={styles.copyStatus} role="status" aria-live="polite">
        {copyState === 'copied'
          ? '命令已复制，可在仓库根目录运行。'
          : copyState === 'error'
            ? '未能自动复制，请手动复制上方命令。'
            : '在仓库根目录运行命令后，从 Uni-Lab Workbench 继续。'}
      </span>
      <details className={styles.reason}>
        <summary>为什么当前界面中不能继续？</summary>
        <p>{dependency}</p>
      </details>
    </section>
  )
}

async function copyText(value: string): Promise<void> {
  if (globalThis.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(value)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('clipboard unavailable')
}

function DesktopIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}
