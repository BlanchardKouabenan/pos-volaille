import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useSessionStore } from '@/store/sessionStore'
import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Caisse from '@/pages/Caisse'
import Dashboard from '@/pages/Dashboard'
import Stock from '@/pages/Stock'
import Produits from '@/pages/Produits'
import Rapports from '@/pages/Rapports'
import Clients from '@/pages/Clients'
import Parametres from '@/pages/Parametres'
import ClotureCaisse from '@/pages/ClotureCaisse'
import TiroirLogPage from '@/pages/TiroirLog'
import Charges from '@/pages/Charges'
import Etats from '@/pages/Etats'
import Promotions from '@/pages/Promotions'
import Fournisseurs from '@/pages/Fournisseurs'
import Inventaire from '@/pages/Inventaire'
import Commercial from '@/pages/Commercial'
import Analytics from '@/pages/Analytics'
import Boutiques from '@/pages/Boutiques'
import Automatisations from '@/pages/Automatisations'
import ImportExport from '@/pages/ImportExport'
import Entrepots from '@/pages/Entrepots'
import Etiquettes from '@/pages/Etiquettes'
import DashboardProprietaire from '@/pages/DashboardProprietaire'
import Campagnes from '@/pages/Campagnes'
import ClientProfile from '@/pages/ClientProfile'
import Factures from '@/pages/Factures'
import CompteResultat from '@/pages/CompteResultat'
import Sync from '@/pages/Sync'
import Transactions from '@/pages/Transactions'
import CaisseMobile from '@/pages/CaisseMobile'
import FondCaisseModal from '@/components/FondCaisseModal'
import CustomerDisplay from '@/pages/CustomerDisplay'
import { getSessionOuverte } from '@/lib/ipc'
import type { UserRole } from '@/types'
import Setup from '@/pages/Setup'
import { useProfilStore } from '@/store/profilStore'

function RequireAuth({ children, roles }: { children: JSX.Element; roles?: UserRole[] }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/caisse" replace />
  return children
}

function AppInner() {
  const { isAuthenticated, user } = useAuthStore()
  const { session, setSession } = useSessionStore()
  const loadProfil = useProfilStore(s => s.load)
  const [showFondCaisse, setShowFondCaisse] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)

  useEffect(() => {
    loadProfil()
  }, [loadProfil])

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setSessionChecked(true)
      return
    }

    const checkSession = async () => {
      try {
        if (session) {
          // Session déjà en store, vérifier si elle est toujours valide (même jour)
          const today = new Date().toISOString().slice(0, 10)
          if (session.date !== today || session.statut !== 'ouvert') {
            // Session expirée ou clôturée, chercher une nouvelle
            const sess = await getSessionOuverte(user.id)
            if (sess) {
              setSession(sess)
            } else {
              // Afficher le modal de fond de caisse uniquement pour les caissiers
              if (user.role === 'caissier') {
                setShowFondCaisse(true)
              }
            }
          }
        } else {
          const sess = await getSessionOuverte(user.id)
          if (sess) {
            setSession(sess)
          } else if (user.role === 'caissier') {
            setShowFondCaisse(true)
          }
        }
      } catch {
        // En cas d'erreur, ne pas bloquer l'interface
      }
      setSessionChecked(true)
    }

    checkSession()
  }, [isAuthenticated, user?.id])

  if (!sessionChecked && isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Chargement de la session...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="caisse" element={<Caisse />} />
          <Route path="cloture-caisse" element={<ClotureCaisse />} />
          <Route path="stock" element={
            <RequireAuth roles={['gestionnaire', 'admin']}><Stock /></RequireAuth>
          } />
          <Route path="produits" element={
            <RequireAuth roles={['gestionnaire', 'admin']}><Produits /></RequireAuth>
          } />
          <Route path="charges" element={
            <RequireAuth roles={['gestionnaire', 'admin']}><Charges /></RequireAuth>
          } />
        <Route path="rapports" element={
          <RequireAuth roles={['admin', 'superviseur']}><Rapports /></RequireAuth>
        } />
        <Route path="tiroir-log" element={
          <RequireAuth roles={['admin', 'superviseur']}><TiroirLogPage /></RequireAuth>
        } />
        <Route path="fournisseurs" element={
          <RequireAuth roles={['admin', 'gestionnaire']}><Fournisseurs /></RequireAuth>
        } />
          <Route path="inventaire" element={
            <RequireAuth roles={['admin', 'gestionnaire']}><Inventaire /></RequireAuth>
          } />
          <Route path="promotions" element={
            <RequireAuth roles={['admin', 'gestionnaire']}><Promotions /></RequireAuth>
          } />
          <Route path="commercial" element={
            <RequireAuth roles={['admin', 'gestionnaire']}><Commercial /></RequireAuth>
          } />
        <Route path="etats" element={
          <RequireAuth roles={['admin', 'gestionnaire', 'superviseur']}><Etats /></RequireAuth>
        } />
          <Route path="analytics" element={
            <RequireAuth roles={['admin', 'gestionnaire']}><Analytics /></RequireAuth>
          } />
          <Route path="boutiques" element={
            <RequireAuth roles={['admin']}><Boutiques /></RequireAuth>
          } />
          <Route path="automatisations" element={
            <RequireAuth roles={['admin', 'gestionnaire']}><Automatisations /></RequireAuth>
          } />
          <Route path="import-export" element={
            <RequireAuth roles={['admin', 'gestionnaire']}><ImportExport /></RequireAuth>
          } />
          <Route path="entrepots" element={
            <RequireAuth roles={['admin', 'gestionnaire']}><Entrepots /></RequireAuth>
          } />
          <Route path="etiquettes" element={
            <RequireAuth roles={['admin', 'gestionnaire']}><Etiquettes /></RequireAuth>
          } />
          <Route path="dashboard-proprio" element={
            <RequireAuth roles={['admin']}><DashboardProprietaire /></RequireAuth>
          } />
          <Route path="campagnes" element={
            <RequireAuth roles={['admin', 'gestionnaire']}><Campagnes /></RequireAuth>
          } />
          <Route path="clients/:id" element={
            <RequireAuth roles={['admin', 'gestionnaire']}><ClientProfile /></RequireAuth>
          } />
          <Route path="factures" element={
            <RequireAuth roles={['admin', 'gestionnaire']}><Factures /></RequireAuth>
          } />
          <Route path="compte-resultat" element={
            <RequireAuth roles={['admin']}><CompteResultat /></RequireAuth>
          } />
          <Route path="sync" element={
            <RequireAuth roles={['admin']}><Sync /></RequireAuth>
          } />
          <Route path="transactions" element={
            <RequireAuth><Transactions /></RequireAuth>
          } />
          <Route path="clients" element={
            <RequireAuth roles={['admin']}><Clients /></RequireAuth>
          } />
          <Route path="parametres" element={
            <RequireAuth roles={['admin']}><Parametres /></RequireAuth>
          } />
        </Route>
        <Route path="/mobile" element={<RequireAuth><CaisseMobile /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Modal fond de caisse - affiché au démarrage si pas de session */}
      {isAuthenticated && user && showFondCaisse && (
        <FondCaisseModal
          user={user}
          onClose={() => setShowFondCaisse(false)}
        />
      )}
    </>
  )
}

export default function App() {
  const isCustomerMode = new URLSearchParams(window.location.search).get('mode') === 'customer'
  if (isCustomerMode) return <CustomerDisplay />

  return (
    <HashRouter>
      <AppInner />
    </HashRouter>
  )
}
