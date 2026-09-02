import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useSessionStore } from '@/store/sessionStore'
import {
  getSessionOuverte, cloturerSession, getVenteStats,
  getChargesStats, getTiroirLog, formatCurrency, getParametres,
  emailEnvoyerControle, getMouvementsCaisse,
  verifieCodeSuperviseur, rotationVerifier
} from '@/lib/ipc'
import type { SessionCaisse, TiroirLog, MouvementCaisse } from '@/types'
import {
  ArrowLeft, Lock, Check, AlertTriangle, Banknote,
  TrendingUp, Receipt, Clock, Wallet, X, Printer, ClipboardCheck, Mail, ShieldAlert
} from 'lucide-react'

const MODE_LABELS: Record<string, string> = {
  especes: 'Espèces', wave: 'Wave', orange_money: 'Orange Money', mtn: 'MTN Money', carte: 'Carte bancaire'
}

function NumPad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const press = (key: string) => {
    if (key === 'C') { onChange(''); return }
    if (key === '⌫') { onChange(value.slice(0, -1)); return }
    if (value === '0' && key !== '.') { onChange(key); return }
    onChange(value + key)
  }
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '000', '0', '⌫']
  return (
    <div className="space-y-2">
      <input
        autoFocus
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        placeholder="Tapez au clavier ou utilisez le pavé"
        className="w-full text-3xl font-bold text-center text-gray-800 bg-white rounded-xl py-2 border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      <div className="grid grid-cols-3 gap-2">
        {keys.map(k => (
          <button key={k} type="button" onClick={() => press(k)}
            className="h-12 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-lg rounded-xl transition-all">
            {k}
          </button>
        ))}
        <button type="button" onClick={() => press('C')}
          className="col-span-3 h-10 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-xl transition-all">
          Effacer tout
        </button>
      </div>
    </div>
  )
}

