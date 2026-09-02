export type UserRole = 'caissier' | 'gestionnaire' | 'admin' | 'superviseur'
export type ModePaiement = 'especes' | 'wave' | 'orange_money' | 'mtn' | 'carte' | 'ardoise'
export type MouvementType = 'entree' | 'sortie' | 'ajustement'
export type VenteStatut = 'completed' | 'annule' | 'rembourse'

export interface User {
  id: number
  username: string
  role: UserRole
  nom: string
  actif: number
  created_at?: string
}

export interface Client {
  id: number
  nom: string
  telephone?: string
  email?: string
  forfait_mensuel?: number
  date_expiration?: string
  solde_credit?: number
  points_fidelite?: number
  solde_portefeuille?: number
  remise_pct?: number
  actif: number
  created_at?: string
}

export interface Categorie {
  id: number
  nom: string
  couleur: string
  icone: string
}

export interface Produit {
  id: number
  nom: string
  categorie_id: number
  prix_vente: number
  prix_achat: number
  unite: string
  stock_actuel: number
  stock_minimum: number
  code_barre?: string
  actif: number
  image_url?: string
  date_peremption?: string | null
  lot?: string | null
  created_at?: string
  categorie_nom?: string
  categorie_couleur?: string
  categorie_icone?: string
}

export interface CartItem {
  key: string
  produit: Produit
  quantite: number
  prix_unitaire: number
  total_ligne: number
  remise_ligne?: number
  details?: string
  variante_id?: number
  stockMax?: number
  nom_libre?: string
}

export interface VenteLigne {
  id: number
  vente_id: number
  produit_id: number
  quantite: number
  prix_unitaire: number
  total_ligne: number
  produit_nom?: string
  unite?: string
  details?: string
  variante_id?: number
}

export interface Vente {
  id: number
  numero_ticket: string
  date: string
  total: number
  remise: number
  montant_paye: number
  monnaie_rendue: number
  mode_paiement: ModePaiement
  caissier_id: number
  client_id?: number
  statut: VenteStatut
  caissier_nom?: string
  client_nom?: string
  lignes?: VenteLigne[]
}

export interface MouvementStock {
  id: number
  produit_id: number
  type: MouvementType
  quantite: number
  raison?: string
  date: string
  user_id?: number
  produit_nom?: string
  user_nom?: string
}

export interface Parametres {
  nom_entreprise: string
  adresse: string
  telephone: string
  email: string
  receipt_header: string
  receipt_footer: string
  tva_taux: string
  monnaie: string
  printer_type: string
  printer_interface: string
  printer_port: string
  heure_cloture_auto?: string
  sms_patronne?: string
  sms_provider?: string
  sms_api_key?: string
  sms_from?: string
  [key: string]: string | undefined
}

export interface Alerte {
  id: number
  produit_id?: number
  message: string
  type: string
  lu: number
  date: string
  produit_nom?: string
}

export interface VenteStats {
  totalVentes: { nb: number; ca: number; remises: number }
  parModePaiement: { mode_paiement: string; nb: number; total: number }[]
  topProduits: { nom: string; qte_vendue: number; ca: number }[]
  parJour: { jour: string; nb: number; ca: number }[]
}

export interface PrintReceiptData {
  ticket: string
  date: string
  caissier: string
  client?: string
  lignes: { nom: string; quantite: number; prix_unitaire: number; total_ligne: number; unite: string; details?: string; nom_libre?: string; type?: 'retour' | 'echange' }[]
  total: number
  remise: number
  montant_paye: number
  monnaie_rendue: number
  especes_comptees?: number
  mode_paiement: string
  paiements?: { mode: string; montant: number }[]
  header?: string
  footer?: string
  cagnotte_utilisee?: number
  portefeuille_utilise?: number
  monnaie_creditee_wallet?: number
  points_utilises?: number
  points_gagnes?: number
  solde_points?: number
  valeur_point_fcfa?: number
  monnaie?: string
  codeRetour?: string
  type?: 'remboursement' | 'echange'
  montant_echange?: number
  montant_reliquat?: number
}

// ─── NOUVELLES INTERFACES ──────────────────────────────────────────────────────

export interface SessionCaisse {
  id: number
  user_id: number
  date: string
  heure_ouverture: string
  heure_cloture?: string
  fond_caisse: number
  montant_final_especes?: number
  total_ventes: number
  nb_ventes: number
  statut: 'ouvert' | 'cloture'
  user_nom?: string
}

export interface TiroirLog {
  id: number
  date_heure: string
  type: 'vente' | 'ouverture_simple'
  vente_id?: number
  user_id: number
  session_id?: number
  motif?: string
  user_nom?: string
  numero_ticket?: string
}

export type MouvementCaisseType = 'versement' | 'retrait'

export interface MouvementCaisse {
  id: number
  session_id?: number
  type: MouvementCaisseType
  montant: number
  motif?: string
  user_id: number
  date_heure: string
  user_nom?: string
  session_user_id?: number
}

