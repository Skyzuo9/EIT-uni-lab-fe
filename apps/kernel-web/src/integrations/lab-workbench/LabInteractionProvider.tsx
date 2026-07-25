import {
  createContext,
  useContext,
  useRef,
  type ReactNode
} from 'react'
import { useStore } from 'zustand'

import {
  createLabInteractionStore,
  type LabInteractionState,
  type LabInteractionStore
} from './interactionStore'

const LabInteractionContext = createContext<LabInteractionStore | null>(null)

export function LabInteractionProvider({
  children
}: {
  children: ReactNode
}): React.JSX.Element {
  const storeRef = useRef<LabInteractionStore | null>(null)
  if (!storeRef.current) {
    storeRef.current = createLabInteractionStore()
  }

  return (
    <LabInteractionContext.Provider value={storeRef.current}>
      {children}
    </LabInteractionContext.Provider>
  )
}

export function useLabInteraction<Value>(
  selector: (state: LabInteractionState) => Value
): Value {
  const store = useContext(LabInteractionContext)
  if (!store) {
    throw new Error(
      'useLabInteraction must be used within LabInteractionProvider'
    )
  }
  return useStore(store, selector)
}

export function useLabInteractionStore(): LabInteractionStore {
  const store = useContext(LabInteractionContext)
  if (!store) {
    throw new Error(
      'useLabInteractionStore must be used within LabInteractionProvider'
    )
  }
  return store
}
