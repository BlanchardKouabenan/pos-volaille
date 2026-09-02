import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { clientProfileGet, whatsappOpenTicket, getProduits, getPrixClients, setPrixClientsBulk, updateClient } from '@/lib/ipc'
import { ArrowLeft, User, ShoppingBag, Star, Wallet, CreditCard, Gift, MessageCircle, Tag, Search, Save, Percent } from 'lucide-react'

export default function ClientProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [produits, setProduits] = useState<any[]>([])
  const [prixDraft, setPrixDraft] = useState<Record<number, string>>({})
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)
  const [remise, setRemise] = useState('')

  useEffect(() => {
    if (!id) return
    clientProfileGet(Number(id))
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!id) return
    ;(async () => {
      try {
        const [prods, prixRows] = await Promise.all([getProduits(), getPrixClients(Number(id))])
        setProduits(prods)
        const map: Record<number, string> = {}
        for (const p of prixRows) map[p.produit_id] = String(p.prix)
        setPrixDraft(map)
      } catch {}
    })()
    if (profile?.client?.remise_pct) setRemise(String(profile.client.remise_pct))
  }, [id])

  const savedTimer = () => {
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 2500)
  }

  const enregistrerTarifs = async () => {
    if (!id) return
    setSaving(true)
    try {
      const items = Object.entries(prixDraft)
        .filter(([, v]) => v.trim() !== '')
        .map(([pid, v]) => ({ produit_id: Number(pid), prix: parseFloat(v) || 0 }))
      await setPrixClientsBulk(Number(id), items)
      const r = parseFloat(remise)
      if (r >= 0 && r <= 100 && Number(profile?.client?.remise_pct) !== r) {
        await updateClient(Number(id), { remise_pct: r })
        setProfile((p: any) => ({ ...p, client: { ...p.client, remise_pct: r } }))
      }
      savedTimer()
    } catch {}
    setSaving(false)
  }

  const produitsFiltres = produits
    .filter((p: any) => p.actif !== 0)
    .filter((p: any) => (p.nom ?? '').toLowerCase().includes(search.toLowerCase()))
    .slice(0, 40)

  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')

  const envoyerWhatsApp = async () => {
    if (!profile?.client?.telephone) return
    const msg = `Bonjour ${profile.client.nom}, merci de votre fidélité chez KB POS ! Vous avez ${profile.pointsFidelite} points fidélité.`
    await whatsappOpenTicket(profile.client.telephone, msg)
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!profile) return (
    <div className="p-6 text-center text-gray-400">
      <User size={40} className="mx-auto mb-3" />
      <p>Client introuvable</p>
      <button onClick={() => navigate(-1)} className="mt-3 text-blue-600 hover:underline text-sm">← Retour</button>
    </div>
  )

  const { client, stats, achatsRecents, topProduits, soldeCredit, pointsFidelite, soldeWallet } = profile

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-black text-gray-900">{client.nom}</h1>
          <p className="text-gray-500 text-sm">{client.telephone ?? 'Pas de téléphone'} {client.email ? `• ${client.email}` : ''}</p>
        </div>
        {client.telephone && (
          <button onClick={envoyerWhatsApp}
            className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-600">
            <MessageCircle size={16} /> WhatsApp
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingBag size={14} className="text-blue-500" />
            <span className="text-xs text-gray-400 uppercase tracking-wide">Achats</span>
          </div>
          <div className="text-2xl font-black text-blue-600">{stats?.nb_achats ?? 0}</div>
          <div className="text-xs text-gray-400">depuis {stats?.premier_achat ? new Date(stats.premier_achat).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : '—'}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingBag size={14} className="text-emerald-500" />
            <span className="text-xs text-gray-400 uppercase tracking-wide">CA total</span>
          </div>
          <div className="text-2xl font-black text-emerald-600">{fmt(stats?.ca_total ?? 0)}</div>
          <div className="text-xs text-gray-400">FCFA dépensés</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <Star size={14} className="text-amber-500" />
            <span className="text-xs text-gray-400 uppercase tracking-wide">Points</span>
          </div>
          <div className="text-2xl font-black text-amber-600">{pointsFidelite}</div>
          <div className="text-xs text-gray-400">points fidélité</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={14} className="text-violet-500" />
            <span className="text-xs text-gray-400 uppercase tracking-wide">Porte-monnaie</span>
          </div>
          <div className="text-2xl font-black text-violet-600">{fmt(soldeWallet)}</div>
          <div className="text-xs text-gray-400">FCFA disponibles</div>
        </div>
      </div>

      {/* Ardoise + infos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Infos client */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <User size={16} className="text-gray-400" /> Informations
          </h3>
          <div className="space-y-2 text-sm">
            {[
              ['Nom', client.nom],
              ['Téléphone', client.telephone ?? '—'],
              ['Email', client.email ?? '—'],
              ['Date de naissance', client.date_naissance ? new Date(client.date_naissance).toLocaleDateString('fr-FR') : '—'],
              ['Client depuis', client.created_at ? new Date(client.created_at).toLocaleDateString('fr-FR') : '—'],
              ['Dernier achat', stats?.dernier_achat ? new Date(stats.dernier_achat).toLocaleDateString('fr-FR') : '—'],
              ['Panier moyen', `${fmt(stats?.panier_moyen ?? 0)} FCFA`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-gray-400">{k}</span>
                <span className="font-medium text-gray-800 text-right">{v}</span>
              </div>
            ))}
            {soldeCredit > 0 && (
              <div className="flex items-center gap-2 mt-3 bg-red-50 rounded-xl p-2.5">
                <CreditCard size={14} className="text-red-500" />
                <span className="text-sm font-semibold text-red-700">Ardoise : {fmt(soldeCredit)} FCFA</span>
              </div>
            )}
          </div>
        </div>

        {/* Top produits */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Gift size={16} className="text-gray-400" /> Produits préférés
          </h3>
          <div className="space-y-2">
            {(topProduits ?? []).map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-50">
                <span className="w-5 h-5 bg-gray-100 rounded-full text-xs flex items-center justify-center text-gray-500 font-bold flex-shrink-0">{i + 1}</span>
                <span className="flex-1 text-sm text-gray-800 truncate">{p.nom}</span>
                <div className="text-right text-xs">
                  <div className="font-bold text-emerald-600">{fmt(Number(p.depense))} FCFA</div>
                  <div className="text-gray-400">{p.qte_total} unités</div>
                </div>
              </div>
            ))}
            {!(topProduits?.length) && <p className="text-gray-400 text-sm">Aucun achat enregistré</p>}
          </div>
        </div>

        {/* Achats récents */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <ShoppingBag size={16} className="text-gray-400" /> Achats récents
          </h3>
          <div className="space-y-2">
            {(achatsRecents ?? []).map((v: any) => (
              <div key={v.id} className="py-1.5 border-b border-gray-50">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-xs font-mono text-gray-500">{v.numero_ticket}</div>
                    <div className="text-xs text-gray-400">{new Date(v.date).toLocaleDateString('fr-FR')}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-gray-800">{fmt(v.total)} FCFA</div>
                    <div className="text-xs text-gray-400 capitalize">{v.mode_paiement?.replace('_', ' ')}</div>
                  </div>
                </div>
              </div>
            ))}
            {!(achatsRecents?.length) && <p className="text-gray-400 text-sm">Aucun achat récent</p>}
          </div>
        </div>
      </div>

      {/* Tarifs spécifiques (grossiste / détaillant) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Tag size={16} className="text-gray-400" /> Tarifs spécifiques
          </h3>
          <span className="text-xs text-gray-400">Prix réservés à ce client. Les cases vides reprennent le prix normal.</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <Percent size={14} className="text-gray-400" />
              <input
                type="number"
                min={0}
                max={100}
                value={remise}
                onChange={e => setRemise(e.target.value)}
                placeholder="Remise %"
                className="w-14 bg-transparent text-right text-sm font-semibold text-gray-800 focus:outline-none"
              />
            </div>
            <button
              onClick={enregistrerTarifs}
              disabled={saving}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-xl text-sm font-semibold"
            >
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={15} />}
              Enregistrer
            </button>
          </div>
        </div>
        {savedMsg && <div className="mb-3 bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 rounded-xl text-sm">Tarifs enregistrés</div>}
        <div className="mb-3 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un produit..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400"
          />
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 rounded-xl border border-gray-100">
          {produitsFiltres.map((p: any) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{p.nom}</div>
                <div className="text-xs text-gray-400">Prix normal : {fmt(p.prix_vente)} FCFA</div>
              </div>
              <div className="w-28">
                <input
                  type="number"
                  min={0}
                  value={prixDraft[p.id] ?? ''}
                  onChange={e => setPrixDraft(d => ({ ...d, [p.id]: e.target.value }))}
                  placeholder="—"
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right font-semibold text-gray-800 focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
          ))}
          {!produitsFiltres.length && <p className="text-sm text-gray-400 px-3 py-4">Aucun produit trouvé</p>}
        </div>
      </div>
    </div>
  )
}
