// Bibliothèque d'images produits — format lib://{emoji}|{couleur}
// Utilisée pour générer des visuels produit sans fichier image externe

export interface LibProduit {
  nom: string
  emoji: string
  couleur: string
}

export interface Rayon {
  id: string
  nom: string
  icone: string
  couleur: string
  produits: LibProduit[]
}

// ─── Encodage / décodage ──────────────────────────────────────────────────────

export function encodeLibImage(emoji: string, couleur: string): string {
  return `lib://${emoji}|${couleur}`
}

export function decodeLibImage(url: string): { emoji: string; couleur: string } | null {
  if (!url?.startsWith('lib://')) return null
  const rest = url.slice(6)
  const idx = rest.lastIndexOf('|')
  if (idx === -1) return null
  return { emoji: rest.slice(0, idx), couleur: rest.slice(idx + 1) }
}

export function isLibImage(url: string | undefined): boolean {
  return typeof url === 'string' && url.startsWith('lib://')
}

// ─── Base de données des rayons ───────────────────────────────────────────────

export const RAYONS: Rayon[] = [
  {
    id: 'volailles',
    nom: 'Volailles & Lapins',
    icone: '🐔',
    couleur: '#f59e0b',
    produits: [
      { nom: 'Poulet entier', emoji: '🐔', couleur: '#f59e0b' },
      { nom: 'Cuisses de poulet', emoji: '🍗', couleur: '#f59e0b' },
      { nom: 'Ailes de poulet', emoji: '🍗', couleur: '#fb923c' },
      { nom: 'Blanc de poulet', emoji: '🐔', couleur: '#fde68a' },
      { nom: 'Poulet découpé', emoji: '🍗', couleur: '#fbbf24' },
      { nom: 'Canard entier', emoji: '🦆', couleur: '#84cc16' },
      { nom: 'Magret de canard', emoji: '🦆', couleur: '#65a30d' },
      { nom: 'Dinde entière', emoji: '🦃', couleur: '#a78bfa' },
      { nom: 'Escalope de dinde', emoji: '🦃', couleur: '#8b5cf6' },
      { nom: 'Lapin entier', emoji: '🐇', couleur: '#f472b6' },
      { nom: 'Pintade', emoji: '🐓', couleur: '#fb923c' },
      { nom: 'Caille', emoji: '🪶', couleur: '#a3e635' },
      { nom: 'Pigeon', emoji: '🕊️', couleur: '#94a3b8' },
      { nom: 'Oie', emoji: '🦢', couleur: '#cbd5e1' },
      { nom: 'Foie de poulet', emoji: '🫀', couleur: '#dc2626' },
      { nom: 'Gésiers de poulet', emoji: '🍖', couleur: '#92400e' },
      { nom: 'Cou de poulet', emoji: '🦴', couleur: '#d97706' },
      { nom: 'Pied de poulet', emoji: '🐾', couleur: '#b45309' },
    ]
  },
  {
    id: 'boucherie',
    nom: 'Boucherie',
    icone: '🥩',
    couleur: '#dc2626',
    produits: [
      { nom: 'Bœuf haché', emoji: '🥩', couleur: '#dc2626' },
      { nom: 'Côte de bœuf', emoji: '🥩', couleur: '#b91c1c' },
      { nom: 'Entrecôte', emoji: '🥩', couleur: '#991b1b' },
      { nom: 'Rôti de bœuf', emoji: '🍖', couleur: '#7f1d1d' },
      { nom: 'Bœuf braisé', emoji: '🍖', couleur: '#b91c1c' },
      { nom: 'Gigot de mouton', emoji: '🦴', couleur: '#9f1239' },
      { nom: 'Côtelettes de mouton', emoji: '🥩', couleur: '#be185d' },
      { nom: 'Mouton découpé', emoji: '🐑', couleur: '#e11d48' },
      { nom: 'Porc filet', emoji: '🐷', couleur: '#f9a8d4' },
      { nom: 'Côtes de porc', emoji: '🥩', couleur: '#ec4899' },
      { nom: 'Lard', emoji: '🥓', couleur: '#db2777' },
      { nom: 'Saucisses fraîches', emoji: '🌭', couleur: '#f97316' },
      { nom: 'Merguez', emoji: '🌶️', couleur: '#dc2626' },
      { nom: 'Chorizo', emoji: '🌭', couleur: '#ea580c' },
      { nom: 'Jambon', emoji: '🍖', couleur: '#f87171' },
      { nom: 'Veau', emoji: '🐄', couleur: '#fda4af' },
      { nom: 'Agneau', emoji: '🐑', couleur: '#e0e7ff' },
      { nom: 'Foie de bœuf', emoji: '🫀', couleur: '#9f1239' },
      { nom: 'Tripes', emoji: '🫁', couleur: '#78350f' },
      { nom: 'Os à moelle', emoji: '🦴', couleur: '#e5e7eb' },
    ]
  },
  {
    id: 'poissonnerie',
    nom: 'Poissonnerie',
    icone: '🐟',
    couleur: '#0ea5e9',
    produits: [
      { nom: 'Poisson entier', emoji: '🐟', couleur: '#0ea5e9' },
      { nom: 'Tilapia', emoji: '🐠', couleur: '#06b6d4' },
      { nom: 'Capitaine', emoji: '🐡', couleur: '#0284c7' },
      { nom: 'Maquereau', emoji: '🐟', couleur: '#0369a1' },
      { nom: 'Sardines fraîches', emoji: '🐟', couleur: '#075985' },
      { nom: 'Thon frais', emoji: '🐠', couleur: '#1d4ed8' },
      { nom: 'Dorade', emoji: '🐡', couleur: '#2563eb' },
      { nom: 'Saumon', emoji: '🍣', couleur: '#f97316' },
      { nom: 'Carpe', emoji: '🐟', couleur: '#64748b' },
      { nom: 'Silure (poisson-chat)', emoji: '🐟', couleur: '#475569' },
      { nom: 'Crevettes fraîches', emoji: '🦐', couleur: '#f87171' },
      { nom: 'Crevettes congelées', emoji: '🦐', couleur: '#fca5a5' },
      { nom: 'Crabe', emoji: '🦀', couleur: '#ef4444' },
      { nom: 'Homard', emoji: '🦞', couleur: '#dc2626' },
      { nom: 'Huîtres', emoji: '🦪', couleur: '#94a3b8' },
      { nom: 'Calamars', emoji: '🦑', couleur: '#e879f9' },
      { nom: 'Pieuvre', emoji: '🐙', couleur: '#d946ef' },
      { nom: 'Poisson fumé', emoji: '🐟', couleur: '#92400e' },
      { nom: 'Morue salée', emoji: '🧂', couleur: '#d1d5db' },
    ]
  },
  {
    id: 'legumes',
    nom: 'Légumes frais',
    icone: '🥦',
    couleur: '#16a34a',
    produits: [
      { nom: 'Tomate', emoji: '🍅', couleur: '#dc2626' },
      { nom: 'Oignon', emoji: '🧅', couleur: '#a16207' },
      { nom: 'Ail', emoji: '🧄', couleur: '#e2e8f0' },
      { nom: 'Carotte', emoji: '🥕', couleur: '#f97316' },
      { nom: 'Chou blanc', emoji: '🥬', couleur: '#4ade80' },
      { nom: 'Chou rouge', emoji: '🫛', couleur: '#7c3aed' },
      { nom: 'Poivron', emoji: '🫑', couleur: '#16a34a' },
      { nom: 'Piment', emoji: '🌶️', couleur: '#dc2626' },
      { nom: 'Gombo', emoji: '🌿', couleur: '#15803d' },
      { nom: 'Aubergine', emoji: '🍆', couleur: '#7c3aed' },
      { nom: 'Courgette', emoji: '🥒', couleur: '#16a34a' },
      { nom: 'Concombre', emoji: '🥒', couleur: '#4ade80' },
      { nom: 'Épinards', emoji: '🥬', couleur: '#15803d' },
      { nom: 'Laitue / Salade', emoji: '🥗', couleur: '#86efac' },
      { nom: 'Céleri', emoji: '🌿', couleur: '#22c55e' },
      { nom: 'Navet', emoji: '🫛', couleur: '#e2e8f0' },
      { nom: 'Patate douce', emoji: '🍠', couleur: '#d97706' },
      { nom: 'Igname', emoji: '🪨', couleur: '#92400e' },
      { nom: 'Manioc', emoji: '🪵', couleur: '#d4a574' },
      { nom: 'Plantain vert', emoji: '🍌', couleur: '#4ade80' },
      { nom: 'Maïs', emoji: '🌽', couleur: '#f59e0b' },
      { nom: 'Brocoli', emoji: '🥦', couleur: '#16a34a' },
      { nom: 'Poireaux', emoji: '🌿', couleur: '#84cc16' },
      { nom: 'Betterave', emoji: '🫀', couleur: '#be185d' },
      { nom: 'Haricots verts', emoji: '🫘', couleur: '#15803d' },
      { nom: 'Petits pois', emoji: '🫛', couleur: '#4ade80' },
    ]
  },
  {
    id: 'fruits',
    nom: 'Fruits frais',
    icone: '🍎',
    couleur: '#ef4444',
    produits: [
      { nom: 'Pomme', emoji: '🍎', couleur: '#dc2626' },
      { nom: 'Orange', emoji: '🍊', couleur: '#f97316' },
      { nom: 'Banane', emoji: '🍌', couleur: '#eab308' },
      { nom: 'Mangue', emoji: '🥭', couleur: '#f97316' },
      { nom: 'Ananas', emoji: '🍍', couleur: '#f59e0b' },
      { nom: 'Pastèque', emoji: '🍉', couleur: '#dc2626' },
      { nom: 'Papaye', emoji: '🫐', couleur: '#f97316' },
      { nom: 'Avocat', emoji: '🥑', couleur: '#15803d' },
      { nom: 'Goyave', emoji: '🍈', couleur: '#84cc16' },
      { nom: 'Kiwi', emoji: '🥝', couleur: '#65a30d' },
      { nom: 'Raisin', emoji: '🍇', couleur: '#7c3aed' },
      { nom: 'Fraise', emoji: '🍓', couleur: '#dc2626' },
      { nom: 'Citron', emoji: '🍋', couleur: '#eab308' },
      { nom: 'Pamplemousse', emoji: '🍊', couleur: '#ea580c' },
      { nom: 'Melon', emoji: '🍈', couleur: '#f59e0b' },
      { nom: 'Poire', emoji: '🍐', couleur: '#84cc16' },
      { nom: 'Cerise', emoji: '🍒', couleur: '#b91c1c' },
      { nom: 'Pêche', emoji: '🍑', couleur: '#f97316' },
      { nom: 'Noix de coco', emoji: '🥥', couleur: '#92400e' },
      { nom: 'Mandarine', emoji: '🍊', couleur: '#fb923c' },
    ]
  },
  {
    id: 'laiterie',
    nom: 'Laiterie & Œufs',
    icone: '🥛',
    couleur: '#64748b',
    produits: [
      { nom: 'Lait frais', emoji: '🥛', couleur: '#f1f5f9' },
      { nom: 'Lait en poudre', emoji: '🥛', couleur: '#e2e8f0' },
      { nom: 'Lait concentré sucré', emoji: '🍶', couleur: '#fef3c7' },
      { nom: 'Yaourt nature', emoji: '🫙', couleur: '#f0fdf4' },
      { nom: 'Yaourt aromatisé', emoji: '🍦', couleur: '#fce7f3' },
      { nom: 'Fromage', emoji: '🧀', couleur: '#fbbf24' },
      { nom: 'Beurre', emoji: '🧈', couleur: '#fde68a' },
      { nom: 'Crème fraîche', emoji: '🫙', couleur: '#fef9ee' },
      { nom: 'Margarine', emoji: '🧈', couleur: '#fef08a' },
      { nom: 'Œufs de poule', emoji: '🥚', couleur: '#fef3c7' },
      { nom: 'Œufs cailles', emoji: '🪺', couleur: '#d1fae5' },
    ]
  },
  {
    id: 'boulangerie',
    nom: 'Boulangerie & Pâtisserie',
    icone: '🍞',
    couleur: '#d97706',
    produits: [
      { nom: 'Pain de mie', emoji: '🍞', couleur: '#d97706' },
      { nom: 'Baguette', emoji: '🥖', couleur: '#b45309' },
      { nom: 'Pain complet', emoji: '🍞', couleur: '#92400e' },
      { nom: 'Croissant', emoji: '🥐', couleur: '#f59e0b' },
      { nom: 'Pain au chocolat', emoji: '🥐', couleur: '#92400e' },
      { nom: 'Gâteau', emoji: '🎂', couleur: '#ec4899' },
      { nom: 'Muffin', emoji: '🧁', couleur: '#f472b6' },
      { nom: 'Biscuits', emoji: '🍪', couleur: '#d97706' },
      { nom: 'Galette', emoji: '🫓', couleur: '#b45309' },
      { nom: 'Brioche', emoji: '🥐', couleur: '#fbbf24' },
      { nom: 'Donut', emoji: '🍩', couleur: '#ec4899' },
      { nom: 'Tarte', emoji: '🥧', couleur: '#d97706' },
    ]
  },
  {
    id: 'epicerie',
    nom: 'Épicerie sèche & Céréales',
    icone: '🌾',
    couleur: '#a16207',
    produits: [
      { nom: 'Riz blanc', emoji: '🍚', couleur: '#f8fafc' },
      { nom: 'Riz brisé', emoji: '🍚', couleur: '#f1f5f9' },
      { nom: 'Maïs en grains', emoji: '🌽', couleur: '#eab308' },
      { nom: 'Mil / Sorgho', emoji: '🌾', couleur: '#d97706' },
      { nom: 'Farine de blé', emoji: '🌾', couleur: '#fef3c7' },
      { nom: 'Semoule', emoji: '🫙', couleur: '#fef9ee' },
      { nom: 'Avoine / Flocons', emoji: '🌾', couleur: '#d97706' },
      { nom: 'Pâtes alimentaires', emoji: '🍝', couleur: '#fbbf24' },
      { nom: 'Haricots secs', emoji: '🫘', couleur: '#92400e' },
      { nom: 'Lentilles', emoji: '🫘', couleur: '#b45309' },
      { nom: 'Pois chiches', emoji: '🫘', couleur: '#d97706' },
      { nom: 'Sucre blanc', emoji: '🍬', couleur: '#f8fafc' },
      { nom: 'Sucre roux / Cassonade', emoji: '🍬', couleur: '#d97706' },
      { nom: 'Sel', emoji: '🧂', couleur: '#e2e8f0' },
      { nom: 'Huile de palme', emoji: '🫙', couleur: '#f59e0b' },
      { nom: 'Huile d\'arachide', emoji: '🫙', couleur: '#d97706' },
      { nom: 'Huile de tournesol', emoji: '🌻', couleur: '#eab308' },
      { nom: 'Arachides / Cacahuètes', emoji: '🥜', couleur: '#92400e' },
      { nom: 'Noix de cajou', emoji: '🥜', couleur: '#b45309' },
      { nom: 'Noix', emoji: '🌰', couleur: '#7f5539' },
    ]
  },
  {
    id: 'conserves',
    nom: 'Conserves & Condiments',
    icone: '🫙',
    couleur: '#2563eb',
    produits: [
      { nom: 'Tomate concentrée', emoji: '🍅', couleur: '#dc2626' },
      { nom: 'Sardines en boîte', emoji: '🐟', couleur: '#0ea5e9' },
      { nom: 'Thon en boîte', emoji: '🐠', couleur: '#1d4ed8' },
      { nom: 'Maïs en boîte', emoji: '🌽', couleur: '#eab308' },
      { nom: 'Haricots en boîte', emoji: '🫘', couleur: '#dc2626' },
      { nom: 'Cubes assaisonnement', emoji: '🧊', couleur: '#fde68a' },
      { nom: 'Sauce tomate', emoji: '🍅', couleur: '#ef4444' },
      { nom: 'Mayonnaise', emoji: '🫙', couleur: '#fef9ee' },
      { nom: 'Moutarde', emoji: '🫙', couleur: '#eab308' },
      { nom: 'Ketchup', emoji: '🍅', couleur: '#dc2626' },
      { nom: 'Poivre moulu', emoji: '⚫', couleur: '#374151' },
      { nom: 'Épices mélangées', emoji: '🌶️', couleur: '#d97706' },
      { nom: 'Vinaigre', emoji: '🫙', couleur: '#f0fdf4' },
      { nom: 'Sauce piment', emoji: '🌶️', couleur: '#dc2626' },
      { nom: 'Bouillon de poulet', emoji: '🍜', couleur: '#fbbf24' },
    ]
  },
  {
    id: 'boissons',
    nom: 'Boissons',
    icone: '🥤',
    couleur: '#0284c7',
    produits: [
      { nom: 'Eau minérale (bouteille)', emoji: '💧', couleur: '#0ea5e9' },
      { nom: 'Eau en sachet', emoji: '💧', couleur: '#bfdbfe' },
      { nom: 'Coca-Cola', emoji: '🥤', couleur: '#dc2626' },
      { nom: 'Fanta Orange', emoji: '🥤', couleur: '#f97316' },
      { nom: 'Sprite', emoji: '🥤', couleur: '#16a34a' },
      { nom: 'Jus de fruits (brique)', emoji: '🧃', couleur: '#f97316' },
      { nom: 'Bissap (jus d\'hibiscus)', emoji: '🌺', couleur: '#be185d' },
      { nom: 'Gingembre (jus)', emoji: '🫚', couleur: '#d97706' },
      { nom: 'Bouye (pain de singe)', emoji: '🌿', couleur: '#84cc16' },
      { nom: 'Lait de soja', emoji: '🥛', couleur: '#fef9ee' },
      { nom: 'Bière', emoji: '🍺', couleur: '#d97706' },
      { nom: 'Bière sans alcool', emoji: '🍺', couleur: '#86efac' },
      { nom: 'Vin rouge', emoji: '🍷', couleur: '#7f1d1d' },
      { nom: 'Vin blanc', emoji: '🥂', couleur: '#fef9ee' },
      { nom: 'Boisson énergisante', emoji: '⚡', couleur: '#eab308' },
      { nom: 'Lait Nescafé', emoji: '☕', couleur: '#92400e' },
      { nom: 'Café soluble', emoji: '☕', couleur: '#451a03' },
      { nom: 'Thé en sachet', emoji: '🍵', couleur: '#16a34a' },
    ]
  },
  {
    id: 'hygiene',
    nom: 'Hygiène & Beauté',
    icone: '🧴',
    couleur: '#7c3aed',
    produits: [
      { nom: 'Savon de toilette', emoji: '🫧', couleur: '#bfdbfe' },
      { nom: 'Savon de Marseille', emoji: '🧼', couleur: '#a5f3fc' },
      { nom: 'Shampoing', emoji: '🧴', couleur: '#a855f7' },
      { nom: 'Après-shampoing', emoji: '🧴', couleur: '#c084fc' },
      { nom: 'Gel douche', emoji: '🚿', couleur: '#60a5fa' },
      { nom: 'Dentifrice', emoji: '🦷', couleur: '#e0f2fe' },
      { nom: 'Brosse à dents', emoji: '🪥', couleur: '#a5f3fc' },
      { nom: 'Déodorant', emoji: '🌸', couleur: '#fbcfe8' },
      { nom: 'Crème corps', emoji: '🧴', couleur: '#fef3c7' },
      { nom: 'Crème visage', emoji: '✨', couleur: '#ede9fe' },
      { nom: 'Lotion solaire', emoji: '☀️', couleur: '#fef08a' },
      { nom: 'Rasoir', emoji: '🪒', couleur: '#94a3b8' },
      { nom: 'Mousse à raser', emoji: '🫧', couleur: '#e2e8f0' },
      { nom: 'Coton hydrophile', emoji: '☁️', couleur: '#f0f9ff' },
      { nom: 'Serviettes hygiéniques', emoji: '🌸', couleur: '#fce7f3' },
      { nom: 'Parfum / Eau de Cologne', emoji: '🌺', couleur: '#e879f9' },
      { nom: 'Vernis à ongles', emoji: '💅', couleur: '#f43f5e' },
      { nom: 'Maquillage', emoji: '💄', couleur: '#dc2626' },
    ]
  },
  {
    id: 'entretien',
    nom: 'Entretien ménager',
    icone: '🧹',
    couleur: '#059669',
    produits: [
      { nom: 'Lessive en poudre', emoji: '🫧', couleur: '#2563eb' },
      { nom: 'Lessive liquide', emoji: '🧴', couleur: '#60a5fa' },
      { nom: 'Liquide vaisselle', emoji: '🍽️', couleur: '#10b981' },
      { nom: 'Eau de Javel', emoji: '🫧', couleur: '#a5f3fc' },
      { nom: 'Désinfectant sol', emoji: '🧹', couleur: '#059669' },
      { nom: 'Nettoyant multi-usage', emoji: '✨', couleur: '#0ea5e9' },
      { nom: 'Éponge', emoji: '🧽', couleur: '#f97316' },
      { nom: 'Balai brosse', emoji: '🧹', couleur: '#92400e' },
      { nom: 'Serpillère / Vadrouille', emoji: '🫧', couleur: '#0ea5e9' },
      { nom: 'Sacs poubelle', emoji: '🗑️', couleur: '#374151' },
      { nom: 'Papier hygiénique', emoji: '🧻', couleur: '#fef9ee' },
      { nom: 'Essuie-tout', emoji: '🧻', couleur: '#fef3c7' },
      { nom: 'Allumettes', emoji: '🔥', couleur: '#f97316' },
      { nom: 'Bougies', emoji: '🕯️', couleur: '#fbbf24' },
      { nom: 'Pile / Batterie', emoji: '🔋', couleur: '#16a34a' },
    ]
  },
  {
    id: 'snacks',
    nom: 'Confiserie & Snacks',
    icone: '🍭',
    couleur: '#ec4899',
    produits: [
      { nom: 'Bonbons', emoji: '🍬', couleur: '#ec4899' },
      { nom: 'Chocolat', emoji: '🍫', couleur: '#78350f' },
      { nom: 'Chips', emoji: '🥔', couleur: '#f97316' },
      { nom: 'Biscuits salés', emoji: '🫙', couleur: '#d97706' },
      { nom: 'Cacahuètes grillées', emoji: '🥜', couleur: '#b45309' },
      { nom: 'Noix de cajou grillées', emoji: '🥜', couleur: '#92400e' },
      { nom: 'Chewing-gum', emoji: '🫧', couleur: '#a5f3fc' },
      { nom: 'Sucettes', emoji: '🍭', couleur: '#f472b6' },
      { nom: 'Chocolat en poudre', emoji: '🍫', couleur: '#78350f' },
      { nom: 'Biscuits sucrés', emoji: '🍪', couleur: '#d97706' },
      { nom: 'Pop-corn', emoji: '🍿', couleur: '#fbbf24' },
      { nom: 'Gâteaux emballés', emoji: '🧁', couleur: '#f472b6' },
    ]
  },
  {
    id: 'surgeles',
    nom: 'Surgelés',
    icone: '🧊',
    couleur: '#0ea5e9',
    produits: [
      { nom: 'Poisson surgelé', emoji: '🐟', couleur: '#0ea5e9' },
      { nom: 'Crevettes surgelées', emoji: '🦐', couleur: '#f87171' },
      { nom: 'Frites surgelées', emoji: '🍟', couleur: '#eab308' },
      { nom: 'Pizza surgelée', emoji: '🍕', couleur: '#dc2626' },
      { nom: 'Légumes surgelés', emoji: '🥦', couleur: '#16a34a' },
      { nom: 'Viande surgelée', emoji: '🥩', couleur: '#dc2626' },
      { nom: 'Glace / Crème glacée', emoji: '🍦', couleur: '#bfdbfe' },
      { nom: 'Yaourt glacé', emoji: '🍧', couleur: '#fbcfe8' },
    ]
  },
  {
    id: 'parapharmacie',
    nom: 'Parapharmacie & Santé',
    icone: '💊',
    couleur: '#dc2626',
    produits: [
      { nom: 'Vitamines', emoji: '💊', couleur: '#f59e0b' },
      { nom: 'Sirop contre la toux', emoji: '🍶', couleur: '#16a34a' },
      { nom: 'Pommade / Crème médicale', emoji: '🧴', couleur: '#bfdbfe' },
      { nom: 'Compresses / Pansements', emoji: '🩹', couleur: '#fca5a5' },
      { nom: 'Thermomètre', emoji: '🌡️', couleur: '#dc2626' },
      { nom: 'Masques chirurgicaux', emoji: '😷', couleur: '#e0f2fe' },
      { nom: 'Gel hydroalcoolique', emoji: '🫧', couleur: '#a5f3fc' },
      { nom: 'Coton tige', emoji: '🌿', couleur: '#f0f9ff' },
      { nom: 'Seringue / Test', emoji: '💉', couleur: '#93c5fd' },
      { nom: 'Sérum physiologique', emoji: '🫙', couleur: '#bfdbfe' },
    ]
  },
  {
    id: 'bebe',
    nom: 'Bébé & Maternité',
    icone: '👶',
    couleur: '#f472b6',
    produits: [
      { nom: 'Couches bébé', emoji: '👶', couleur: '#fce7f3' },
      { nom: 'Lait maternisé', emoji: '🍼', couleur: '#fef3c7' },
      { nom: 'Lait 2ème âge', emoji: '🍼', couleur: '#fef9ee' },
      { nom: 'Petits pots bébé', emoji: '🫙', couleur: '#f0fdf4' },
      { nom: 'Lingettes bébé', emoji: '🌸', couleur: '#fce7f3' },
      { nom: 'Talc bébé', emoji: '☁️', couleur: '#f8fafc' },
      { nom: 'Biberon', emoji: '🍼', couleur: '#bfdbfe' },
      { nom: 'Tétine', emoji: '🧸', couleur: '#fce7f3' },
    ]
  },
  {
    id: 'animaux',
    nom: 'Animaux de compagnie',
    icone: '🐾',
    couleur: '#92400e',
    produits: [
      { nom: 'Croquettes chien', emoji: '🐕', couleur: '#d97706' },
      { nom: 'Croquettes chat', emoji: '🐈', couleur: '#f97316' },
      { nom: 'Pâtée chien', emoji: '🐶', couleur: '#b45309' },
      { nom: 'Pâtée chat', emoji: '🐱', couleur: '#92400e' },
      { nom: 'Friandises animaux', emoji: '🦴', couleur: '#fef3c7' },
      { nom: 'Litière chat', emoji: '🪨', couleur: '#94a3b8' },
      { nom: 'Nourriture poissons', emoji: '🐠', couleur: '#0ea5e9' },
      { nom: 'Accessoires animaux', emoji: '🎾', couleur: '#f59e0b' },
    ]
  },
  {
    id: 'scolaire',
    nom: 'Fournitures & Papeterie',
    icone: '✏️',
    couleur: '#2563eb',
    produits: [
      { nom: 'Cahiers', emoji: '📓', couleur: '#2563eb' },
      { nom: 'Stylos', emoji: '✒️', couleur: '#1e40af' },
      { nom: 'Crayons', emoji: '✏️', couleur: '#d97706' },
      { nom: 'Règles / Équerre', emoji: '📐', couleur: '#7c3aed' },
      { nom: 'Classeur / Chemise', emoji: '📁', couleur: '#f97316' },
      { nom: 'Colle', emoji: '🔑', couleur: '#f59e0b' },
      { nom: 'Scotch / Ruban adhésif', emoji: '📼', couleur: '#94a3b8' },
      { nom: 'Enveloppes / Papier A4', emoji: '📄', couleur: '#e2e8f0' },
      { nom: 'Cartouche encre', emoji: '🖨️', couleur: '#374151' },
      { nom: 'Calculatrice', emoji: '🔢', couleur: '#1e40af' },
    ]
  },
  {
    id: 'telephonie',
    nom: 'Téléphonie & Électronique',
    icone: '📱',
    couleur: '#374151',
    produits: [
      { nom: 'Crédit téléphonique', emoji: '📱', couleur: '#10b981' },
      { nom: 'Forfait data / Internet', emoji: '📶', couleur: '#2563eb' },
      { nom: 'Chargeur téléphone', emoji: '🔌', couleur: '#374151' },
      { nom: 'Câble USB', emoji: '🔌', couleur: '#64748b' },
      { nom: 'Écouteurs', emoji: '🎧', couleur: '#1e40af' },
      { nom: 'Batterie de secours', emoji: '🔋', couleur: '#16a34a' },
      { nom: 'Protection écran', emoji: '📱', couleur: '#94a3b8' },
      { nom: 'Ampoule LED', emoji: '💡', couleur: '#fbbf24' },
      { nom: 'Ventilateur', emoji: '🌀', couleur: '#60a5fa' },
      { nom: 'Radio portable', emoji: '📻', couleur: '#f59e0b' },
    ]
  },
  {
    id: 'divers',
    nom: 'Articles divers & Services',
    icone: '📦',
    couleur: '#6b7280',
    produits: [
      { nom: 'Sachet plastique', emoji: '🛍️', couleur: '#94a3b8' },
      { nom: 'Boîte en carton', emoji: '📦', couleur: '#d97706' },
      { nom: 'Ficelle / Corde', emoji: '🪢', couleur: '#92400e' },
      { nom: 'Sac réutilisable', emoji: '🛒', couleur: '#16a34a' },
      { nom: 'Cintres', emoji: '🪝', couleur: '#64748b' },
      { nom: 'Serviettes de table', emoji: '🧻', couleur: '#fef9ee' },
      { nom: 'Assiettes jetables', emoji: '🍽️', couleur: '#e2e8f0' },
      { nom: 'Verres jetables', emoji: '🥤', couleur: '#bfdbfe' },
      { nom: 'Ustensiles cuisine', emoji: '🍴', couleur: '#9ca3af' },
      { nom: 'Monnaie / Service', emoji: '💰', couleur: '#fbbf24' },
    ]
  }
]

// ─── Recherche globale ────────────────────────────────────────────────────────

export function searchLibrary(query: string): (LibProduit & { rayon: string; rayonId: string })[] {
  const q = query.toLowerCase().trim()
  if (!q) return []
  const results: (LibProduit & { rayon: string; rayonId: string })[] = []
  for (const rayon of RAYONS) {
    for (const prod of rayon.produits) {
      if (prod.nom.toLowerCase().includes(q)) {
        results.push({ ...prod, rayon: rayon.nom, rayonId: rayon.id })
      }
    }
  }
  return results.slice(0, 40)
}
