import {
  useEffect,
  useRef,
  type HTMLAttributes
} from 'react'

import type {
  PascalEditorInstance,
  PascalEditorLoader,
  PascalEditorOptions
} from './types'

export interface PascalHostProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onError'> {
  loader: PascalEditorLoader
  options?: PascalEditorOptions
  onReady?: (editor: PascalEditorInstance) => void
  onError?: (error: Error) => void
}

export function PascalHost({
  loader,
  options = {},
  onReady,
  onError,
  ...containerProps
}: PascalHostProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const optionsRef = useRef(options)
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)

  optionsRef.current = options
  onReadyRef.current = onReady
  onErrorRef.current = onError

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let editor: PascalEditorInstance | null = null

    void loader()
      .then((module) => module.mount(container, optionsRef.current))
      .then((instance) => {
        if (cancelled) {
          instance.dispose()
          return
        }
        editor = instance
        onReadyRef.current?.(instance)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        onErrorRef.current?.(
          cause instanceof Error ? cause : new Error('Pascal editor failed to load')
        )
      })

    return () => {
      cancelled = true
      editor?.dispose()
    }
  }, [loader])

  return <div {...containerProps} ref={containerRef} />
}
