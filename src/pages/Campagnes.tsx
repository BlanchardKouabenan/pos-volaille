import { useState, useEffect } from 'react'
import { campagneGetAll, campagneCreate, campagneDelete, campagneGetDestinataires, campagneMarquerEnvoyee, smsSend, getParametres } from '@/lib/ipc'
import { Megaphone, Plus, Trash2, Send, Users, X, Check, RefreshCw } from 'lucide-react'

const SEGMENTS = [
  { value: 'tous', label: 'Tous les clients', desc: 'Tous les clients avec numéro' },
  { value: 'vip', label: 'VIP (≥3 achats)', desc: 'Clients ayant effectué au moins 3 achats' },
  { value: 'inactifs', label: 'Inactifs (>30j)', desc: "N'ont pas acheté depuis 30 jours" },
  { value: 'fideles', label: 'Fidèles (≥100 pts)', desc: 'Clients avec 100 points ou plus' },
  { value: 'anniversaire_mois', label: 'Anniversaires ce mois', desc: 'Clients dont c\'est l\'anniversaire ce mois' },
]

const TEMPLATES: Record<string, string> = {
  promo: 'Bonjour {NOM}, profitez de -10% sur tous nos produits ce weekend ! Code: PROMO10. KB POS',
  fidelite: 'Bonjour {NOM}, vous avez {POINTS} points fidélité. Venez les utiliser chez KB POS !',
  anniversaire: 'Joyeux anniversaire {NOM} ! 🎂 KB POS vous offre 5% de réduction aujourd\'hui. Bonne fête !',
  relance: 'Bonjour {NOM}, cela fait un moment ! Revenez chez KB POS, nos produits frais vous attendent.',
}

interface Campagne {
  id: number; nom: string; segment: string; message_template: string
  statut: string; date_programmee?: string; date_envoi?: string
  nb_destinataires: number; nb_envoyes: number; nb_echecs: number
  created_at: string; user_nom?: string
}

