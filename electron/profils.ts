// Registre des types de commerce (profils) — data pure, partagée avec la base de données
// Un profil pilote : unités, devise, TVA, modules UI, modes de paiement, catalogue de démarrage.

export type ProfilModule =
  | 'pesee'
  | 'variantes'
  | 'peremption'
  | 'forfaits_client'
  | 'fidelite'
  | 'ardoise'
  | 'devis'
  | 'commandes_fournisseurs'
  | 'inventaire'
  | 'promotions'
  | 'campagnes'
  | 'multi_entrepots'
  | 'factures'
  | 'retours'
  | 'sms'

export const PROFIL_MODULES: ProfilModule[] = [
  'pesee', 'variantes', 'peremption', 'forfaits_client', 'fidelite', 'ardoise',
  'devis', 'commandes_fournisseurs', 'inventaire', 'promotions', 'campagnes',
  'multi_entrepots', 'factures', 'retours', 'sms',
]

export interface ProUniteDef { nom: string; symbole: string; pesable: boolean }
export interface ProAttributDef { nom: string; valeurs: string[] }
export interface ProCategorieDef { nom: string; couleur: string; icone: string }
export interface ProVarianteDef {
  // Combinaison exprimée par nom d'attribut → label de valeur (ex. { Taille: 'L', Couleur: 'Noir' })
  combinaison: Record<string, string>
  stock: number
  prix_vente?: number | null
  prix_achat?: number | null
  sku?: string | null
}
export interface ProProduitDef {
  nom: string
  categorie: string
  prix_vente: number
  prix_achat: number
  unite: string
  stock_actuel: number
  stock_minimum: number
  code_barre?: string
  image_url: string
  variantes?: ProVarianteDef[]
}

export interface ProfilCommerce {
  id: string
  label: string
  description: string
  icone: string
  couleur: string
  devise: string
  unite_defaut: string
  tva_defaut: number
  modules: Record<ProfilModule, boolean>
  mode_paiements: string[]
  champs_client: string[]
  unites: ProUniteDef[]
  attributs?: ProAttributDef[]
  categories?: ProCategorieDef[]
  produits?: ProProduitDef[]
}

function allModules(actifs: ProfilModule[]): Record<ProfilModule, boolean> {
  const m = {} as Record<ProfilModule, boolean>
  for (const mod of PROFIL_MODULES) m[mod] = actifs.includes(mod)
  return m
}

const UNITE_KG: ProUniteDef = { nom: 'kg', symbole: 'kg', pesable: true }
const UNITE_PIECE: ProUniteDef = { nom: 'pièce', symbole: 'pce', pesable: false }
const UNITE_LITRE: ProUniteDef = { nom: 'litre', symbole: 'L', pesable: false }
const UNITE_LOT: ProUniteDef = { nom: 'lot', symbole: 'lot', pesable: false }
const UNITE_PAIRE: ProUniteDef = { nom: 'paire', symbole: 'pr', pesable: false }

// Valeurs possibles des modes de paiement (repose sur le CHECK existant de ventes.mode_paiement)
export const MODES_PAIEMENT_DISPO = ['especes', 'wave', 'orange_money', 'mtn', 'carte', 'ardoise'] as const