export default function ClotureCaisse() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { logout } = useAuthStore()
  const { session, setSession, clearSession } = useSessionStore()
  const [sessionData, setSessionData] = useState<SessionCaisse | null>(null)
  const [stats, setStats] = useState<any>(null)
  const [chargesStats, setChargesStats] = useState<any>(null)
  const [tiroirLogs, setTiroirLogs] = useState<TiroirLog[]>([])
  const [mouvements, setMouvements] = useState<MouvementCaisse[]>([])
  const [montantCompteSaisi, setMontantCompteSaisi] = useState('0')
  const [monnaie, setMonnaie] = useState('FCFA')
  const [loading, setLoading] = useState(true)
  const [cloturing, setCloturing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [cloturee, setCloturee] = useState(false)
  const [error, setError] = useState('')
  const [controleMsg, setControleMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [codeSaisi, setCodeSaisi] = useState('')
  const [codeErreur, setCodeErreur] = useState('')
  const [codeLoading, setCodeLoading] = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [p, tLogs, mvts] = await Promise.all([
          getParametres(),
          getTiroirLog(today, today),
          getMouvementsCaisse(today, today)
        ])
        if (p?.monnaie) setMonnaie(p.monnaie)
        setTiroirLogs(tLogs)
        setMouvements(mvts)

        // Charger la session
        let sess = session
        if (!sess && user) {
          sess = await getSessionOuverte(user.id)
          if (sess) setSession(sess)
        }
        setSessionData(sess)

        if (sess) {
          const [s, cs] = await Promise.all([
            getVenteStats(sess.date, sess.date),
            getChargesStats(sess.date, sess.date)
          ])
          setStats(s)
          setChargesStats(cs)
        }
      } catch (err) {
        setError('Erreur lors du chargement des données')
      }
      setLoading(false)
    }
    load()
  }, [])

  const fmt = (v: number) => formatCurrency(v, monnaie)

  const montantCompte = parseInt(montantCompteSaisi) || 0

  // Calculs
  const fondCaisse = sessionData?.fond_caisse ?? 0
  const totalVentes = stats?.totalVentes?.ca ?? 0
  const totalCharges = chargesStats?.total?.total ?? 0
  const ventesEspeces = stats?.parModePaiement?.find((m: any) => m.mode_paiement === 'especes')?.total ?? 0
  const totalVersements = mouvements.filter(m => m.type === 'versement').reduce((s, m) => s + m.montant, 0)
  const totalRetraits = mouvements.filter(m => m.type === 'retrait').reduce((s, m) => s + m.montant, 0)
  const espècesAttendues = fondCaisse + ventesEspeces + totalVersements - totalRetraits
  const ecart = montantCompte - espècesAttendues
  const resultatNet = totalVentes - totalCharges

  const handleCloturer = async () => {
    if (!sessionData) return
    setCloturing(true)
    setError('')
    try {
      await cloturerSession(sessionData.id, montantCompte)
      // Déconnexion + retour à l'écran de connexion (ne laisse pas le caissier sur la caisse)
      clearSession()
      logout(sessionData.id)
      setCloturee(true)
      setShowConfirm(false)
      navigate('/login', { replace: true })
    } catch (err: any) {
      setError('Erreur lors de la clôture: ' + (err.message || ''))
    }
    setCloturing(false)
  }

  const verifierCode = async (code: string): Promise<boolean> => {
    if (code.length === 4) {
      const ok = await verifieCodeSuperviseur(code)
      if (ok) return true
    }
    const res = await rotationVerifier(code)
    return !!res?.ok
  }

  const handleDemanderCode = () => {
    setCodeSaisi('')
    setCodeErreur('')
    setShowCodeModal(true)
  }

  const handleValiderCode = async () => {
    if (codeSaisi.length < 4) { setCodeErreur('Code trop court'); return }
    setCodeLoading(true)
    setCodeErreur('')
    try {
      const ok = await verifierCode(codeSaisi)
      if (ok) {
        setShowCodeModal(false)
        setShowConfirm(false)
        handleCloturer()
      } else {
        setCodeErreur('Code superviseur incorrect. Accès refusé.')
        setCodeSaisi('')
      }
    } catch {
      setCodeErreur('Erreur de vérification du code')
    }
    setCodeLoading(false)
  }

  const handleControle = async () => {
    if (!sessionData) return
    setCloturing(true)
    setError('')
    setControleMsg(null)
    try {
      const res = await emailEnvoyerControle(sessionData.id, montantCompte)
      if (res?.success) {
        setControleMsg({ ok: true, text: 'Relevé de contrôle envoyé par email. La session reste ouverte.' })
      } else {
        setControleMsg({ ok: false, text: 'Le relevé est affiché mais l\'envoi email a échoué: ' + (res?.error || 'vérifier la config SMTP') })
      }
    } catch (err: any) {
      setControleMsg({ ok: false, text: 'Le relevé est affiché mais l\'envoi email a échoué: ' + (err.message || '') })
    }
    setCloturing(false)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (cloturee) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow-card p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={40} className="text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Caisse clôturée</h2>
          <p className="text-gray-500 mb-6">La session a été clôturée avec succès.</p>
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm mb-6">
            <div className="flex justify-between">
              <span className="text-gray-500">CA du jour</span>
              <span className="font-bold text-blue-700">{fmt(totalVentes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Charges</span>
              <span className="font-bold text-red-600">-{fmt(totalCharges)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-2">
              <span className="font-semibold text-gray-700">Résultat net</span>
              <span className={`font-bold ${resultatNet >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(resultatNet)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Écart caisse</span>
              <span className={`font-bold ${ecart === 0 ? 'text-gray-600' : ecart > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {ecart >= 0 ? '+' : ''}{fmt(ecart)}
              </span>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => window.print()}
              className="flex-1 flex items-center justify-center gap-2 h-12 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all"
            >
              <Printer size={18} /> Imprimer
            </button>
            <button
              onClick={() => navigate('/caisse')}
              className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all"
            >
              Retour à la caisse
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!sessionData) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow-card p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={32} className="text-yellow-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Aucune session ouverte</h2>
          <p className="text-gray-500 mb-6">Il n'y a pas de session de caisse ouverte aujourd'hui.</p>
          <button onClick={() => navigate('/caisse')} className="btn-primary w-full h-12">
            Retour à la caisse
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 flex-shrink-0 flex items-center gap-4">
        <button
          onClick={() => navigate('/caisse')}
          className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Clôture de caisse</h1>
          <p className="text-sm text-gray-500">
            Session du {new Date(sessionData.date).toLocaleDateString('fr-FR')} — Ouverture à {sessionData.heure_ouverture}
          </p>
        </div>
        {error && (
          <div className="ml-auto bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-xl text-sm flex items-center gap-2">
            <AlertTriangle size={15} /> {error}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">

          {/* Résumé session */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Fond initial', value: fmt(fondCaisse), icon: <Wallet size={20} />, color: 'bg-blue-600' },
              { label: 'CA du jour', value: fmt(totalVentes), icon: <TrendingUp size={20} />, color: 'bg-emerald-600' },
              { label: 'Nb ventes', value: String(stats?.totalVentes?.nb ?? 0), icon: <Receipt size={20} />, color: 'bg-purple-600' },
              { label: 'Durée session', value: sessionData.heure_ouverture, icon: <Clock size={20} />, color: 'bg-orange-500' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-2xl shadow-card p-4 flex items-center gap-3">
                <div className={`w-10 h-10 ${kpi.color} text-white rounded-xl flex items-center justify-center flex-shrink-0`}>
                  {kpi.icon}
                </div>
                <div>
                  <div className="text-xs text-gray-500">{kpi.label}</div>
                  <div className="font-bold text-gray-800">{kpi.value}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Ventes par mode */}
            <div className="bg-white rounded-2xl shadow-card p-5">
              <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <TrendingUp size={18} className="text-blue-600" />
                Ventes par mode de paiement
              </h2>
              {(!stats?.parModePaiement || stats.parModePaiement.length === 0) ? (
                <p className="text-gray-400 text-sm text-center py-4">Aucune vente aujourd'hui</p>
              ) : (
                <div className="space-y-2">
                  {stats.parModePaiement.map((m: any) => (
                    <div key={m.mode_paiement} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div>
                        <div className="font-semibold text-gray-800 text-sm">{MODE_LABELS[m.mode_paiement] || m.mode_paiement}</div>
                        <div className="text-xs text-gray-500">{m.nb} vente(s)</div>
                      </div>
                      <div className="font-bold text-blue-700">{fmt(m.total)}</div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-200">
                    <span className="font-bold text-blue-800">TOTAL VENTES</span>
                    <span className="font-bold text-blue-800 text-lg">{fmt(totalVentes)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Charges */}
            <div className="bg-white rounded-2xl shadow-card p-5">
              <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Banknote size={18} className="text-red-500" />
                Charges du jour
              </h2>
              {(!chargesStats?.parCategorie || chargesStats.parCategorie.length === 0) ? (
                <p className="text-gray-400 text-sm text-center py-4">Aucune charge enregistrée</p>
              ) : (
                <div className="space-y-2">
                  {chargesStats.parCategorie.map((c: any) => (
                    <div key={c.categorie} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div>
                        <div className="font-semibold text-gray-800 text-sm">{c.categorie}</div>
                        <div className="text-xs text-gray-500">{c.nb} opération(s)</div>
                      </div>
                      <div className="font-bold text-red-600">{fmt(c.total)}</div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-200">
                    <span className="font-bold text-red-800">TOTAL CHARGES</span>
                    <span className="font-bold text-red-800 text-lg">{fmt(totalCharges)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Résultat net */}
          <div className="bg-white rounded-2xl shadow-card p-5">
            <h2 className="font-bold text-gray-800 mb-4">Résultat financier</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-xl p-4 text-center">
                <div className="text-sm text-blue-600 font-medium mb-1">CA Brut</div>
                <div className="text-2xl font-bold text-blue-800">{fmt(totalVentes)}</div>
              </div>
              <div className="bg-red-50 rounded-xl p-4 text-center">
                <div className="text-sm text-red-600 font-medium mb-1">Charges</div>
                <div className="text-2xl font-bold text-red-800">-{fmt(totalCharges)}</div>
              </div>
              <div className={`rounded-xl p-4 text-center ${resultatNet >= 0 ? 'bg-emerald-50' : 'bg-orange-50'}`}>
                <div className={`text-sm font-medium mb-1 ${resultatNet >= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>Résultat net</div>
                <div className={`text-2xl font-bold ${resultatNet >= 0 ? 'text-emerald-800' : 'text-orange-800'}`}>{fmt(resultatNet)}</div>
              </div>
            </div>
          </div>

          {/* Comptage espèces */}
          <div className="bg-white rounded-2xl shadow-card p-5">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Banknote size={18} className="text-emerald-600" />
              Comptage des espèces en caisse
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 text-center mb-4">
                  <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Montant compté</div>
                  <div className="text-4xl font-bold text-gray-800">
                    {montantCompte.toLocaleString('fr-FR')} <span className="text-xl text-gray-500">FCFA</span>
                  </div>
                </div>
                <NumPad value={montantCompteSaisi} onChange={setMontantCompteSaisi} />
              </div>

              <div className="space-y-3">
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Fond initial</span>
                    <span className="font-semibold">{fmt(fondCaisse)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Ventes espèces</span>
                    <span className="font-semibold text-emerald-600">+{fmt(ventesEspeces)}</span>
                  </div>
                  {totalVersements > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Versements</span>
                      <span className="font-semibold text-emerald-600">+{fmt(totalVersements)}</span>
                    </div>
                  )}
                  {totalRetraits > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Retraits</span>
                      <span className="font-semibold text-red-500">-{fmt(totalRetraits)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold border-t border-gray-200 pt-3">
                    <span className="text-gray-700">Espèces attendues</span>
                    <span className="text-blue-700">{fmt(espècesAttendues)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Montant compté</span>
                    <span className="font-semibold">{fmt(montantCompte)}</span>
                  </div>
                  <div className={`flex justify-between font-bold text-base border-t border-gray-200 pt-3 ${ecart === 0 ? 'text-gray-700' : ecart > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    <span>Écart</span>
                    <span>{ecart >= 0 ? '+' : ''}{fmt(ecart)}</span>
                  </div>
                </div>

                {ecart !== 0 && (
                  <div className={`p-3 rounded-xl text-sm flex items-center gap-2 ${ecart > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    <AlertTriangle size={16} />
                    {ecart > 0 ? `Excédent de ${fmt(ecart)} en caisse` : `Manque de ${fmt(Math.abs(ecart))} en caisse`}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Dernières ouvertures tiroir */}
          {tiroirLogs.length > 0 && (
            <div className="bg-white rounded-2xl shadow-card p-5">
              <h2 className="font-bold text-gray-800 mb-4">Ouvertures de tiroir du jour</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-gray-100">
                      <th className="pb-2 text-gray-500 font-semibold">Heure</th>
                      <th className="pb-2 text-gray-500 font-semibold">Type</th>
                      <th className="pb-2 text-gray-500 font-semibold">Caissier</th>
                      <th className="pb-2 text-gray-500 font-semibold">Ticket</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {tiroirLogs.slice(0, 10).map(log => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="py-2 font-mono text-xs text-gray-600">
                          {new Date(log.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2">
                          <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-semibold ${
                            log.type === 'vente' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {log.type === 'vente' ? 'Vente' : 'Ouverture manuelle'}
                          </span>
                        </td>
                        <td className="py-2 text-gray-700">{log.user_nom || '—'}</td>
                        <td className="py-2 font-mono text-xs text-gray-500">{log.numero_ticket || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Mouvements de caisse du jour */}
          {mouvements.length > 0 && (
            <div className="bg-white rounded-2xl shadow-card p-5">
              <h2 className="font-bold text-gray-800 mb-4">Mouvements de caisse du jour</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-gray-100">
                      <th className="pb-2 text-gray-500 font-semibold">Heure</th>
                      <th className="pb-2 text-gray-500 font-semibold">Type</th>
                      <th className="pb-2 text-gray-500 font-semibold">Caissier</th>
                      <th className="pb-2 text-gray-500 font-semibold">Motif</th>
                      <th className="pb-2 text-right text-gray-500 font-semibold">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {mouvements.map(m => (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="py-2 font-mono text-xs text-gray-600">
                          {new Date(m.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2">
                          <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-semibold ${
                            m.type === 'versement' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {m.type === 'versement' ? 'Versement' : 'Retrait'}
                          </span>
                        </td>
                        <td className="py-2 text-gray-700">{m.user_nom || '—'}</td>
                        <td className="py-2 text-xs text-gray-500 italic">{m.motif || '—'}</td>
                        <td className={`py-2 text-right font-bold ${m.type === 'versement' ? 'text-emerald-600' : 'text-red-500'}`}>
                          {m.type === 'versement' ? '+' : '-'}{fmt(m.montant)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Bouton clôturer */}
          <div className="flex gap-3 pb-6">
            <button
              onClick={() => navigate('/caisse')}
              className="flex items-center gap-2 h-14 px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all"
            >
              <ArrowLeft size={18} />
              Retour
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              className="flex-1 h-14 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-lg rounded-xl transition-all flex items-center justify-center gap-3"
            >
              <Lock size={22} />
              Clôturer et imprimer
            </button>
          </div>
        </div>
      </div>

      {/* Modal confirmation clôture */}
      {showConfirm && (
        <div className="modal-overlay">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                  <Lock size={24} className="text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Confirmer la clôture</h3>
                  <p className="text-sm text-gray-500">Cette action est irréversible.</p>
                </div>
              </div>
              <button onClick={() => setShowConfirm(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm mb-5">
              <div className="flex justify-between">
                <span className="text-gray-500">CA du jour</span>
                <span className="font-bold">{fmt(totalVentes)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Espèces attendues</span>
                <span className="font-bold">{fmt(espècesAttendues)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Espèces comptées</span>
                <span className="font-bold">{fmt(montantCompte)}</span>
              </div>
              <div className={`flex justify-between font-bold border-t border-gray-200 pt-2 ${ecart === 0 ? 'text-gray-700' : ecart > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                <span>Écart</span>
                <span>{ecart >= 0 ? '+' : ''}{fmt(ecart)}</span>
              </div>
            </div>

            <div className="flex gap-3 mb-3">
              <button
                onClick={handleControle}
                disabled={cloturing}
                className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {cloturing ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><ClipboardCheck size={18} /> Relevé de contrôle (sans clôturer)</>
                )}
              </button>
            </div>
            {controleMsg && (
              <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${controleMsg.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
                {controleMsg.ok ? <Mail size={16} className="inline mr-1" /> : <AlertTriangle size={16} className="inline mr-1" />}
                {controleMsg.text}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 h-12 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all"
              >
                Annuler
              </button>
              <button
                onClick={handleDemanderCode}
                disabled={cloturing}
                className="flex-1 h-12 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {cloturing ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><Lock size={18} /> Clôturer</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal code superviseur pour clôturer */}
      {showCodeModal && (
        <div className="modal-overlay">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                  <ShieldAlert size={24} className="text-orange-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Code superviseur requis</h3>
                  <p className="text-sm text-gray-500">Autoriser la clôture de la caisse.</p>
                </div>
              </div>
              <button onClick={() => setShowCodeModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            {/* Affichage du code masqué */}
            <div className="flex justify-center gap-2 mb-4">
              {[0,1,2,3,4,5].map(i => (
                <div key={i} className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-all ${
                  codeSaisi.length > i ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 bg-gray-50'
                }`}>
                  {codeSaisi.length > i ? '•' : ''}
                </div>
              ))}
            </div>

            {codeErreur && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-sm text-center mb-3 flex items-center justify-center gap-1">
                <AlertTriangle size={14} /> {codeErreur}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              {['1','2','3','4','5','6','7','8','9','C','0','⌫'].map(k => (
                <button
                  key={k}
                  onClick={() => {
                    if (k === 'C') { setCodeSaisi(''); setCodeErreur(''); return }
                    if (k === '⌫') { setCodeSaisi(v => v.slice(0, -1)); setCodeErreur(''); return }
                    if (codeSaisi.length >= 6) return
                    setCodeSaisi(v => v + k)
                  }}
                  disabled={codeLoading}
                  className={`h-12 font-bold text-lg rounded-xl transition-all ${
                    k === 'C' ? 'bg-red-100 hover:bg-red-200 text-red-700' :
                    k === '⌫' ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' :
                    'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>

            <button
              onClick={handleValiderCode}
              disabled={codeLoading || codeSaisi.length < 4}
              className="w-full h-12 mt-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {codeLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Lock size={18} />}
              Autoriser la clôture
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
