import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SessionCaisse } from '@/types'

interface SessionStore {
  session: SessionCaisse | null
  sessionId: number | null
  fondCaisse: number
  setSession: (session: SessionCaisse) => void
  clearSession: () => void
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      session: null,
      sessionId: null,
      fondCaisse: 0,
      setSession: (session: SessionCaisse) =>
        set({
          session,
          sessionId: session.id,
          fondCaisse: session.fond_caisse
        }),
      clearSession: () =>
        set({
          session: null,
          sessionId: null,
          fondCaisse: 0
        })
    }),
    { name: 'session-caisse' }
  )
)