export interface Charge {
  id: number
  date: string
  libelle: string
  categorie: string
  montant: number
  mode_paiement: string
  user_id: number
  note?: string
  created_at: string
  user_nom?: string
}

export interface CodeSuperviseur {
  id: number
  code: string
  user_id: number
  actif: number
  created_at?: string
  user_nom?: string
}

export interface StatsDuJour {
  ca: number
  nb_ventes: number
  par_mode: { mode_paiement: string; total: number; nb: number }[]
  fond_caisse: number
}

export interface ConnexionLog {
  id: number
  user_id: number
  type: 'connexion' | 'deconnexion' | 'cloture_session'
  date_heure: string
  session_id?: number
  note?: string
  user_nom?: string
  user_role?: string
  fond_caisse?: number
  session_statut?: string
}

// ─── VOLET COMMERCIAL ─────────────────────────────────────────────────────────

export interface Ardoise {
  id: number
  client_id: number
  vente_id?: number
  type: 'credit' | 'remboursement'
  montant: number
  solde_avant: number
  solde_apres: number
  note?: string
  user_id?: number
  date: string
  user_nom?: string
  numero_ticket?: string
}

export interface FideliteRegle {
  id: number
  nom: string
  points_par_fcfa: number
  valeur_point_fcfa: number
  seuil_utilisation: number
  actif: number
}

export interface FideliteTransaction {
  id: number
  client_id: number
  vente_id?: number
  type: 'gain' | 'utilisation' | 'ajustement'
  points: number
  solde_avant: number
  date: string
  numero_ticket?: string
  vente_total?: number
}

export interface DevisLigne {
  id?: number
  devis_id?: number
  produit_id?: number
  designation: string
  unite: string
  quantite: number
  prix_unitaire: number
  total_ligne: number
  produit_nom_ref?: string
}

export interface Devis {
  id: number
  numero: string
  client_id?: number
  client_nom?: string
  client_telephone?: string
  date: string
  date_validite?: string
  total: number
  remise: number
  statut: 'brouillon' | 'envoye' | 'accepte' | 'refuse' | 'converti'
  notes?: string
  user_id?: number
  vente_id?: number
  created_at?: string
  client_nom_join?: string
  user_nom?: string
  nb_lignes?: number
  lignes?: DevisLigne[]
}

export interface EtatComplet {
  resume: {
    nb_ventes: number
    ca_total: number
    remises_total: number
    panier_moyen: number
    vente_min: number
    vente_max: number
  }
  marges: {
    cout_achats_total: number
    marge_brute_total: number
    taux_marge_global: number
    charges_total: number
    resultat_net: number
  }
  parModePaiement: { mode_paiement: string; nb: number; total: number; moyenne: number }[]
  parArticle: {
    produit_nom: string; unite: string; prix_achat: number
    categorie_nom: string; categorie_couleur: string
    qte_vendue: number; nb_transactions: number
    ca: number; prix_moyen: number
    cout_achat: number; marge_brute: number
  }[]
  parCategorie: { categorie_nom: string; icone: string; couleur: string; nb_transactions: number; qte_vendue: number; ca: number }[]
  ventes: Vente[]
  sessions: (SessionCaisse & { user_nom: string })[]
  connexions: ConnexionLog[]
  tiroir: TiroirLog[]
  charges: Charge[]
  annulations: Vente[]
}

// ─── TYPE DE COMMERCE (profil paramétrable) ───────────────────────────────────

export type ProfilModule =
  | 'pesee' | 'variantes' | 'peremption' | 'forfaits_client' | 'fidelite' | 'ardoise'
  | 'devis' | 'commandes_fournisseurs' | 'inventaire' | 'promotions' | 'campagnes'
  | 'multi_entrepots' | 'factures' | 'retours' | 'sms'

export type ProfilModules = Record<ProfilModule, boolean>

export interface ProfilCommerceAplique {
  id: string
  label: string
  applique_le?: string
}

export interface ProfilListEntry {
  id: string
  label: string
  description: string
  icone: string
  couleur: string
}

export interface ProfilComplet {
  id: string
  label: string
  icone: string
  couleur: string
  devise: string
  unite_defaut: string
  tva_defaut: number
  modules: ProfilModules
  mode_paiements: string[]
  champs_client: string[]
  applique_le?: string
}

// ─── ATTRIBUTS / VARIANTES (typologie du commerce) ────────────────────────────

export interface AttributValeur {
  id: number
  label: string
  ordre: number
}

export interface AttributComplet {
  id: number
  nom: string
  actif: number
  valeurs: AttributValeur[]
}

export interface AttributionProduit {
  attribut_id: number
  attribut_nom: string
  valeur_id: number | null
  valeur_label: string | null
}

export interface VarianteProduit {
  id: number
  produit_id: number
  combinaison: Record<number, number>
  combinaison_labels: Record<string, string>
  stock: number
  prix_vente: number | null
  prix_achat: number | null
  sku: string | null
}

export interface VarianteComboInput {
  combinaison: Record<number, number>
  stock: number
  prix_vente?: number | null
  prix_achat?: number | null
  sku?: string | null
}