export default function Campagnes() {
  const [campagnes, setCampagnes] = useState<Campagne[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [preview, setPreview] = useState<any[] | null>(null)
  const [sending, setSending] = useState<number | null>(null)
  const [smsConfig, setSmsConfig] = useState<any>(null)

  const [form, setForm] = useState({
    nom: '', segment: 'tous', message_template: '', date_programmee: ''
  })

  const load = async () => {
    setLoading(true)
    try {
      const [c, params] = await Promise.all([campagneGetAll(), getParametres()])
      setCampagnes(c as Campagne[])
      const p = params as any
      if (p?.sms_api_key) setSmsConfig({ provider: p.sms_provider, api_key: p.sms_api_key, from: p.sms_from })
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const handlePreviewSegment = async () => {
    const dest = await campagneGetDestinataires(form.segment)
    setPreview(dest)
  }

  const handleCreate = async () => {
    if (!form.nom.trim() || !form.message_template.trim()) return
    await campagneCreate({ ...form, date_programmee: form.date_programmee || undefined })
    setShowCreate(false)
    setForm({ nom: '', segment: 'tous', message_template: '', date_programmee: '' })
    setPreview(null)
    load()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer cette campagne ?')) return
    await campagneDelete(id)
    load()
  }

  const handleEnvoyer = async (campagne: Campagne) => {
    if (!smsConfig?.api_key) {
      alert('Configurez le SMS dans les Paramètres avant d\'envoyer.')
      return
    }
    if (!confirm(`Envoyer "${campagne.nom}" à ${campagne.nb_destinataires} destinataires ?`)) return
    setSending(campagne.id)
    const dest = await campagneGetDestinataires(campagne.segment)
    let nb = 0; let nbEchec = 0
    for (const d of dest) {
      const msg = campagne.message_template
        .replace('{NOM}', d.nom ?? '')
        .replace('{POINTS}', String(d.points_fidelite ?? 0))
      try {
        const r: any = await smsSend({ ...smsConfig, to: d.telephone, message: msg })
        if (r?.success) nb++; else nbEchec++
      } catch { nbEchec++ }
    }
    await campagneMarquerEnvoyee(campagne.id, nb, nbEchec)
    setSending(null)
    load()
  }

  const STATUT_BADGE: Record<string, string> = {
    brouillon: 'bg-gray-100 text-gray-600',
    planifie: 'bg-blue-100 text-blue-700',
    envoye: 'bg-emerald-100 text-emerald-700',
    echec: 'bg-red-100 text-red-700',
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-pink-600 rounded-xl flex items-center justify-center">
            <Megaphone size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Campagnes SMS</h1>
            <p className="text-gray-500 text-sm">Envoi ciblé de SMS promotionnels à vos clients</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100">
            <RefreshCw size={16} />
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-pink-600 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-pink-700">
            <Plus size={16} /> Nouvelle campagne
          </button>
        </div>
      </div>

      {!smsConfig?.api_key && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
          ⚠️ SMS non configuré. Allez dans <strong>Paramètres → SMS</strong> pour activer l'envoi.
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-pink-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : campagnes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Megaphone size={40} className="mx-auto mb-3" />
          <p>Aucune campagne. Créez-en une pour commencer.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campagnes.map(c => (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-gray-900">{c.nom}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUT_BADGE[c.statut] ?? 'bg-gray-100 text-gray-600'}`}>
                      {c.statut}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
                    <span className="flex items-center gap-1"><Users size={12} /> {c.nb_destinataires} destinataires</span>
                    <span>{SEGMENTS.find(s => s.value === c.segment)?.label ?? c.segment}</span>
                    {c.date_envoi && <span>Envoyé le {new Date(c.date_envoi).toLocaleDateString('fr-FR')}</span>}
                    {c.nb_envoyes > 0 && <span className="text-emerald-600">{c.nb_envoyes} envoyés</span>}
                    {c.nb_echecs > 0 && <span className="text-red-500">{c.nb_echecs} échecs</span>}
                  </div>
                  <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 italic truncate">
                    "{c.message_template}"
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {c.statut === 'brouillon' && (
                    <button onClick={() => handleEnvoyer(c)} disabled={sending === c.id}
                      className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
                      {sending === c.id ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                      Envoyer
                    </button>
                  )}
                  {c.statut === 'envoye' && <Check size={16} className="text-emerald-500" />}
                  <button onClick={() => handleDelete(c.id)} className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal création */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-bold text-lg">Nouvelle campagne SMS</h2>
              <button onClick={() => { setShowCreate(false); setPreview(null) }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Nom de la campagne</label>
                <input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })}
                  placeholder="Ex: Promo Weekend Juillet"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Segment cible</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {SEGMENTS.map(s => (
                    <label key={s.value} className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer border transition-all ${form.segment === s.value ? 'border-pink-400 bg-pink-50' : 'border-gray-100 hover:border-gray-200'}`}>
                      <input type="radio" checked={form.segment === s.value} onChange={() => { setForm({ ...form, segment: s.value }); setPreview(null) }} className="accent-pink-600" />
                      <div>
                        <div className="text-sm font-medium text-gray-800">{s.label}</div>
                        <div className="text-xs text-gray-400">{s.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <button onClick={handlePreviewSegment} className="mt-2 text-xs text-pink-600 hover:underline flex items-center gap-1">
                  <Users size={12} /> Aperçu des destinataires
                </button>
                {preview !== null && (
                  <div className="mt-2 bg-gray-50 rounded-xl p-2.5 text-xs text-gray-600 max-h-24 overflow-y-auto">
                    <strong>{preview.length} destinataire(s) :</strong>{' '}
                    {preview.slice(0, 8).map(d => d.nom).join(', ')}{preview.length > 8 && ` ...+${preview.length - 8}`}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Message</label>
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  {Object.entries(TEMPLATES).map(([k, v]) => (
                    <button key={k} onClick={() => setForm({ ...form, message_template: v })}
                      className="px-2 py-1 text-xs bg-gray-100 hover:bg-pink-100 text-gray-600 hover:text-pink-700 rounded-lg transition-all capitalize">{k}</button>
                  ))}
                </div>
                <textarea value={form.message_template} onChange={e => setForm({ ...form, message_template: e.target.value })}
                  rows={4} placeholder="Utilisez {NOM}, {POINTS} comme variables..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none" />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Variables : {'{'}NOM{'}'}, {'{'}POINTS{'}'}</span>
                  <span>{form.message_template.length} / 160 chars</span>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => { setShowCreate(false); setPreview(null) }}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">
                  Annuler
                </button>
                <button onClick={handleCreate} disabled={!form.nom || !form.message_template}
                  className="flex-1 px-4 py-2.5 bg-pink-600 text-white rounded-xl text-sm font-semibold hover:bg-pink-700 disabled:opacity-40">
                  Créer la campagne
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
