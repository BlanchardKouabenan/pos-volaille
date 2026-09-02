import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { login, getParametres, profilGet } from '@/lib/ipc'
import { Eye, EyeOff, LogIn } from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const { login: storeLogin } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [nomEntreprise, setNomEntreprise] = useState('KB POS')
  const [adresse, setAdresse] = useState('')

  useEffect(() => {
    getParametres().then(p => {
      if (p?.nom_entreprise) setNomEntreprise(p.nom_entreprise)
      if (p?.adresse) setAdresse(p.adresse)
    }).catch(() => {})
    // Premier lancement : aucun type de commerce défini → installation
    profilGet().then(prof => {
      if (!prof) navigate('/setup', { replace: true })
    }).catch(() => {})
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('Veuillez saisir votre identifiant et mot de passe')
      return
    }
    setLoading(true)
    setError('')
    try {
      const user = await login(username.trim(), password)
      if (user && (user as any).forfaitExpire) {
        setError('Forfait arrivé à expiration. Contactez votre administrateur pour le renouveler.')
      } else if (user) {
        storeLogin(user as any)
        navigate('/caisse')
      } else {
        setError('Identifiant ou mot de passe incorrect')
      }
    } catch (err) {
      setError('Erreur de connexion. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a1f2e] via-[#252d40] to-[#1a1f2e] flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 text-8xl opacity-5">🏪</div>
        <div className="absolute top-40 right-20 text-6xl opacity-5">🛍️</div>
        <div className="absolute bottom-20 left-20 text-7xl opacity-5">👕</div>
        <div className="absolute bottom-40 right-10 text-5xl opacity-5">💳</div>
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo card */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-amber-500 rounded-3xl shadow-2xl mb-4">
            <span className="text-5xl">🏪</span>
          </div>
          <h1 className="text-3xl font-bold text-white">{nomEntreprise}</h1>
          {adresse && <p className="text-gray-400 mt-1 text-sm">{adresse}</p>}
          <p className="text-gray-500 mt-2 text-sm">Système de Caisse Enregistreuse</p>
        </div>

        {/* Login form */}
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">Connexion</h2>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Identifiant
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Entrez votre identifiant"
                className="input-field text-lg h-14"
                autoComplete="username"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Entrez votre mot de passe"
                  className="input-field text-lg h-14 pr-14"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary h-14 text-lg flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={22} />
                  Se connecter
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          POS Commerce v1.0.0 — © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
