import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useState, useEffect } from 'react'
import {
  ShoppingCart, Package, BarChart3, Users, Settings,
  LogOut, AlertTriangle, Layers, Clock, Lock, UnlockKeyhole, TrendingDown, FileText, Tag,
  Truck, ClipboardList, TrendingUp, LineChart, Store, Bell, ArrowLeftRight, Warehouse, Barcode,
  Monitor, Megaphone, Calculator, Globe, Receipt, LayoutDashboard
} from 'lucide-react'
import { getLowStockProduits } from '@/lib/ipc'
import type { UserRole } from '@/types'
import { login, getParametres, forfaitGet } from '@/lib/ipc'
import type { ForfaitInfo } from '@/lib/ipc'
import { Eye, EyeOff, LogIn, Lock as LockIcon, KeyRound } from 'lucide-react'

interface NavItem {
  path: string
  label: string
  icon: JSX.Element
  roles: UserRole[]
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Accueil', icon: <LayoutDashboard size={22} />, roles: ['caissier', 'gestionnaire', 'admin', 'superviseur'] },
  { path: '/caisse', label: 'Caisse', icon: <ShoppingCart size={22} />, roles: ['caissier', 'gestionnaire', 'admin', 'superviseur'] },
  { path: '/transactions', label: 'Transactions', icon: <Receipt size={22} />, roles: ['caissier', 'gestionnaire', 'admin', 'superviseur'] },
  { path: '/cloture-caisse', label: 'Clôture Caisse', icon: <Lock size={22} />, roles: ['caissier', 'gestionnaire', 'admin', 'superviseur'] },
  { path: '/rapports', label: 'Rapports', icon: <BarChart3 size={22} />, roles: ['admin', 'superviseur'] },
  { path: '/etats', label: 'États', icon: <FileText size={22} />, roles: ['admin', 'gestionnaire', 'superviseur'] },
  { path: '/stock', label: 'Stock', icon: <Layers size={22} />, roles: ['gestionnaire', 'admin'] },
  { path: '/produits', label: 'Produits', icon: <Package size={22} />, roles: ['gestionnaire', 'admin'] },
  { path: '/charges', label: 'Charges', icon: <TrendingDown size={22} />, roles: ['gestionnaire', 'admin'] },
  { path: '/tiroir-log', label: 'Tiroir', icon: <UnlockKeyhole size={22} />, roles: ['admin', 'superviseur'] },
  { path: '/fournisseurs', label: 'Fournisseurs', icon: <Truck size={22} />, roles: ['admin', 'gestionnaire'] },
  { path: '/inventaire', label: 'Inventaire', icon: <ClipboardList size={22} />, roles: ['admin', 'gestionnaire'] },
  { path: '/promotions', label: 'Promos', icon: <Tag size={22} />, roles: ['admin', 'gestionnaire'] },
  { path: '/commercial', label: 'Commercial', icon: <TrendingUp size={22} />, roles: ['admin', 'gestionnaire'] },
  { path: '/analytics', label: 'Analytics', icon: <LineChart size={22} />, roles: ['admin', 'gestionnaire'] },
  { path: '/automatisations', label: 'Alertes', icon: <Bell size={22} />, roles: ['admin', 'gestionnaire'] },
  { path: '/import-export', label: 'Import/Export', icon: <ArrowLeftRight size={22} />, roles: ['admin', 'gestionnaire'] },
  { path: '/entrepots', label: 'Entrepôts', icon: <Warehouse size={22} />, roles: ['admin', 'gestionnaire'] },
  { path: '/etiquettes', label: 'Étiquettes', icon: <Barcode size={22} />, roles: ['admin', 'gestionnaire'] },
  { path: '/dashboard-proprio', label: 'Dashboard', icon: <Monitor size={22} />, roles: ['admin'] },
  { path: '/campagnes', label: 'Campagnes', icon: <Megaphone size={22} />, roles: ['admin', 'gestionnaire'] },
  { path: '/factures', label: 'Factures', icon: <Tag size={22} />, roles: ['admin', 'gestionnaire'] },
  { path: '/compte-resultat', label: 'Résultat', icon: <Calculator size={22} />, roles: ['admin'] },
  { path: '/sync', label: 'Sync', icon: <Globe size={22} />, roles: ['admin'] },
  { path: '/boutiques', label: 'Boutiques', icon: <Store size={22} />, roles: ['admin'] },
  { path: '/clients', label: 'Clients', icon: <Users size={22} />, roles: ['admin'] },
  { path: '/parametres', label: 'Paramètres', icon: <Settings size={22} />, roles: ['admin'] }
]

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  gestionnaire: 'Gestionnaire',
  caissier: 'Caissier',
  superviseur: 'Superviseur'
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-600',
  gestionnaire: 'bg-blue-600',
  caissier: 'bg-emerald-600',
  superviseur: 'bg-orange-600'
}

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [time, setTime] = useState(new Date())
  const [lowStockCount, setLowStockCount] = useState(0)
  const { login: storeLogin } = useAuthStore()
  const [locked, setLocked] = useState(false)
  const [lockUser, setLockUser] = useState('')
  const [lockPass, setLockPass] = useState('')
  const [lockShow, setLockShow] = useState(false)
  const [lockError, setLockError] = useState('')
  const [lockLoading, setLockLoading] = useState(false)
  const [forfait, setForfait] = useState<ForfaitInfo | null>(null)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const checkStock = async () => {
      try {
        const items = await getLowStockProduits()
        setLowStockCount(items.length)
      } catch {}
    }
    checkStock()
    const interval = setInterval(checkStock, 60000)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // ─── Forfait / expiration ───────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    const load = () => forfaitGet().then(f => { if (alive) setForfait(f) }).catch(() => {})
    load()
    const iv = setInterval(load, 60 * 60 * 1000)
    return () => { alive = false; clearInterval(iv) }
  }, [])

  // Décompte exact : recalculé chaque minute (le nombre de jours change à minuit)
  useEffect(() => {
    const compute = () => {
      if (!forfait?.expiration) { setDaysLeft(null); return }
      const end = new Date(forfait.expiration + 'T00:00:00').getTime()
      const todayMidnight = new Date().setHours(0, 0, 0, 0)
      setDaysLeft(Math.floor((end - todayMidnight) / 86400000))
    }
    compute()
    const iv = setInterval(compute, 60 * 1000)
    return () => clearInterval(iv)
  }, [forfait])

  // ─── Verrouillage automatique après inactivité ─────────────────────────────
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let lockMinutes = 30
    getParametres().then(p => {
      const v = parseInt(p?.auto_lock_minutes ?? '30', 10)
      lockMinutes = isNaN(v) || v < 0 ? 30 : v
    }).catch(() => {})
    const reset = () => {
      if (timer) clearTimeout(timer)
      // Recalcule la durée (paramètre modifiable)
      getParametres().then(p => {
        const v = parseInt(p?.auto_lock_minutes ?? '30', 10)
        lockMinutes = isNaN(v) || v < 0 ? 30 : v
        if (lockMinutes <= 0) return
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => setLocked(true), lockMinutes * 60 * 1000)
      }).catch(() => {})
    }
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']
    events.forEach(ev => window.addEventListener(ev, reset))
    reset()
    return () => {
      events.forEach(ev => window.removeEventListener(ev, reset))
      if (timer) clearTimeout(timer)
    }
  }, [])

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lockUser.trim() || !lockPass.trim()) { setLockError('Saisissez vos identifiants'); return }
    setLockLoading(true)
    setLockError('')
    try {
      const u = await login(lockUser.trim(), lockPass)
      if (u && (u as any).forfaitExpire) {
        setLockError('Forfait arrivé à expiration. Contactez votre administrateur pour le renouveler.')
      } else if (u) {
        storeLogin(u as any)
        setLocked(false)
        setLockUser(''); setLockPass(''); setLockError('')
      } else {
        setLockError('Identifiant ou mot de passe incorrect')
      }
    } catch { setLockError('Erreur de connexion') }
    setLockLoading(false)
  }

  const visibleNav = navItems.filter(item => user && item.roles.includes(user.role))

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Écran de verrouillage (auto après inactivité) */}
      {locked && (
        <div className="fixed inset-0 z-[100] bg-[#1a1f2e] flex items-center justify-center p-4">
          <div className="w-full max-w-md relative">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-amber-500 rounded-3xl shadow-2xl mb-4">
                <KeyRound size={36} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Écran verrouillé</h1>
              <p className="text-gray-400 mt-1 text-sm">Veuillez vous reconnecter pour continuer</p>
            </div>
            <div className="bg-white rounded-3xl shadow-2xl p-8">
              <form onSubmit={handleUnlock} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Identifiant</label>
                  <input type="text" value={lockUser} onChange={e => setLockUser(e.target.value)}
                    placeholder="Votre identifiant" autoFocus className="input-field text-lg h-14" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Mot de passe</label>
                  <div className="relative">
                    <input type={lockShow ? 'text' : 'password'} value={lockPass} onChange={e => setLockPass(e.target.value)}
                      placeholder="Votre mot de passe" className="input-field text-lg h-14 pr-14" />
                    <button type="button" onClick={() => setLockShow(!lockShow)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 p-1">
                      {lockShow ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>
                {lockError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-xl text-sm font-medium">{lockError}</div>}
                <button type="submit" disabled={lockLoading}
                  className="w-full btn-primary h-14 text-lg flex items-center justify-center gap-2 disabled:opacity-70">
                  {lockLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <><LogIn size={20} /> Déverrouiller</>}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Sidebar */}
      <aside className="w-20 lg:w-64 bg-[#1a1f2e] flex flex-col flex-shrink-0 transition-all duration-300">
        {/* Logo */}
        <div className="p-4 border-b border-[#2d3748]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
              K
            </div>
            <div className="hidden lg:block">
              <div className="text-white font-bold text-sm leading-tight">KB POS</div>
              <div className="text-gray-400 text-xs">Point de Vente</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleNav.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-150 group relative ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-gray-400 hover:bg-[#252d40] hover:text-white'
                }`
              }
            >
              <span className="flex-shrink-0">{item.icon}</span>
              <span className="hidden lg:block font-medium text-sm">{item.label}</span>
              {item.path === '/stock' && lowStockCount > 0 && (
                <span className="hidden lg:flex ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 items-center justify-center font-bold">
                  {lowStockCount}
                </span>
              )}
              {/* Tooltip for collapsed sidebar */}
              <div className="lg:hidden absolute left-full ml-2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                {item.label}
              </div>
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-[#2d3748]">
          <div className="hidden lg:block mb-2 px-3 py-2 bg-[#252d40] rounded-xl">
            <div className="text-white text-sm font-medium truncate">{user?.nom}</div>
            <span className={`inline-block text-white text-xs px-2 py-0.5 rounded-full mt-1 ${ROLE_COLORS[user?.role || 'caissier']}`}>
              {ROLE_LABELS[user?.role || 'caissier']}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-3 text-gray-400 hover:bg-red-600 hover:text-white rounded-xl transition-all duration-150 group"
          >
            <LogOut size={20} />
            <span className="hidden lg:block text-sm font-medium">Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Bandeau décompte forfait (bleu > 10 j, rouge ≤ 10 j) */}
        {forfait && forfait.expiration && daysLeft !== null && (
          <div className={`flex items-center gap-3 px-6 py-3 text-white text-sm font-medium flex-shrink-0 ${daysLeft < 10 ? 'bg-red-600' : 'bg-blue-600'}`}>
            <AlertTriangle size={18} />
            {daysLeft < 0 ? (
              <span>Forfait arrivé à expiration le {forfait.expiration}. Contactez votre administrateur pour renouveler. (expiré depuis {Math.abs(daysLeft)} jour(s))</span>
            ) : daysLeft === 0 ? (
              <span>Dernier jour du forfait aujourd'hui ({forfait.expiration}). Contactez votre administrateur pour renouveler.</span>
            ) : (
              <span>Jours restants du forfait : {daysLeft} jour{daysLeft > 1 ? 's' : ''} — expire le {forfait.expiration}.</span>
            )}
          </div>
        )}
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            {lowStockCount > 0 && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded-lg text-sm">
                <AlertTriangle size={15} />
                <span className="font-medium">{lowStockCount} produit(s) en stock bas</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Clock size={16} />
              <span className="font-mono font-medium">{time.toLocaleTimeString('fr-FR')}</span>
              <span className="text-gray-400">|</span>
              <span>{time.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                {user?.nom?.charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:block">
                <div className="text-sm font-semibold text-gray-800">{user?.nom}</div>
                <div className="text-xs text-gray-500">{ROLE_LABELS[user?.role || 'caissier']}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
