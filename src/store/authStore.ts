import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  login: (user: User, sessionId?: number) => void
  logout: (sessionId?: number) => void
}

const callLogConnexion = (data: { user_id: number; type: 'connexion' | 'deconnexion' | 'cloture_session'; session_id?: number; note?: string }) => {
  try {
    const api = (window as any).electronAPI
    if (api?.db?.logConnexion) api.db.logConnexion(data)
  } catch {}
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: (user, sessionId) => {
        callLogConnexion({ user_id: user.id, type: 'connexion', session_id: sessionId })
        set({ user, isAuthenticated: true })
      },
      logout: (sessionId) => {
        const api = (window as any).electronAPI
        try {
          // Récupère l'utilisateur actuel avant de le supprimer du store
          const stored = JSON.parse(localStorage.getItem('pos-auth') || '{}')
          const userId = stored?.state?.user?.id
          if (userId) callLogConnexion({ user_id: userId, type: 'deconnexion', session_id: sessionId })
        } catch {}
        set({ user: null, isAuthenticated: false })
      }
    }),
    {
      name: 'pos-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated })
    }
  )
)
