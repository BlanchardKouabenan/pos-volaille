import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { profilList, profilApply, profilGet, getParametres, setParametres, getCategories } from '@/lib/ipc'
import type { ProfilListEntry } from '@/types'
import { Check, Store, ArrowRight, ChevronLeft, Building2, AlertTriangle } from 'lucide-react'

export default function Setup() {
  const navigate = useNavigate()
  const [profils, setProfils] = useState<ProfilListEntry[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [nomEntreprise, setNomEntreprise] = useState('')
  const [adresse, setAdresse] = useState('')
  const [nbCategories, setNbCategories] = useState(0)
  const [aucunProfil, setAucunProfil] = useState(true)
  const [remplacer, setRemplacer] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([profilList(), getParametres(), getCategories(), profilGet()])
      .then(([p, params, cats, prof]) => {
        setProfils(p)
        if (params?.nom_entreprise) setNomEntreprise(params.nom_entreprise)
        if (params?.adresse) setAdresse(params.adresse)
        setNbCategories(Array.isArray(cats) ? cats.length : 0)
        setAucunProfil(!prof)
        // Base déjà configurée (accès depuis le login) → présélectionner le type actuel
        if (prof) setSelected(prof.id)
        // Données existantes → proposer le remplacement du catalogue par défaut
        setRemplacer(cats.length > 0)
      })
      .catch(() => setError('Impossible de charger les types de commerce.'))
      .finally(() => setLoading(false))
  }, [])

  const handleApply = async () => {
    if (!selected) return
    if (!nomEntreprise.trim()) {
      setError('Veuillez saisir le nom de votre commerce.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await setParametres({ nom_entreprise: nomEntreprise.trim(), adresse: adresse.trim() })
      await profilApply(selected, { remplacerCatalogue: remplacer })
      navigate('/login', { replace: true })
    } catch {
      setError('Erreur pendant la configuration. Réessayez.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a1f2e] via-[#252d40] to-[#1a1f2e] flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-3xl relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-500 rounded-3xl shadow-2xl mb-4">
            <Store size={40} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Configuration de votre commerce</h1>
          <p className="text-gray-400 mt-2">
            Choisissez le type de commerce : l'application s'adapte automatiquement
            (unités, devise, TVA, paiements, catalogue de départ).
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8">
          {nbCategories > 0 && (
            <div className="mb-5 rounded-2xl border-2 p-4"
              style={{ borderColor: remplacer ? '#fbbf24' : '#d1d5db', backgroundColor: remplacer ? '#fffbeb' : '#f9fafb' }}>
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-bold text-gray-800">
                    {nbCategories} catégories et des produits existent déjà dans cette base
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    D'anciennes données (ex. catalogue volaille) peuvent subsister. Pour obtenir le
                    catalogue du commerce choisi, remplacez-les — l'historique des ventes est conservé.
                  </p>
                  <label className="inline-flex items-center gap-2 mt-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={remplacer}
                      onChange={e => setRemplacer(e.target.checked)}
                      className="w-4 h-4 accent-amber-500"
                    />
                    <span className="text-sm font-semibold text-gray-800">
                      Remplacer les produits et catégories par ceux du type choisi
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Type de commerce
          </label>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
              {profils.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p.id)}
                  className={`text-left rounded-2xl border-2 p-4 transition-all ${
                    selected === p.id
                      ? 'border-emerald-500 bg-emerald-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0"
                      style={{ backgroundColor: p.couleur + '22' }}
                    >
                      {p.icone}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">{p.label}</span>
                        {selected === p.id && <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{p.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Nom du commerce
              </label>
              <input
                value={nomEntreprise}
                onChange={e => setNomEntreprise(e.target.value)}
                placeholder="Ex. Boutique Maman Rose"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Adresse (optionnel)
              </label>
              <input
                value={adresse}
                onChange={e => setAdresse(e.target.value)}
                placeholder="Ex. Abidjan, Marcory"
                className="input-field"
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <p className="text-xs text-gray-400">
              Le catalogue de départ suit le type choisi. Vous pourrez changer de type de
              commerce à tout moment dans Paramètres.
            </p>
            <button
              onClick={handleApply}
              disabled={saving || !selected}
              className="btn-primary px-6 h-12 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
            >
              {saving ? (
                <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Building2 size={18} />
                  Configurer mon commerce
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </div>

        <p className="text-center text-gray-500 text-xs mt-6 flex items-center justify-center gap-1">
          <ChevronLeft size={14} />
          Vous pourrez modifier ce choix plus tard dans Paramètres &rarr; Type de commerce
        </p>
      </div>
    </div>
  )
}