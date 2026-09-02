import { useState, useMemo } from 'react'
import { RAYONS, searchLibrary, encodeLibImage } from '@/lib/imageLibrary'
import { X, Search } from 'lucide-react'

interface Props {
  onSelect: (imageUrl: string) => void
  onClose: () => void
  currentUrl?: string
}

export default function ImageLibraryPicker({ onSelect, onClose, currentUrl }: Props) {
  const [activeRayon, setActiveRayon] = useState(RAYONS[0].id)
  const [search, setSearch] = useState('')

  const searchResults = useMemo(() => searchLibrary(search), [search])

  const rayon = RAYONS.find(r => r.id === activeRayon)

  const handleSelect = (emoji: string, couleur: string) => {
    onSelect(encodeLibImage(emoji, couleur))
    onClose()
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 60 }}>
      <div className="modal-content w-full max-w-4xl" style={{ height: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="bg-indigo-600 text-white p-4 rounded-t-2xl flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bold text-lg">📚 Bibliothèque d'images produit</h2>
            <p className="text-indigo-200 text-sm">{RAYONS.length} rayons · {RAYONS.reduce((s, r) => s + r.produits.length, 0)} visuels</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-indigo-700 rounded-lg"><X size={20} /></button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar rayons */}
          <div className="w-44 flex-shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto">
            {RAYONS.map(r => (
              <button
                key={r.id}
                onClick={() => { setActiveRayon(r.id); setSearch('') }}
                className={`w-full text-left px-3 py-2.5 text-xs font-medium flex items-center gap-2 transition-all border-b border-gray-100 ${
                  activeRayon === r.id && !search
                    ? 'bg-indigo-50 text-indigo-700 border-l-2 border-l-indigo-500'
                    : 'text-gray-600 hover:bg-white'
                }`}
              >
                <span className="text-base flex-shrink-0">{r.icone}</span>
                <span className="leading-tight">{r.nom}</span>
              </button>
            ))}
          </div>

          {/* Contenu principal */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Barre de recherche */}
            <div className="p-3 border-b border-gray-200 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher un produit dans tous les rayons..."
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Grille de visuels */}
            <div className="flex-1 overflow-y-auto p-4">
              {search ? (
                <>
                  <p className="text-xs text-gray-500 mb-3">{searchResults.length} résultat(s) pour « {search} »</p>
                  {searchResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                      <span className="text-4xl mb-2">🔍</span>
                      <p className="text-sm">Aucun produit trouvé</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                      {searchResults.map((prod, i) => (
                        <ProductCard
                          key={i}
                          nom={prod.nom}
                          emoji={prod.emoji}
                          couleur={prod.couleur}
                          sub={prod.rayon}
                          isSelected={currentUrl === encodeLibImage(prod.emoji, prod.couleur)}
                          onSelect={() => handleSelect(prod.emoji, prod.couleur)}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : rayon ? (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-2xl">{rayon.icone}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{rayon.nom}</h3>
                      <p className="text-xs text-gray-500">{rayon.produits.length} visuels disponibles</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                    {rayon.produits.map((prod, i) => (
                      <ProductCard
                        key={i}
                        nom={prod.nom}
                        emoji={prod.emoji}
                        couleur={prod.couleur}
                        isSelected={currentUrl === encodeLibImage(prod.emoji, prod.couleur)}
                        onSelect={() => handleSelect(prod.emoji, prod.couleur)}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Carte visuel produit ──────────────────────────────────────────────────────
function ProductCard({ nom, emoji, couleur, sub, isSelected, onSelect }: {
  nom: string; emoji: string; couleur: string; sub?: string
  isSelected: boolean; onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all hover:shadow-md ${
        isSelected
          ? 'border-indigo-500 shadow-md shadow-indigo-100'
          : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
      }`}
      title={nom}
    >
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl"
        style={{ background: `linear-gradient(135deg, ${couleur}28, ${couleur}10)` }}
      >
        {emoji}
      </div>
      <span className="text-xs text-gray-700 text-center leading-tight line-clamp-2 w-full">{nom}</span>
      {sub && <span className="text-xs text-gray-400 leading-tight">{sub}</span>}
      {isSelected && <span className="text-xs text-indigo-600 font-bold">✓</span>}
    </button>
  )
}
