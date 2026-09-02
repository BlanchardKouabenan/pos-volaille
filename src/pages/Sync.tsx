import { useState, useEffect } from 'react'
import {
  syncGetPeers, syncCreatePeer, syncDeletePeer,
  syncPushTo, syncPullFrom,
  syncStartServer, syncStopServer, syncIsRunning, syncGetLocalIp,
  syncGetJournal
} from '@/lib/ipc'
import { RefreshCw, Plus, Trash2, Upload, Download, Wifi, WifiOff, Globe, X, Check, AlertCircle } from 'lucide-react'

interface Peer { id: number; nom: string; ip: string; port: number; last_sync?: string; last_sync_boutique_id?: number }
interface SyncResult { ok: boolean; pushed?: number; received?: number; applied?: number; errors?: string[]; error?: string; message?: string }

export default function Sync() {
  const [peers, setPeers] = useState<Peer[]>([])
  const [journal, setJournal] = useState<any[]>([])
  const [serverOn, setServerOn] = useState(false)
  const [localIp, setLocalIp] = useState('')
  const [port, setPort] = useState(7890)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<number | null>(null)
  const [results, setResults] = useState<Record<number, SyncResult>>({})
  const [showAddPeer, setShowAddPeer] = useState(false)
  const [newPeer, setNewPeer] = useState({ nom: '', ip: '', port: 7890 })
  const [toggling, setToggling] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [p, isOn, ip, j] = await Promise.all([
        syncGetPeers(), syncIsRunning(), syncGetLocalIp(), syncGetJournal()
      ])
      setPeers(p as Peer[])
      setServerOn(isOn)
      setLocalIp(ip)
      setJournal((j as any[]).slice(-50).reverse())
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const toggleServer = async () => {
    setToggling(true)
    try {
      if (serverOn) { await syncStopServer(); setServerOn(false) }
      else { const r = await syncStartServer(port); if (r?.ok) setServerOn(true) }
    } catch {}
    setToggling(false)
  }

  const handlePush = async (peer: Peer) => {
    setSyncing(peer.id)
    const r = await syncPushTo(peer.id, peer.ip, peer.port)
    setResults(prev => ({ ...prev, [peer.id]: r }))
    setSyncing(null)
    load()
  }

  const handlePull = async (peer: Peer) => {
    setSyncing(peer.id)
    const r = await syncPullFrom(peer.id, peer.ip, peer.port)
    setResults(prev => ({ ...prev, [peer.id]: r }))
    setSyncing(null)
    load()
  }

  const handleAddPeer = async () => {
    if (!newPeer.nom.trim() || !newPeer.ip.trim()) return
    await syncCreatePeer(newPeer)
    setShowAddPeer(false)
    setNewPeer({ nom: '', ip: '', port: 7890 })
    load()
  }

  const handleDeletePeer = async (id: number) => {
    if (!confirm('Supprimer ce point de synchronisation ?')) return
    await syncDeletePeer(id)
    load()
  }

  const ENTITY_COLORS: Record<string, string> = {
    vente: 'bg-emerald-100 text-emerald-700',
    produit: 'bg-blue-100 text-blue-700',
    client: 'bg-violet-100 text-violet-700',
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center">
            <Globe size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Synchronisation</h1>
            <p className="text-gray-500 text-sm">Sync des données entre boutiques sur le même réseau LAN</p>
          </div>
        </div>
        <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Statut serveur */}
      <div className={`rounded-2xl p-5 border flex items-center gap-4 ${serverOn ? 'bg-teal-50 border-teal-200' : 'bg-gray-50 border-gray-200'}`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${serverOn ? 'bg-teal-600' : 'bg-gray-400'}`}>
          {serverOn ? <Wifi size={20} className="text-white" /> : <WifiOff size={20} className="text-white" />}
        </div>
        <div className="flex-1">
          <div className="font-bold text-gray-800">{serverOn ? 'Serveur actif — Cette boutique reçoit les données' : 'Serveur arrêté'}</div>
          {serverOn && localIp && (
            <div className="text-sm text-teal-700 mt-0.5">
              URL: <span className="font-mono font-bold">http://{localIp}:{port}</span>
              <span className="text-gray-400 ml-2">Endpoints : /api/sync/pull · /api/sync/push · /api/stats · /</span>
            </div>
          )}
          {!serverOn && <div className="text-sm text-gray-400">Démarrez le serveur pour que d'autres boutiques puissent synchroniser vers vous</div>}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {!serverOn && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Port</span>
              <input type="number" value={port} onChange={e => setPort(Number(e.target.value))}
                className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center" />
            </div>
          )}
          <button onClick={toggleServer} disabled={toggling}
            className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${serverOn ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-teal-600 text-white hover:bg-teal-700'} disabled:opacity-50`}>
            {toggling ? '...' : serverOn ? 'Arrêter' : 'Démarrer'}
          </button>
        </div>
      </div>

      {/* Points de sync (peers) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800">Boutiques distantes</h2>
          <button onClick={() => setShowAddPeer(true)}
            className="flex items-center gap-1.5 bg-teal-600 text-white px-3 py-1.5 rounded-xl text-sm font-semibold hover:bg-teal-700">
            <Plus size={14} /> Ajouter
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : peers.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Globe size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Aucune boutique distante configurée</p>
            <p className="text-xs mt-1">Ajoutez l'IP d'une autre boutique pour synchroniser</p>
          </div>
        ) : (
          <div className="space-y-3">
            {peers.map(peer => {
              const res = results[peer.id]
              const isSyncing = syncing === peer.id
              return (
                <div key={peer.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800">{peer.nom}</div>
                      <div className="text-sm text-gray-500 font-mono mt-0.5">http://{peer.ip}:{peer.port}</div>
                      {peer.last_sync && (
                        <div className="text-xs text-gray-400 mt-1">
                          Dernière sync : {new Date(peer.last_sync).toLocaleString('fr-FR')}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handlePush(peer)} disabled={isSyncing}
                        title="Envoyer mes données vers cette boutique"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-semibold disabled:opacity-50 transition-all">
                        {isSyncing ? <RefreshCw size={12} className="animate-spin" /> : <Upload size={12} />} Envoyer
                      </button>
                      <button onClick={() => handlePull(peer)} disabled={isSyncing}
                        title="Recevoir les données de cette boutique"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-semibold disabled:opacity-50 transition-all">
                        {isSyncing ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />} Recevoir
                      </button>
                      <button onClick={() => handleDeletePeer(peer.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Résultat de la dernière sync */}
                  {res && (
                    <div className={`mt-3 flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${res.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {res.ok ? <Check size={12} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />}
                      <div>
                        {res.ok
                          ? res.pushed !== undefined
                            ? `${res.pushed} changement(s) envoyé(s)${res.message ? ` — ${res.message}` : ''}`
                            : `${res.received} reçu(s), ${res.applied} appliqué(s)`
                          : `Erreur : ${res.error}`
                        }
                        {res.errors?.length ? <div className="text-red-500 mt-0.5">{res.errors.slice(0, 3).join(' | ')}</div> : null}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Journal sync local */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-4">Journal des modifications ({journal.length})</h2>
        <div className="overflow-auto max-h-72">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {['Type', 'ID', 'Action', 'Boutique', 'Date', 'Sync'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {journal.map((j: any) => (
                <tr key={j.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded font-semibold ${ENTITY_COLORS[j.entity_type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {j.entity_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono">{j.entity_id}</td>
                  <td className="px-3 py-2 capitalize">{j.action}</td>
                  <td className="px-3 py-2">#{j.boutique_id}</td>
                  <td className="px-3 py-2 text-gray-400">{new Date(j.created_at).toLocaleString('fr-FR')}</td>
                  <td className="px-3 py-2">
                    {j.synced ? <Check size={12} className="text-emerald-500" /> : <div className="w-2 h-2 rounded-full bg-amber-400" />}
                  </td>
                </tr>
              ))}
              {!journal.length && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Aucun événement local</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal ajouter peer */}
      {showAddPeer && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg">Ajouter une boutique distante</h3>
              <button onClick={() => setShowAddPeer(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Nom de la boutique</label>
                <input value={newPeer.nom} onChange={e => setNewPeer(p => ({ ...p, nom: e.target.value }))}
                  placeholder="Ex: Boutique Centre-ville"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Adresse IP</label>
                  <input value={newPeer.ip} onChange={e => setNewPeer(p => ({ ...p, ip: e.target.value }))}
                    placeholder="192.168.1.10"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1">Port</label>
                  <input type="number" value={newPeer.port} onChange={e => setNewPeer(p => ({ ...p, port: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-300" />
                </div>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
                💡 L'autre boutique doit avoir démarré son serveur de sync pour que la connexion fonctionne.
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddPeer(false)} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">Annuler</button>
              <button onClick={handleAddPeer} disabled={!newPeer.nom || !newPeer.ip}
                className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 disabled:opacity-40">
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
