import { useState, useEffect, useRef } from 'react'
import { getProduits, getParametres } from '@/lib/ipc'
import type { Produit } from '@/types'
import { Tag, Printer, Search, Check, X, Plus, Minus } from 'lucide-react'

// ─── Générateur CODE128 (subset B) ───────────────────────────────────────────
const CODE128B_TABLE: Record<string, number> = {}
const ASCII_START = 32
for (let i = 0; i < 96; i++) CODE128B_TABLE[String.fromCharCode(ASCII_START + i)] = i

function encode128(text: string): boolean[] {
  const bars: boolean[] = []
  const PATTERNS: string[] = [
    '11011001100','11001101100','11001100110','10010011000','10010001100',
    '10001001100','10011001000','10011000100','10001100100','11001001000',
    '11001000100','11000100100','10110011100','10011011100','10011001110',
    '10111001100','10011101100','10011100110','11001110010','11001011100',
    '11001001110','11011100100','11001110100','11101101110','11101001100',
    '11100101100','11100100110','11101100100','11100110100','11100110010',
    '11011011000','11011000110','11000110110','10100011000','10001011000',
    '10001000110','10110001000','10001101000','10001100010','11010001000',
    '11000101000','11000100010','10110111000','10110001110','10001101110',
    '10111011000','10111000110','10001110110','11101110110','11010001110',
    '11000101110','11011101000','11011100010','11011101110','11101011000',
    '11101000110','11100010110','11101101000','11101100010','11100011010',
    '11101111010','11001000010','11110001010','10100110000','10100001100',
    '10010110000','10010000110','10000101100','10000100110','10110010000',
    '10110000100','10011010000','10011000010','10000110100','10000110010',
    '11000010010','11001010000','11110111010','11000010100','10001111010',
    '10100111100','10010111100','10010011110','10111100100','10011110100',
    '10011110010','11110100100','11110010100','11110010010','11011011110',
    '11011110110','11110110110','10101111000','10100011110','10001011110',
    '10111101000','10111100010','11110101000','11110100010','10111011110',
    '10111101110','11101011110','11110101110','11010000100','11010010000',
    '11010011100','1100011101011'
  ]
  const START_B = 104
  const STOP = 106
  const codes: number[] = [START_B]
  for (const ch of text) {
    const v = CODE128B_TABLE[ch]
    if (v !== undefined) codes.push(v)
  }
  const check = codes.reduce((s, c, i) => s + (i === 0 ? c : c * i), 0) % 103
  codes.push(check, STOP)

  for (const code of codes) {
    const pat = PATTERNS[code] ?? '0'
    for (let i = 0; i < pat.length; i++) {
      bars.push(pat[i] === '1')
    }
  }
  // Quiet zone
  return [...Array(10).fill(false), ...bars, ...Array(10).fill(false)]
}

