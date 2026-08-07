import {
  QueryClient,
  QueryClientProvider
} from '@tanstack/react-query'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode
} from 'react'

import type { BackendConfig } from './backends'
import { createServices, type Services } from './createServices'
import type { HttpRequestTraceReporter } from './http'

interface ServicesProviderProps {
  backend: BackendConfig
  children: ReactNode
  getAccessToken?: () => string | null | Promise<string | null>
  traceRequest?: HttpRequestTraceReporter
}

interface ServicesContextValue {
  services: Services
  queryClient: QueryClient
}

const ServicesContext = createContext<ServicesContextValue | null>(null)

export function ServicesProvider({
  backend,
  children,
  getAccessToken,
  traceRequest
}: ServicesProviderProps): React.JSX.Element {
  const value = useMemo<ServicesContextValue>(() => {
    const services = createServices({ backend, getAccessToken, traceRequest })
    return {
      services,
      queryClient: new QueryClient()
    }
  }, [backend, getAccessToken, traceRequest])

  useEffect(() => {
    return () => {
      value.services.dispose()
      value.queryClient.clear()
    }
  }, [value])

  return (
    <ServicesContext.Provider value={value}>
      <QueryClientProvider client={value.queryClient}>
        {children}
      </QueryClientProvider>
    </ServicesContext.Provider>
  )
}

export function useServices(): Services {
  const contextValue = useContext(ServicesContext)
  if (!contextValue) {
    throw new Error('useServices must be used within ServicesProvider')
  }
  return contextValue.services
}