export const PROFILS: ProfilCommerce[] = [
  {
    id: 'volaille',
    label: 'Alimentation — Volaille & Fruits/Légumes',
    description: 'Produits frais vendus au poids ou à la pièce, abonnements, abattage.',
    icone: '🐔',
    couleur: '#f59e0b',
    devise: 'FCFA',
    unite_defaut: 'kg',
    tva_defaut: 0,
    modules: allModules(['pesee', 'peremption', 'forfaits_client', 'fidelite', 'ardoise',
      'commandes_fournisseurs', 'inventaire', 'promotions', 'multi_entrepots', 'factures', 'retours', 'sms']),
    mode_paiements: [...MODES_PAIEMENT_DISPO],
    champs_client: ['forfait'],
    unites: [UNITE_KG, UNITE_PIECE, UNITE_LITRE],
    categories: [
      { nom: 'Volaille', couleur: '#f59e0b', icone: '🐔' },
      { nom: 'Fruits', couleur: '#10b981', icone: '🍎' },
      { nom: 'Légumes', couleur: '#3b82f6', icone: '🥦' },
    ],
    produits: [
      { nom: 'Poulet entier', categorie: 'Volaille', prix_vente: 3500, prix_achat: 2500, unite: 'pièce', stock_actuel: 20, stock_minimum: 5, code_barre: '100001', image_url: 'lib://🐔|#f59e0b' },
      { nom: 'Poulet découpé', categorie: 'Volaille', prix_vente: 4000, prix_achat: 2800, unite: 'kg', stock_actuel: 15, stock_minimum: 3, code_barre: '100002', image_url: 'lib://🍗|#f59e0b' },
      { nom: 'Cuisses de poulet', categorie: 'Volaille', prix_vente: 2500, prix_achat: 1800, unite: 'kg', stock_actuel: 10, stock_minimum: 3, code_barre: '100003', image_url: 'lib://🍗|#fb923c' },
      { nom: 'Ailes de poulet', categorie: 'Volaille', prix_vente: 2000, prix_achat: 1400, unite: 'kg', stock_actuel: 8, stock_minimum: 2, code_barre: '100004', image_url: 'lib://🍗|#fbbf24' },
      { nom: 'Poulet fumé', categorie: 'Volaille', prix_vente: 5000, prix_achat: 3500, unite: 'pièce', stock_actuel: 12, stock_minimum: 3, code_barre: '100005', image_url: 'lib://🐔|#92400e' },
      { nom: 'Canard entier', categorie: 'Volaille', prix_vente: 8000, prix_achat: 6000, unite: 'pièce', stock_actuel: 5, stock_minimum: 2, code_barre: '100006', image_url: 'lib://🦆|#84cc16' },
      { nom: 'Dinde entière', categorie: 'Volaille', prix_vente: 15000, prix_achat: 11000, unite: 'pièce', stock_actuel: 3, stock_minimum: 1, code_barre: '100007', image_url: 'lib://🦃|#a78bfa' },
      { nom: 'Pintade', categorie: 'Volaille', prix_vente: 6000, prix_achat: 4500, unite: 'pièce', stock_actuel: 4, stock_minimum: 1, code_barre: '100008', image_url: 'lib://🐓|#fb923c' },
      { nom: 'Mangue', categorie: 'Fruits', prix_vente: 500, prix_achat: 300, unite: 'kg', stock_actuel: 30, stock_minimum: 10, code_barre: '200001', image_url: 'lib://🥭|#f97316' },
      { nom: 'Banane', categorie: 'Fruits', prix_vente: 400, prix_achat: 250, unite: 'kg', stock_actuel: 25, stock_minimum: 10, code_barre: '200002', image_url: 'lib://🍌|#eab308' },
      { nom: 'Ananas', categorie: 'Fruits', prix_vente: 800, prix_achat: 500, unite: 'pièce', stock_actuel: 15, stock_minimum: 5, code_barre: '200003', image_url: 'lib://🍍|#f59e0b' },
      { nom: 'Papaye', categorie: 'Fruits', prix_vente: 600, prix_achat: 400, unite: 'kg', stock_actuel: 12, stock_minimum: 5, code_barre: '200004', image_url: 'lib://🍈|#f97316' },
      { nom: 'Orange', categorie: 'Fruits', prix_vente: 300, prix_achat: 200, unite: 'kg', stock_actuel: 20, stock_minimum: 8, code_barre: '200005', image_url: 'lib://🍊|#f97316' },
      { nom: 'Citron', categorie: 'Fruits', prix_vente: 250, prix_achat: 150, unite: 'kg', stock_actuel: 10, stock_minimum: 5, code_barre: '200006', image_url: 'lib://🍋|#eab308' },
      { nom: 'Pastèque', categorie: 'Fruits', prix_vente: 1000, prix_achat: 700, unite: 'pièce', stock_actuel: 8, stock_minimum: 3, code_barre: '200007', image_url: 'lib://🍉|#dc2626' },
      { nom: 'Avocat', categorie: 'Fruits', prix_vente: 400, prix_achat: 250, unite: 'pièce', stock_actuel: 20, stock_minimum: 5, code_barre: '200008', image_url: 'lib://🥑|#15803d' },
      { nom: 'Tomate', categorie: 'Légumes', prix_vente: 400, prix_achat: 250, unite: 'kg', stock_actuel: 20, stock_minimum: 8, code_barre: '300001', image_url: 'lib://🍅|#dc2626' },
      { nom: 'Oignon', categorie: 'Légumes', prix_vente: 350, prix_achat: 200, unite: 'kg', stock_actuel: 15, stock_minimum: 5, code_barre: '300002', image_url: 'lib://🧅|#a16207' },
      { nom: 'Carotte', categorie: 'Légumes', prix_vente: 500, prix_achat: 300, unite: 'kg', stock_actuel: 10, stock_minimum: 4, code_barre: '300003', image_url: 'lib://🥕|#f97316' },
      { nom: 'Gombo', categorie: 'Légumes', prix_vente: 600, prix_achat: 400, unite: 'kg', stock_actuel: 8, stock_minimum: 3, code_barre: '300004', image_url: 'lib://🌿|#15803d' },
      { nom: 'Aubergine', categorie: 'Légumes', prix_vente: 450, prix_achat: 280, unite: 'kg', stock_actuel: 12, stock_minimum: 4, code_barre: '300005', image_url: 'lib://🍆|#7c3aed' },
      { nom: 'Piment', categorie: 'Légumes', prix_vente: 700, prix_achat: 450, unite: 'kg', stock_actuel: 5, stock_minimum: 2, code_barre: '300006', image_url: 'lib://🌶️|#dc2626' },
      { nom: 'Poivron', categorie: 'Légumes', prix_vente: 800, prix_achat: 550, unite: 'kg', stock_actuel: 8, stock_minimum: 3, code_barre: '300007', image_url: 'lib://🫑|#16a34a' },
      { nom: 'Chou', categorie: 'Légumes', prix_vente: 300, prix_achat: 180, unite: 'pièce', stock_actuel: 15, stock_minimum: 5, code_barre: '300008', image_url: 'lib://🥬|#4ade80' },
    ],
  },
  {
    id: 'vetements',
    label: 'Boutique de vêtements',
    description: 'Vêtements, chaussures, accessoires — tailles, couleurs et variantes.',
    icone: '👕',
    couleur: '#6366f1',
    devise: 'FCFA',
    unite_defaut: 'pièce',
    tva_defaut: 18,
    modules: allModules(['variantes', 'fidelite', 'inventaire', 'promotions', 'campagnes',
      'factures', 'retours', 'sms']),
    mode_paiements: ['especes', 'wave', 'orange_money', 'mtn', 'carte'],
    champs_client: [],
    unites: [UNITE_PIECE, UNITE_LOT, UNITE_PAIRE],
    attributs: [
      { nom: 'Taille', valeurs: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '36', '37', '38', '39', '40', '41', '42', '43', '44'] },
      { nom: 'Couleur', valeurs: ['Noir', 'Blanc', 'Rouge', 'Bleu', 'Vert', 'Jaune', 'Rose', 'Bordeaux', 'Gris', 'Autre'] },
    ],
    categories: [
      { nom: 'Homme', couleur: '#6366f1', icone: '👔' },
      { nom: 'Femme', couleur: '#ec4899', icone: '👗' },
      { nom: 'Enfant', couleur: '#f59e0b', icone: '🧒' },
      { nom: 'Chaussures', couleur: '#10b981', icone: '👟' },
      { nom: 'Accessoires', couleur: '#8b5cf6', icone: '👜' },
    ],
    produits: [
      { nom: 'Chemise homme', categorie: 'Homme', prix_vente: 15000, prix_achat: 9000, unite: 'pièce', stock_actuel: 23, stock_minimum: 5, code_barre: '500001', image_url: 'lib://👔|#6366f1',
        variantes: [
          { combinaison: { Taille: 'S', Couleur: 'Blanc' }, stock: 5 },
          { combinaison: { Taille: 'M', Couleur: 'Blanc' }, stock: 8 },
          { combinaison: { Taille: 'L', Couleur: 'Blanc' }, stock: 0 },
          { combinaison: { Taille: 'M', Couleur: 'Noir' }, stock: 6 },
          { combinaison: { Taille: 'L', Couleur: 'Noir' }, stock: 4 },
          { combinaison: { Taille: 'XL', Couleur: 'Noir' }, stock: 0 },
        ] },
      { nom: 'Pantalon homme', categorie: 'Homme', prix_vente: 18000, prix_achat: 11000, unite: 'pièce', stock_actuel: 15, stock_minimum: 5, code_barre: '500002', image_url: 'lib://👖|#6366f1',
        variantes: [
          { combinaison: { Taille: 'M', Couleur: 'Noir' }, stock: 4 },
          { combinaison: { Taille: 'L', Couleur: 'Noir' }, stock: 6 },
          { combinaison: { Taille: 'L', Couleur: 'Bleu' }, stock: 3 },
          { combinaison: { Taille: 'XL', Couleur: 'Bleu' }, stock: 2 },
          { combinaison: { Taille: 'M', Couleur: 'Bleu' }, stock: 0 },
        ] },
      { nom: 'T-shirt homme', categorie: 'Homme', prix_vente: 7000, prix_achat: 3500, unite: 'pièce', stock_actuel: 36, stock_minimum: 10, code_barre: '500003', image_url: 'lib://👕|#6366f1',
        variantes: [
          { combinaison: { Taille: 'S', Couleur: 'Blanc' }, stock: 10 },
          { combinaison: { Taille: 'M', Couleur: 'Blanc' }, stock: 12 },
          { combinaison: { Taille: 'M', Couleur: 'Noir' }, stock: 8 },
          { combinaison: { Taille: 'L', Couleur: 'Noir' }, stock: 0 },
          { combinaison: { Taille: 'L', Couleur: 'Rouge' }, stock: 6 },
          { combinaison: { Taille: 'XL', Couleur: 'Rouge' }, stock: 0 },
        ] },
      { nom: 'Robe femme', categorie: 'Femme', prix_vente: 25000, prix_achat: 14000, unite: 'pièce', stock_actuel: 17, stock_minimum: 3, code_barre: '500004', image_url: 'lib://👗|#ec4899',
        variantes: [
          { combinaison: { Taille: 'S', Couleur: 'Rouge' }, stock: 4 },
          { combinaison: { Taille: 'M', Couleur: 'Rouge' }, stock: 5 },
          { combinaison: { Taille: 'L', Couleur: 'Noir' }, stock: 0 },
          { combinaison: { Taille: 'M', Couleur: 'Noir' }, stock: 6 },
          { combinaison: { Taille: 'L', Couleur: 'Rouge' }, stock: 2 },
        ] },
      { nom: 'Jupe femme', categorie: 'Femme', prix_vente: 12000, prix_achat: 6500, unite: 'pièce', stock_actuel: 15, stock_minimum: 4, code_barre: '500005', image_url: 'lib://👗|#ec4899',
        variantes: [
          { combinaison: { Taille: 'M', Couleur: 'Noir' }, stock: 6 },
          { combinaison: { Taille: 'L', Couleur: 'Noir' }, stock: 4 },
          { combinaison: { Taille: 'M', Couleur: 'Rouge' }, stock: 0 },
          { combinaison: { Taille: 'S', Couleur: 'Rouge' }, stock: 5 },
        ] },
      { nom: 'Blouse femme', categorie: 'Femme', prix_vente: 16000, prix_achat: 8500, unite: 'pièce', stock_actuel: 15, stock_minimum: 3, code_barre: '500006', image_url: 'lib://👚|#ec4899',
        variantes: [
          { combinaison: { Taille: 'S', Couleur: 'Blanc' }, stock: 5 },
          { combinaison: { Taille: 'M', Couleur: 'Bleu' }, stock: 6 },
          { combinaison: { Taille: 'L', Couleur: 'Bleu' }, stock: 0 },
          { combinaison: { Taille: 'M', Couleur: 'Blanc' }, stock: 4 },
        ] },
      { nom: 'Ensemble enfant', categorie: 'Enfant', prix_vente: 9000, prix_achat: 4500, unite: 'pièce', stock_actuel: 23, stock_minimum: 5, code_barre: '500007', image_url: 'lib://🧒|#f59e0b',
        variantes: [
          { combinaison: { Taille: 'S', Couleur: 'Bleu' }, stock: 8 },
          { combinaison: { Taille: 'M', Couleur: 'Bleu' }, stock: 6 },
          { combinaison: { Taille: 'L', Couleur: 'Bleu' }, stock: 0 },
          { combinaison: { Taille: 'S', Couleur: 'Rouge' }, stock: 4 },
          { combinaison: { Taille: 'M', Couleur: 'Rouge' }, stock: 5 },
        ] },
      { nom: 'Chaussures homme', categorie: 'Chaussures', prix_vente: 30000, prix_achat: 18000, unite: 'paire', stock_actuel: 12, stock_minimum: 2, code_barre: '500008', image_url: 'lib://👟|#10b981',
        variantes: [
          { combinaison: { Taille: '40', Couleur: 'Noir' }, stock: 4 },
          { combinaison: { Taille: '41', Couleur: 'Noir' }, stock: 5 },
          { combinaison: { Taille: '42', Couleur: 'Noir' }, stock: 0 },
          { combinaison: { Taille: '41', Couleur: 'Bleu' }, stock: 3 },
          { combinaison: { Taille: '43', Couleur: 'Bleu' }, stock: 0 },
        ] },
      { nom: 'Chaussures femme', categorie: 'Chaussures', prix_vente: 28000, prix_achat: 16000, unite: 'paire', stock_actuel: 12, stock_minimum: 2, code_barre: '500009', image_url: 'lib://👠|#10b981',
        variantes: [
          { combinaison: { Taille: '37', Couleur: 'Noir' }, stock: 4 },
          { combinaison: { Taille: '38', Couleur: 'Rouge' }, stock: 5 },
          { combinaison: { Taille: '38', Couleur: 'Noir' }, stock: 3 },
          { combinaison: { Taille: '39', Couleur: 'Noir' }, stock: 0 },
        ] },
      { nom: 'Sac à main', categorie: 'Accessoires', prix_vente: 35000, prix_achat: 20000, unite: 'pièce', stock_actuel: 13, stock_minimum: 2, code_barre: '500010', image_url: 'lib://👜|#8b5cf6',
        variantes: [
          { combinaison: { Couleur: 'Noir' }, stock: 6 },
          { combinaison: { Couleur: 'Bleu' }, stock: 4 },
          { combinaison: { Couleur: 'Rouge' }, stock: 0 },
        ] },
      { nom: 'Ceinture', categorie: 'Accessoires', prix_vente: 5000, prix_achat: 2500, unite: 'pièce', stock_actuel: 11, stock_minimum: 4, code_barre: '500011', image_url: 'lib://🧵|#8b5cf6',
        variantes: [
          { combinaison: { Couleur: 'Noir' }, stock: 8 },
          { combinaison: { Couleur: 'Blanc' }, stock: 3 },
          { combinaison: { Couleur: 'Bleu' }, stock: 0 },
        ] },
      { nom: 'Écharpe / Foulard', categorie: 'Accessoires', prix_vente: 6000, prix_achat: 3000, unite: 'pièce', stock_actuel: 12, stock_minimum: 3, code_barre: '500012', image_url: 'lib://🧣|#8b5cf6',
        variantes: [
          { combinaison: { Taille: 'S', Couleur: 'Rouge' }, stock: 4 },
          { combinaison: { Taille: 'M', Couleur: 'Rouge' }, stock: 5 },
          { combinaison: { Taille: 'L', Couleur: 'Rouge' }, stock: 0 },
          { combinaison: { Taille: 'S', Couleur: 'Noir' }, stock: 3 },
          { combinaison: { Taille: 'M', Couleur: 'Noir' }, stock: 0 },
        ] },
    ],
  },
  {
    id: 'epicerie',
    label: 'Épicerie — Alimentation générale',
    description: 'Produits d\' épicerie, boissons, céréales — dates de péremption suivies.',
    icone: '🛒',
    couleur: '#22c55e',
    devise: 'FCFA',
    unite_defaut: 'pièce',
    tva_defaut: 0,
    modules: allModules(['peremption', 'fidelite', 'ardoise',
      'commandes_fournisseurs', 'inventaire', 'promotions', 'multi_entrepots', 'factures', 'retours', 'sms']),
    mode_paiements: [...MODES_PAIEMENT_DISPO],
    champs_client: [],
    unites: [UNITE_PIECE, UNITE_KG, UNITE_LITRE],
    attributs: [
      { nom: 'Contenance', valeurs: ['250 g', '500 g', '1 kg', '500 ml', '1 L', '1.5 L', '2 L'] },
    ],
    categories: [
      { nom: 'Épicerie salée', couleur: '#f59e0b', icone: '🍚' },
      { nom: 'Épicerie sucrée', couleur: '#ec4899', icone: '🍬' },
      { nom: 'Boissons', couleur: '#3b82f6', icone: '🥤' },
      { nom: 'Céréales & Farines', couleur: '#a16207', icone: '🌾' },
      { nom: 'Conserves', couleur: '#64748b', icone: '🥫' },
      { nom: 'Produits d\'entretien', couleur: '#22c55e', icone: '🧹' },
    ],
  },
  {
    id: 'restaurant',
    label: 'Restaurant / Traiteur',
    description: 'Plats, grillades, boissons — vente par assiette ou portion.',
    icone: '🍽️',
    couleur: '#f97316',
    devise: 'FCFA',
    unite_defaut: 'pièce',
    tva_defaut: 18,
    modules: allModules(['fidelite', 'ardoise', 'commandes_fournisseurs', 'inventaire',
      'promotions', 'factures', 'retours']),
    mode_paiements: [...MODES_PAIEMENT_DISPO],
    champs_client: [],
    unites: [UNITE_PIECE, UNITE_KG, UNITE_LITRE],
    categories: [
      { nom: 'Plats', couleur: '#f97316', icone: '🍲' },
      { nom: 'Grillades', couleur: '#ef4444', icone: '🍗' },
      { nom: 'Desserts', couleur: '#ec4899', icone: '🍰' },
      { nom: 'Boissons', couleur: '#3b82f6', icone: '🥤' },
      { nom: 'Accompagnements', couleur: '#a16207', icone: '🍟' },
    ],
  },
  {
    id: 'salon',
    label: 'Salon de coiffure / Beauté',
    description: 'Services coiffure, soins, produits vendus à la pièce.',
    icone: '💇',
    couleur: '#a855f7',
    devise: 'FCFA',
    unite_defaut: 'pièce',
    tva_defaut: 18,
    modules: allModules(['variantes', 'fidelite', 'ardoise', 'promotions', 'campagnes', 'factures', 'retours', 'sms']),
    mode_paiements: ['especes', 'wave', 'orange_money', 'mtn', 'carte'],
    champs_client: [],
    unites: [UNITE_PIECE, UNITE_LITRE, UNITE_KG],
    categories: [
      { nom: 'Coiffure', couleur: '#a855f7', icone: '💇' },
      { nom: 'Soins & Ongles', couleur: '#ec4899', icone: '💅' },
      { nom: 'Produits de beauté', couleur: '#f59e0b', icone: '🧴' },
    ],
  },
  {
    id: 'pharmacie',
    label: 'Pharmacie / Parapharmacie',
    description: 'Médicaments et soins, lots + dates de péremption, TVA 18%.',
    icone: '💊',
    couleur: '#14b8a6',
    devise: 'FCFA',
    unite_defaut: 'pièce',
    tva_defaut: 18,
    modules: allModules(['peremption', 'fidelite', 'inventaire', 'commandes_fournisseurs',
      'factures', 'retours', 'sms']),
    mode_paiements: ['especes', 'wave', 'orange_money', 'mtn', 'carte'],
    champs_client: [],
    unites: [UNITE_PIECE, UNITE_LITRE, UNITE_KG],
    categories: [
      { nom: 'Médicaments', couleur: '#14b8a6', icone: '💊' },
      { nom: 'Parapharmacie', couleur: '#0ea5e9', icone: '🧴' },
      { nom: 'Soins', couleur: '#f97316', icone: '🩹' },
      { nom: 'Bébé', couleur: '#ec4899', icone: '🍼' },
    ],
  },
  {
    id: 'electronique',
    label: 'Électronique / Téléphonie',
    description: 'Téléphones, accessoires, électroménager — variantes couleur/capacité.',
    icone: '📱',
    couleur: '#0ea5e9',
    devise: 'FCFA',
    unite_defaut: 'pièce',
    tva_defaut: 18,
    modules: allModules(['variantes', 'fidelite', 'commandes_fournisseurs', 'inventaire',
      'promotions', 'campagnes', 'factures', 'retours', 'sms']),
    mode_paiements: ['especes', 'wave', 'orange_money', 'mtn', 'carte'],
    champs_client: [],
    unites: [UNITE_PIECE, UNITE_KG],
    attributs: [
      { nom: 'Couleur', valeurs: ['Noir', 'Blanc', 'Bleu', 'Or', 'Argent'] },
      { nom: 'Capacité', valeurs: ['32 Go', '64 Go', '128 Go', '256 Go'] },
    ],
    categories: [
      { nom: 'Téléphones', couleur: '#0ea5e9', icone: '📱' },
      { nom: 'Accessoires', couleur: '#8b5cf6', icone: '🎧' },
      { nom: 'Électroménager', couleur: '#64748b', icone: '🔌' },
      { nom: 'Audio & Vidéo', couleur: '#ef4444', icone: '🔊' },
      { nom: 'Informatique', couleur: '#3b82f6', icone: '💻' },
    ],
  },
  {
    id: 'quincaillerie',
    label: 'Quincaillerie / Bricolage',
    description: 'Outillage, matériaux, plomberie, électricité — vente à la pièce.',
    icone: '🔧',
    couleur: '#78716c',
    devise: 'FCFA',
    unite_defaut: 'pièce',
    tva_defaut: 18,
    modules: allModules(['variantes', 'ardoise', 'commandes_fournisseurs', 'inventaire',
      'promotions', 'factures', 'retours']),
    mode_paiements: [...MODES_PAIEMENT_DISPO],
    champs_client: [],
    unites: [UNITE_PIECE, UNITE_KG, UNITE_LITRE],
    categories: [
      { nom: 'Outillage', couleur: '#78716c', icone: '🔧' },
      { nom: 'Plomberie', couleur: '#0ea5e9', icone: '🚿' },
      { nom: 'Électricité', couleur: '#f59e0b', icone: '💡' },
      { nom: 'Peinture', couleur: '#ec4899', icone: '🎨' },
      { nom: 'Fixations', couleur: '#64748b', icone: '🔩' },
    ],
  },
]

export function getProfil(id: string): ProfilCommerce | undefined {
  return PROFILS.find(p => p.id === id)
}

// Info légère exposée au renderer (wizard / paramètres)
export function toInfo(p: ProfilCommerce) {
  return {
    id: p.id,
    label: p.label,
    description: p.description,
    icone: p.icone,
    couleur: p.couleur,
  }
}