function BarcodesSVG({ value, width = 180, height = 50 }: { value: string; width?: number; height?: number }) {
  if (!value) return <rect width={width} height={height} fill="#f3f4f6" rx="2" />
  const bars = encode128(value)
  const barW = width / bars.length
  const rects: JSX.Element[] = []
  let i = 0
  while (i < bars.length) {
    const isBar = bars[i]
    let j = i
    while (j < bars.length && bars[j] === isBar) j++
    if (isBar) {
      rects.push(<rect key={i} x={i * barW} y={0} width={(j - i) * barW} height={height} fill="#000" />)
    }
    i = j
  }
  return <>{rects}</>
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface EtiquetteItem {
  produit: Produit
  quantite: number
}

type Format = '1x1' | '2x5' | '3x7' | '4x10'
const FORMAT_CONFIG: Record<Format, { cols: number; rows: number; label: string; wMm: number; hMm: number }> = {
  '1x1': { cols: 1, rows: 1, label: 'Grande (1 par page)', wMm: 100, hMm: 60 },
  '2x5': { cols: 2, rows: 5, label: 'Moyenne (2×5 / page)', wMm: 95, hMm: 50 },
  '3x7': { cols: 3, rows: 7, label: 'Petite (3×7 / page)', wMm: 62, hMm: 38 },
  '4x10': { cols: 4, rows: 10, label: 'Très petite (4×10 / page)', wMm: 48, hMm: 28 },
}

export default function Etiquettes() {
  const [produits, setProduits] = useState<Produit[]>([])
  const [selection, setSelection] = useState<EtiquetteItem[]>([])
  const [format, setFormat] = useState<Format>('2x5')
  const [search, setSearch] = useState('')
  const [showPrix, setShowPrix] = useState(true)
  const [nomEntreprise, setNomEntreprise] = useState('KB POS')
  const [loading, setLoading] = useState(true)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([getProduits(), getParametres()])
      .then(([p, params]) => {
        setProduits(p as Produit[])
        if ((params as any)?.nom_entreprise) setNomEntreprise((params as any).nom_entreprise)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = produits.filter(p =>
    p.nom.toLowerCase().includes(search.toLowerCase()) ||
    (p.code_barre ?? '').includes(search)
  ).slice(0, 50)

  const toggleProduit = (p: Produit) => {
    const exists = selection.find(s => s.produit.id === p.id)
    if (exists) setSelection(prev => prev.filter(s => s.produit.id !== p.id))
    else setSelection(prev => [...prev, { produit: p, quantite: 1 }])
  }

  const setQte = (id: number, q: number) => {
    if (q < 1) return
    setSelection(prev => prev.map(s => s.produit.id === id ? { ...s, quantite: q } : s))
  }

  // Expand selon quantite
  const etiquettes = selection.flatMap(s => Array(s.quantite).fill(s.produit))

  const cfg = FORMAT_CONFIG[format]

  const handlePrint = () => {
    const printContent = printRef.current
    if (!printContent) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html><head><title>Étiquettes</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; }
        .page { display: grid; grid-template-columns: repeat(${cfg.cols}, 1fr); gap: 2mm; padding: 8mm; }
        .label {
          width: ${cfg.wMm}mm; height: ${cfg.hMm}mm;
          border: 0.5px solid #ccc; border-radius: 2mm;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 1.5mm; overflow: hidden;
          page-break-inside: avoid;
        }
        .ent { font-size: ${cfg.hMm > 40 ? 7 : 5}pt; color: #666; text-transform: uppercase; letter-spacing: .5px; }
        .nom { font-size: ${cfg.hMm > 40 ? 10 : 7}pt; font-weight: bold; text-align: center; margin: 1mm 0; line-height: 1.2; }
        .prix { font-size: ${cfg.hMm > 40 ? 12 : 8}pt; font-weight: 900; color: #059669; }
        .code { font-size: ${cfg.hMm > 40 ? 7 : 5}pt; color: #888; font-family: monospace; margin-top: 1mm; }
        svg { max-width: 100%; }
        @page { margin: 0; size: A4; }
        @media print { body { margin: 0; } }
      </style></head><body>${printContent.innerHTML}</body></html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center">
          <Tag size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900">Étiquettes codes-barres</h1>
          <p className="text-gray-500 text-sm">Générer et imprimer des étiquettes pour vos produits</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Sélection produits ─────────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h2 className="font-bold text-gray-800 mb-3">Sélectionner les produits</h2>
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>

            <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filtered.map(p => {
                const selected = !!selection.find(s => s.produit.id === p.id)
                return (
                  <button key={p.id} onClick={() => toggleProduit(p)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all text-left ${selected ? 'bg-violet-50 border border-violet-200' : 'hover:bg-gray-50 border border-transparent'}`}>
                    <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${selected ? 'bg-violet-600 border-violet-600' : 'border-gray-300'}`}>
                      {selected && <Check size={10} className="text-white" />}
                    </div>
                    <span className="flex-1 font-medium text-gray-800 truncate">{p.nom}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {p.prix_vente?.toLocaleString('fr-FR')} FCFA
                    </span>
                  </button>
                )
              })}
              {!filtered.length && <p className="text-center text-gray-400 text-sm py-6">Aucun produit</p>}
            </div>

            {selection.length > 0 && (
              <button onClick={() => setSelection([])}
                className="mt-3 w-full text-sm text-red-500 hover:text-red-700 flex items-center justify-center gap-1">
                <X size={12} /> Tout désélectionner
              </button>
            )}
          </div>

          {/* Quantités */}
          {selection.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h2 className="font-bold text-gray-800 mb-3 text-sm">Quantités d'étiquettes</h2>
              <div className="space-y-2">
                {selection.map(s => (
                  <div key={s.produit.id} className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-gray-700 truncate">{s.produit.nom}</span>
                    <button onClick={() => setQte(s.produit.id, s.quantite - 1)}
                      className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                      <Minus size={12} />
                    </button>
                    <span className="w-8 text-center text-sm font-bold">{s.quantite}</span>
                    <button onClick={() => setQte(s.produit.id, s.quantite + 1)}
                      className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                      <Plus size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2 text-right">{etiquettes.length} étiquette(s) au total</p>
            </div>
          )}
        </div>

        {/* ── Config + Aperçu ─────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-3">
          {/* Options */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Format</label>
                <div className="flex gap-2 flex-wrap">
                  {(Object.keys(FORMAT_CONFIG) as Format[]).map(f => (
                    <button key={f} onClick={() => setFormat(f)}
                      className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${format === f ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {FORMAT_CONFIG[f].label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Options</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={showPrix} onChange={e => setShowPrix(e.target.checked)}
                    className="w-4 h-4 accent-violet-600" />
                  <span className="text-sm text-gray-700">Afficher le prix</span>
                </label>
              </div>
              <div className="ml-auto">
                <button onClick={handlePrint} disabled={!etiquettes.length}
                  className="flex items-center gap-2 bg-violet-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                  <Printer size={16} /> Imprimer {etiquettes.length > 0 ? `(${etiquettes.length})` : ''}
                </button>
              </div>
            </div>
          </div>

          {/* Aperçu */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h2 className="font-bold text-gray-800 mb-3 text-sm">Aperçu</h2>
            {etiquettes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                <Tag size={40} className="mb-3" />
                <p className="text-sm">Sélectionnez des produits pour voir l'aperçu</p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[500px] bg-gray-50 rounded-xl p-3">
                {/* Zone d'impression (cachée) */}
                <div ref={printRef} style={{ display: 'none' }}>
                  <div className="page">
                    {etiquettes.map((p: Produit, i) => (
                      <div key={i} className="label">
                        <span className="ent">{nomEntreprise}</span>
                        <span className="nom">{p.nom}</span>
                        {p.code_barre && (
                          <svg viewBox={`0 0 200 40`} width="90%" height="auto">
                            <BarcodesSVG value={p.code_barre} width={200} height={40} />
                          </svg>
                        )}
                        {showPrix && p.prix_vente && (
                          <span className="prix">{Math.round(p.prix_vente).toLocaleString('fr-FR')} FCFA</span>
                        )}
                        {p.code_barre && <span className="code">{p.code_barre}</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Aperçu visible */}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cfg.cols, 4)}, 1fr)`, gap: '8px' }}>
                  {etiquettes.slice(0, Math.min(etiquettes.length, cfg.cols * 3)).map((p: Produit, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg bg-white p-2 flex flex-col items-center text-center"
                      style={{ minHeight: '90px' }}>
                      <span className="text-gray-400 text-xs truncate w-full">{nomEntreprise}</span>
                      <span className="font-bold text-gray-800 text-xs leading-tight my-1 line-clamp-2">{p.nom}</span>
                      {p.code_barre && (
                        <svg viewBox="0 0 160 30" width="100%" height="24">
                          <BarcodesSVG value={p.code_barre} width={160} height={30} />
                        </svg>
                      )}
                      {showPrix && p.prix_vente && (
                        <span className="text-emerald-700 font-black text-xs mt-1">
                          {Math.round(p.prix_vente).toLocaleString('fr-FR')} FCFA
                        </span>
                      )}
                      {p.code_barre && <span className="text-gray-300 font-mono text-xs">{p.code_barre}</span>}
                    </div>
                  ))}
                  {etiquettes.length > cfg.cols * 3 && (
                    <div className="border border-dashed border-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-xs p-2">
                      +{etiquettes.length - cfg.cols * 3} autres...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
