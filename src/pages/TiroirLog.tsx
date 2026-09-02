import { useState, useEffect } from 'react'
import { getTiroirLog } from '@/lib/ipc'
import type { TiroirLog } from '@/types'
import { format, subDays } from 'date-fns'
import { Calendar, Printer, UnlockKeyhole, ShoppingBag } from 'lucide-react'

const today = () => format(new Date(), 'yyyy-MM-dd')

export default function TiroirLogPage() {
  const [logs, setLogs] = useState<TiroirLog[]>([])
  const [loading, setLoading] = useState(true)
  const [dateDebut, setDateDebut] = useState(today())
  const [dateFin, setDateFin] = useState(today())

  const load = async (debut = dateDebut, fin = dateFin) => {
    setLoading(true)
    try {
      const data = await getTiroirLog(debut, fin)
      setLogs(data)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const nbVentes = logs.filter(l => l.type === 'vente').length
  const nbManuels = logs.filter(l => l.type === 'ouverture_simple').length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Journal du tiroir-caisse</h1>
            <p className="text-sm text-gray-500">Historique de toutes les ouvertures de tiroir</p>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition-colors"
          >
            <Printer size={16} />
            Imprimer
          </button>
        </div>

        {/* Filtres date */}
        <div className="flex flex-wrap gap-3 items-center">
          {[
            { label: "Aujourd'hui", debut: today(), fin: today() },
            { label: 'Hier', debut: format(subDays(new Date(), 1), 'yyyy-MM-dd'), fin: format(subDays(new Date(), 1), 'yyyy-MM-dd') },
            { label: '7 jours', debut: format(subDays(new Date(), 6), 'yyyy-MM-dd'), fin: today() },
          ].map(p => (
            <button key={p.label}
              onClick={() => { setDateDebut(p.debut); setDateFin(p.fin); load(p.debut, p.fin) }}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold transition-colors">
              {p.label}
            </button>
          ))}
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-400" />
            <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-gray-400 text-sm">au</span>
            <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={() => load()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors">
              {loading ? '...' : 'Filtrer'}
            </button>
          </div>
        </div>
      </div>

      {/* Résumé */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex gap-6 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
            <ShoppingBag size={16} className="text-emerald-600" />
          </div>
          <div>
            <div className="text-xs text-gray-500">Ouvertures vente</div>
            <div className="font-bold text-gray-800">{nbVentes}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
            <UnlockKeyhole size={16} className="text-orange-600" />
          </div>
          <div>
            <div className="text-xs text-gray-500">Ouvertures manuelles</div>
            <div className="font-bold text-gray-800">{nbManuels}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <UnlockKeyhole size={16} className="text-blue-600" />
          </div>
          <div>
            <div className="text-xs text-gray-500">Total ouvertures</div>
            <div className="font-bold text-gray-800">{logs.length}</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <UnlockKeyhole size={48} className="mx-auto mb-3 opacity-20" />
              <p className="font-medium">Aucune ouverture de tiroir sur la période</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date/Heure</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Caissier</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">N° Ticket</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Motif</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {new Date(log.date_heure).toLocaleString('fr-FR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit', second: '2-digit'
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold ${
                          log.type === 'vente'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {log.type === 'vente'
                            ? <><ShoppingBag size={12} /> Vente</>
                            : <><UnlockKeyhole size={12} /> Ouverture manuelle</>
                          }
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-medium">{log.user_nom || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-blue-700 font-semibold">
                        {log.numero_ticket || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs italic">{log.motif || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
