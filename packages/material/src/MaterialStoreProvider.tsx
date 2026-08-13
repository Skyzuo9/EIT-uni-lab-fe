import {
  createContext,
  useContext,
  type ReactNode
} from 'react'
import { useStore } from 'zustand'

import type { MaterialStore, MaterialStoreState } from './store'

const MaterialStoreContext = createContext<MaterialStore | null>(null)

export function MaterialStoreProvider({
  store,
  children
}: {
  store: MaterialStore
  children: ReactNode
}): React.JSX.Element {
  return (
    <MaterialStoreContext.Provider value={store}>
      {children}
    </MaterialStoreContext.Provider>
  )
}

export function useMaterialStoreApi(): MaterialStore {
  const store = useContext(MaterialStoreContext)
  if (!store) {
    throw new Error(
      'useMaterialStoreApi must be used within MaterialStoreProvider'
    )
  }
  return store
}

export function useMaterialStore<Selected>(
  selector: (state: MaterialStoreState) => Selected
): Selected {
  return useStore(useMaterialStoreApi(), selector)
}
