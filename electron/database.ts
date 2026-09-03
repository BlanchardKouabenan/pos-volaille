import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import crypto from 'crypto'
// sql.js: pure WebAssembly SQLite - no native compilation needed
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { PROFILS, type ProProduitDef } from './profils'

let db: SqlJsDatabase
let dbPath: string
let rotationCodeFile: string  // fichier partagé entre instances Electron

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex')
}

function saveDb() {
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

// Helper: run query returning all rows as objects
function queryAll(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows: any[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

// Helper: run query returning first row or null
function queryOne(sql: string, params: any[] = []): any | null {
  const rows = queryAll(sql, params)
  return rows.length > 0 ? rows[0] : null
}

// Helper: run INSERT/UPDATE/DELETE, save DB, return last insert rowid
function runWrite(sql: string, params: any[] = []): { lastInsertRowid: number; changes: number } {
  db.run(sql, params)
  const rowid = db.exec('SELECT last_insert_rowid() as r')[0]?.values[0]?.[0] as number ?? 0
  const changes = db.exec('SELECT changes() as c')[0]?.values[0]?.[0] as number ?? 0
  saveDb()
  return { lastInsertRowid: rowid, changes }
}

export async function initDatabase(): Promise<void> {
  // En mode packagé, le fichier WASM est dans process.resourcesPath
  // En mode dev, il est dans node_modules/sql.js/dist/
  const wasmPath = app.isPackaged
    ? path.join(process.resourcesPath, 'sql-wasm.wasm')
    : path.join(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => wasmPath })
  const userDataDir = app.getPath('userData')
  dbPath = path.join(userDataDir, 'kb-pos.db')
  rotationCodeFile = path.join(userDataDir, 'rotation_code.json')

  // Migration des anciennes bases (renommage de l'application)
  if (!fs.existsSync(dbPath)) {
    const legacyPaths = [
      path.join(app.getPath('appData'), 'pos-volaille', 'pos-volaille.db'),
      path.join(app.getPath('appData'), 'Volaille Express POS', 'pos-volaille.db')
    ]
    for (const legacy of legacyPaths) {
      if (fs.existsSync(legacy)) {
        fs.copyFileSync(legacy, dbPath)
        break
      }
    }
  }

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON')
  createTables()
  migrateSchema()
  seedData()

  // Au démarrage, on complète les combinaisons de stock d'un catalogue déjà seedé
  // avant l'existence de variantes_produit (idempotent, aucun impact sinon).
  try {
    const profil = getProfileCommerce()
    if (profil) reconcilierVariantesProfile(PROFILS.find(p => p.id === profil.id)!)
  } catch (e: any) {
    console.error('reconcilier variantes failed:', e?.message)
  }

  saveDb()
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('caissier','gestionnaire','admin','superviseur')),
      nom TEXT NOT NULL,
      actif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      telephone TEXT,
      email TEXT,
      forfait_mensuel REAL DEFAULT 0,
      date_expiration TEXT,
      actif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      couleur TEXT NOT NULL DEFAULT '#3b82f6',
      icone TEXT NOT NULL DEFAULT '📦'
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS produits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      categorie_id INTEGER REFERENCES categories(id),
      prix_vente REAL NOT NULL DEFAULT 0,
      prix_achat REAL NOT NULL DEFAULT 0,
      unite TEXT NOT NULL DEFAULT 'kg',
      stock_actuel REAL NOT NULL DEFAULT 0,
      stock_minimum REAL NOT NULL DEFAULT 0,
      code_barre TEXT,
      actif INTEGER NOT NULL DEFAULT 1,
      image_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS prix_clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produit_id INTEGER NOT NULL REFERENCES produits(id),
      client_id INTEGER NOT NULL REFERENCES clients(id),
      prix REAL NOT NULL,
      UNIQUE(produit_id, client_id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS ventes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_ticket TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL DEFAULT (datetime('now')),
      total REAL NOT NULL DEFAULT 0,
      remise REAL NOT NULL DEFAULT 0,
      montant_paye REAL NOT NULL DEFAULT 0,
      monnaie_rendue REAL NOT NULL DEFAULT 0,
      mode_paiement TEXT NOT NULL CHECK(mode_paiement IN ('especes','wave','orange_money','mtn','carte','ardoise')),
      caissier_id INTEGER REFERENCES users(id),
      client_id INTEGER REFERENCES clients(id),
      statut TEXT NOT NULL DEFAULT 'completed' CHECK(statut IN ('completed','annule','rembourse'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS vente_lignes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vente_id INTEGER NOT NULL REFERENCES ventes(id) ON DELETE CASCADE,
      produit_id INTEGER NOT NULL REFERENCES produits(id),
      quantite REAL NOT NULL,
      prix_unitaire REAL NOT NULL,
      total_ligne REAL NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS vente_paiements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vente_id INTEGER NOT NULL REFERENCES ventes(id) ON DELETE CASCADE,
      mode TEXT NOT NULL CHECK(mode IN ('especes','wave','orange_money','mtn','carte','ardoise')),
      montant REAL NOT NULL DEFAULT 0
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS mouvements_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produit_id INTEGER NOT NULL REFERENCES produits(id),
      type TEXT NOT NULL CHECK(type IN ('entree','sortie','ajustement')),
      quantite REAL NOT NULL,
      raison TEXT,
      date TEXT DEFAULT (datetime('now')),
      user_id INTEGER REFERENCES users(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS parametres (
      cle TEXT PRIMARY KEY,
      valeur TEXT NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS alertes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produit_id INTEGER REFERENCES produits(id),
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'stock',
      lu INTEGER NOT NULL DEFAULT 0,
      date TEXT DEFAULT (datetime('now'))
    )
  `)

  // ─── NOUVELLES TABLES ─────────────────────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions_caisse (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      date TEXT NOT NULL DEFAULT (date('now')),
      heure_ouverture TEXT NOT NULL DEFAULT (time('now')),
      heure_cloture TEXT,
      fond_caisse REAL NOT NULL DEFAULT 0,
      montant_final_especes REAL,
      total_ventes REAL DEFAULT 0,
      nb_ventes INTEGER DEFAULT 0,
      statut TEXT NOT NULL DEFAULT 'ouvert' CHECK(statut IN ('ouvert','cloture'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS tiroir_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_heure TEXT NOT NULL DEFAULT (datetime('now')),
      type TEXT NOT NULL DEFAULT 'vente' CHECK(type IN ('vente','ouverture_simple')),
      vente_id INTEGER REFERENCES ventes(id),
      user_id INTEGER REFERENCES users(id),
      session_id INTEGER REFERENCES sessions_caisse(id),
      motif TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL DEFAULT (date('now')),
      libelle TEXT NOT NULL,
      categorie TEXT NOT NULL DEFAULT 'Autre',
      montant REAL NOT NULL,
      mode_paiement TEXT NOT NULL DEFAULT 'especes',
      user_id INTEGER REFERENCES users(id),
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS mouvements_caisse (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER REFERENCES sessions_caisse(id),
      type TEXT NOT NULL CHECK(type IN ('versement','retrait')),
      montant REAL NOT NULL,
      motif TEXT,
      user_id INTEGER REFERENCES users(id),
      date_heure TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS codes_superviseur (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      actif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // ─── FOURNISSEURS ─────────────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS fournisseurs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      telephone TEXT,
      email TEXT,
      adresse TEXT,
      contact_nom TEXT,
      notes TEXT,
      actif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS commandes_fournisseur (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fournisseur_id INTEGER NOT NULL REFERENCES fournisseurs(id),
      reference TEXT,
      date TEXT NOT NULL DEFAULT (date('now')),
      statut TEXT NOT NULL DEFAULT 'brouillon' CHECK(statut IN ('brouillon','commandé','reçu_partiel','reçu','annulé')),
      total REAL NOT NULL DEFAULT 0,
      notes TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS commandes_lignes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commande_id INTEGER NOT NULL REFERENCES commandes_fournisseur(id) ON DELETE CASCADE,
      produit_id INTEGER NOT NULL REFERENCES produits(id),
      quantite_commandee REAL NOT NULL DEFAULT 0,
      quantite_recue REAL NOT NULL DEFAULT 0,
      prix_achat REAL NOT NULL DEFAULT 0,
      total_ligne REAL NOT NULL DEFAULT 0
    )
  `)

  // ─── INVENTAIRE PHYSIQUE ───────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS inventaires (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT (date('now')),
      statut TEXT NOT NULL DEFAULT 'en_cours' CHECK(statut IN ('en_cours','cloture')),
      user_id INTEGER REFERENCES users(id),
      notes TEXT,
      nb_articles INTEGER DEFAULT 0,
      nb_ecarts INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS inventaire_lignes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventaire_id INTEGER NOT NULL REFERENCES inventaires(id) ON DELETE CASCADE,
      produit_id INTEGER NOT NULL REFERENCES produits(id),
      stock_theorique REAL NOT NULL DEFAULT 0,
      stock_compte REAL,
      ecart REAL
    )
  `)

  // ─── JOURNAL DES ENVOIS EMAIL ────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS emails_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      sujet TEXT,
      destinataire TEXT,
      statut TEXT NOT NULL DEFAULT 'envoye' CHECK(statut IN ('envoye','echec')),
      erreur TEXT,
      date_envoi TEXT DEFAULT (datetime('now'))
    )
  `)

  // ─── PROMOTIONS ───────────────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('pourcentage','montant_fixe','prix_special','quantite')),
      valeur REAL NOT NULL,
      quantite_min INTEGER NOT NULL DEFAULT 1,
      produit_id INTEGER REFERENCES produits(id),
      categorie_id INTEGER REFERENCES categories(id),
      date_debut TEXT,
      date_fin TEXT,
      actif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS connexions_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL CHECK(type IN ('connexion','deconnexion','cloture_session')),
      date_heure TEXT NOT NULL DEFAULT (datetime('now')),
      session_id INTEGER REFERENCES sessions_caisse(id),
      ip TEXT,
      note TEXT
    )
  `)

  // ─── VOLET COMMERCIAL ─────────────────────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS portefeuille_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      vente_id INTEGER REFERENCES ventes(id),
      type TEXT NOT NULL CHECK(type IN ('credit','debit','monnaie')),
      montant REAL NOT NULL,
      solde_avant REAL NOT NULL DEFAULT 0,
      solde_apres REAL NOT NULL DEFAULT 0,
      note TEXT,
      user_id INTEGER REFERENCES users(id),
      date TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS ardoises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      vente_id INTEGER REFERENCES ventes(id),
      type TEXT NOT NULL CHECK(type IN ('credit','remboursement')),
      montant REAL NOT NULL,
      solde_avant REAL NOT NULL DEFAULT 0,
      solde_apres REAL NOT NULL DEFAULT 0,
      note TEXT,
      user_id INTEGER REFERENCES users(id),
      date TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS fidelite_regles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      points_par_fcfa REAL NOT NULL DEFAULT 1,
      valeur_point_fcfa REAL NOT NULL DEFAULT 1,
      seuil_utilisation INTEGER NOT NULL DEFAULT 100,
      actif INTEGER NOT NULL DEFAULT 1
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS fidelite_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      vente_id INTEGER REFERENCES ventes(id),
      type TEXT NOT NULL CHECK(type IN ('gain','utilisation','ajustement')),
      points INTEGER NOT NULL,
      solde_avant INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      date TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS devis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT NOT NULL UNIQUE,
      client_id INTEGER REFERENCES clients(id),
      client_nom TEXT,
      client_telephone TEXT,
      date TEXT NOT NULL DEFAULT (date('now')),
      date_validite TEXT,
      total REAL NOT NULL DEFAULT 0,
      remise REAL NOT NULL DEFAULT 0,
      statut TEXT NOT NULL DEFAULT 'brouillon' CHECK(statut IN ('brouillon','envoye','accepte','refuse','converti')),
      notes TEXT,
      user_id INTEGER REFERENCES users(id),
      vente_id INTEGER REFERENCES ventes(id),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS devis_lignes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      devis_id INTEGER NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
      produit_id INTEGER REFERENCES produits(id),
      designation TEXT NOT NULL,
      unite TEXT NOT NULL DEFAULT 'pièce',
      quantite REAL NOT NULL DEFAULT 1,
      prix_unitaire REAL NOT NULL DEFAULT 0,
      total_ligne REAL NOT NULL DEFAULT 0
    )
  `)

  // ─── CODE ROTATION SUPERVISEUR (30min) ────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS code_rotation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code_hash TEXT NOT NULL,
      expire_a TEXT NOT NULL,
      genere_par INTEGER REFERENCES users(id),
      genere_le TEXT DEFAULT (datetime('now')),
      actif INTEGER NOT NULL DEFAULT 1
    )
  `)

  // ─── RETOURS ARTICLES ─────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS retours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT NOT NULL UNIQUE,
      vente_id INTEGER NOT NULL REFERENCES ventes(id),
      caissier_id INTEGER NOT NULL REFERENCES users(id),
      code_rotation_id INTEGER REFERENCES code_rotation(id),
      montant_rembourse REAL NOT NULL DEFAULT 0,
      mode_remboursement TEXT NOT NULL DEFAULT 'especes',
      motif TEXT,
      date TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS retour_lignes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      retour_id INTEGER NOT NULL REFERENCES retours(id) ON DELETE CASCADE,
      produit_id INTEGER NOT NULL REFERENCES produits(id),
      quantite REAL NOT NULL DEFAULT 1,
      prix_unitaire REAL NOT NULL DEFAULT 0,
      total_ligne REAL NOT NULL DEFAULT 0
    )
  `)

  // ─── ENTREPÔTS / MULTI-STOCK ─────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS entrepots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      adresse TEXT,
      responsable TEXT,
      actif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS stock_par_entrepot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produit_id INTEGER NOT NULL REFERENCES produits(id),
      entrepot_id INTEGER NOT NULL REFERENCES entrepots(id),
      quantite REAL NOT NULL DEFAULT 0,
      UNIQUE(produit_id, entrepot_id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS transferts_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      entrepot_source_id INTEGER NOT NULL REFERENCES entrepots(id),
      entrepot_dest_id INTEGER NOT NULL REFERENCES entrepots(id),
      statut TEXT NOT NULL DEFAULT 'en_attente' CHECK(statut IN ('en_attente','validé','annulé')),
      notes TEXT,
      user_id INTEGER REFERENCES users(id),
      date TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS transfert_lignes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfert_id INTEGER NOT NULL REFERENCES transferts_stock(id) ON DELETE CASCADE,
      produit_id INTEGER NOT NULL REFERENCES produits(id),
      quantite REAL NOT NULL DEFAULT 0
    )
  `)

  // ─── HISTORIQUE PRIX D'ACHAT ──────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS prix_achat_historique (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produit_id INTEGER NOT NULL REFERENCES produits(id),
      prix_achat REAL NOT NULL,
      fournisseur_id INTEGER REFERENCES fournisseurs(id),
      commande_id INTEGER REFERENCES commandes_fournisseur(id),
      date TEXT DEFAULT (datetime('now'))
    )
  `)

  // ─── MULTI-BOUTIQUES ──────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS boutiques (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      adresse TEXT,
      telephone TEXT,
      actif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // ─── ALERTES AUTOMATISATIONS ──────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS alertes_regles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      actif INTEGER NOT NULL DEFAULT 1,
      params TEXT DEFAULT '{}',
      derniere_execution TEXT
    )
  `)

  // ─── IMPORT/EXPORT LOG ────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS import_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      fichier TEXT,
      nb_lignes INTEGER DEFAULT 0,
      nb_erreurs INTEGER DEFAULT 0,
      date TEXT DEFAULT (datetime('now')),
      user_id INTEGER REFERENCES users(id)
    )
  `)

  // ─── SYNC INTER-BOUTIQUES ─────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('create','update','delete')),
      data_json TEXT NOT NULL DEFAULT '{}',
      boutique_id INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      synced INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS sync_peers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      ip TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 7890,
      actif INTEGER NOT NULL DEFAULT 1,
      last_sync TEXT,
      last_sync_boutique_id INTEGER
    )
  `)

  // ─── SPRINT 9 — CAMPAGNES SMS ─────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS campagnes_sms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      segment TEXT NOT NULL DEFAULT 'tous',
      message_template TEXT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'brouillon' CHECK(statut IN ('brouillon','planifie','envoye','echec')),
      date_programmee TEXT,
      date_envoi TEXT,
      nb_destinataires INTEGER DEFAULT 0,
      nb_envoyes INTEGER DEFAULT 0,
      nb_echecs INTEGER DEFAULT 0,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // ─── SPRINT 10 — FACTURES DGI ─────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS factures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT NOT NULL UNIQUE,
      vente_id INTEGER REFERENCES ventes(id),
      client_id INTEGER REFERENCES clients(id),
      client_nom TEXT,
      client_nif TEXT,
      client_rccm TEXT,
      client_adresse TEXT,
      montant_ht REAL NOT NULL DEFAULT 0,
      tva_taux REAL NOT NULL DEFAULT 18,
      tva_montant REAL NOT NULL DEFAULT 0,
      montant_ttc REAL NOT NULL DEFAULT 0,
      statut TEXT NOT NULL DEFAULT 'emise' CHECK(statut IN ('emise','payee','annulee')),
      date_emission TEXT DEFAULT (datetime('now')),
      date_echeance TEXT,
      notes TEXT,
      user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS facture_lignes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
      designation TEXT NOT NULL,
      quantite REAL NOT NULL DEFAULT 1,
      prix_unitaire_ht REAL NOT NULL DEFAULT 0,
      tva_taux REAL NOT NULL DEFAULT 18,
      total_ht REAL NOT NULL DEFAULT 0,
      total_ttc REAL NOT NULL DEFAULT 0
    )
  `)

  // ─── Phase « Commerce paramétrable » ──────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS unites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL UNIQUE,
      symbole TEXT NOT NULL DEFAULT '',
      pesable INTEGER NOT NULL DEFAULT 0,
      actif INTEGER NOT NULL DEFAULT 1
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS attributs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL UNIQUE,
      actif INTEGER NOT NULL DEFAULT 1
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS attribut_valeurs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attribut_id INTEGER NOT NULL REFERENCES attributs(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      ordre INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS attributs_produit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produit_id INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
      attribut_id INTEGER NOT NULL REFERENCES attributs(id),
      valeur_id INTEGER REFERENCES attribut_valeurs(id),
      UNIQUE(produit_id, attribut_id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS variantes_produit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produit_id INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
      combinaison TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      prix_vente REAL,
      prix_achat REAL,
      sku TEXT
    )
  `)
  try { db.run('CREATE INDEX IF NOT EXISTS idx_variantes_produit ON variantes_produit(produit_id)') } catch {}

  db.run(`
    CREATE TABLE IF NOT EXISTS methodes_paiement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      nom TEXT NOT NULL,
      icone TEXT NOT NULL DEFAULT 'any',
      actif INTEGER NOT NULL DEFAULT 1,
      ordre INTEGER NOT NULL DEFAULT 0
    )
  `)

  // ��� JOURNAL D'AUDIT ����������������������������������������������
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_heure TEXT NOT NULL DEFAULT (datetime('now')),
      user_id INTEGER,
      user_nom TEXT,
      action TEXT NOT NULL,
      entite TEXT NOT NULL,
      entite_id INTEGER,
      details TEXT
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_log(date_heure)')
  db.run('CREATE INDEX IF NOT EXISTS idx_audit_entite ON audit_log(entite)')
}

function migrateSchema() {
  const safeAddCol = (table: string, col: string, def: string) => {
    try { db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`) } catch {}
  }
  safeAddCol('produits', 'date_peremption', 'TEXT')
  safeAddCol('produits', 'lot', 'TEXT')
  // Sprint 4 — Volet commercial
  safeAddCol('clients', 'solde_credit', 'REAL DEFAULT 0')
  safeAddCol('clients', 'points_fidelite', 'INTEGER DEFAULT 0')
  safeAddCol('clients', 'solde_portefeuille', 'REAL DEFAULT 0')
  safeAddCol('clients', 'remise_pct', 'REAL DEFAULT 0')
  safeAddCol('ventes', 'points_gagnes', 'INTEGER DEFAULT 0')
  safeAddCol('ventes', 'points_utilises', 'INTEGER DEFAULT 0')
  safeAddCol('ventes', 'cagnotte_utilisee', 'REAL DEFAULT 0')
  safeAddCol('ventes', 'portefeuille_utilise', 'REAL DEFAULT 0')
  safeAddCol('ventes', 'monnaie_creditee_wallet', 'REAL DEFAULT 0')
  // Volet Avancé — multi-boutiques
  safeAddCol('ventes', 'boutique_id', 'INTEGER DEFAULT 1')
  safeAddCol('produits', 'boutique_id', 'INTEGER DEFAULT 1')
  safeAddCol('vente_lignes', 'details', 'TEXT')
  safeAddCol('vente_lignes', 'nom_libre', 'TEXT')
  // Migration rôle "superviseur" : reconstruit users si le CHECK ne l'autorise pas
  try {
    const sql = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")[0]?.values?.[0]?.[0] as string || ''
    if (!sql.includes('superviseur')) {
      db.run('PRAGMA foreign_keys = OFF')
      db.run('ALTER TABLE users RENAME TO users_old')
      db.run(`CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('caissier','gestionnaire','admin','superviseur')),
        nom TEXT NOT NULL,
        actif INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      )`)
      db.run(`INSERT INTO users (id, username, password_hash, role, nom, actif, created_at)
              SELECT id, username, password_hash, role, nom, actif, created_at FROM users_old`)
      db.run('DROP TABLE users_old')
      db.run('PRAGMA foreign_keys = ON')
    }
  } catch {}
  // Seed catégorie "Articles divers" + produit "Article libre" (vente libre sans code-barres)
  try {
    const catLibre = queryOne('SELECT id FROM categories WHERE nom = ?', ['Articles divers'])
    let catId = catLibre?.id
    if (!catId) {
      runWrite('INSERT INTO categories (nom, couleur, icone) VALUES (?, ?, ?)', ['Articles divers', '#9CA3AF', 'Package'])
      catId = db.exec('SELECT last_insert_rowid() as r')[0]?.values[0]?.[0] as number
    }
    const prodLibre = queryOne('SELECT id FROM produits WHERE nom = ? AND categorie_id = ?', ['Article libre', catId])
    if (!prodLibre) {
      runWrite(
        'INSERT INTO produits (nom, categorie_id, prix_vente, prix_achat, stock_actuel, stock_minimum, unite, actif) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['Article libre', catId, 0, 0, 999999, 0, 'pce', 1]
      )
    }
  } catch {}
  // Seed boutique par défaut
  try {
    const b = queryOne('SELECT id FROM boutiques LIMIT 1', [])
    if (!b) db.run(`INSERT INTO boutiques (id, nom) VALUES (1, 'Boutique principale')`)
  } catch {}
  // Seed entrepôt principal + migration stock existant
  try {
    const e = queryOne('SELECT id FROM entrepots LIMIT 1', [])
    if (!e) {
      db.run(`INSERT INTO entrepots (id, nom, adresse) VALUES (1, 'Entrepôt principal', 'Principal')`)
      // Migrer le stock actuel des produits vers l'entrepôt principal
      db.run(`
        INSERT OR IGNORE INTO stock_par_entrepot (produit_id, entrepot_id, quantite)
        SELECT id, 1, stock_actuel FROM produits WHERE actif = 1
      `)
    }
  } catch {}
  // Sync inter-boutiques
  safeAddCol('produits', 'updated_at', 'TEXT DEFAULT (datetime(\'now\'))')
  safeAddCol('clients', 'updated_at', 'TEXT DEFAULT (datetime(\'now\'))')
  // Sprint 9 — date_naissance clients
  safeAddCol('clients', 'date_naissance', 'TEXT')
  // Sprint — état inventaire : justification des écarts + valeur unitaire au comptage
  safeAddCol('inventaire_lignes', 'justification', 'TEXT')
  safeAddCol('inventaire_lignes', 'prix_vente', 'REAL DEFAULT 0')
  // Sprint 10 — TVA produits
  safeAddCol('produits', 'tva_applicable', 'INTEGER DEFAULT 0')
  // Phase « Commerce paramétrable »
  safeAddCol('produits', 'taux_tva', 'REAL DEFAULT 0')
  // Retours améliorés : échange / remplacement + reliquat
  safeAddCol('retours', 'type', 'TEXT DEFAULT \'remboursement\'')
  safeAddCol('retours', 'montant_echange', 'REAL DEFAULT 0')
  safeAddCol('retours', 'montant_reliquat', 'REAL DEFAULT 0')
  safeAddCol('retour_lignes', 'type', 'TEXT DEFAULT \'retour\'')
  safeAddCol('retour_lignes', 'variante_id', 'INTEGER')
  // Seed référentiel unités
  try {
    const unitesDef: [string, string, number][] = [
      ['kg', 'kg', 1], ['pièce', 'pce', 0], ['litre', 'L', 0],
    ]
    for (const [nom, symbole, pesable] of unitesDef) {
      db.run('INSERT OR IGNORE INTO unites (nom, symbole, pesable) VALUES (?, ?, ?)', [nom, symbole, pesable])
    }
  } catch {}
  // Seed modes de paiement
  try {
    const modesDef: [string, string, string, number][] = [
      ['especes', 'Espèces', '💵', 0],
      ['wave', 'Wave', '📱', 1],
      ['orange_money', 'Orange Money', '📲', 2],
      ['mtn', 'MTN MoMo', '📱', 3],
      ['carte', 'Carte bancaire', '💳', 4],
      ['ardoise', 'Crédit / Ardoise', '🧾', 5],
    ]
    for (const [code, nom, icone, ordre] of modesDef) {
      db.run('INSERT OR IGNORE INTO methodes_paiement (code, nom, icone, ordre) VALUES (?, ?, ?, ?)', [code, nom, icone, ordre])
    }
  } catch {}
  // Seed params finance
  try {
    const pFinance: [string, string][] = [
      ['tva_taux', '18'],
      ['nif_entreprise', ''],
      ['rccm_entreprise', ''],
      ['compte_contribuable', ''],
      ['sync_server_port', '7890'],
      ['sync_actif', '0'],
    ]
    for (const [cle, valeur] of pFinance) {
      db.run('INSERT OR IGNORE INTO parametres (cle, valeur) VALUES (?, ?)', [cle, valeur])
    }
  } catch {}
  // Seed règles alertes par défaut
  try {
    const ar = queryOne('SELECT id FROM alertes_regles LIMIT 1', [])
    if (!ar) {
      db.run(`INSERT INTO alertes_regles (type, actif, params) VALUES ('stock_faible', 1, '{}')`)
      db.run(`INSERT INTO alertes_regles (type, actif, params) VALUES ('ardoise_ancienne', 1, '{"jours":30}')`)
      db.run(`INSERT INTO alertes_regles (type, actif, params) VALUES ('fidelite_palier', 1, '{"points":100}')`)
    }
  } catch {}
  // Déduplication des attributs (taille / couleur / contenance…) créés en double
  // par les applications successives d'un profil (avait une table sans UNIQUE).
  try {
    const dup = queryOne(`SELECT COUNT(*) as c FROM (SELECT nom FROM attributs GROUP BY nom HAVING COUNT(*) > 1)`, [])
    if ((dup?.c ?? 0) > 0) {
      // Une tentative précédente peut avoir laissé une table partielle et des FK désactivées
      db.run('PRAGMA foreign_keys = ON')
      db.run('DROP TABLE IF EXISTS attributs_new')
      db.run('PRAGMA foreign_keys = OFF')
      db.run('BEGIN')
      db.run(`
        CREATE TABLE attributs_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nom TEXT NOT NULL UNIQUE,
          actif INTEGER NOT NULL DEFAULT 1
        )
      `)
      // On conserve l'occurrence la plus ancienne comme référence canonique
      db.run(`
        INSERT INTO attributs_new (id, nom, actif)
        SELECT MIN(a1.id), a1.nom, a1.actif
        FROM attributs a1
        GROUP BY a1.nom
      `)
      db.run(`
        CREATE TEMP TABLE attr_map AS
        SELECT a.id oldId, n.id newId
        FROM attributs a
        JOIN (SELECT nom, MIN(id) minId FROM attributs GROUP BY nom) m ON a.nom = m.nom
        JOIN attributs_new n ON n.nom = m.nom
      `)
      db.run('UPDATE attribut_valeurs SET attribut_id = (SELECT newId FROM attr_map WHERE oldId = attribut_id)')
      db.run('UPDATE attributs_produit SET attribut_id = (SELECT newId FROM attr_map WHERE oldId = attribut_id)')
      db.run('DROP TABLE attributs')
      db.run('ALTER TABLE attributs_new RENAME TO attributs')
      db.run('DROP TABLE attr_map')
      db.run('COMMIT')
      db.run('PRAGMA foreign_keys = ON')
    }
  } catch (e: any) {
    try { db.run('ROLLBACK'); db.run('PRAGMA foreign_keys = ON') } catch {}
    console.error('migrate attrs dedup failed:', e?.message)
  }
}

function seedData() {
  const existingAdmin = queryOne('SELECT id FROM users WHERE username = ?', ['admin'])
  if (!existingAdmin) {
    db.run(`INSERT INTO users (username, password_hash, role, nom) VALUES (?, ?, 'admin', 'Administrateur')`,
      ['admin', hashPassword('admin123')])
    db.run(`INSERT INTO users (username, password_hash, role, nom) VALUES (?, ?, 'caissier', 'Caissier 1')`,
      ['caissier1', hashPassword('caissier123')])
    db.run(`INSERT INTO users (username, password_hash, role, nom) VALUES (?, ?, 'gestionnaire', 'Gestionnaire')`,
      ['gestionnaire', hashPassword('gest123')])
  }

  // Seed code superviseur par défaut (code 1234, associé à admin)
  const existingCode = queryOne('SELECT id FROM codes_superviseur LIMIT 1', [])
  if (!existingCode) {
    const adminUser = queryOne('SELECT id FROM users WHERE username = ?', ['admin'])
    if (adminUser) {
      db.run('INSERT OR IGNORE INTO codes_superviseur (code, user_id) VALUES (?, ?)',
        [hashPassword('1234'), adminUser.id])
    }
  }

  // Le catalogue de départ est désormais fourni par le type de commerce (profil)
  // appliqué lors de la configuration initiale (voir applyProfileCommerce).

  // Paramètres par défaut. On ajoute toujours les clés manquantes (INSERT OR IGNORE) :
  // cela garantit que les bases créées avant l'ajout d'un paramètre reçoivent le défaut
  // sans écraser une éventuelle valeur déjà sauvegardée par l'utilisateur.
  const defaults: [string, string][] = [
    ['nom_entreprise', 'Mon Commerce'],
    ['adresse', ''],
    ['telephone', ''],
    ['email', ''],
    ['receipt_header', 'Bienvenue !'],
    ['receipt_footer', 'Merci de votre visite !'],
    ['tva_taux', '0'],
    ['monnaie', 'FCFA'],
    ['printer_type', 'EPSON'],
    ['printer_interface', 'USB'],
    ['printer_port', 'USB001'],
    ['heure_cloture_auto', '20:00'],
    ['sms_patronne', ''],
    ['sms_provider', ''],
    ['sms_api_key', ''],
    ['sms_from', ''],
    // Email (fond de caisse + point de vente horaire)
    ['smtp_host', ''],
    ['smtp_port', '587'],
    ['smtp_user', ''],
    ['smtp_pass', ''],
    ['smtp_secure', '0'],
    ['smtp_from', ''],
    ['email_fond_caisse', ''],
    ['email_rapports', ''],
    // Envoi automatique
    ['auto_envoi_fond_caisse', '1'],
    ['auto_envoi_horaire', '0'],
    ['auto_envoi_journalier', '0'],
    ['auto_envoi_inventaire', '0'],
    ['auto_envoi_stock', '0'],
    // Verrouillage automatique (minutes d'inactivité, 0 = désactivé)
    ['auto_lock_minutes', '30'],
    // Forfait / abonnement ('' = illimité)
    ['forfait_expiration', ''],
    ['forfait_email_alerte', '0'],
    // Sauvegardes automatiques
    ['backup_auto', '1'],
    ['backup_mensuel', '1'],
    ['backup_interval_h', '24'],
    ['backup_max_count', '30'],
    ['backup_dir', ''],
    // Sauvegarde cloud WebDAV
    ['cloud_backup_actif', '0'],
    ['cloud_backup_url', ''],
    ['cloud_backup_user', ''],
    ['cloud_backup_pass', ''],
    ['cloud_backup_dossier', 'kb-pos'],
    // Auto-sync inter-boutiques (0 = désactivé)
    ['sync_auto_interval_min', '0'],
    // Notifications desktop
    ['notif_vente', '1'],
    ['notif_stock', '1'],
    ['notif_ardoise', '1'],
    ['notif_fidelite', '1'],
    ['notif_rapport', '1'],
    // Exécution planifiée des alertes auto (0 = désactivé, sinon minutes)
    ['alerte_auto_interval_min', '30'],
    // Mode réseau client-serveur : 'none' (par défaut) | 'serveur' | 'client'
    ['reseau_role', 'none'],
    ['reseau_serveur_ip', ''],
    ['reseau_serveur_port', '7890'],
  ]
  for (const [cle, valeur] of defaults) {
    db.run('INSERT OR IGNORE INTO parametres (cle, valeur) VALUES (?, ?)', [cle, valeur])
  }
}

// ─── USERS ────────────────────────────────────────────────────────────────────

export function loginUser(username: string, password: string) {
  const row = queryOne(
    'SELECT id, username, role, nom FROM users WHERE username = ? AND password_hash = ? AND actif = 1',
    [username, hashPassword(password)]
  )
  if (!row) return null
  const user = row as { id: number; username: string; role: string; nom: string }
  // Blocage forfait : seuls les administrateurs ne s'expirent jamais
  if (user.role !== 'admin') {
    const info = getForfaitInfo()
    if (info.expire) {
      return { forfaitExpire: true, expiration: info.expiration }
    }
  }
  return user
}

export function getAllUsers() {
  return queryAll('SELECT id, username, role, nom, actif, created_at FROM users ORDER BY nom')
}

export function createUser(data: { username: string; password: string; role: string; nom: string }) {
  const r = runWrite(
    'INSERT INTO users (username, password_hash, role, nom) VALUES (?, ?, ?, ?)',
    [data.username, hashPassword(data.password), data.role, data.nom]
  )
  logAudit({ action: 'creation', entite: 'utilisateur', details: { username: data.username, role: data.role, nom: data.nom } })
  return r
}

export function updateUser(id: number, data: { username?: string; password?: string; role?: string; nom?: string; actif?: number }) {
  const fields: string[] = []
  const values: any[] = []
  if (data.username !== undefined) { fields.push('username = ?'); values.push(data.username) }
  if (data.password !== undefined) { fields.push('password_hash = ?'); values.push(hashPassword(data.password)) }
  if (data.role !== undefined) { fields.push('role = ?'); values.push(data.role) }
  if (data.nom !== undefined) { fields.push('nom = ?'); values.push(data.nom) }
  if (data.actif !== undefined) { fields.push('actif = ?'); values.push(data.actif) }
  values.push(id)
  const r = runWrite(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values)
  logAudit({ action: 'modification', entite: 'utilisateur', entite_id: id, details: data })
  return r
}

export function deleteUser(id: number) {
  // Le compte administrateur ne doit jamais pouvoir être supprimé
  const target = queryOne('SELECT id, role FROM users WHERE id = ?', [id])
  if (target && target.role === 'admin') {
    throw new Error('Le compte administrateur ne peut pas être supprimé')
  }
  const r = runWrite('DELETE FROM users WHERE id = ?', [id])
  logAudit({ action: 'suppression', entite: 'utilisateur', entite_id: id })
  return r
}

// ─── CATEGORIES ───────────────────────────────────────────────────────────────

export function getAllCategories() {
  return queryAll('SELECT * FROM categories ORDER BY nom')
}

export function createCategorie(data: { nom: string; couleur: string; icone: string }) {
  const r = runWrite('INSERT INTO categories (nom, couleur, icone) VALUES (?, ?, ?)', [data.nom, data.couleur, data.icone])
  logAudit({ action: 'creation', entite: 'categorie', details: { nom: data.nom } })
  return r
}

export function updateCategorie(id: number, data: { nom?: string; couleur?: string; icone?: string }) {
  const fields: string[] = []
  const values: any[] = []
  if (data.nom !== undefined) { fields.push('nom = ?'); values.push(data.nom) }
  if (data.couleur !== undefined) { fields.push('couleur = ?'); values.push(data.couleur) }
  if (data.icone !== undefined) { fields.push('icone = ?'); values.push(data.icone) }
  values.push(id)
  const r = runWrite(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, values)
  logAudit({ action: 'modification', entite: 'categorie', entite_id: id, details: data })
  return r
}

// ─── PRODUITS ─────────────────────────────────────────────────────────────────

export function getAllProduits(categorieId?: number, search?: string) {
  let query = `
    SELECT p.*, c.nom as categorie_nom, c.couleur as categorie_couleur, c.icone as categorie_icone
    FROM produits p
    LEFT JOIN categories c ON p.categorie_id = c.id
    WHERE p.actif = 1
  `
  const params: any[] = []
  if (categorieId) { query += ' AND p.categorie_id = ?'; params.push(categorieId) }
  if (search) { query += ' AND (p.nom LIKE ? OR p.code_barre = ?)'; params.push(`%${search}%`, search) }
  query += ' ORDER BY p.nom'
  return queryAll(query, params)
}

export function getProduitByBarcode(codeBarre: string) {
  return queryOne(`
    SELECT p.*, c.nom as categorie_nom, c.couleur as categorie_couleur
    FROM produits p LEFT JOIN categories c ON p.categorie_id = c.id
    WHERE p.code_barre = ? AND p.actif = 1
  `, [codeBarre])
}

export function createProduit(data: any) {
  const r = runWrite(
    'INSERT INTO produits (nom, categorie_id, prix_vente, prix_achat, unite, stock_actuel, stock_minimum, code_barre, date_peremption, lot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [data.nom, data.categorie_id, data.prix_vente, data.prix_achat, data.unite, data.stock_actuel ?? 0, data.stock_minimum ?? 0, data.code_barre ?? null, data.date_peremption ?? null, data.lot ?? null]
  )
  logAudit({ action: 'creation', entite: 'produit', details: { nom: data.nom, prix_vente: data.prix_vente } })
  return r
}

export function updateProduit(id: number, data: any) {
  const fields: string[] = []
  const values: any[] = []
  const allowed = ['nom', 'categorie_id', 'prix_vente', 'prix_achat', 'unite', 'stock_actuel', 'stock_minimum', 'code_barre', 'image_url', 'actif', 'date_peremption', 'lot', 'tva_applicable']
  for (const key of allowed) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); values.push(data[key]) }
  }
  fields.push(`updated_at = datetime('now')`)
  values.push(id)
  const r = runWrite(`UPDATE produits SET ${fields.join(', ')} WHERE id = ?`, values)
  if (data.prix_vente !== undefined) {
    const prod = queryOne(`SELECT id, prix_vente FROM produits WHERE id=?`, [id])
    if (prod) logSync('produit', id, 'update', { id, prix_vente: prod.prix_vente })
  }
  logAudit({ action: 'modification', entite: 'produit', entite_id: id, details: data })
  return r
}

export function deleteProduit(id: number) {
  const prod = queryOne('SELECT nom FROM produits WHERE id = ?', [id])
  const r = runWrite('UPDATE produits SET actif = 0 WHERE id = ?', [id])
  logAudit({ action: 'suppression', entite: 'produit', entite_id: id, details: { nom: prod?.nom } })
  return r
}

export function getLowStockProduits() {
  return queryAll(`
    SELECT p.*, c.nom as categorie_nom FROM produits p
    LEFT JOIN categories c ON p.categorie_id = c.id
    WHERE p.actif = 1 AND p.stock_actuel <= p.stock_minimum
    ORDER BY (p.stock_actuel - p.stock_minimum)
  `)
}

// ─── MOUVEMENTS STOCK ─────────────────────────────────────────────────────────

export function addMouvement(data: { produit_id: number; type: string; quantite: number; raison?: string; user_id?: number }) {
  const prod = queryOne('SELECT stock_actuel FROM produits WHERE id = ?', [data.produit_id])
  if (!prod) return null
  let newStock = Number(prod.stock_actuel)
  if (data.type === 'entree') newStock += data.quantite
  else if (data.type === 'sortie') newStock -= data.quantite
  else newStock = data.quantite
  db.run('UPDATE produits SET stock_actuel = ? WHERE id = ?', [newStock, data.produit_id])
  const result = runWrite(
    'INSERT INTO mouvements_stock (produit_id, type, quantite, raison, user_id) VALUES (?, ?, ?, ?, ?)',
    [data.produit_id, data.type, data.quantite, data.raison ?? null, data.user_id ?? null]
  )
  return result
}

export function getMouvements(produitId?: number, limit = 100) {
  let query = `
    SELECT ms.*, p.nom as produit_nom, u.nom as user_nom
    FROM mouvements_stock ms
    LEFT JOIN produits p ON ms.produit_id = p.id
    LEFT JOIN users u ON ms.user_id = u.id
  `
  if (produitId) {
    query += ` WHERE ms.produit_id = ? ORDER BY ms.date DESC LIMIT ?`
    return queryAll(query, [produitId, limit])
  }
  query += ' ORDER BY ms.date DESC LIMIT ?'
  return queryAll(query, [limit])
}

// ─── VENTES ───────────────────────────────────────────────────────────────────

function generateTicketNumber(): string {
  const now = new Date()
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
  const count = queryOne('SELECT COUNT(*) as c FROM ventes', [])?.c ?? 0
  return `TK-${datePart}-${String(Number(count) + 1).padStart(4, '0')}`
}

export function createVente(data: {
  total: number
  remise: number
  montant_paye: number
  monnaie_rendue: number
  mode_paiement: string
  caissier_id: number
  client_id?: number
  cagnotte_utilisee?: number
  portefeuille_utilise?: number
  monnaie_creditee_wallet?: number
  boutique_id?: number
  paiements?: { mode: string; montant: number }[]
  lignes: { produit_id: number; quantite: number; prix_unitaire: number; total_ligne: number; details?: string; variante_id?: number; nom_libre?: string }[]
}) {
  const ticket = generateTicketNumber()
  db.run(
    `INSERT INTO ventes (numero_ticket, total, remise, montant_paye, monnaie_rendue, mode_paiement,
      caissier_id, client_id, cagnotte_utilisee, portefeuille_utilise, monnaie_creditee_wallet, boutique_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ticket, data.total, data.remise, data.montant_paye, data.monnaie_rendue, data.mode_paiement,
     data.caissier_id, data.client_id ?? null,
     data.cagnotte_utilisee ?? 0, data.portefeuille_utilise ?? 0, data.monnaie_creditee_wallet ?? 0,
     data.boutique_id ?? 1]
  )
  const venteId = db.exec('SELECT last_insert_rowid() as r')[0]?.values[0]?.[0] as number

  if (data.paiements && data.paiements.length > 0) {
    for (const p of data.paiements) {
      if (p.montant <= 0) continue
      db.run('INSERT INTO vente_paiements (vente_id, mode, montant) VALUES (?, ?, ?)', [venteId, p.mode, p.montant])
    }
  }

  const produitsVariants = new Set<number>()
  for (const ligne of data.lignes) {
    db.run(
      'INSERT INTO vente_lignes (vente_id, produit_id, quantite, prix_unitaire, total_ligne, details, nom_libre) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [venteId, ligne.produit_id, ligne.quantite, ligne.prix_unitaire, ligne.total_ligne, ligne.details ?? null, ligne.nom_libre ?? null]
    )
    if (ligne.variante_id) {
      // Article à variantes : débiter la combinaison précise, pas le stock produit
      db.run('UPDATE variantes_produit SET stock = MAX(0, stock - ?) WHERE id = ?', [ligne.quantite, ligne.variante_id])
      produitsVariants.add(ligne.produit_id)
    } else if (ligne.nom_libre || ligne.produit_id === 99999998) {
      // Vente libre : article hors catalogue, aucun stock à décrémenter
    } else {
      db.run('UPDATE produits SET stock_actuel = stock_actuel - ? WHERE id = ?', [ligne.quantite, ligne.produit_id])
    }
    db.run(
      'INSERT INTO mouvements_stock (produit_id, type, quantite, raison, user_id) VALUES (?, ?, ?, ?, ?)',
      [ligne.produit_id, 'sortie', ligne.quantite, `Vente ${ticket}`, data.caissier_id]
    )
  }
  // Resynchroniser le stock des produits à variantes vendus
  for (const pid of produitsVariants) resyncStockProduit(pid)

  // Mettre à jour la session caisse ouverte du caissier
  const session = queryOne(
    `SELECT id FROM sessions_caisse WHERE user_id = ? AND date = date('now') AND statut = 'ouvert'`,
    [data.caissier_id]
  )
  if (session) {
    db.run(
      `UPDATE sessions_caisse SET total_ventes = total_ventes + ?, nb_ventes = nb_ventes + 1 WHERE id = ?`,
      [data.total, session.id]
    )
  }

  // Log sync
  const boutiqueId = data.boutique_id ?? 1
  logSync('vente', venteId, 'create', {
    numero_ticket: ticket, date: new Date().toISOString(), total: data.total,
    remise: data.remise, montant_paye: data.montant_paye, monnaie_rendue: data.monnaie_rendue,
    mode_paiement: data.mode_paiement, statut: 'completed', boutique_id: boutiqueId
  }, boutiqueId)

  saveDb()
  return { venteId, ticket }
}

// ─── MODE CLIENT-SERVEUR (stock partagé temps réel) ───────────────────────────
// Côté serveur central : décrémente le stock de façon atomique pour les caisses
// clientes. Réutilise la même logique que createVente (variantes, mouvements, résync).
export function checkRemoteStocks(items: { produit_id?: number; variante_id?: number; code_barre?: string }[]) {
  const out: { produit_id: number | null; variante_id?: number; code_barre?: string; disponible: boolean; dispo: number }[] = []
  for (const it of items) {
    let dispo = 0
    let pid: number | null = it.produit_id ?? null
    if (it.variante_id) {
      const v = queryOne('SELECT stock, produit_id FROM variantes_produit WHERE id = ?', [it.variante_id])
      dispo = Number(v?.stock ?? 0); pid = v?.produit_id ?? pid
    } else if (it.code_barre) {
      const p = queryOne('SELECT id, stock_actuel FROM produits WHERE code_barre = ?', [it.code_barre])
      pid = p?.id ?? null; dispo = Number(p?.stock_actuel ?? 0)
    } else if (it.produit_id) {
      const p = queryOne('SELECT stock_actuel FROM produits WHERE id = ?', [it.produit_id])
      dispo = Number(p?.stock_actuel ?? 0)
    }
    out.push({ produit_id: pid, variante_id: it.variante_id, code_barre: it.code_barre, disponible: dispo > 0, dispo })
  }
  return out
}

export function applyRemoteVenteStock(items: { produit_id?: number; quantite: number; variante_id?: number; code_barre?: string; nom_libre?: string }[], caissierId: number, ticketLabel: string) {
  const produitsVariants = new Set<number>()
  let ok = true
  const insuffisants: { produit_id?: number | null; code_barre?: string; nom_libre?: string }[] = []
  for (const it of items) {
    // Vente libre : aucun stock à décrémenter
    if (it.nom_libre || it.produit_id === 99999998) continue
    // Résolution de l'id serveur par code-barres (référence partagée client/serveur)
    let pid: number | null = it.produit_id ?? null
    if (!pid && it.code_barre) {
      const p = queryOne('SELECT id FROM produits WHERE code_barre = ?', [it.code_barre])
      pid = p?.id ?? null
    }
    if (!pid) continue
    const id = pid as number
    if (it.variante_id) {
      const v = queryOne('SELECT stock FROM variantes_produit WHERE id = ?', [it.variante_id])
      if (Number(v?.stock ?? 0) < Number(it.quantite)) { ok = false; insuffisants.push({ produit_id: id }); continue }
      db.run('UPDATE variantes_produit SET stock = MAX(0, stock - ?) WHERE id = ?', [it.quantite, it.variante_id])
      produitsVariants.add(id)
    } else {
      const p = queryOne('SELECT stock_actuel FROM produits WHERE id = ?', [id])
      if (Number(p?.stock_actuel ?? 0) < Number(it.quantite)) { ok = false; insuffisants.push({ produit_id: id, nom_libre: it.nom_libre }); continue }
      db.run('UPDATE produits SET stock_actuel = MAX(0, stock_actuel - ?) WHERE id = ?', [it.quantite, id])
    }
    db.run('INSERT INTO mouvements_stock (produit_id, type, quantite, raison, user_id) VALUES (?, ?, ?, ?, ?)',
      [id, 'sortie', it.quantite, `Vente ${ticketLabel}`, caissierId])
  }
  for (const pid2 of produitsVariants) resyncStockProduit(pid2)
  saveDb()
  return { ok, insuffisants }
}

// Récupère l'état temps réel (catalogue + stock) exposé aux caisses clientes.
export function getRemoteCatalog() {
  const produits = queryAll(`
    SELECT p.id, p.nom, p.categorie_id, c.nom as categorie_nom, p.prix_vente, p.prix_achat,
           p.unite, p.stock_actuel, p.stock_minimum, p.code_barre, p.lot, p.date_peremption
    FROM produits p LEFT JOIN categories c ON p.categorie_id = c.id
    WHERE p.actif = 1 ORDER BY p.nom
  `, [])
  const variantes = queryAll(`SELECT v.id, v.produit_id, p.code_barre, v.combinaison, v.stock, v.prix_vente, v.prix_achat, v.sku
    FROM variantes_produit v LEFT JOIN produits p ON p.id = v.produit_id`, [])
  return { produits, variantes }
}

export function getRemoteClients() {
  return queryAll(`SELECT id, nom, telephone, email, points_fidelite, solde_credit FROM clients WHERE actif = 1 ORDER BY nom`, [])
}

export function getCodeBarreById(id: number): string | null {
  const p = queryOne('SELECT code_barre FROM produits WHERE id = ?', [id])
  return p?.code_barre ?? null
}

// Côté caisse cliente : réplique le catalogue du serveur dans la base locale
// (miroir par code-barres) pour afficher le même stock/catalogue que le serveur.
export function syncRemoteCatalog(produits: any[], variantes: any[]) {
  let ajoutes = 0, majes = 0
  for (const p of produits ?? []) {
    if (!p.code_barre) continue
    const local = queryOne('SELECT id, updated_at FROM produits WHERE code_barre = ?', [p.code_barre])
    if (local) {
      db.run(`UPDATE produits SET nom=?, prix_achat=?, stock_actuel=?, stock_minimum=?, categorie_id=?, unite=?, lot=?, date_peremption=? WHERE id=?`,
        [p.nom, p.prix_achat ?? 0, p.stock_actuel ?? 0, p.stock_minimum ?? 0, p.categorie_id ?? null, p.unite ?? 'kg', p.lot ?? null, p.date_peremption ?? null, local.id])
      majes++
    } else {
      db.run(`INSERT OR IGNORE INTO produits (code_barre, nom, prix_vente, prix_achat, unite, stock_actuel, stock_minimum, categorie_id, lot, date_peremption)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [p.code_barre, p.nom, p.prix_vente ?? 0, p.prix_achat ?? 0, p.unite ?? 'kg', p.stock_actuel ?? 0, p.stock_minimum ?? 0, p.categorie_id ?? null, p.lot ?? null, p.date_peremption ?? null])
      ajoutes++
    }
  }
  // Miroir simplifié des variantes (par combinaison JSON) pour rester cohérent
  for (const v of variantes ?? []) {
    const prod = queryOne('SELECT id FROM produits WHERE code_barre = ?', [v.code_barre])
    if (!prod) continue
    const existing = queryOne('SELECT id FROM variantes_produit WHERE produit_id = ? AND combinaison = ?', [prod.id, v.combinaison])
    if (existing) {
      db.run('UPDATE variantes_produit SET stock=?, prix_vente=? WHERE id=?', [v.stock ?? 0, v.prix_vente ?? null, existing.id])
    } else {
      db.run('INSERT INTO variantes_produit (produit_id, combinaison, stock, prix_vente, prix_achat, sku) VALUES (?,?,?,?,?,?)',
        [prod.id, v.combinaison, v.stock ?? 0, v.prix_vente ?? null, v.prix_achat ?? null, v.sku ?? null])
    }
  }
  saveDb()
  return { ajoutes, majes }
}

// ─── RÉPLICATION DE CONFIGURATION (serveur → client) ───────────────────────
// Le serveur expose toute sa configuration via /api/rt/config, et les clients
// l'appliquent pour hériter des types de commerce, paramètres, attributs, etc.

export function getRemoteConfig() {
  const params = getAllParametres()
  const profils = getProfilsAppliques()
  const attributs = listAttributsActifs()
  const unites = queryAll('SELECT nom, symbole, pesable FROM unites ORDER BY id')
  const categories = queryAll('SELECT id, nom, couleur, icone FROM categories ORDER BY id')
  const methodesPaiement = queryAll('SELECT code, nom, actif FROM methodes_paiement ORDER BY id')
  return {
    profils_appliques: profils,
    parametres: {
      profil_commerce: params.profil_commerce ?? '',
      monnaie: params.monnaie ?? 'FCFA',
      tva_taux: params.tva_taux ?? '0',
      unite_defaut: params.unite_defaut ?? 'pièce',
      modes_paiement_actifs: params.modes_paiement_actifs ?? '[]',
      modules_actifs: params.modules_actifs ?? '{}',
      nom_entreprise: params.nom_entreprise ?? 'Mon Commerce',
      adresse: params.adresse ?? '',
      telephone: params.telephone ?? '',
      email: params.email ?? '',
      receipt_header: params.receipt_header ?? 'Bienvenue !',
      receipt_footer: params.receipt_footer ?? 'Merci de votre visite !',
    },
    attributs,
    unites,
    categories,
    methodes_paiement: methodesPaiement,
  }
}

export function applyRemoteConfig(config: ReturnType<typeof getRemoteConfig>) {
  if (!config) return
  // Paramètres métier
  for (const [cle, valeur] of Object.entries(config.parametres)) {
    if (valeur !== undefined && valeur !== null && valeur !== '') setParametre(cle, String(valeur))
  }
  // Profils appliqués
  if (config.profils_appliques?.length) {
    setParametre('profils_appliques', JSON.stringify(config.profils_appliques))
  }
  // Catégories (créer celles qui manquent)
  for (const cat of config.categories ?? []) {
    const existing = queryOne('SELECT id FROM categories WHERE nom = ?', [cat.nom])
    if (!existing) db.run('INSERT OR IGNORE INTO categories (nom, couleur, icone) VALUES (?, ?, ?)', [cat.nom, cat.couleur, cat.icone])
  }
  // Attributs + valeurs
  for (const attr of config.attributs ?? []) {
    db.run('INSERT OR IGNORE INTO attributs (nom, actif) VALUES (?, 1)', [attr.nom])
    const row = queryOne('SELECT id FROM attributs WHERE nom = ?', [attr.nom])
    if (!row) continue
    for (const val of attr.valeurs ?? []) {
      db.run('INSERT OR IGNORE INTO attribut_valeurs (attribut_id, label, ordre) VALUES (?, ?, ?)', [row.id, val.label, val.ordre])
    }
  }
  // Unités
  for (const u of config.unites ?? []) {
    db.run('INSERT OR IGNORE INTO unites (nom, symbole, pesable) VALUES (?, ?, ?)', [u.nom, u.symbole, u.pesable ? 1 : 0])
  }
  // Modes de paiement
  for (const m of config.methodes_paiement ?? []) {
    db.run('UPDATE methodes_paiement SET actif = ? WHERE code = ?', [m.actif ? 1 : 0, m.code])
  }
  saveDb()
}

export function getVentes(dateDebut?: string, dateFin?: string, limit = 200) {
  let query = `
    SELECT v.*, u.nom as caissier_nom, c.nom as client_nom
    FROM ventes v
    LEFT JOIN users u ON v.caissier_id = u.id
    LEFT JOIN clients c ON v.client_id = c.id
    WHERE v.statut = 'completed'
  `
  const params: any[] = []
  if (dateDebut) { query += ' AND date(v.date) >= ?'; params.push(dateDebut) }
  if (dateFin) { query += ' AND date(v.date) <= ?'; params.push(dateFin) }
  query += ' ORDER BY v.date DESC LIMIT ?'
  params.push(limit)
  return queryAll(query, params)
}

export function getVenteById(id: number) {
  const vente = queryOne(`
    SELECT v.*, u.nom as caissier_nom, c.nom as client_nom
    FROM ventes v LEFT JOIN users u ON v.caissier_id = u.id LEFT JOIN clients c ON v.client_id = c.id
    WHERE v.id = ?
  `, [id])
  if (!vente) return null
  vente.lignes = queryAll(
    "SELECT vl.*, COALESCE(vl.nom_libre, p.nom) as nom, COALESCE(vl.nom_libre, p.nom) as produit_nom, p.unite FROM vente_lignes vl LEFT JOIN produits p ON vl.produit_id = p.id WHERE vl.vente_id = ?",
    [id]
  )
  vente.paiements = queryAll('SELECT mode, montant FROM vente_paiements WHERE vente_id = ? ORDER BY id', [id])
  return vente
}

export function getVenteStats(dateDebut: string, dateFin: string) {
  const totalVentes = queryOne(
    `SELECT COUNT(*) as nb, COALESCE(SUM(total),0) as ca, COALESCE(SUM(remise),0) as remises
     FROM ventes WHERE statut='completed' AND date(date) BETWEEN ? AND ?`,
    [dateDebut, dateFin]
  )

  const parModePaiement = queryAll(`
    SELECT mode as mode_paiement, COUNT(*) as nb, SUM(montant) as total
    FROM (
      SELECT vp.mode as mode, vp.montant as montant
      FROM vente_paiements vp JOIN ventes v ON vp.vente_id = v.id
      WHERE v.statut='completed' AND date(v.date) BETWEEN ? AND ?
      UNION ALL
      SELECT v.mode_paiement as mode, v.total as montant
      FROM ventes v
      WHERE v.statut='completed' AND date(v.date) BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM vente_paiements vp WHERE vp.vente_id = v.id)
    )
    GROUP BY mode`,
    [dateDebut, dateFin, dateDebut, dateFin]
  )

  const topProduits = queryAll(
    `SELECT COALESCE(vl.nom_libre, p.nom) as nom, SUM(vl.quantite) as qte_vendue, SUM(vl.total_ligne) as ca,
            COALESCE(SUM(vl.quantite * COALESCE(p.prix_achat, 0)), 0) as cout,
            SUM(vl.total_ligne) - COALESCE(SUM(vl.quantite * COALESCE(p.prix_achat, 0)), 0) as marge
     FROM vente_lignes vl
     JOIN ventes v ON vl.vente_id = v.id
     LEFT JOIN produits p ON vl.produit_id = p.id
     WHERE v.statut='completed' AND date(v.date) BETWEEN ? AND ?
     GROUP BY COALESCE(vl.nom_libre, p.nom) ORDER BY ca DESC LIMIT 10`,
    [dateDebut, dateFin]
  )

  // Marge brute totale sur la période (CA - coût des ventes)
  const marge = queryOne(
    `SELECT
       COALESCE(SUM(vl.total_ligne), 0) as ca,
       COALESCE(SUM(vl.quantite * COALESCE(p.prix_achat, 0)), 0) as cout
     FROM vente_lignes vl
     JOIN ventes v ON vl.vente_id = v.id
     LEFT JOIN produits p ON vl.produit_id = p.id
     WHERE v.statut='completed' AND date(v.date) BETWEEN ? AND ?`,
    [dateDebut, dateFin]
  )

  const parJour = queryAll(
    `SELECT date(date) as jour, COUNT(*) as nb, COALESCE(SUM(total),0) as ca
     FROM ventes WHERE statut='completed' AND date(date) BETWEEN ? AND ?
     GROUP BY date(date) ORDER BY jour`,
    [dateDebut, dateFin]
  )

  return { totalVentes, parModePaiement, topProduits, parJour, marge }
}

// Ventes de la dernière heure (pour l'envoi horaire "point de vente")
export function getVentesDerniereHeure() {
  const pg = queryAll(`
    SELECT mode as mode_paiement, COUNT(*) as nb, COALESCE(SUM(montant),0) as total
    FROM (
      SELECT vp.mode as mode, vp.montant as montant
      FROM vente_paiements vp JOIN ventes v ON vp.vente_id = v.id
      WHERE v.statut='completed' AND datetime(v.date) >= datetime('now','-1 hour')
      UNION ALL
      SELECT v.mode_paiement as mode, v.total as montant
      FROM ventes v
      WHERE v.statut='completed' AND datetime(v.date) >= datetime('now','-1 hour')
        AND NOT EXISTS (SELECT 1 FROM vente_paiements vp WHERE vp.vente_id = v.id)
    )
    GROUP BY mode ORDER BY total DESC`,
    []
  )
  const total = queryOne(`
    SELECT COUNT(*) as nb, COALESCE(SUM(montant),0) as ca
    FROM (
      SELECT vp.montant as montant FROM vente_paiements vp JOIN ventes v ON vp.vente_id = v.id
        WHERE v.statut='completed' AND datetime(v.date) >= datetime('now','-1 hour')
      UNION ALL
      SELECT v.total as montant FROM ventes v
        WHERE v.statut='completed' AND datetime(v.date) >= datetime('now','-1 hour')
          AND NOT EXISTS (SELECT 1 FROM vente_paiements vp WHERE vp.vente_id = v.id)
    )`, [])
  const depuis = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  return { total, parMode: pg, depuis }
}

// ─── CLIENTS ──────────────────────────────────────────────────────────────────

export function getAllClients() {
  return queryAll('SELECT * FROM clients WHERE actif = 1 ORDER BY nom')
}

export function createClient(data: { nom: string; telephone?: string; email?: string; forfait_mensuel?: number; date_expiration?: string }) {
  return runWrite(
    'INSERT INTO clients (nom, telephone, email, forfait_mensuel, date_expiration) VALUES (?, ?, ?, ?, ?)',
    [data.nom, data.telephone ?? null, data.email ?? null, data.forfait_mensuel ?? 0, data.date_expiration ?? null]
  )
}

export function updateClient(id: number, data: any) {
  const fields: string[] = []
  const values: any[] = []
  const allowed = ['nom', 'telephone', 'email', 'forfait_mensuel', 'date_expiration', 'actif', 'remise_pct', 'date_naissance']
  for (const key of allowed) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); values.push(data[key]) }
  }
  values.push(id)
  return runWrite(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`, values)
}

export function deleteClient(id: number) {
  return runWrite('UPDATE clients SET actif = 0 WHERE id = ?', [id])
}

export function getClientVentes(clientId: number) {
  return queryAll(`
    SELECT v.*, u.nom as caissier_nom FROM ventes v
    LEFT JOIN users u ON v.caissier_id = u.id
    WHERE v.client_id = ? AND v.statut = 'completed'
    ORDER BY v.date DESC LIMIT 50
  `, [clientId])
}

// ─── PRIX PAR CLIENT (tarifs spécifiques grossiste/détaillant) ─────────────────

export function getPrixClients(clientId: number) {
  return queryAll(
    `SELECT id, produit_id, prix FROM prix_clients WHERE client_id = ?`,
    [clientId]
  )
}

export function getPrixClient(clientId: number, produitId: number): number | null {
  const row = queryOne(
    `SELECT prix FROM prix_clients WHERE client_id = ? AND produit_id = ?`,
    [clientId, produitId]
  )
  return row ? Number(row.prix) : null
}

export function setPrixClient(clientId: number, produitId: number, prix: number) {
  if (prix <= 0) {
    return runWrite(
      `DELETE FROM prix_clients WHERE client_id = ? AND produit_id = ?`,
      [clientId, produitId]
    )
  }
  const existing = queryOne(
    `SELECT id FROM prix_clients WHERE client_id = ? AND produit_id = ?`,
    [clientId, produitId]
  )
  if (existing) {
    return runWrite(
      `UPDATE prix_clients SET prix = ? WHERE id = ?`,
      [prix, existing.id]
    )
  }
  return runWrite(
    `INSERT INTO prix_clients (client_id, produit_id, prix) VALUES (?, ?, ?)`,
    [clientId, produitId, prix]
  )
}

export function setPrixClientsBulk(clientId: number, items: { produit_id: number; prix: number }[]) {
  db.run('BEGIN')
  try {
    for (const it of items) {
      setPrixClient(clientId, it.produit_id, it.prix)
    }
    db.run('COMMIT')
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
  saveDb()
}

// ─── PARAMÈTRES ───────────────────────────────────────────────────────────────

export function getAllParametres(): Record<string, string> {
  const rows = queryAll('SELECT cle, valeur FROM parametres')
  const result: Record<string, string> = {}
  for (const row of rows) result[row.cle] = row.valeur
  return result
}

export function setParametre(cle: string, valeur: string) {
  return runWrite('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)', [cle, valeur])
}

export function setParametres(params: Record<string, string>) {
  for (const [cle, valeur] of Object.entries(params)) {
    db.run('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)', [cle, valeur])
  }
  saveDb()
}

export function getParametre(cle: string): string | null {
  const row = queryOne('SELECT valeur FROM parametres WHERE cle = ?', [cle])
  return row?.valeur ?? null
}

export interface ForfaitInfo {
  expiration: string
  joursRestants: number
  expire: boolean
  procheExpiration: boolean
  moisRestants: number
}

export function getForfaitInfo(): ForfaitInfo {
  const p = getAllParametres()
  const exp = p.forfait_expiration || ''
  if (!exp) return { expiration: '', joursRestants: Infinity, expire: false, procheExpiration: false, moisRestants: 0 }
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const expDate = new Date(exp + 'T00:00:00').getTime()
  const days = Math.floor((expDate - today) / 86400000)
  const expire = days < 0
  const procheExpiration = !expire && days <= 5
  return { expiration: exp, joursRestants: days, expire, procheExpiration, moisRestants: Math.max(0, Math.floor(days / 30)) }
}

export interface EmailConfigData {
  smtp_host: string
  smtp_port: string
  smtp_user: string
  smtp_pass: string
  smtp_secure: string
  smtp_from: string
  email_fond_caisse: string
  email_rapports: string
  auto_envoi_fond_caisse: string
  auto_envoi_horaire: string
  auto_lock_minutes: string
}

export function getEmailConfig(): EmailConfigData {
  const p = getAllParametres()
  return {
    smtp_host: p.smtp_host || '',
    smtp_port: p.smtp_port || '587',
    smtp_user: p.smtp_user || '',
    smtp_pass: p.smtp_pass || '',
    smtp_secure: p.smtp_secure || '0',
    smtp_from: p.smtp_from || '',
    email_fond_caisse: p.email_fond_caisse || '',
    email_rapports: p.email_rapports || '',
    auto_envoi_fond_caisse: p.auto_envoi_fond_caisse || '1',
    auto_envoi_horaire: p.auto_envoi_horaire || '0',
    auto_lock_minutes: p.auto_lock_minutes || '30',
  }
}

// ─── TYPE DE COMMERCE (profil paramétrable) ───────────────────────────────────

function profilCle(): string {
  const row = queryOne('SELECT valeur FROM parametres WHERE cle = ?', ['profil_commerce'])
  return row?.valeur ?? ''
}

export function getProfileCommerce(): { id: string; label: string; applique_le?: string } | null {
  const raw = profilCle()
  if (!raw) return null
  try {
    const stored = JSON.parse(raw)
    const prof = PROFILS.find(p => p.id === stored.id)
    return {
      id: stored.id,
      label: prof?.label ?? stored.label ?? stored.id,
      applique_le: stored.applique_le,
    }
  } catch {
    return null
  }
}

export function listProfils() {
  return PROFILS.map(p => ({
    id: p.id,
    label: p.label,
    description: p.description,
    icone: p.icone,
    couleur: p.couleur,
  }))
}

function seedAttributs(attributs: { nom: string; valeurs: string[] }[]) {
  for (const a of attributs) {
    db.run('INSERT OR IGNORE INTO attributs (nom) VALUES (?)', [a.nom])
    const row = queryOne('SELECT id FROM attributs WHERE nom = ?', [a.nom])
    if (!row) continue
    a.valeurs.forEach((label, i) => {
      db.run('INSERT OR IGNORE INTO attribut_valeurs (attribut_id, label, ordre) VALUES (?, ?, ?)', [row.id, label, i])
    })
  }
}

// Attributs + valeurs (tailles, couleurs, contenances…) — moteur des variantes légères
export function listAttributs(): { id: number; nom: string; actif: number; valeurs: { id: number; label: string; ordre: number }[] }[] {
  const attrs = queryAll('SELECT * FROM attributs ORDER BY id')
  const valRows = queryAll('SELECT * FROM attribut_valeurs ORDER BY attribut_id, ordre')
  const byAttr: Record<number, { id: number; label: string; ordre: number }[]> = {}
  for (const v of valRows) {
    ;(byAttr[v.attribut_id] = byAttr[v.attribut_id] || []).push({ id: v.id, label: v.label, ordre: v.ordre })
  }
  return attrs.map(a => ({ id: a.id, nom: a.nom, actif: a.actif, valeurs: byAttr[a.id] || [] }))
}

export function listAttributsActifs(): { id: number; nom: string; actif: number; valeurs: { id: number; label: string; ordre: number }[] }[] {
  return listAttributs().filter(a => a.actif === 1)
}

export function getAttributsProduit(produitId: number): { attribut_id: number; attribut_nom: string; valeur_id: number | null; valeur_label: string | null }[] {
  return queryAll(
    `SELECT ap.attribut_id, a.nom as attribut_nom, ap.valeur_id, av.label as valeur_label
     FROM attributs_produit ap
     JOIN attributs a ON a.id = ap.attribut_id
     LEFT JOIN attribut_valeurs av ON av.id = ap.valeur_id
     WHERE ap.produit_id = ? ORDER BY a.id`,
    [produitId]
  )
}

export function setAttributsProduit(produitId: number, attributions: { attribut_id: number; valeur_id: number | null }[]) {
  db.run('DELETE FROM attributs_produit WHERE produit_id = ?', [produitId])
  // Une attribution sans valeur fixe (valeur_id NULL) signifie « critère de variante »
  // (taille / couleur) décliné en combinaisons de stock par produit.
  for (const att of attributions) {
    db.run('INSERT INTO attributs_produit (produit_id, attribut_id, valeur_id) VALUES (?, ?, ?)', [produitId, att.attribut_id, att.valeur_id ?? null])
  }
  saveDb()
}

export function getAttributionsTousProduits(): { produit_id: number; attribut_id: number; attribut_nom: string; valeur_id: number | null; valeur_label: string | null }[] {
  return queryAll(
    `SELECT ap.produit_id, ap.attribut_id, a.nom as attribut_nom, ap.valeur_id, av.label as valeur_label
     FROM attributs_produit ap
     JOIN attributs a ON a.id = ap.attribut_id
     LEFT JOIN attribut_valeurs av ON av.id = ap.valeur_id
     ORDER BY ap.produit_id, a.id`
  )
}

// ─── VARIANTES : stock par combinaison (taille × couleur) ─────────────────────

function resolveCombinaisonLabels(combinaison: Record<number, number>, attrsMap: Record<number, { nom: string }>): Record<string, string> {
  const labels: Record<string, string> = {}
  const valRows = queryAll('SELECT id, attribut_id, label FROM attribut_valeurs')
  const valById: Record<number, { attribut_id: number; label: string }> = {}
  for (const v of valRows) valById[v.id] = { attribut_id: v.attribut_id, label: v.label }
  for (const [attrIdS, valIdS] of Object.entries(combinaison)) {
    const attrId = Number(attrIdS); const valId = Number(valIdS)
    const attr = attrsMap[attrId]; const val = valById[valId]
    if (attr && val) labels[attr.nom] = val.label
  }
  return labels
}

export function getVariantesProduit(produitId: number): {
  id: number; produit_id: number; combinaison: Record<number, number>; combinaison_labels: Record<string, string>;
  stock: number; prix_vente: number | null; prix_achat: number | null; sku: string | null
}[] {
  const attrsMap: Record<number, { nom: string }> = {}
  for (const a of queryAll('SELECT id, nom FROM attributs')) attrsMap[a.id] = { nom: a.nom }
  const rows = queryAll('SELECT * FROM variantes_produit WHERE produit_id = ? ORDER BY id', [produitId])
  return rows.map(r => {
    let combinaison: Record<number, number> = {}
    try { combinaison = JSON.parse(r.combinaison || '{}') } catch {}
    return {
      id: r.id, produit_id: r.produit_id,
      combinaison,
      combinaison_labels: resolveCombinaisonLabels(combinaison, attrsMap),
      stock: r.stock, prix_vente: r.prix_vente ?? null, prix_achat: r.prix_achat ?? null, sku: r.sku ?? null
    }
  })
}

export function setVariantesProduit(
  produitId: number,
  combos: { combinaison: Record<number, number>; stock: number; prix_vente?: number | null; prix_achat?: number | null; sku?: string | null }[]
) {
  db.run('DELETE FROM variantes_produit WHERE produit_id = ?', [produitId])
  for (const c of combos) {
    const combinaison = c.combinaison || {}
    if (Object.keys(combinaison).length === 0) continue
    db.run(
      'INSERT INTO variantes_produit (produit_id, combinaison, stock, prix_vente, prix_achat, sku) VALUES (?, ?, ?, ?, ?, ?)',
      [produitId, JSON.stringify(combinaison), c.stock || 0, c.prix_vente ?? null, c.prix_achat ?? null, c.sku ?? null]
    )
  }
  resyncStockProduit(produitId)
  saveDb()
}

function resyncStockProduit(produitId: number) {
  // Le stock d'un article à variantes = somme des stocks de ses combinaisons
  db.run(
    `UPDATE produits SET stock_actuel = COALESCE((SELECT SUM(stock) FROM variantes_produit WHERE produit_id = ?), 0) WHERE id = ?`,
    [produitId, produitId]
  )
}

function attrIdByName(): Record<string, number> {
  const m: Record<string, number> = {}
  for (const a of queryAll('SELECT id, nom FROM attributs')) m[a.nom] = a.id
  return m
}

function valIdsMap(): Record<string, number> {
  const m: Record<string, number> = {}
  for (const v of queryAll('SELECT id, attribut_id, label FROM attribut_valeurs')) {
    m[`${v.attribut_id}::${v.label}`] = v.id
  }
  return m
}

// Insère les combinaisons de stock (taille × couleur…) d'un produit à variantes
function seedVariantesProduit(produitId: number, variants?: ProProduitDef['variantes']) {
  const combos = variants ?? []
  if (!combos.length) return
  const attrById = attrIdByName()
  const valById = valIdsMap()
  const inserts: { combinaison: Record<number, number>; stock: number; prix_vente?: number | null; prix_achat?: number | null; sku?: string | null }[] = []
  for (const c of combos) {
    const ids: Record<number, number> = {}
    for (const [attrNom, valeurLabel] of Object.entries(c.combinaison ?? {})) {
      const attrId = attrById[attrNom]
      if (attrId == null) continue
      const valId = valById[`${attrId}::${valeurLabel}`]
      if (valId != null) ids[attrId] = valId
    }
    if (Object.keys(ids).length === 0) continue
    inserts.push({ combinaison: ids, stock: c.stock ?? 0, prix_vente: c.prix_vente ?? null, prix_achat: c.prix_achat ?? null, sku: c.sku ?? null })
  }
  if (inserts.length) {
    for (const ins of inserts) {
      db.run(
        'INSERT INTO variantes_produit (produit_id, combinaison, stock, prix_vente, prix_achat, sku) VALUES (?, ?, ?, ?, ?, ?)',
        [produitId, JSON.stringify(ins.combinaison), ins.stock, ins.prix_vente ?? null, ins.prix_achat ?? null, ins.sku ?? null]
      )
    }
    resyncStockProduit(produitId)
  }
}

// Remplit les combinaisons de stock manquantes d'un catalogue déjà présent en base
// (ex. catalogue seedé avant la création de variantes_produit). Idempotent.
function reconcilierVariantesProfile(profile: typeof PROFILS[number]): number {
  const seedVariants = (profile.produits ?? []).filter(p => (p.variantes?.length ?? 0) > 0)
  if (!seedVariants.length) return 0
  const existing = queryAll('SELECT id, nom, code_barre, categorie_id FROM produits') as { id: number; nom: string; code_barre: string | null; categorie_id: number }[]
  const catNoms: Record<number, string> = {}
  for (const c of queryAll('SELECT id, nom FROM categories')) catNoms[c.id] = c.nom
  let seeded = 0
  for (const p of seedVariants) {
    const target = existing.find(e =>
      (p.code_barre && e.code_barre && e.code_barre === p.code_barre) ||
      (!p.code_barre && e.nom === p.nom && (p.categorie ? catNoms[e.categorie_id] === p.categorie : true))
    )
    if (!target) continue
    const hasVariantes = queryOne('SELECT 1 as x FROM variantes_produit WHERE produit_id = ? LIMIT 1', [target.id])
    if (hasVariantes) continue
    seedVariantesProduit(target.id, p.variantes)
    seeded++
  }
  if (seeded > 0) saveDb()
  return seeded
}

function seedCatalogue(profil: typeof PROFILS[number]) {
  const cats = PROFILS.find(p => p.id === profil.id)?.categories ?? []
  const catIds: Record<string, number> = {}
  for (const c of cats) {
    const r = runWrite('INSERT INTO categories (nom, couleur, icone) VALUES (?, ?, ?)', [c.nom, c.couleur, c.icone])
    catIds[c.nom] = r.lastInsertRowid
  }
  const prods = PROFILS.find(p => p.id === profil.id)?.produits ?? []
  // Attributs du profil (tailles, couleurs…) à lier à chaque produit du catalogue initial
  const attrsIds = (profil.attributs ?? []).map(a => {
    const row = queryOne('SELECT id FROM attributs WHERE nom = ?', [a.nom])
    return row?.id
  }).filter((x): x is number => x != null)
  for (const p of prods) {
    const catId = catIds[p.categorie]
    if (!catId) continue
    db.run(
      'INSERT INTO produits (nom, categorie_id, prix_vente, prix_achat, unite, stock_actuel, stock_minimum, code_barre, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [p.nom, catId, p.prix_vente, p.prix_achat, p.unite, p.stock_actuel, p.stock_minimum, p.code_barre ?? null, p.image_url]
    )
    const produitId = db.exec('SELECT last_insert_rowid() as r')[0]?.values[0]?.[0] as number
    if (attrsIds.length) {
      for (const attrId of attrsIds) {
        db.run('INSERT OR IGNORE INTO attributs_produit (produit_id, attribut_id, valeur_id) VALUES (?, ?, NULL)', [produitId, attrId])
      }
    }
    seedVariantesProduit(produitId, p.variantes)
  }
}

export function applyProfileCommerce(id: string, opts?: { remplacerCatalogue?: boolean }): { id: string; label: string; applique_le?: string } {
  const prof = PROFILS.find(p => p.id === id)
  if (!prof) throw new Error('Profil de commerce inconnu : ' + id)

  const applique_le = new Date().toISOString()
  setParametre('profil_commerce', JSON.stringify({ id: prof.id, label: prof.label, applique_le }))

  // Écrasement des paramètres métier pilotés par le profil (au moment de l'application)
  setParametre('monnaie', prof.devise)
  setParametre('tva_taux', String(prof.tva_defaut))
  setParametre('unite_defaut', prof.unite_defaut)
  setParametre('modes_paiement_actifs', JSON.stringify(prof.mode_paiements))
  setParametre('modules_actifs', JSON.stringify(prof.modules))

  // Modes de paiement : activer les codes du profil, désactiver les autres
  try {
    const tous = queryAll('SELECT code FROM methodes_paiement')
    for (const m of tous) {
      const actif = prof.mode_paiements.includes(m.code) ? 1 : 0
      db.run('UPDATE methodes_paiement SET actif = ? WHERE code = ?', [actif, m.code])
    }
  } catch {}

  // Référentiel unités du profil
  const unitesDef: [string, string, number][] = prof.unites.map(u => [u.nom, u.symbole, u.pesable ? 1 : 0])
  for (const [nom, symbole, pesable] of unitesDef) {
    db.run('INSERT OR IGNORE INTO unites (nom, symbole, pesable) VALUES (?, ?, ?)', [nom, symbole, pesable])
  }

  // Attributs (tailles / couleurs / contenances…) — utiles aux variantes
  if (prof.attributs?.length) seedAttributs(prof.attributs)

  // Catalogue : chaque type de commerce impose SA typologie.
  //   - base vierge → on seede le catalogue du profil ;
  //   - catalogue existant qui ne correspond PAS à la typologie (aucune catégorie
  //     du profil présente) → on le remplace automatiquement pour que l'utilisateur
  //     ne retrouve jamais les articles d'un autre commerce (ex. volaille chez un vendeur de vêtements).
  //   - remplacement explicite demandé → on vide puis on reseede.
  const profCats = (prof.categories ?? []).map(c => c.nom)
  const existingCats = (queryAll('SELECT nom FROM categories') as { nom: string }[]).map(r => r.nom)
  const noCatalogue = existingCats.length === 0
  const typologieEtrangere = noCatalogue
    ? false
    : profCats.length > 0 && !profCats.some(n => existingCats.includes(n))
  const doitRemplacer = Boolean(opts?.remplacerCatalogue) || typologieEtrangere

  if (doitRemplacer && existingCats.length > 0) {
    db.run('PRAGMA foreign_keys = OFF')
    db.run('DELETE FROM variantes_produit')
    db.run('DELETE FROM attributs_produit')
    db.run('DELETE FROM produits')
    db.run('DELETE FROM categories')
    db.run('PRAGMA foreign_keys = ON')
  }
  const catCount = queryOne('SELECT COUNT(*) as c FROM categories', [])?.c ?? 0
  if (catCount === 0 && prof.categories?.length) seedCatalogue(prof)

  // Complète les combinaisons de stock manquantes sur un catalogue déjà en place (idempotent)
  try { reconcilierVariantesProfile(prof) } catch (e: any) { console.error('reconcilier variantes failed:', e?.message) }

  saveDb()
  return { id: prof.id, label: prof.label, applique_le }
}

export function getModulesActifs(): Record<string, boolean> | null {
  const row = queryOne('SELECT valeur FROM parametres WHERE cle = ?', ['modules_actifs'])
  if (!row?.valeur) return null
  try {
    const m = JSON.parse(row.valeur)
    return typeof m === 'object' && m !== null ? m : null
  } catch {
    return null
  }
}

// ─── MULTI-PROFILS (types de commerce multiples par magasin) ───────────────
// Stocke la liste des types de commerce appliqués dans `profils_appliques` (JSON array).
// Le premier profil de la liste est le "principal" qui pilote monnaie/TVA/unite_defaut.
// Les profils suivants étendent le catalogue (catégories + produits + attributs) et
// fusionnent les modules/modes de paiement (union).

export interface ProfilApplique { id: string; label: string; applique_le?: string }

export function getProfilsAppliques(): ProfilApplique[] {
  const raw = getParametre('profils_appliques')
  if (!raw) {
    const old = getProfileCommerce()
    if (old) {
      const list: ProfilApplique[] = [{ id: old.id, label: old.label, applique_le: old.applique_le }]
      setParametre('profils_appliques', JSON.stringify(list))
      return list
    }
    return []
  }
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function seedCatalogueAdditif(profilId: string) {
  const prof = PROFILS.find(p => p.id === profilId)
  if (!prof) return
  const catIds: Record<string, number> = {}
  for (const c of prof.categories ?? []) {
    const existing = queryOne('SELECT id FROM categories WHERE nom = ?', [c.nom])
    if (existing) { catIds[c.nom] = existing.id }
    else {
      const r = runWrite('INSERT INTO categories (nom, couleur, icone) VALUES (?, ?, ?)', [c.nom, c.couleur, c.icone])
      catIds[c.nom] = r.lastInsertRowid
    }
  }
  if (prof.attributs?.length) seedAttributs(prof.attributs)
  const attrsIds = (prof.attributs ?? []).map(a => {
    const row = queryOne('SELECT id FROM attributs WHERE nom = ?', [a.nom])
    return row?.id
  }).filter((x): x is number => x != null)
  const existingBarcodes = (queryAll('SELECT code_barre FROM produits WHERE code_barre IS NOT NULL') as { code_barre: string }[]).map(r => r.code_barre)
  for (const p of prof.produits ?? []) {
    if (p.code_barre && existingBarcodes.includes(p.code_barre)) continue
    const catId = catIds[p.categorie]
    if (!catId) continue
    db.run(
      'INSERT INTO produits (nom, categorie_id, prix_vente, prix_achat, unite, stock_actuel, stock_minimum, code_barre, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [p.nom, catId, p.prix_vente, p.prix_achat, p.unite, p.stock_actuel, p.stock_minimum, p.code_barre ?? null, p.image_url]
    )
    const produitId = db.exec('SELECT last_insert_rowid() as r')[0]?.values[0]?.[0] as number
    if (attrsIds.length) {
      for (const attrId of attrsIds) {
        db.run('INSERT OR IGNORE INTO attributs_produit (produit_id, attribut_id, valeur_id) VALUES (?, ?, NULL)', [produitId, attrId])
      }
    }
    seedVariantesProduit(produitId, p.variantes)
  }
}

export function addProfileType(id: string): ProfilApplique {
  const prof = PROFILS.find(p => p.id === id)
  if (!prof) throw new Error('Profil de commerce inconnu : ' + id)
  const list = getProfilsAppliques()
  if (list.some(p => p.id === id)) {
    const existing = list.find(p => p.id === id)!
    return existing
  }
  const applique_le = new Date().toISOString()
  const entry: ProfilApplique = { id: prof.id, label: prof.label, applique_le }
  list.push(entry)
  setParametre('profils_appliques', JSON.stringify(list))

  if (list.length === 1) {
    setParametre('profil_commerce', JSON.stringify({ id: prof.id, label: prof.label, applique_le }))
    setParametre('monnaie', prof.devise)
    setParametre('tva_taux', String(prof.tva_defaut))
    setParametre('unite_defaut', prof.unite_defaut)
    setParametre('modes_paiement_actifs', JSON.stringify(prof.mode_paiements))
    setParametre('modules_actifs', JSON.stringify(prof.modules))
    try {
      const allModes = queryAll('SELECT code FROM methodes_paiement')
      for (const m of allModes) db.run('UPDATE methodes_paiement SET actif = ? WHERE code = ?', [prof.mode_paiements.includes(m.code) ? 1 : 0, m.code])
    } catch {}
    const unitesDef: [string, string, number][] = prof.unites.map(u => [u.nom, u.symbole, u.pesable ? 1 : 0])
    for (const [nom, symbole, pesable] of unitesDef) db.run('INSERT OR IGNORE INTO unites (nom, symbole, pesable) VALUES (?, ?, ?)', [nom, symbole, pesable])
    if (prof.attributs?.length) seedAttributs(prof.attributs)
    const profCats = (prof.categories ?? []).map(c => c.nom)
    const existingCats = (queryAll('SELECT nom FROM categories') as { nom: string }[]).map(r => r.nom)
    const noCatalogue = existingCats.length === 0
    const typologieEtrangere = !noCatalogue && profCats.length > 0 && !profCats.some(n => existingCats.includes(n))
    if (typologieEtrangere && existingCats.length > 0) {
      db.run('PRAGMA foreign_keys = OFF')
      db.run('DELETE FROM variantes_produit')
      db.run('DELETE FROM attributs_produit')
      db.run('DELETE FROM produits')
      db.run('DELETE FROM categories')
      db.run('PRAGMA foreign_keys = ON')
    }
    const catCount = queryOne('SELECT COUNT(*) as c FROM categories', [])?.c ?? 0
    if (catCount === 0 && prof.categories?.length) seedCatalogue(prof)
    try { reconcilierVariantesProfile(prof) } catch {}
  } else {
    // Profil additionnel : fusion des modules/modes + catalogue additif
    const existingModules = JSON.parse(getParametre('modules_actifs') || '{}') as Record<string, boolean>
    const merged: Record<string, boolean> = {}
    for (const mod of Object.keys(prof.modules)) merged[mod] = existingModules[mod] || prof.modules[mod as keyof typeof prof.modules]
    setParametre('modules_actifs', JSON.stringify(merged))

    const existingModes: string[] = JSON.parse(getParametre('modes_paiement_actifs') || '[]')
    const mergedModes = [...new Set([...existingModes, ...prof.mode_paiements])]
    setParametre('modes_paiement_actifs', JSON.stringify(mergedModes))

    try {
      const allModes = queryAll('SELECT code FROM methodes_paiement')
      for (const m of allModes) db.run('UPDATE methodes_paiement SET actif = ? WHERE code = ?', [mergedModes.includes(m.code) ? 1 : 0, m.code])
    } catch {}

    const unitesDef: [string, string, number][] = prof.unites.map(u => [u.nom, u.symbole, u.pesable ? 1 : 0])
    for (const [nom, symbole, pesable] of unitesDef) db.run('INSERT OR IGNORE INTO unites (nom, symbole, pesable) VALUES (?, ?, ?)', [nom, symbole, pesable])
    if (prof.attributs?.length) seedAttributs(prof.attributs)
    seedCatalogueAdditif(id)
    try { reconcilierVariantesProfile(prof) } catch {}
  }
  saveDb()
  return entry
}

export function removeProfileType(id: string): boolean {
  const list = getProfilsAppliques()
  const idx = list.findIndex(p => p.id === id)
  if (idx < 0) return false
  list.splice(idx, 1)
  setParametre('profils_appliques', JSON.stringify(list))
  if (idx === 0 && list.length > 0) {
    const next = list[0]
    const prof = PROFILS.find(p => p.id === next.id)
    if (prof) {
      setParametre('profil_commerce', JSON.stringify({ id: prof.id, label: prof.label, applique_le: next.applique_le }))
      setParametre('monnaie', prof.devise)
      setParametre('tva_taux', String(prof.tva_defaut))
      setParametre('unite_defaut', prof.unite_defaut)
      setParametre('modes_paiement_actifs', JSON.stringify(prof.mode_paiements))
      setParametre('modules_actifs', JSON.stringify(prof.modules))
    }
  }
  saveDb()
  return true
}

// ─── ALERTES ──────────────────────────────────────────────────────────────────

export function getAlertes(lu?: boolean) {
  let query = 'SELECT a.*, p.nom as produit_nom FROM alertes a LEFT JOIN produits p ON a.produit_id = p.id'
  if (lu !== undefined) query += ` WHERE a.lu = ${lu ? 1 : 0}`
  return queryAll(query + ' ORDER BY a.date DESC')
}

export function marquerAlerteLue(id: number) {
  return runWrite('UPDATE alertes SET lu = 1 WHERE id = ?', [id])
}

// ─── SESSIONS CAISSE ──────────────────────────────────────────────────────────

export function ouvrirSessionCaisse(userId: number, fondCaisse: number) {
  // Vérifie si une session est déjà ouverte aujourd'hui pour cet utilisateur
  const existing = queryOne(
    `SELECT id FROM sessions_caisse WHERE user_id = ? AND date = date('now') AND statut = 'ouvert'`,
    [userId]
  )
  if (existing) return existing
  return runWrite(
    `INSERT INTO sessions_caisse (user_id, fond_caisse, date, heure_ouverture, statut)
     VALUES (?, ?, date('now'), time('now'), 'ouvert')`,
    [userId, fondCaisse]
  )
}

export function getSessionCaisseOuverte(userId: number) {
  return queryOne(
    `SELECT * FROM sessions_caisse WHERE user_id = ? AND date = date('now') AND statut = 'ouvert'`,
    [userId]
  )
}

export function cloturerSessionCaisse(sessionId: number, montantFinalEspeces: number) {
  return runWrite(
    `UPDATE sessions_caisse SET statut = 'cloture', heure_cloture = time('now'), montant_final_especes = ? WHERE id = ?`,
    [montantFinalEspeces, sessionId]
  )
}

export function getSessionsCaisse(dateDebut?: string, dateFin?: string) {
  let query = `
    SELECT s.*, u.nom as user_nom
    FROM sessions_caisse s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE 1=1
  `
  const params: any[] = []
  if (dateDebut) { query += ' AND s.date >= ?'; params.push(dateDebut) }
  if (dateFin) { query += ' AND s.date <= ?'; params.push(dateFin) }
  query += ' ORDER BY s.date DESC, s.heure_ouverture DESC'
  return queryAll(query, params)
}

export function nbSessionsOuvertes(): number {
  return Number(queryOne(
    `SELECT COUNT(*) as c FROM sessions_caisse WHERE statut = 'ouvert'`,
    []
  )?.c ?? 0)
}

// ─── JOURNAL DES ENVOIS EMAIL ─────────────────────────────────────────────────

export function logEmail(entry: { type?: string; sujet: string; destinataire: string; statut: 'envoye' | 'echec'; erreur?: string }) {
  return runWrite(
    `INSERT INTO emails_journal (type, sujet, destinataire, statut, erreur) VALUES (?, ?, ?, ?, ?)`,
    [entry.type ?? 'general', entry.sujet, entry.destinataire, entry.statut, entry.erreur ?? null]
  )
}

export function getEmailsJournal(limit = 50) {
  return queryAll(
    `SELECT * FROM emails_journal ORDER BY date_envoi DESC LIMIT ?`,
    [limit]
  )
}

export function getProduitsStockFaible() {
  return queryAll(`
    SELECT id, nom, stock_actuel, stock_minimum, unite FROM produits
    WHERE actif = 1 AND stock_actuel <= stock_minimum AND stock_minimum > 0
    ORDER BY (stock_actuel - stock_minimum) ASC
  `, [])
}

// ─── TIROIR LOG ───────────────────────────────────────────────────────────────

export function logTiroir(data: { type: 'vente' | 'ouverture_simple'; vente_id?: number; user_id: number; session_id?: number; motif?: string }) {
  return runWrite(
    `INSERT INTO tiroir_log (type, vente_id, user_id, session_id, motif) VALUES (?, ?, ?, ?, ?)`,
    [data.type, data.vente_id ?? null, data.user_id, data.session_id ?? null, data.motif ?? null]
  )
}

export function getTiroirLog(dateDebut?: string, dateFin?: string) {
  let query = `
    SELECT t.*, u.nom as user_nom, v.numero_ticket
    FROM tiroir_log t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN ventes v ON t.vente_id = v.id
    WHERE 1=1
  `
  const params: any[] = []
  if (dateDebut) { query += ' AND date(t.date_heure) >= ?'; params.push(dateDebut) }
  if (dateFin) { query += ' AND date(t.date_heure) <= ?'; params.push(dateFin) }
  query += ' ORDER BY t.date_heure DESC LIMIT 500'
  return queryAll(query, params)
}

// ─── MOUVEMENTS DE CAISSE (versements / retraits) ─────────────────────────────

export function createMouvementCaisse(data: { session_id?: number; type: 'versement' | 'retrait'; montant: number; motif?: string; user_id: number }) {
  return runWrite(
    `INSERT INTO mouvements_caisse (session_id, type, montant, motif, user_id) VALUES (?, ?, ?, ?, ?)`,
    [data.session_id ?? null, data.type, data.montant, data.motif ?? null, data.user_id]
  )
}

export function getMouvementsCaisse(dateDebut?: string, dateFin?: string) {
  let query = `
    SELECT m.*, u.nom as user_nom, s.user_id as session_user_id
    FROM mouvements_caisse m
    LEFT JOIN users u ON m.user_id = u.id
    LEFT JOIN sessions_caisse s ON m.session_id = s.id
    WHERE 1=1
  `
  const params: any[] = []
  if (dateDebut) { query += ' AND date(m.date_heure) >= ?'; params.push(dateDebut) }
  if (dateFin) { query += ' AND date(m.date_heure) <= ?'; params.push(dateFin) }
  query += ' ORDER BY m.date_heure DESC LIMIT 500'
  return queryAll(query, params)
}

export function getMouvementsCaisseParSession(sessionId: number) {
  return queryAll(
    `SELECT m.*, u.nom as user_nom, s.user_id as session_user_id
     FROM mouvements_caisse m
     LEFT JOIN users u ON m.user_id = u.id
     LEFT JOIN sessions_caisse s ON m.session_id = s.id
     WHERE m.session_id = ?
     ORDER BY m.date_heure DESC`,
    [sessionId]
  )
}

// ─── CHARGES ──────────────────────────────────────────────────────────────────

export function getAllCharges(dateDebut?: string, dateFin?: string) {
  let query = `
    SELECT c.*, u.nom as user_nom
    FROM charges c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE 1=1
  `
  const params: any[] = []
  if (dateDebut) { query += ' AND c.date >= ?'; params.push(dateDebut) }
  if (dateFin) { query += ' AND c.date <= ?'; params.push(dateFin) }
  query += ' ORDER BY c.date DESC, c.created_at DESC'
  return queryAll(query, params)
}

export function createCharge(data: { libelle: string; categorie: string; montant: number; mode_paiement: string; user_id: number; note?: string; date?: string }) {
  return runWrite(
    `INSERT INTO charges (libelle, categorie, montant, mode_paiement, user_id, note, date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.libelle, data.categorie, data.montant, data.mode_paiement, data.user_id, data.note ?? null, data.date ?? new Date().toISOString().slice(0, 10)]
  )
}

export function updateCharge(id: number, data: any) {
  const fields: string[] = []
  const values: any[] = []
  const allowed = ['libelle', 'categorie', 'montant', 'mode_paiement', 'note', 'date']
  for (const key of allowed) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); values.push(data[key]) }
  }
  if (fields.length === 0) return { lastInsertRowid: 0, changes: 0 }
  values.push(id)
  return runWrite(`UPDATE charges SET ${fields.join(', ')} WHERE id = ?`, values)
}

export function deleteCharge(id: number) {
  return runWrite('DELETE FROM charges WHERE id = ?', [id])
}

export function getChargesStats(dateDebut: string, dateFin: string) {
  const total = queryOne(
    `SELECT COALESCE(SUM(montant), 0) as total, COUNT(*) as nb FROM charges WHERE date BETWEEN ? AND ?`,
    [dateDebut, dateFin]
  )
  const parCategorie = queryAll(
    `SELECT categorie, COALESCE(SUM(montant), 0) as total, COUNT(*) as nb
     FROM charges WHERE date BETWEEN ? AND ?
     GROUP BY categorie ORDER BY total DESC`,
    [dateDebut, dateFin]
  )
  const parMode = queryAll(
    `SELECT mode_paiement, COALESCE(SUM(montant), 0) as total, COUNT(*) as nb
     FROM charges WHERE date BETWEEN ? AND ?
     GROUP BY mode_paiement ORDER BY total DESC`,
    [dateDebut, dateFin]
  )
  return { total, parCategorie, parMode }
}

// ─── CODES SUPERVISEUR ────────────────────────────────────────────────────────

export function verifieCodeSuperviseur(code: string): boolean {
  const hashed = hashPassword(code)
  const found = queryOne('SELECT id FROM codes_superviseur WHERE code = ? AND actif = 1', [hashed])
  return found !== null
}

export function getCodesSuperviseur() {
  return queryAll(`
    SELECT cs.id, cs.code, cs.user_id, cs.actif, cs.created_at, u.nom as user_nom
    FROM codes_superviseur cs
    LEFT JOIN users u ON cs.user_id = u.id
    ORDER BY cs.created_at DESC
  `)
}

export function createCodeSuperviseur(code: string, userId: number) {
  return runWrite(
    'INSERT OR IGNORE INTO codes_superviseur (code, user_id) VALUES (?, ?)',
    [hashPassword(code), userId]
  )
}

export function updateCodeSuperviseur(id: number, data: any) {
  const fields: string[] = []
  const values: any[] = []
  if (data.code !== undefined) { fields.push('code = ?'); values.push(hashPassword(data.code)) }
  if (data.user_id !== undefined) { fields.push('user_id = ?'); values.push(data.user_id) }
  if (data.actif !== undefined) { fields.push('actif = ?'); values.push(data.actif) }
  if (fields.length === 0) return { lastInsertRowid: 0, changes: 0 }
  values.push(id)
  return runWrite(`UPDATE codes_superviseur SET ${fields.join(', ')} WHERE id = ?`, values)
}

// ─── CONNEXIONS LOG ───────────────────────────────────────────────────────────

export function logConnexion(data: { user_id: number; type: 'connexion' | 'deconnexion' | 'cloture_session'; session_id?: number; note?: string }) {
  return runWrite(
    `INSERT INTO connexions_log (user_id, type, session_id, note) VALUES (?, ?, ?, ?)`,
    [data.user_id, data.type, data.session_id ?? null, data.note ?? null]
  )
}

export function getConnexionsLog(dateDebut?: string, dateFin?: string) {
  let query = `
    SELECT cl.*, u.nom as user_nom, u.role as user_role, s.fond_caisse, s.statut as session_statut
    FROM connexions_log cl
    LEFT JOIN users u ON cl.user_id = u.id
    LEFT JOIN sessions_caisse s ON cl.session_id = s.id
    WHERE 1=1
  `
  const params: any[] = []
  if (dateDebut) { query += ' AND date(cl.date_heure) >= ?'; params.push(dateDebut) }
  if (dateFin) { query += ' AND date(cl.date_heure) <= ?'; params.push(dateFin) }
  query += ' ORDER BY cl.date_heure DESC LIMIT 1000'
  return queryAll(query, params)
}

// ─── ÉTATS COMPLETS (pour la page États) ──────────────────────────────────────

export function getEtatComplet(dateDebut: string, dateFin: string) {
  // Résumé global
  const resume = queryOne(`
    SELECT
      COUNT(*) as nb_ventes,
      COALESCE(SUM(total), 0) as ca_total,
      COALESCE(SUM(remise), 0) as remises_total,
      COALESCE(AVG(total), 0) as panier_moyen,
      MIN(total) as vente_min,
      MAX(total) as vente_max
    FROM ventes WHERE statut = 'completed' AND date(date) BETWEEN ? AND ?
  `, [dateDebut, dateFin])

  // Ventes par mode de paiement
  const parModePaiement = queryAll(`
    SELECT mode as mode_paiement, COUNT(*) as nb, COALESCE(SUM(montant), 0) as total, COALESCE(AVG(montant), 0) as moyenne
    FROM (
      SELECT vp.mode as mode, vp.montant as montant
      FROM vente_paiements vp JOIN ventes v ON vp.vente_id = v.id
      WHERE v.statut = 'completed' AND date(v.date) BETWEEN ? AND ?
      UNION ALL
      SELECT v.mode_paiement as mode, v.total as montant
      FROM ventes v
      WHERE v.statut = 'completed' AND date(v.date) BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM vente_paiements vp WHERE vp.vente_id = v.id)
    )
    GROUP BY mode ORDER BY total DESC
  `, [dateDebut, dateFin, dateDebut, dateFin])

  // Ventes par article (quantités + CA + marge)
  const parArticle = queryAll(`
    SELECT
      COALESCE(vl.nom_libre, p.nom) as produit_nom,
      p.unite,
      p.prix_achat,
      c.nom as categorie_nom,
      c.couleur as categorie_couleur,
      SUM(vl.quantite) as qte_vendue,
      COUNT(DISTINCT vl.vente_id) as nb_transactions,
      COALESCE(SUM(vl.total_ligne), 0) as ca,
      COALESCE(AVG(vl.prix_unitaire), 0) as prix_moyen,
      COALESCE(SUM(vl.quantite * p.prix_achat), 0) as cout_achat,
      COALESCE(SUM(vl.total_ligne) - SUM(vl.quantite * p.prix_achat), 0) as marge_brute
    FROM vente_lignes vl
    JOIN ventes v ON vl.vente_id = v.id
    LEFT JOIN produits p ON vl.produit_id = p.id
    LEFT JOIN categories c ON p.categorie_id = c.id
    WHERE v.statut = 'completed' AND date(v.date) BETWEEN ? AND ?
    GROUP BY COALESCE(vl.nom_libre, p.nom)
    ORDER BY ca DESC
  `, [dateDebut, dateFin])

  // Ventes par catégorie
  const parCategorie = queryAll(`
    SELECT
      COALESCE(c.nom, 'Ventes libres') as categorie_nom,
      COALESCE(c.icone, 'Package') as icone,
      COALESCE(c.couleur, '#9CA3AF') as couleur,
      COUNT(DISTINCT vl.vente_id) as nb_transactions,
      SUM(vl.quantite) as qte_vendue,
      COALESCE(SUM(vl.total_ligne), 0) as ca
    FROM vente_lignes vl
    JOIN ventes v ON vl.vente_id = v.id
    LEFT JOIN produits p ON vl.produit_id = p.id
    LEFT JOIN categories c ON p.categorie_id = c.id
    WHERE v.statut = 'completed' AND date(v.date) BETWEEN ? AND ?
    GROUP BY COALESCE(c.id, 0)
    ORDER BY ca DESC
  `, [dateDebut, dateFin])

  // Détail de toutes les ventes
  const ventes = queryAll(`
    SELECT v.*, u.nom as caissier_nom, cl.nom as client_nom
    FROM ventes v
    LEFT JOIN users u ON v.caissier_id = u.id
    LEFT JOIN clients cl ON v.client_id = cl.id
    WHERE v.statut = 'completed' AND date(v.date) BETWEEN ? AND ?
    ORDER BY v.date DESC
  `, [dateDebut, dateFin])

  // Sessions caisse
  const sessions = queryAll(`
    SELECT s.*, u.nom as user_nom
    FROM sessions_caisse s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE s.date BETWEEN ? AND ?
    ORDER BY s.date DESC, s.heure_ouverture DESC
  `, [dateDebut, dateFin])

  // Journal connexions
  const connexions = queryAll(`
    SELECT cl.*, u.nom as user_nom, u.role as user_role
    FROM connexions_log cl
    LEFT JOIN users u ON cl.user_id = u.id
    WHERE date(cl.date_heure) BETWEEN ? AND ?
    ORDER BY cl.date_heure DESC
  `, [dateDebut, dateFin])

  // Tiroir log
  const tiroir = queryAll(`
    SELECT t.*, u.nom as user_nom, v.numero_ticket
    FROM tiroir_log t
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN ventes v ON t.vente_id = v.id
    WHERE date(t.date_heure) BETWEEN ? AND ?
    ORDER BY t.date_heure DESC
  `, [dateDebut, dateFin])

  // Charges
  const charges = queryAll(`
    SELECT c.*, u.nom as user_nom
    FROM charges c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.date BETWEEN ? AND ?
    ORDER BY c.date DESC
  `, [dateDebut, dateFin])

  // Ventes annulées
  const annulations = queryAll(`
    SELECT v.*, u.nom as caissier_nom
    FROM ventes v
    LEFT JOIN users u ON v.caissier_id = u.id
    WHERE v.statut IN ('annule','rembourse') AND date(v.date) BETWEEN ? AND ?
    ORDER BY v.date DESC
  `, [dateDebut, dateFin])

  // Totaux marge calculés à partir des lignes
  const cout_achats_total = parArticle.reduce((s: number, a: any) => s + Number(a.cout_achat), 0)
  const marge_brute_total = Number(resume?.ca_total ?? 0) - cout_achats_total
  const taux_marge_global = Number(resume?.ca_total ?? 0) > 0
    ? (marge_brute_total / Number(resume.ca_total)) * 100
    : 0
  const total_charges = queryOne(`SELECT COALESCE(SUM(montant),0) as total FROM charges WHERE date BETWEEN ? AND ?`, [dateDebut, dateFin])
  const charges_total = Number(total_charges?.total ?? 0)
  const resultat_net = marge_brute_total - charges_total

  const marges = { cout_achats_total, marge_brute_total, taux_marge_global, charges_total, resultat_net }

  return { resume, marges, parModePaiement, parArticle, parCategorie, ventes, sessions, connexions, tiroir, charges, annulations }
}

// ─── STATS DU JOUR ────────────────────────────────────────────────────────────

export function getStatsDuJour(): { ca: number; nb_ventes: number; par_mode: any[]; fond_caisse: number } {
  const today = new Date().toISOString().slice(0, 10)

  const totaux = queryOne(
    `SELECT COALESCE(SUM(total), 0) as ca, COUNT(*) as nb_ventes
     FROM ventes WHERE statut = 'completed' AND date(date) = ?`,
    [today]
  )

  const parMode = queryAll(`
    SELECT mode as mode_paiement, SUM(montant) as total, COUNT(*) as nb
    FROM (
      SELECT vp.mode as mode, vp.montant as montant
      FROM vente_paiements vp JOIN ventes v ON vp.vente_id = v.id
      WHERE v.statut = 'completed' AND date(v.date) = ?
      UNION ALL
      SELECT v.mode_paiement as mode, v.total as montant
      FROM ventes v
      WHERE v.statut = 'completed' AND date(v.date) = ?
        AND NOT EXISTS (SELECT 1 FROM vente_paiements vp WHERE vp.vente_id = v.id)
    )
    GROUP BY mode`,
    [today, today]
  )

  // Fond de la dernière session ouverte du jour
  const session = queryOne(
    `SELECT fond_caisse FROM sessions_caisse WHERE date = ? AND statut = 'ouvert' ORDER BY id DESC LIMIT 1`,
    [today]
  )

  return {
    ca: Number(totaux?.ca ?? 0),
    nb_ventes: Number(totaux?.nb_ventes ?? 0),
    par_mode: parMode,
    fond_caisse: Number(session?.fond_caisse ?? 0)
  }
}

// ─── PROMOTIONS ───────────────────────────────────────────────────────────────

export function getAllPromotions() {
  return queryAll(`
    SELECT pr.*, p.nom as produit_nom, c.nom as categorie_nom
    FROM promotions pr
    LEFT JOIN produits p ON pr.produit_id = p.id
    LEFT JOIN categories c ON pr.categorie_id = c.id
    ORDER BY pr.created_at DESC
  `)
}

export function createPromotion(data: {
  nom: string; type: string; valeur: number; quantite_min?: number
  produit_id?: number | null; categorie_id?: number | null
  date_debut?: string | null; date_fin?: string | null; actif?: number
}) {
  return runWrite(
    `INSERT INTO promotions (nom, type, valeur, quantite_min, produit_id, categorie_id, date_debut, date_fin, actif)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.nom, data.type, data.valeur, data.quantite_min ?? 1,
     data.produit_id ?? null, data.categorie_id ?? null,
     data.date_debut ?? null, data.date_fin ?? null, data.actif ?? 1]
  )
}

export function updatePromotion(id: number, data: any) {
  const fields: string[] = []
  const values: any[] = []
  const allowed = ['nom', 'type', 'valeur', 'quantite_min', 'produit_id', 'categorie_id', 'date_debut', 'date_fin', 'actif']
  for (const key of allowed) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); values.push(data[key]) }
  }
  if (fields.length === 0) return { lastInsertRowid: 0, changes: 0 }
  values.push(id)
  return runWrite(`UPDATE promotions SET ${fields.join(', ')} WHERE id = ?`, values)
}

export function deletePromotion(id: number) {
  return runWrite('DELETE FROM promotions WHERE id = ?', [id])
}

export function getPromosPourProduit(produitId: number, categorieId: number | null, quantite: number, date: string) {
  // Promos actives pour ce produit (directes) ou sa catégorie
  const promos = queryAll(`
    SELECT * FROM promotions
    WHERE actif = 1
      AND quantite_min <= ?
      AND (date_debut IS NULL OR date_debut <= ?)
      AND (date_fin IS NULL OR date_fin >= ?)
      AND (produit_id = ? OR (produit_id IS NULL AND categorie_id = ?) OR (produit_id IS NULL AND categorie_id IS NULL))
    ORDER BY produit_id DESC, valeur DESC
  `, [quantite, date, date, produitId, categorieId])
  return promos
}

export function calculerPrixPromo(prixVente: number, promo: any): number {
  switch (promo.type) {
    case 'pourcentage':
      return Math.round(prixVente * (1 - Number(promo.valeur) / 100))
    case 'montant_fixe':
      return Math.max(0, Math.round(prixVente - Number(promo.valeur)))
    case 'prix_special':
      return Math.round(Number(promo.valeur))
    default:
      return prixVente
  }
}

// ─── BACKUP ───────────────────────────────────────────────────────────────────

let backupDir: string | null = null

export function setBackupDir(dir: string) {
  backupDir = dir
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function getBackupDir(): string {
  if (backupDir) return backupDir
  const defaultDir = path.join(app.getPath('userData'), 'backups')
  if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { recursive: true })
  return defaultDir
}

export function createBackup(label?: string): { success: boolean; filename?: string; error?: string } {
  try {
    const dir = getBackupDir()
    const now = new Date()
    // Format lisible : backup_2026-07-02.db (un seul par jour, écrase si déjà fait)
    const dateStr = now.toISOString().slice(0, 10) // YYYY-MM-DD
    const timeStr = now.toTimeString().slice(0, 5).replace(':', 'h') // HHhMM
    const suffix = label ? `_${label.replace(/[^a-zA-Z0-9]/g, '_')}` : ''
    const filename = `backup_${dateStr}_${timeStr}${suffix}.db`
    const destPath = path.join(dir, filename)
    const data = db.export()
    fs.writeFileSync(destPath, Buffer.from(data))
    return { success: true, filename }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export function purgeOldBackups(maxDays: number = 30): void {
  try {
    const dir = getBackupDir()
    if (!fs.existsSync(dir)) return
    const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000
    fs.readdirSync(dir)
      .filter(f => f.endsWith('.db'))
      .forEach(f => {
        // Les sauvegardes mensuelles sont conservées à vie (archives)
        if (f.toLowerCase().includes('mensuel')) return
        const fp = path.join(dir, f)
        const stat = fs.statSync(fp)
        if (stat.mtimeMs < cutoff) fs.unlinkSync(fp)
      })
  } catch {}
}

// Vérifie s'il existe déjà une sauvegarde mensuelle pour le mois en cours (YYYY-MM)
export function monthlyBackupExists(): boolean {
  const ym = new Date().toISOString().slice(0, 7)
  return listBackups().some(b => b.filename.toLowerCase().includes('mensuel') && b.date.slice(0, 7) === ym)
}

export function listBackups(): { filename: string; size: number; date: string; path: string }[] {
  const dir = getBackupDir()
  if (!fs.existsSync(dir)) return []
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const fp = path.join(dir, f)
        const stat = fs.statSync(fp)
        return { filename: f, size: stat.size, date: stat.mtime.toISOString(), path: fp }
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  } catch {
    return []
  }
}

export function restoreBackup(filename: string): { success: boolean; error?: string; requiresRestart?: boolean } {
  try {
    const dir = getBackupDir()
    const fp = path.join(dir, filename)
    if (!fs.existsSync(fp)) return { success: false, error: 'Fichier introuvable' }
    // Créer d'abord une sauvegarde de l'état actuel avant de restaurer
    createBackup('avant_restauration')
    // Copier le backup par-dessus la base de données actuelle
    fs.copyFileSync(fp, dbPath)
    return { success: true, requiresRestart: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export function deleteBackup(filename: string): { success: boolean; error?: string } {
  try {
    const dir = getBackupDir()
    const fp = path.join(dir, filename)
    if (fs.existsSync(fp)) fs.unlinkSync(fp)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export function getBackupDirPath(): string {
  return getBackupDir()
}

// ─── PÉREMPTION ───────────────────────────────────────────────────────────────

export function getProduitsExpirant(joursAlerte: number = 7) {
  const today = new Date().toISOString().slice(0, 10)
  const limite = new Date(Date.now() + joursAlerte * 86400000).toISOString().slice(0, 10)
  return queryAll(`
    SELECT p.*, c.nom as categorie_nom, c.couleur as categorie_couleur
    FROM produits p
    LEFT JOIN categories c ON p.categorie_id = c.id
    WHERE p.actif = 1
      AND p.date_peremption IS NOT NULL
      AND p.date_peremption <= ?
    ORDER BY p.date_peremption ASC
  `, [limite])
}

export function getProduitsExpires() {
  const today = new Date().toISOString().slice(0, 10)
  return queryAll(`
    SELECT p.*, c.nom as categorie_nom
    FROM produits p
    LEFT JOIN categories c ON p.categorie_id = c.id
    WHERE p.actif = 1
      AND p.date_peremption IS NOT NULL
      AND p.date_peremption < ?
    ORDER BY p.date_peremption ASC
  `, [today])
}

// ─── BALANCE SÉRIE (liste ports COM disponibles) ───────────────────────────────

export function getPortsCOM(): string[] {
  try {
    const { execSync } = require('child_process') as typeof import('child_process')
    const out = execSync(
      'wmic path Win32_SerialPort get DeviceID /format:list 2>nul || ls /dev/tty* 2>/dev/null || echo ""',
      { encoding: 'utf8', timeout: 3000 }
    )
    const ports = (out.match(/COM\d+|\/dev\/tty\S+/g) ?? [])
    return [...new Set(ports)]
  } catch {
    return []
  }
}

// ─── FOURNISSEURS ─────────────────────────────────────────────────────────────

export function getAllFournisseurs() {
  return queryAll(`SELECT * FROM fournisseurs ORDER BY nom`)
}

export function createFournisseur(data: { nom: string; telephone?: string; email?: string; adresse?: string; contact_nom?: string; notes?: string }) {
  return runWrite(
    `INSERT INTO fournisseurs (nom, telephone, email, adresse, contact_nom, notes) VALUES (?, ?, ?, ?, ?, ?)`,
    [data.nom, data.telephone ?? null, data.email ?? null, data.adresse ?? null, data.contact_nom ?? null, data.notes ?? null]
  )
}

export function updateFournisseur(id: number, data: any) {
  const fields: string[] = []
  const values: any[] = []
  const allowed = ['nom', 'telephone', 'email', 'adresse', 'contact_nom', 'notes', 'actif']
  for (const key of allowed) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); values.push(data[key]) }
  }
  if (fields.length === 0) return { lastInsertRowid: 0, changes: 0 }
  values.push(id)
  return runWrite(`UPDATE fournisseurs SET ${fields.join(', ')} WHERE id = ?`, values)
}

export function deleteFournisseur(id: number) {
  return runWrite('UPDATE fournisseurs SET actif = 0 WHERE id = ?', [id])
}

// ─── COMMANDES FOURNISSEUR ────────────────────────────────────────────────────

export function getAllCommandes(fournisseurId?: number) {
  let q = `
    SELECT cf.*, f.nom as fournisseur_nom, u.nom as user_nom,
      (SELECT COUNT(*) FROM commandes_lignes WHERE commande_id = cf.id) as nb_lignes
    FROM commandes_fournisseur cf
    LEFT JOIN fournisseurs f ON cf.fournisseur_id = f.id
    LEFT JOIN users u ON cf.user_id = u.id
    WHERE 1=1
  `
  const params: any[] = []
  if (fournisseurId) { q += ' AND cf.fournisseur_id = ?'; params.push(fournisseurId) }
  q += ' ORDER BY cf.date DESC, cf.created_at DESC'
  return queryAll(q, params)
}

export function getCommandeById(id: number) {
  const commande = queryOne(`
    SELECT cf.*, f.nom as fournisseur_nom
    FROM commandes_fournisseur cf
    LEFT JOIN fournisseurs f ON cf.fournisseur_id = f.id
    WHERE cf.id = ?
  `, [id])
  if (!commande) return null
  const lignes = queryAll(`
    SELECT cl.*, p.nom as produit_nom, p.unite, p.code_barre
    FROM commandes_lignes cl
    LEFT JOIN produits p ON cl.produit_id = p.id
    WHERE cl.commande_id = ?
  `, [id])
  return { ...commande, lignes }
}

export function createCommande(data: {
  fournisseur_id: number; reference?: string; date?: string; notes?: string; user_id?: number
  lignes: { produit_id: number; quantite_commandee: number; prix_achat: number }[]
}) {
  const total = data.lignes.reduce((s, l) => s + l.quantite_commandee * l.prix_achat, 0)
  const r = runWrite(
    `INSERT INTO commandes_fournisseur (fournisseur_id, reference, date, total, notes, user_id, statut)
     VALUES (?, ?, ?, ?, ?, ?, 'brouillon')`,
    [data.fournisseur_id, data.reference ?? null, data.date ?? new Date().toISOString().slice(0, 10), total, data.notes ?? null, data.user_id ?? null]
  )
  const commandeId = r.lastInsertRowid
  for (const l of data.lignes) {
    db.run(
      `INSERT INTO commandes_lignes (commande_id, produit_id, quantite_commandee, prix_achat, total_ligne) VALUES (?, ?, ?, ?, ?)`,
      [commandeId, l.produit_id, l.quantite_commandee, l.prix_achat, l.quantite_commandee * l.prix_achat]
    )
  }
  saveDb()
  return { commandeId }
}

export function updateCommandeStatut(id: number, statut: string) {
  return runWrite(`UPDATE commandes_fournisseur SET statut = ? WHERE id = ?`, [statut, id])
}

export function recevoirCommande(commandeId: number, receptions: { produit_id: number; quantite_recue: number; prix_achat: number }[], userId?: number) {
  const commande = queryOne('SELECT * FROM commandes_fournisseur WHERE id = ?', [commandeId])
  if (!commande) return { success: false, error: 'Commande introuvable' }

  for (const r of receptions) {
    // Mettre à jour la ligne de commande
    db.run(
      `UPDATE commandes_lignes SET quantite_recue = quantite_recue + ?, prix_achat = ? WHERE commande_id = ? AND produit_id = ?`,
      [r.quantite_recue, r.prix_achat, commandeId, r.produit_id]
    )
    // Mettre à jour le stock principal et prix d'achat
    db.run(
      `UPDATE produits SET stock_actuel = stock_actuel + ?, prix_achat = ? WHERE id = ?`,
      [r.quantite_recue, r.prix_achat, r.produit_id]
    )
    // Sync stock_par_entrepot (entrepôt principal = 1)
    db.run(`
      INSERT INTO stock_par_entrepot (produit_id, entrepot_id, quantite) VALUES (?, 1, ?)
      ON CONFLICT(produit_id, entrepot_id) DO UPDATE SET quantite = quantite + ?
    `, [r.produit_id, r.quantite_recue, r.quantite_recue])
    // Mouvement de stock
    db.run(
      `INSERT INTO mouvements_stock (produit_id, type, quantite, raison, user_id) VALUES (?, 'entree', ?, ?, ?)`,
      [r.produit_id, r.quantite_recue, `Réception commande #${commandeId}`, userId ?? null]
    )
    // Historique prix d'achat
    try {
      db.run(
        `INSERT INTO prix_achat_historique (produit_id, prix_achat, fournisseur_id, commande_id) VALUES (?, ?, ?, ?)`,
        [r.produit_id, r.prix_achat, commande.fournisseur_id, commandeId]
      )
    } catch {}
  }

  // Vérifier si toutes les lignes sont reçues
  const lignes = queryAll('SELECT * FROM commandes_lignes WHERE commande_id = ?', [commandeId])
  const toutRecu = lignes.every((l: any) => Number(l.quantite_recue) >= Number(l.quantite_commandee))
  const partiel = lignes.some((l: any) => Number(l.quantite_recue) > 0)
  const newStatut = toutRecu ? 'reçu' : partiel ? 'reçu_partiel' : 'commandé'
  db.run(`UPDATE commandes_fournisseur SET statut = ? WHERE id = ?`, [newStatut, commandeId])

  saveDb()
  return { success: true }
}

export function deleteCommande(id: number) {
  return runWrite('DELETE FROM commandes_fournisseur WHERE id = ?', [id])
}

// ─── INVENTAIRE PHYSIQUE ──────────────────────────────────────────────────────

export function getAllInventaires() {
  return queryAll(`
    SELECT i.*, u.nom as user_nom
    FROM inventaires i
    LEFT JOIN users u ON i.user_id = u.id
    ORDER BY i.date DESC, i.created_at DESC
  `)
}

export function getInventaireById(id: number) {
  const inv = queryOne(`
    SELECT i.*, u.nom as user_nom FROM inventaires i
    LEFT JOIN users u ON i.user_id = u.id WHERE i.id = ?
  `, [id])
  if (!inv) return null
  const lignes = queryAll(`
    SELECT il.*, p.nom as produit_nom, p.unite, p.code_barre,
      c.nom as categorie_nom, c.couleur as categorie_couleur
    FROM inventaire_lignes il
    LEFT JOIN produits p ON il.produit_id = p.id
    LEFT JOIN categories c ON p.categorie_id = c.id
    WHERE il.inventaire_id = ?
    ORDER BY p.nom
  `, [id])
  return { ...inv, lignes }
}

export function createInventaire(data: { notes?: string; user_id?: number; categorieId?: number }) {
  const ref = `INV-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`
  const r = runWrite(
    `INSERT INTO inventaires (reference, notes, user_id) VALUES (?, ?, ?)`,
    [ref, data.notes ?? null, data.user_id ?? null]
  )
  const invId = r.lastInsertRowid

  // Créer une ligne pour chaque produit actif (filtré par catégorie si spécifié)
  let q = `SELECT id, stock_actuel, prix_vente FROM produits WHERE actif = 1`
  const params: any[] = []
  if (data.categorieId) { q += ' AND categorie_id = ?'; params.push(data.categorieId) }
  const prods = queryAll(q, params)

  for (const p of prods) {
    db.run(
      `INSERT INTO inventaire_lignes (inventaire_id, produit_id, stock_theorique, prix_vente) VALUES (?, ?, ?, ?)`,
      [invId, p.id, p.stock_actuel, p.prix_vente ?? 0]
    )
  }
  db.run(`UPDATE inventaires SET nb_articles = ? WHERE id = ?`, [prods.length, invId])
  saveDb()
  return { inventaireId: invId, reference: ref }
}

export function updateInventaireLigne(inventaireId: number, produitId: number, stockCompte: number) {
  const ecart = queryOne(
    `SELECT stock_theorique FROM inventaire_lignes WHERE inventaire_id = ? AND produit_id = ?`,
    [inventaireId, produitId]
  )
  const e = stockCompte - Number(ecart?.stock_theorique ?? 0)
  return runWrite(
    `UPDATE inventaire_lignes SET stock_compte = ?, ecart = ? WHERE inventaire_id = ? AND produit_id = ?`,
    [stockCompte, e, inventaireId, produitId]
  )
}

export function updateInventaireJustification(inventaireId: number, produitId: number, justification: string) {
  return runWrite(
    `UPDATE inventaire_lignes SET justification = ? WHERE inventaire_id = ? AND produit_id = ?`,
    [justification || null, inventaireId, produitId]
  )
}

export function cloturerInventaire(id: number, userId?: number) {
  const inv = getInventaireById(id)
  if (!inv) return { success: false, error: 'Introuvable' }
  if (inv.statut === 'cloture') return { success: false, error: 'Déjà clôturé' }

  let nbEcarts = 0
  for (const l of inv.lignes) {
    if (l.stock_compte === null || l.stock_compte === undefined) continue
    const ecart = Number(l.ecart)
    if (ecart !== 0) {
      nbEcarts++
      db.run(`UPDATE produits SET stock_actuel = ? WHERE id = ?`, [l.stock_compte, l.produit_id])
      db.run(
        `INSERT INTO mouvements_stock (produit_id, type, quantite, raison, user_id) VALUES (?, 'ajustement', ?, ?, ?)`,
        [l.produit_id, Math.abs(ecart), `Inventaire ${inv.reference} — écart ${ecart > 0 ? '+' : ''}${ecart}`, userId ?? null]
      )
    }
  }
  db.run(
    `UPDATE inventaires SET statut = 'cloture', nb_ecarts = ? WHERE id = ?`,
    [nbEcarts, id]
  )
  saveDb()
  return { success: true, nbEcarts }
}

// ─── ARDOISE / CRÉDIT CLIENT ──────────────────────────────────────────────────

export function getClientSolde(clientId: number): { solde_credit: number; points_fidelite: number } {
  return queryOne(`SELECT solde_credit, points_fidelite FROM clients WHERE id = ?`, [clientId])
    ?? { solde_credit: 0, points_fidelite: 0 }
}

export function getHistoriqueArdoise(clientId: number, limit = 50) {
  return queryAll(`
    SELECT a.*, v.numero_ticket, u.nom as user_nom
    FROM ardoises a
    LEFT JOIN ventes v ON a.vente_id = v.id
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.client_id = ?
    ORDER BY a.date DESC LIMIT ?
  `, [clientId, limit])
}

export function vendreACredit(data: {
  client_id: number
  vente_id?: number
  montant: number
  note?: string
  user_id?: number
}) {
  const client = queryOne(`SELECT solde_credit FROM clients WHERE id = ?`, [data.client_id])
  if (!client) return { success: false, error: 'Client introuvable' }
  const soldeBefore = Number(client.solde_credit ?? 0)
  const soldeAfter = soldeBefore + data.montant
  db.run(`UPDATE clients SET solde_credit = ? WHERE id = ?`, [soldeAfter, data.client_id])
  runWrite(
    `INSERT INTO ardoises (client_id, vente_id, type, montant, solde_avant, solde_apres, note, user_id) VALUES (?, ?, 'credit', ?, ?, ?, ?, ?)`,
    [data.client_id, data.vente_id ?? null, data.montant, soldeBefore, soldeAfter, data.note ?? null, data.user_id ?? null]
  )
  return { success: true, solde: soldeAfter }
}

export function rembourserCredit(data: {
  client_id: number
  montant: number
  note?: string
  user_id?: number
}) {
  const client = queryOne(`SELECT solde_credit FROM clients WHERE id = ?`, [data.client_id])
  if (!client) return { success: false, error: 'Client introuvable' }
  const soldeBefore = Number(client.solde_credit ?? 0)
  if (data.montant > soldeBefore) return { success: false, error: 'Montant supérieur au solde dû' }
  const soldeAfter = soldeBefore - data.montant
  db.run(`UPDATE clients SET solde_credit = ? WHERE id = ?`, [soldeAfter, data.client_id])
  runWrite(
    `INSERT INTO ardoises (client_id, type, montant, solde_avant, solde_apres, note, user_id) VALUES (?, 'remboursement', ?, ?, ?, ?, ?)`,
    [data.client_id, data.montant, soldeBefore, soldeAfter, data.note ?? null, data.user_id ?? null]
  )
  return { success: true, solde: soldeAfter }
}

export function getClientsAvecCredit() {
  return queryAll(`
    SELECT c.*,
      COUNT(DISTINCT a.id) as nb_ardoises,
      MAX(a.date) as derniere_ardoise
    FROM clients c
    LEFT JOIN ardoises a ON a.client_id = c.id AND a.type = 'credit'
    WHERE c.actif = 1 AND (c.solde_credit > 0 OR c.points_fidelite > 0)
    GROUP BY c.id
    ORDER BY c.solde_credit DESC
  `)
}

// ─── FIDÉLITÉ ─────────────────────────────────────────────────────────────────

export function getFideliteRegle(): any {
  return queryOne(`SELECT * FROM fidelite_regles WHERE actif = 1 LIMIT 1`)
}

export function setFideliteRegle(data: { points_par_fcfa: number; valeur_point_fcfa: number; seuil_utilisation: number }) {
  const existing = queryOne(`SELECT id FROM fidelite_regles LIMIT 1`)
  if (existing) {
    return runWrite(
      `UPDATE fidelite_regles SET points_par_fcfa = ?, valeur_point_fcfa = ?, seuil_utilisation = ?, actif = 1 WHERE id = ?`,
      [data.points_par_fcfa, data.valeur_point_fcfa, data.seuil_utilisation, existing.id]
    )
  }
  return runWrite(
    `INSERT INTO fidelite_regles (nom, points_par_fcfa, valeur_point_fcfa, seuil_utilisation) VALUES ('Programme fidélité', ?, ?, ?)`,
    [data.points_par_fcfa, data.valeur_point_fcfa, data.seuil_utilisation]
  )
}

export function ajouterPoints(clientId: number, montantVente: number, venteId?: number, userId?: number) {
  const regle = getFideliteRegle()
  if (!regle) return { pointsGagnes: 0 }
  const pointsGagnes = Math.floor(montantVente * regle.points_par_fcfa / 100)
  if (pointsGagnes <= 0) return { pointsGagnes: 0 }
  const client = queryOne(`SELECT points_fidelite FROM clients WHERE id = ?`, [clientId])
  const soldeBefore = Number(client?.points_fidelite ?? 0)
  db.run(`UPDATE clients SET points_fidelite = points_fidelite + ? WHERE id = ?`, [pointsGagnes, clientId])
  runWrite(
    `INSERT INTO fidelite_transactions (client_id, vente_id, type, points, solde_avant) VALUES (?, ?, 'gain', ?, ?)`,
    [clientId, venteId ?? null, pointsGagnes, soldeBefore]
  )
  if (venteId) db.run(`UPDATE ventes SET points_gagnes = ? WHERE id = ?`, [pointsGagnes, venteId])
  saveDb()
  return { pointsGagnes }
}

export function utiliserPoints(clientId: number, points: number, venteId?: number) {
  const regle = getFideliteRegle()
  if (!regle) return { success: false, error: 'Programme de fidélité non configuré' }
  const client = queryOne(`SELECT points_fidelite FROM clients WHERE id = ?`, [clientId])
  const solde = Number(client?.points_fidelite ?? 0)
  if (points > solde) return { success: false, error: 'Points insuffisants' }
  if (solde < regle.seuil_utilisation) return { success: false, error: `Seuil minimum: ${regle.seuil_utilisation} pts` }
  const reduction = points * regle.valeur_point_fcfa
  db.run(`UPDATE clients SET points_fidelite = points_fidelite - ? WHERE id = ?`, [points, clientId])
  runWrite(
    `INSERT INTO fidelite_transactions (client_id, vente_id, type, points, solde_avant) VALUES (?, ?, 'utilisation', ?, ?)`,
    [clientId, venteId ?? null, -points, solde]
  )
  if (venteId) db.run(`UPDATE ventes SET points_utilises = ? WHERE id = ?`, [points, venteId])
  saveDb()
  return { success: true, reduction }
}

// ─── PORTE-MONNAIE VIRTUEL ────────────────────────────────────────────────────

export function crediterPortefeuille(data: {
  client_id: number
  montant: number
  type?: 'credit' | 'monnaie'
  vente_id?: number
  note?: string
  user_id?: number
}) {
  const client = queryOne(`SELECT solde_portefeuille FROM clients WHERE id = ?`, [data.client_id])
  if (!client) return { success: false, error: 'Client introuvable' }
  const soldeBefore = Number(client.solde_portefeuille ?? 0)
  const soldeAfter = soldeBefore + data.montant
  db.run(`UPDATE clients SET solde_portefeuille = ? WHERE id = ?`, [soldeAfter, data.client_id])
  runWrite(
    `INSERT INTO portefeuille_transactions (client_id, vente_id, type, montant, solde_avant, solde_apres, note, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.client_id, data.vente_id ?? null, data.type ?? 'credit', data.montant, soldeBefore, soldeAfter, data.note ?? null, data.user_id ?? null]
  )
  return { success: true, solde: soldeAfter }
}

export function debiterPortefeuille(data: {
  client_id: number
  montant: number
  vente_id?: number
  note?: string
  user_id?: number
}) {
  const client = queryOne(`SELECT solde_portefeuille FROM clients WHERE id = ?`, [data.client_id])
  if (!client) return { success: false, error: 'Client introuvable' }
  const soldeBefore = Number(client.solde_portefeuille ?? 0)
  if (data.montant > soldeBefore + 0.01) return { success: false, error: 'Solde porte-monnaie insuffisant' }
  const soldeAfter = Math.max(0, soldeBefore - data.montant)
  db.run(`UPDATE clients SET solde_portefeuille = ? WHERE id = ?`, [soldeAfter, data.client_id])
  runWrite(
    `INSERT INTO portefeuille_transactions (client_id, vente_id, type, montant, solde_avant, solde_apres, note, user_id) VALUES (?, ?, 'debit', ?, ?, ?, ?, ?)`,
    [data.client_id, data.vente_id ?? null, data.montant, soldeBefore, soldeAfter, data.note ?? null, data.user_id ?? null]
  )
  return { success: true, solde: soldeAfter }
}

export function getHistoriquePortefeuille(clientId: number, limit = 50) {
  return queryAll(`
    SELECT pt.*, v.numero_ticket, u.nom as user_nom
    FROM portefeuille_transactions pt
    LEFT JOIN ventes v ON pt.vente_id = v.id
    LEFT JOIN users u ON pt.user_id = u.id
    WHERE pt.client_id = ?
    ORDER BY pt.date DESC LIMIT ?
  `, [clientId, limit])
}

export function getHistoriqueFidelite(clientId: number, limit = 50) {
  return queryAll(`
    SELECT ft.*, v.numero_ticket, v.total as vente_total
    FROM fidelite_transactions ft
    LEFT JOIN ventes v ON ft.vente_id = v.id
    WHERE ft.client_id = ?
    ORDER BY ft.date DESC LIMIT ?
  `, [clientId, limit])
}

// ─── DEVIS ────────────────────────────────────────────────────────────────────

function generateDevisNumber(): string {
  const now = new Date()
  const seq = queryOne(`SELECT COUNT(*) as c FROM devis`)?.c ?? 0
  return `DEV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(Number(seq) + 1).padStart(4, '0')}`
}

export function getAllDevis(statut?: string) {
  let q = `
    SELECT d.*, c.nom as client_nom_join, u.nom as user_nom,
      (SELECT COUNT(*) FROM devis_lignes WHERE devis_id = d.id) as nb_lignes
    FROM devis d
    LEFT JOIN clients c ON d.client_id = c.id
    LEFT JOIN users u ON d.user_id = u.id
  `
  const params: any[] = []
  if (statut) { q += ` WHERE d.statut = ?`; params.push(statut) }
  q += ` ORDER BY d.created_at DESC LIMIT 200`
  return queryAll(q, params)
}

export function getDevisById(id: number) {
  const d = queryOne(`
    SELECT d.*, c.nom as client_nom_join, c.telephone as client_telephone_join, u.nom as user_nom
    FROM devis d
    LEFT JOIN clients c ON d.client_id = c.id
    LEFT JOIN users u ON d.user_id = u.id
    WHERE d.id = ?
  `, [id])
  if (!d) return null
  const lignes = queryAll(`
    SELECT dl.*, p.nom as produit_nom_ref
    FROM devis_lignes dl
    LEFT JOIN produits p ON dl.produit_id = p.id
    WHERE dl.devis_id = ?
    ORDER BY dl.id
  `, [id])
  return { ...d, lignes }
}

export function createDevis(data: {
  client_id?: number
  client_nom?: string
  client_telephone?: string
  date_validite?: string
  notes?: string
  user_id?: number
  lignes: { produit_id?: number; designation: string; unite: string; quantite: number; prix_unitaire: number }[]
}) {
  const numero = generateDevisNumber()
  const total = data.lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0)
  const r = runWrite(
    `INSERT INTO devis (numero, client_id, client_nom, client_telephone, date_validite, total, notes, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [numero, data.client_id ?? null, data.client_nom ?? null, data.client_telephone ?? null, data.date_validite ?? null, total, data.notes ?? null, data.user_id ?? null]
  )
  const devisId = r.lastInsertRowid
  for (const l of data.lignes) {
    db.run(
      `INSERT INTO devis_lignes (devis_id, produit_id, designation, unite, quantite, prix_unitaire, total_ligne) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [devisId, l.produit_id ?? null, l.designation, l.unite, l.quantite, l.prix_unitaire, l.quantite * l.prix_unitaire]
    )
  }
  saveDb()
  return { devisId, numero }
}

export function updateDevisStatut(id: number, statut: string) {
  return runWrite(`UPDATE devis SET statut = ? WHERE id = ?`, [statut, id])
}

export function deleteDevis(id: number) {
  return runWrite(`DELETE FROM devis WHERE id = ? AND statut NOT IN ('converti')`, [id])
}

export function transformerDevisEnVente(devisId: number, caissierId: number, modePaiement: string, montantPaye: number) {
  const devis = getDevisById(devisId)
  if (!devis) return { success: false, error: 'Devis introuvable' }
  if (devis.statut === 'converti') return { success: false, error: 'Déjà converti' }

  // Check stock for all lines
  for (const l of devis.lignes) {
    if (!l.produit_id) continue
    const prod = queryOne(`SELECT stock_actuel, nom FROM produits WHERE id = ?`, [l.produit_id])
    if (prod && Number(prod.stock_actuel) < Number(l.quantite)) {
      return { success: false, error: `Stock insuffisant: ${prod.nom}` }
    }
  }

  const ticket = generateTicketNumber()
  db.run(
    `INSERT INTO ventes (numero_ticket, total, remise, montant_paye, monnaie_rendue, mode_paiement, caissier_id, client_id) VALUES (?, ?, 0, ?, ?, ?, ?, ?)`,
    [ticket, devis.total, montantPaye, Math.max(0, montantPaye - devis.total), modePaiement, caissierId, devis.client_id ?? null]
  )
  const venteId = db.exec('SELECT last_insert_rowid() as r')[0]?.values[0]?.[0] as number

  for (const l of devis.lignes) {
    if (!l.produit_id) continue
    db.run(
      `INSERT INTO vente_lignes (vente_id, produit_id, quantite, prix_unitaire, total_ligne) VALUES (?, ?, ?, ?, ?)`,
      [venteId, l.produit_id, l.quantite, l.prix_unitaire, l.total_ligne]
    )
    db.run(`UPDATE produits SET stock_actuel = stock_actuel - ? WHERE id = ?`, [l.quantite, l.produit_id])
    db.run(
      `INSERT INTO mouvements_stock (produit_id, type, quantite, raison, user_id) VALUES (?, 'sortie', ?, ?, ?)`,
      [l.produit_id, l.quantite, `Devis ${devis.numero}`, caissierId]
    )
  }

  db.run(`UPDATE devis SET statut = 'converti', vente_id = ? WHERE id = ?`, [venteId, devisId])
  saveDb()
  return { success: true, venteId, ticket }
}

// ─── DASHBOARD COMMERCIAL ─────────────────────────────────────────────────────

export function getDashboardCommercial(dateDebut: string, dateFin: string) {
  const topClients = queryAll(`
    SELECT c.id, c.nom, c.telephone, c.solde_credit, c.points_fidelite,
      COUNT(v.id) as nb_achats,
      COALESCE(SUM(v.total), 0) as ca_total,
      MAX(v.date) as dernier_achat
    FROM clients c
    LEFT JOIN ventes v ON v.client_id = c.id AND v.statut = 'completed'
      AND date(v.date) BETWEEN ? AND ?
    WHERE c.actif = 1
    GROUP BY c.id
    ORDER BY ca_total DESC
    LIMIT 15
  `, [dateDebut, dateFin])

  const impayesTotal = queryOne(`SELECT COALESCE(SUM(solde_credit), 0) as total FROM clients WHERE actif = 1`)

  const caParMode = queryAll(`
    SELECT mode as mode_paiement, COUNT(*) as nb, SUM(montant) as total
    FROM (
      SELECT vp.mode as mode, vp.montant as montant
      FROM vente_paiements vp JOIN ventes v ON vp.vente_id = v.id
      WHERE v.statut = 'completed' AND date(v.date) BETWEEN ? AND ?
      UNION ALL
      SELECT v.mode_paiement as mode, v.total as montant
      FROM ventes v
      WHERE v.statut = 'completed' AND date(v.date) BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM vente_paiements vp WHERE vp.vente_id = v.id)
    )
    GROUP BY mode
  `, [dateDebut, dateFin, dateDebut, dateFin])

  const evolutionCA = queryAll(`
    SELECT date(date) as jour, COUNT(*) as nb, SUM(total) as ca, AVG(total) as panier
    FROM ventes
    WHERE statut = 'completed' AND date(date) BETWEEN ? AND ?
    GROUP BY date(date)
    ORDER BY jour
  `, [dateDebut, dateFin])

  const devisStats = queryOne(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN statut='brouillon' THEN 1 ELSE 0 END) as brouillons,
      SUM(CASE WHEN statut='envoye' THEN 1 ELSE 0 END) as envoyes,
      SUM(CASE WHEN statut='accepte' THEN 1 ELSE 0 END) as acceptes,
      SUM(CASE WHEN statut='converti' THEN 1 ELSE 0 END) as convertis,
      SUM(CASE WHEN statut IN ('brouillon','envoye','accepte') THEN total ELSE 0 END) as montant_pipeline
    FROM devis WHERE date(created_at) BETWEEN ? AND ?
  `, [dateDebut, dateFin])

  const fideliteStats = queryOne(`
    SELECT COUNT(DISTINCT client_id) as clients_actifs,
      SUM(CASE WHEN type='gain' THEN points ELSE 0 END) as points_distribues,
      SUM(CASE WHEN type='utilisation' THEN ABS(points) ELSE 0 END) as points_utilises
    FROM fidelite_transactions WHERE date(date) BETWEEN ? AND ?
  `, [dateDebut, dateFin])

  return { topClients, impayesTotal: Number(impayesTotal?.total ?? 0), caParMode, evolutionCA, devisStats, fideliteStats }
}

// ─── CODE ROTATION SUPERVISEUR ────────────────────────────────────────────────
// Stocké dans un fichier JSON sur disque (pas en DB) pour être partagé entre
// toutes les instances Electron ouvertes sur la même machine.

function genCode6(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

interface RotationFileData {
  code: string
  expire_a: string
  genere_le: string
  genere_par_nom: string
}

function readRotationFile(): RotationFileData | null {
  try {
    if (!rotationCodeFile || !fs.existsSync(rotationCodeFile)) return null
    return JSON.parse(fs.readFileSync(rotationCodeFile, 'utf8')) as RotationFileData
  } catch {
    return null
  }
}

export function genererCodeRotation(userId: number): string {
  const plain = genCode6()
  const now = new Date()
  const expireA = new Date(now.getTime() + 30 * 60 * 1000).toISOString()
  const userRow = queryOne('SELECT nom FROM users WHERE id = ?', [userId])
  const data: RotationFileData = {
    code: plain,
    expire_a: expireA,
    genere_le: now.toISOString(),
    genere_par_nom: userRow?.nom ?? 'Gestionnaire',
  }
  fs.writeFileSync(rotationCodeFile, JSON.stringify(data), 'utf8')
  return plain
}

export function getCurrentCodeRotationInfo(): { expire_a: string; genere_le: string; genere_par_nom: string; reste_secondes: number; actif: boolean } | null {
  const data = readRotationFile()
  if (!data) return null
  const resteMs = new Date(data.expire_a).getTime() - Date.now()
  return {
    expire_a: data.expire_a,
    genere_le: data.genere_le,
    genere_par_nom: data.genere_par_nom,
    reste_secondes: Math.max(0, Math.floor(resteMs / 1000)),
    actif: resteMs > 0,
  }
}

export function verifieCodeRotation(code: string): { ok: boolean; codeId?: number; raison?: string } {
  // Relit le fichier sur disque à chaque appel → visible par toutes les instances
  const data = readRotationFile()
  if (!data) return { ok: false, raison: 'Aucun code généré — demandez au gestionnaire de générer un code' }
  if (data.code !== code.trim()) return { ok: false, raison: 'Code incorrect' }
  const resteMs = new Date(data.expire_a).getTime() - Date.now()
  if (resteMs <= 0) return { ok: false, raison: 'Code expiré — demandez un nouveau code au gestionnaire' }
  return { ok: true }
}

// ─── RETOURS ARTICLES ─────────────────────────────────────────────────────────

export function getVenteByTicket(input: string) {
  const value = (input || '').trim()
  if (!value) return null
  // Formats acceptés :
  //  - numero_ticket (ex: TK-20260701-0012) — ce que contient le code-barres de retour
  //  - id numérique de la vente
  //  - code préfixé R<id> (ex: R42)
  let where = 'v.numero_ticket = ?'
  let param: any = value
  const idMatch = value.match(/^R?(\d+)$/i)
  if (idMatch && !value.startsWith('TK-')) {
    where = 'v.id = ?'
    param = Number(idMatch[1])
  }
  const vente = queryOne(`
    SELECT v.*, u.nom as caissier_nom, cl.nom as client_nom, cl.telephone as client_telephone
    FROM ventes v
    LEFT JOIN users u ON v.caissier_id = u.id
    LEFT JOIN clients cl ON v.client_id = cl.id
    WHERE ${where}
  `, [param])
  if (!vente) return null
  const lignes = queryAll(`
    SELECT vl.*, COALESCE(vl.nom_libre, p.nom) as produit_nom, p.unite, p.code_barre
    FROM vente_lignes vl
    LEFT JOIN produits p ON vl.produit_id = p.id
    WHERE vl.vente_id = ?
  `, [vente.id])
  const retourExistant = queryOne('SELECT id FROM retours WHERE vente_id = ?', [vente.id])
  const paiements = queryAll('SELECT mode, montant FROM vente_paiements WHERE vente_id = ? ORDER BY id', [vente.id])
  return { ...vente, lignes, paiements, deja_retourne: retourExistant !== null }
}

export function creerRetour(data: {
  vente_id: number
  caissier_id: number
  code_rotation_id?: number
  montant_rembourse: number
  mode_remboursement: string
  motif?: string
  lignes: { produit_id: number; quantite: number; prix_unitaire: number; total_ligne: number; variante_id?: number }[]
  type?: 'remboursement' | 'echange'
  echange?: {
    // Articles de remplacement (nouvelle vente)
    lignes: { produit_id: number; quantite: number; prix_unitaire: number; total_ligne: number; variante_id?: number; nom_libre?: string }[]
    total: number
    paiements: { mode: string; montant: number }[]
    montant_rembourse: number
    mode_remboursement: string
    boutique_id?: number
  }
}) {
  const type = data.type || 'remboursement'
  const numero = `RET-${Date.now()}`
  const vente = queryOne('SELECT client_id, total FROM ventes WHERE id = ?', [data.vente_id])
  const montantEchange = type === 'echange' ? (data.echange?.total ?? 0) : 0
  const montantReliquat = type === 'echange' ? (data.echange?.montant_rembourse ?? 0) : 0
  const { lastInsertRowid: retourId } = runWrite(`
    INSERT INTO retours (numero, vente_id, caissier_id, code_rotation_id, montant_rembourse, mode_remboursement, motif, type, montant_echange, montant_reliquat)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [numero, data.vente_id, data.caissier_id, data.code_rotation_id ?? null,
      data.montant_rembourse, data.mode_remboursement, data.motif ?? null,
      type, montantEchange, montantReliquat])

  let qteRetournee = 0
  for (const l of data.lignes) {
    db.run('INSERT INTO retour_lignes (retour_id, produit_id, quantite, prix_unitaire, total_ligne, type, variante_id) VALUES (?,?,?,?,?,?,?)',
      [retourId, l.produit_id, l.quantite, l.prix_unitaire, l.total_ligne, 'retour', l.variante_id ?? null])
    // Recréditer le stock (variante si fournie, sinon produit)
    if (l.variante_id) {
      db.run('UPDATE variantes_produit SET stock = stock + ? WHERE id = ?', [l.quantite, l.variante_id])
      resyncStockProduit(l.produit_id)
    } else {
      db.run('UPDATE produits SET stock_actuel = stock_actuel + ? WHERE id = ?', [l.quantite, l.produit_id])
    }
    db.run(`INSERT INTO mouvements_stock (produit_id, type, quantite, raison, user_id)
            VALUES (?, 'entree', ?, ?, ?)`,
      [l.produit_id, l.quantite, `Retour ${numero}`, data.caissier_id])
    qteRetournee += Number(l.quantite ?? 0)
  }

  // Échange : créer la nouvelle vente de remplacement (stock décrémenté) + paiement
  let remplacementVenteId: number | null = null
  let remplacementTicket: string | null = null
  if (type === 'echange' && data.echange && data.echange.lignes.length > 0) {
    const ec = data.echange
    const venteRemplacement = createVente({
      total: ec.total,
      remise: 0,
      montant_paye: ec.paiements.reduce((s, p) => s + p.montant, 0),
      monnaie_rendue: 0,
      mode_paiement: ec.paiements.length ? [...ec.paiements].sort((a, b) => b.montant - a.montant)[0].mode : 'especes',
      caissier_id: data.caissier_id,
      client_id: vente?.client_id ?? undefined,
      boutique_id: ec.boutique_id ?? 1,
      paiements: ec.paiements,
      lignes: ec.lignes
    })
    remplacementVenteId = venteRemplacement.venteId
    remplacementTicket = venteRemplacement.ticket
  }

  // Retour complet → vente marquée remboursée (sinon elle reste 'completed' pour ne pas fausser les stats)
  const totalVendu = queryOne('SELECT COALESCE(SUM(quantite),0) as q FROM vente_lignes WHERE vente_id = ?', [data.vente_id])
  const qteVendue = Number((totalVendu as any)?.q ?? 0)
  if (qteRetournee > 0 && qteRetournee >= qteVendue) {
    db.run("UPDATE ventes SET statut = 'rembourse' WHERE id = ?", [data.vente_id])
  }

  // Remboursement porte-monnaie : créditer réellement le client si la vente a un client
  // (soit remboursement simple, soit reliquat d'un échange)
  const montantPortefeuille = type === 'echange'
    ? (data.echange?.montant_rembourse ?? 0)
    : data.montant_rembourse
  if ((type === 'remboursement' && data.mode_remboursement === 'wallet') ||
      (type === 'echange' && data.echange?.mode_remboursement === 'wallet')) {
    if (vente && vente.client_id && montantPortefeuille > 0) {
      crediterPortefeuille({
        client_id: vente.client_id,
        montant: montantPortefeuille,
        vente_id: data.vente_id,
        type: 'credit',
        note: type === 'echange' ? `Reliquat échange ${numero}` : `Retour ${numero}`,
        user_id: data.caissier_id
      })
    }
  }

  saveDb()
  return { retourId, numero, remplacementVenteId, remplacementTicket }
}

export function getRetours(dateDebut?: string, dateFin?: string) {
  let q = `
    SELECT r.*, v.numero_ticket, u.nom as caissier_nom,
           cl.nom as client_nom
    FROM retours r
    JOIN ventes v ON r.vente_id = v.id
    JOIN users u ON r.caissier_id = u.id
    LEFT JOIN clients cl ON v.client_id = cl.id
    WHERE 1=1
  `
  const params: any[] = []
  if (dateDebut) { q += ' AND date(r.date) >= ?'; params.push(dateDebut) }
  if (dateFin) { q += ' AND date(r.date) <= ?'; params.push(dateFin) }
  q += ' ORDER BY r.date DESC LIMIT 200'
  return queryAll(q, params)
}

// ─────────────────────────────────────────────────────────────────────────────
// VOLET AVANCÉ
// ─────────────────────────────────────────────────────────────────────────────

// ─── ANALYTICS ────────────────────────────────────────────────────────────────
export function getAnalyticsDashboard(dateDebut: string, dateFin: string, boutiqueId?: number) {
  const bFilter = boutiqueId ? ' AND (v.boutique_id = ? OR v.boutique_id IS NULL)' : ''
  const bParams = boutiqueId ? [boutiqueId] : []

  // CA par jour sur la période
  const caParJour = queryAll(`
    SELECT date(v.date) as jour, SUM(v.total) as ca, COUNT(*) as nb_ventes
    FROM ventes v WHERE v.statut != 'annule'
    AND date(v.date) >= ? AND date(v.date) <= ?
    ${bFilter}
    GROUP BY date(v.date) ORDER BY jour
  `, [dateDebut, dateFin, ...bParams])

  // Top 10 produits (CA)
  const topProduits = queryAll(`
    SELECT COALESCE(vl.nom_libre, p.nom) as nom, SUM(vl.total_ligne) as ca, SUM(vl.quantite) as qte
    FROM vente_lignes vl
    LEFT JOIN produits p ON vl.produit_id = p.id
    JOIN ventes v ON vl.vente_id = v.id
    WHERE v.statut != 'annule'
    AND date(v.date) >= ? AND date(v.date) <= ?
    ${bFilter}
    GROUP BY COALESCE(vl.nom_libre, p.nom) ORDER BY ca DESC LIMIT 10
  `, [dateDebut, dateFin, ...bParams])

  // Répartition par mode de paiement
  const parMode = queryAll(`
    SELECT mode as mode_paiement, SUM(montant) as ca, COUNT(*) as nb
    FROM (
      SELECT vp.mode as mode, vp.montant as montant
      FROM vente_paiements vp JOIN ventes v ON vp.vente_id = v.id
      WHERE v.statut != 'annule' AND date(v.date) >= ? AND date(v.date) <= ? ${bFilter}
      UNION ALL
      SELECT v.mode_paiement as mode, v.total as montant
      FROM ventes v
      WHERE v.statut != 'annule' AND date(v.date) >= ? AND date(v.date) <= ? ${bFilter}
        AND NOT EXISTS (SELECT 1 FROM vente_paiements vp WHERE vp.vente_id = v.id)
    )
    GROUP BY mode ORDER BY ca DESC
  `, [dateDebut, dateFin, ...bParams, dateDebut, dateFin, ...bParams])

  // Heatmap heures (0-23)
  const parHeure = queryAll(`
    SELECT CAST(strftime('%H', v.date) AS INTEGER) as heure,
           COUNT(*) as nb, SUM(v.total) as ca
    FROM ventes v WHERE v.statut != 'annule'
    AND date(v.date) >= ? AND date(v.date) <= ?
    ${bFilter}
    GROUP BY heure ORDER BY heure
  `, [dateDebut, dateFin, ...bParams])

  // Totaux globaux
  const totaux = queryOne(`
    SELECT SUM(v.total) as ca_total, COUNT(*) as nb_ventes,
           AVG(v.total) as panier_moyen,
           SUM(v.remise) as remises_total
    FROM ventes v WHERE v.statut != 'annule'
    AND date(v.date) >= ? AND date(v.date) <= ?
    ${bFilter}
  `, [dateDebut, dateFin, ...bParams])

  // Retours sur la période
  const retours = queryOne(`
    SELECT COUNT(*) as nb, SUM(r.montant_rembourse) as montant
    FROM retours r WHERE date(r.date) >= ? AND date(r.date) <= ?
  `, [dateDebut, dateFin])

  // Top catégories
  const topCategories = queryAll(`
    SELECT COALESCE(c.nom, 'Ventes libres') as nom, SUM(vl.total_ligne) as ca, SUM(vl.quantite) as qte
    FROM vente_lignes vl
    LEFT JOIN produits p ON vl.produit_id = p.id
    LEFT JOIN categories c ON p.categorie_id = c.id
    JOIN ventes v ON vl.vente_id = v.id
    WHERE v.statut != 'annule'
    AND date(v.date) >= ? AND date(v.date) <= ?
    ${bFilter}
    GROUP BY COALESCE(c.id, 0) ORDER BY ca DESC LIMIT 6
  `, [dateDebut, dateFin, ...bParams])

  return { caParJour, topProduits, parMode, parHeure, totaux, retours, topCategories }
}

export function getAnalyticsComparaison(periode1: { debut: string; fin: string }, periode2: { debut: string; fin: string }) {
  const stats = (debut: string, fin: string) => queryOne(`
    SELECT SUM(total) as ca, COUNT(*) as nb, AVG(total) as panier
    FROM ventes WHERE statut != 'annule' AND date(date) >= ? AND date(date) <= ?
  `, [debut, fin])
  return {
    periode1: { ...stats(periode1.debut, periode1.fin), debut: periode1.debut, fin: periode1.fin },
    periode2: { ...stats(periode2.debut, periode2.fin), debut: periode2.debut, fin: periode2.fin }
  }
}

// ─── BOUTIQUES ────────────────────────────────────────────────────────────────
export function getAllBoutiques() {
  return queryAll('SELECT * FROM boutiques ORDER BY id', [])
}

export function createBoutique(data: { nom: string; adresse?: string; telephone?: string }) {
  const { lastInsertRowid } = runWrite(
    'INSERT INTO boutiques (nom, adresse, telephone) VALUES (?,?,?)',
    [data.nom, data.adresse ?? null, data.telephone ?? null]
  )
  return { id: lastInsertRowid, ...data }
}

export function updateBoutique(id: number, data: { nom?: string; adresse?: string; telephone?: string; actif?: number }) {
  const fields: string[] = []
  const vals: any[] = []
  if (data.nom !== undefined) { fields.push('nom = ?'); vals.push(data.nom) }
  if (data.adresse !== undefined) { fields.push('adresse = ?'); vals.push(data.adresse) }
  if (data.telephone !== undefined) { fields.push('telephone = ?'); vals.push(data.telephone) }
  if (data.actif !== undefined) { fields.push('actif = ?'); vals.push(data.actif) }
  if (!fields.length) return
  runWrite(`UPDATE boutiques SET ${fields.join(', ')} WHERE id = ?`, [...vals, id])
}

export function deleteBoutique(id: number) {
  // Ne pas supprimer si c'est la seule boutique
  const nb = queryOne('SELECT COUNT(*) as c FROM boutiques WHERE actif = 1', [])?.c ?? 1
  if (nb <= 1) return { error: 'Impossible de supprimer la dernière boutique' }
  runWrite('UPDATE boutiques SET actif = 0 WHERE id = ?', [id])
  return { ok: true }
}

export function getStatsBoutiqueConsolidee(dateDebut: string, dateFin: string) {
  const rows = queryAll(`
    SELECT b.nom as boutique, b.id as boutique_id,
           COUNT(DISTINCT v.id) as nb_ventes, COALESCE(SUM(DISTINCT v.total),0) as ca,
           COALESCE(AVG(v.total),0) as panier_moyen
    FROM boutiques b
    LEFT JOIN ventes v ON (v.boutique_id = b.id OR (v.boutique_id IS NULL AND b.id = 1))
      AND v.statut != 'annule'
      AND date(v.date) >= ? AND date(v.date) <= ?
    WHERE b.actif = 1
    GROUP BY b.id ORDER BY ca DESC
  `, [dateDebut, dateFin])

  // Marge + top produit par boutique (via jointure sur lignes)
  const marges = queryAll(`
    SELECT v.boutique_id as bid,
           COALESCE(SUM(vl.quantite * COALESCE(p.prix_achat,0)),0) as cout,
           COALESCE(SUM(vl.total_ligne),0) as ca_lignes
    FROM ventes v
    LEFT JOIN vente_lignes vl ON vl.vente_id = v.id
    LEFT JOIN produits p ON vl.produit_id = p.id
    WHERE v.statut != 'annule' AND date(v.date) >= ? AND date(v.date) <= ?
    GROUP BY v.boutique_id
  `, [dateDebut, dateFin])

  return rows.map((r: any) => {
    const bid = r.boutique_id ?? 1
    const m = marges.find((x: any) => (x.bid ?? 1) === bid)
    const cout = Number(m?.cout ?? 0)
    const caL = Number(m?.ca_lignes ?? 0)
    return {
      ...r,
      cout,
      marge: caL - cout,
      taux_marge: caL > 0 ? ((caL - cout) / caL) * 100 : 0
    }
  })
}

// ─── ALERTES AUTOMATISÉES ─────────────────────────────────────────────────────
export function getAlertesRegles() {
  return queryAll('SELECT * FROM alertes_regles ORDER BY id', [])
}

export function updateAlerteRegle(id: number, data: { actif?: number; params?: string }) {
  const fields: string[] = []
  const vals: any[] = []
  if (data.actif !== undefined) { fields.push('actif = ?'); vals.push(data.actif) }
  if (data.params !== undefined) { fields.push('params = ?'); vals.push(data.params) }
  if (!fields.length) return
  runWrite(`UPDATE alertes_regles SET ${fields.join(', ')} WHERE id = ?`, [...vals, id])
}

export function runAlertesAuto(): { nouvelles: number; details: string[] } {
  const regles = queryAll('SELECT * FROM alertes_regles WHERE actif = 1', [])
  let nouvelles = 0
  const details: string[] = []

  for (const regle of regles) {
    const p = JSON.parse(regle.params || '{}')
    if (regle.type === 'stock_faible') {
      const produits = queryAll(`
        SELECT nom, stock_actuel, stock_minimum FROM produits
        WHERE actif = 1 AND stock_actuel <= stock_minimum AND stock_minimum > 0
      `, [])
      for (const prod of produits) {
        const exists = queryOne(`
          SELECT id FROM alertes WHERE type = 'stock_faible' AND message LIKE ? AND lu = 0
        `, [`%${prod.nom}%`])
        if (!exists) {
          runWrite(`INSERT INTO alertes (type, message, produit_id) VALUES ('stock_faible', ?, (SELECT id FROM produits WHERE nom = ? LIMIT 1))`,
            [`Stock faible: ${prod.nom} (${prod.stock_actuel} restant)`, prod.nom])
          nouvelles++
          details.push(`Stock faible: ${prod.nom}`)
        }
      }
    }

    if (regle.type === 'ardoise_ancienne') {
      const jours = p.jours ?? 30
      const clients = queryAll(`
        SELECT c.nom, c.solde_credit,
               MAX(date(t.date)) as derniere_vente
        FROM clients c
        LEFT JOIN ventes t ON t.client_id = c.id AND t.mode_paiement = 'ardoise'
        WHERE c.solde_credit > 0
        GROUP BY c.id
        HAVING derniere_vente IS NULL OR julianday('now') - julianday(derniere_vente) > ?
      `, [jours])
      for (const cl of clients) {
        const exists = queryOne(`
          SELECT id FROM alertes WHERE type = 'ardoise' AND message LIKE ? AND lu = 0
        `, [`%${cl.nom}%`])
        if (!exists) {
          runWrite(`INSERT INTO alertes (type, message) VALUES ('ardoise', ?)`,
            [`Ardoise ancienne: ${cl.nom} doit ${Math.round(cl.solde_credit).toLocaleString('fr-FR')} FCFA`])
          nouvelles++
          details.push(`Ardoise: ${cl.nom}`)
        }
      }
    }

    if (regle.type === 'fidelite_palier') {
      const palier = p.points ?? 100
      const clients = queryAll(`
        SELECT nom, points_fidelite FROM clients
        WHERE points_fidelite >= ? AND actif = 1
      `, [palier])
      for (const cl of clients) {
        const exists = queryOne(`
          SELECT id FROM alertes WHERE type = 'fidelite' AND message LIKE ? AND lu = 0
        `, [`%${cl.nom}%`])
        if (!exists) {
          runWrite(`INSERT INTO alertes (type, message) VALUES ('fidelite', ?)`,
            [`Fidélité: ${cl.nom} a atteint ${cl.points_fidelite} pts — éligible récompense`])
          nouvelles++
          details.push(`Fidélité: ${cl.nom}`)
        }
      }
    }

    runWrite('UPDATE alertes_regles SET derniere_execution = datetime(\'now\') WHERE id = ?', [regle.id])
  }

  return { nouvelles, details }
}

// ─── IMPORT / EXPORT ──────────────────────────────────────────────────────────
export function importProduits(lignes: {
  nom: string; categorie_nom?: string; prix_vente: number; prix_achat?: number;
  stock_actuel?: number; stock_minimum?: number; unite?: string; code_barre?: string
}[], userId?: number): { importees: number; erreurs: string[] } {
  let importees = 0
  const erreurs: string[] = []
  let doublonsFichier = 0
  let majExistantes = 0
  const vus = new Set<string>()
  for (const l of lignes) {
    try {
      if (!l.nom || !l.prix_vente) { erreurs.push(`Ligne invalide: nom ou prix manquant`); continue }
      // Détection des doublons au sein du fichier importé
      const cle = (l.code_barre || l.nom.trim().toLowerCase())
      if (vus.has(cle)) { doublonsFichier++; continue }
      vus.add(cle)
      // Trouver ou créer catégorie
      let catId: number | null = null
      if (l.categorie_nom) {
        let cat = queryOne('SELECT id FROM categories WHERE nom = ?', [l.categorie_nom])
        if (!cat) {
          db.run('INSERT INTO categories (nom) VALUES (?)', [l.categorie_nom])
          cat = queryOne('SELECT last_insert_rowid() as id', [])
        }
        catId = cat?.id ?? null
      }
      // Upsert par code_barre ou nom
      const existing = l.code_barre
        ? queryOne('SELECT id FROM produits WHERE code_barre = ?', [l.code_barre])
        : queryOne('SELECT id FROM produits WHERE nom = ?', [l.nom])
      if (existing) {
        majExistantes++
        db.run(`UPDATE produits SET nom=?, prix_vente=?, prix_achat=COALESCE(?,prix_achat),
          stock_actuel=COALESCE(?,stock_actuel), stock_minimum=COALESCE(?,stock_minimum),
          unite=COALESCE(?,unite), categorie_id=COALESCE(?,categorie_id) WHERE id=?`,
          [l.nom, l.prix_vente, l.prix_achat ?? null, l.stock_actuel ?? null,
           l.stock_minimum ?? null, l.unite ?? null, catId, existing.id])
      } else {
        db.run(`INSERT INTO produits (nom, categorie_id, prix_vente, prix_achat, stock_actuel, stock_minimum, unite, code_barre)
          VALUES (?,?,?,?,?,?,?,?)`,
          [l.nom, catId, l.prix_vente, l.prix_achat ?? 0, l.stock_actuel ?? 0,
           l.stock_minimum ?? 0, l.unite ?? 'pièce', l.code_barre ?? null])
      }
      importees++
    } catch (e: any) {
      erreurs.push(`${l.nom}: ${e.message}`)
    }
  }
  saveDb()
  if (userId) {
    try { runWrite('INSERT INTO import_log (type, nb_lignes, nb_erreurs, user_id) VALUES (?,?,?,?)',
      ['produits', importees, erreurs.length, userId]) } catch {}
  }
  return { importees, erreurs, doublonsFichier, majExistantes }
}

export function importClients(lignes: {
  nom: string; telephone?: string; email?: string
}[], userId?: number): { importees: number; erreurs: string[] } {
  let importees = 0
  const erreurs: string[] = []
  for (const l of lignes) {
    try {
      if (!l.nom) { erreurs.push('Nom manquant'); continue }
      const existing = queryOne('SELECT id FROM clients WHERE nom = ?', [l.nom])
      if (!existing) {
        db.run('INSERT INTO clients (nom, telephone, email) VALUES (?,?,?)',
          [l.nom, l.telephone ?? null, l.email ?? null])
        importees++
      }
    } catch (e: any) { erreurs.push(`${l.nom}: ${e.message}`) }
  }
  saveDb()
  if (userId) {
    try { runWrite('INSERT INTO import_log (type, nb_lignes, nb_erreurs, user_id) VALUES (?,?,?,?)',
      ['clients', importees, erreurs.length, userId]) } catch {}
  }
  return { importees, erreurs }
}

export function exportProduitsList() {
  return queryAll(`
    SELECT p.nom, c.nom as categorie, p.prix_vente, p.prix_achat,
           p.stock_actuel, p.stock_minimum, p.unite, p.code_barre, p.actif
    FROM produits p LEFT JOIN categories c ON p.categorie_id = c.id
    WHERE p.actif = 1 ORDER BY c.nom, p.nom
  `, [])
}

// Export de l'état des stocks / inventaire (avec valorisation et statut)
export function exportStockList() {
  return queryAll(`
    SELECT p.nom, c.nom as categorie, p.stock_actuel, p.stock_minimum, p.unite,
           p.prix_achat, p.prix_vente,
           ROUND(p.stock_actuel * p.prix_achat, 0) as valeur_achat,
           ROUND(p.stock_actuel * p.prix_vente, 0) as valeur_vente,
           CASE
             WHEN p.stock_actuel <= 0 THEN 'Rupture'
             WHEN p.stock_minimum > 0 AND p.stock_actuel <= p.stock_minimum THEN 'Stock bas'
             ELSE 'OK'
           END as statut
    FROM produits p LEFT JOIN categories c ON p.categorie_id = c.id
    WHERE p.actif = 1
    ORDER BY statut, c.nom, p.nom
  `, [])
}

export function exportVentesList(dateDebut: string, dateFin: string) {
  return queryAll(`
    SELECT v.numero_ticket, date(v.date) as date, strftime('%H:%M',v.date) as heure,
           v.total, v.remise, v.mode_paiement, v.montant_paye, v.monnaie_rendue,
           u.nom as caissier, cl.nom as client, v.statut
    FROM ventes v
    JOIN users u ON v.caissier_id = u.id
    LEFT JOIN clients cl ON v.client_id = cl.id
    WHERE v.statut != 'annule'
    AND date(v.date) >= ? AND date(v.date) <= ?
    ORDER BY v.date DESC
  `, [dateDebut, dateFin])
}

export function exportClientsList() {
  return queryAll(`
    SELECT nom, telephone, email, solde_credit, points_fidelite, solde_portefeuille,
           created_at
    FROM clients WHERE actif = 1 ORDER BY nom
  `, [])
}

export function getImportLog() {
  return queryAll('SELECT * FROM import_log ORDER BY date DESC LIMIT 50', [])
}

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 7 — VOLET OPÉRATIONS
// ─────────────────────────────────────────────────────────────────────────────

// ─── ENTREPÔTS ────────────────────────────────────────────────────────────────
export function getAllEntrepots() {
  return queryAll('SELECT * FROM entrepots WHERE actif = 1 ORDER BY id', [])
}

export function createEntrepot(data: { nom: string; adresse?: string; responsable?: string }) {
  const { lastInsertRowid } = runWrite(
    'INSERT INTO entrepots (nom, adresse, responsable) VALUES (?,?,?)',
    [data.nom, data.adresse ?? null, data.responsable ?? null]
  )
  db.run(`
    INSERT OR IGNORE INTO stock_par_entrepot (produit_id, entrepot_id, quantite)
    SELECT id, ?, 0 FROM produits WHERE actif = 1
  `, [lastInsertRowid])
  saveDb()
  return { id: lastInsertRowid }
}

export function updateEntrepot(id: number, data: { nom?: string; adresse?: string; responsable?: string }) {
  const fields: string[] = []
  const vals: any[] = []
  if (data.nom !== undefined) { fields.push('nom = ?'); vals.push(data.nom) }
  if (data.adresse !== undefined) { fields.push('adresse = ?'); vals.push(data.adresse) }
  if (data.responsable !== undefined) { fields.push('responsable = ?'); vals.push(data.responsable) }
  if (!fields.length) return
  runWrite(`UPDATE entrepots SET ${fields.join(', ')} WHERE id = ?`, [...vals, id])
}

export function deleteEntrepot(id: number) {
  const nb = queryOne('SELECT COUNT(*) as c FROM entrepots WHERE actif = 1', [])?.c ?? 1
  if (id === 1) return { error: "L'entrepôt principal ne peut pas être supprimé" }
  if (nb <= 1) return { error: 'Impossible de supprimer le seul entrepôt actif' }
  runWrite('UPDATE entrepots SET actif = 0 WHERE id = ?', [id])
  return { ok: true }
}

export function getStockParEntrepot(entrepotId?: number) {
  if (entrepotId) {
    return queryAll(`
      SELECT p.id as produit_id, p.nom, p.code_barre, p.unite,
             c.nom as categorie, spe.quantite, spe.entrepot_id, p.stock_minimum
      FROM stock_par_entrepot spe
      JOIN produits p ON spe.produit_id = p.id
      LEFT JOIN categories c ON p.categorie_id = c.id
      WHERE spe.entrepot_id = ? AND p.actif = 1
      ORDER BY c.nom, p.nom
    `, [entrepotId])
  }
  return queryAll(`
    SELECT p.id as produit_id, p.nom, p.unite, c.nom as categorie,
           SUM(spe.quantite) as stock_total, p.stock_minimum,
           GROUP_CONCAT(e.nom || ':' || ROUND(spe.quantite,2), ' | ') as detail_entrepots
    FROM produits p
    LEFT JOIN stock_par_entrepot spe ON spe.produit_id = p.id
    LEFT JOIN entrepots e ON spe.entrepot_id = e.id AND e.actif = 1
    LEFT JOIN categories c ON p.categorie_id = c.id
    WHERE p.actif = 1
    GROUP BY p.id
    ORDER BY c.nom, p.nom
  `, [])
}

// ─── TRANSFERTS STOCK ─────────────────────────────────────────────────────────
export function getAllTransferts(limit = 50) {
  return queryAll(`
    SELECT t.*, es.nom as source_nom, ed.nom as dest_nom, u.nom as user_nom,
           COUNT(tl.id) as nb_lignes, SUM(tl.quantite) as qte_totale
    FROM transferts_stock t
    JOIN entrepots es ON t.entrepot_source_id = es.id
    JOIN entrepots ed ON t.entrepot_dest_id = ed.id
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN transfert_lignes tl ON tl.transfert_id = t.id
    GROUP BY t.id
    ORDER BY t.date DESC LIMIT ?
  `, [limit])
}

export function getTransfertById(id: number) {
  const transfert = queryOne(`
    SELECT t.*, es.nom as source_nom, ed.nom as dest_nom, u.nom as user_nom
    FROM transferts_stock t
    JOIN entrepots es ON t.entrepot_source_id = es.id
    JOIN entrepots ed ON t.entrepot_dest_id = ed.id
    LEFT JOIN users u ON t.user_id = u.id
    WHERE t.id = ?
  `, [id])
  if (!transfert) return null
  const lignes = queryAll(`
    SELECT tl.*, p.nom as produit_nom, p.unite
    FROM transfert_lignes tl
    JOIN produits p ON tl.produit_id = p.id
    WHERE tl.transfert_id = ?
  `, [id])
  return { ...transfert, lignes }
}

export function createTransfert(data: {
  entrepot_source_id: number
  entrepot_dest_id: number
  notes?: string
  user_id?: number
  lignes: { produit_id: number; quantite: number }[]
}) {
  if (data.entrepot_source_id === data.entrepot_dest_id)
    return { error: 'Source et destination identiques' }

  for (const l of data.lignes) {
    const stock = queryOne(
      'SELECT quantite FROM stock_par_entrepot WHERE produit_id = ? AND entrepot_id = ?',
      [l.produit_id, data.entrepot_source_id]
    )
    if (!stock || Number(stock.quantite) < l.quantite)
      return { error: `Stock insuffisant pour le produit ID ${l.produit_id}` }
  }

  const ref = `TRF-${Date.now()}`
  const { lastInsertRowid: transfertId } = runWrite(`
    INSERT INTO transferts_stock (reference, entrepot_source_id, entrepot_dest_id, statut, notes, user_id)
    VALUES (?, ?, ?, 'en_attente', ?, ?)
  `, [ref, data.entrepot_source_id, data.entrepot_dest_id, data.notes ?? null, data.user_id ?? null])

  for (const l of data.lignes) {
    db.run(
      'INSERT INTO transfert_lignes (transfert_id, produit_id, quantite) VALUES (?,?,?)',
      [transfertId, l.produit_id, l.quantite]
    )
  }
  saveDb()
  return { transfertId, reference: ref }
}

export function validerTransfert(id: number) {
  const t = queryOne('SELECT * FROM transferts_stock WHERE id = ?', [id])
  if (!t) return { error: 'Transfert introuvable' }
  if (t.statut !== 'en_attente') return { error: 'Transfert déjà traité' }

  const lignes = queryAll('SELECT * FROM transfert_lignes WHERE transfert_id = ?', [id])
  for (const l of lignes) {
    db.run(
      'UPDATE stock_par_entrepot SET quantite = quantite - ? WHERE produit_id = ? AND entrepot_id = ?',
      [l.quantite, l.produit_id, t.entrepot_source_id]
    )
    db.run(`
      INSERT INTO stock_par_entrepot (produit_id, entrepot_id, quantite) VALUES (?, ?, ?)
      ON CONFLICT(produit_id, entrepot_id) DO UPDATE SET quantite = quantite + ?
    `, [l.produit_id, t.entrepot_dest_id, l.quantite, l.quantite])
    const total = queryOne('SELECT SUM(quantite) as s FROM stock_par_entrepot WHERE produit_id = ?', [l.produit_id])
    db.run('UPDATE produits SET stock_actuel = ? WHERE id = ?', [total?.s ?? 0, l.produit_id])
    db.run(`INSERT INTO mouvements_stock (produit_id, type, quantite, raison) VALUES (?, 'transfert', ?, ?)`,
      [l.produit_id, l.quantite, `Transfert ${t.reference}`])
  }
  db.run("UPDATE transferts_stock SET statut = 'validé' WHERE id = ?", [id])
  saveDb()
  return { ok: true }
}

export function annulerTransfert(id: number) {
  const t = queryOne('SELECT statut FROM transferts_stock WHERE id = ?', [id])
  if (!t || t.statut !== 'en_attente') return { error: "Impossible d'annuler" }
  runWrite("UPDATE transferts_stock SET statut = 'annulé' WHERE id = ?", [id])
  return { ok: true }
}

// ─── HISTORIQUE PRIX D'ACHAT ──────────────────────────────────────────────────
export function getPrixAchatHistorique(produitId: number) {
  return queryAll(`
    SELECT h.*, f.nom as fournisseur_nom
    FROM prix_achat_historique h
    LEFT JOIN fournisseurs f ON h.fournisseur_id = f.id
    WHERE h.produit_id = ?
    ORDER BY h.date DESC LIMIT 50
  `, [produitId])
}

export function getPrixAchatStatsProduits() {
  return queryAll(`
    SELECT p.id, p.nom, p.prix_achat as prix_actuel,
           MIN(h.prix_achat) as prix_min,
           MAX(h.prix_achat) as prix_max,
           AVG(h.prix_achat) as prix_moyen,
           COUNT(h.id) as nb_achats,
           MAX(h.date) as dernier_achat,
           (SELECT f2.nom FROM fournisseurs f2
            JOIN prix_achat_historique h2 ON h2.fournisseur_id = f2.id
            WHERE h2.produit_id = p.id
            ORDER BY h2.date DESC LIMIT 1) as dernier_fournisseur
    FROM produits p
    LEFT JOIN prix_achat_historique h ON h.produit_id = p.id
    WHERE p.actif = 1
    GROUP BY p.id
    HAVING nb_achats > 0
    ORDER BY dernier_achat DESC
  `, [])
}

export function getCommandePdfData(commandeId: number) {
  const commande = queryOne(`
    SELECT c.*, f.nom as fournisseur_nom, f.telephone as fournisseur_tel,
           f.email as fournisseur_email, f.adresse as fournisseur_adresse,
           u.nom as user_nom
    FROM commandes_fournisseur c
    JOIN fournisseurs f ON c.fournisseur_id = f.id
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `, [commandeId])
  if (!commande) return null
  const lignes = queryAll(`
    SELECT cl.*, p.nom as produit_nom, p.unite, p.code_barre
    FROM commandes_lignes cl
    JOIN produits p ON cl.produit_id = p.id
    WHERE cl.commande_id = ?
  `, [commandeId])
  return { ...commande, lignes }
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNC INTER-BOUTIQUES
// ─────────────────────────────────────────────────────────────────────────────

function logSync(entityType: string, entityId: number, action: string, data: any, boutiqueId = 1) {
  try {
    db.run(
      `INSERT INTO sync_journal (entity_type, entity_id, action, data_json, boutique_id) VALUES (?,?,?,?,?)`,
      [entityType, entityId, action, JSON.stringify(data), boutiqueId]
    )
  } catch {}
}

export function getSyncJournal(since?: string, boutiqueId?: number) {
  let q = `SELECT * FROM sync_journal WHERE 1=1`
  const p: any[] = []
  if (since) { q += ` AND created_at > ?`; p.push(since) }
  if (boutiqueId) { q += ` AND boutique_id = ?`; p.push(boutiqueId) }
  q += ` ORDER BY created_at ASC LIMIT 1000`
  return queryAll(q, p)
}

export function getSyncPeers() {
  return queryAll(`SELECT * FROM sync_peers WHERE actif=1 ORDER BY nom`, [])
}

export function createSyncPeer(data: { nom: string; ip: string; port?: number }) {
  return runWrite(
    `INSERT INTO sync_peers (nom, ip, port) VALUES (?,?,?)`,
    [data.nom, data.ip, data.port ?? 7890]
  )
}

export function deleteSyncPeer(id: number) {
  return runWrite(`DELETE FROM sync_peers WHERE id=?`, [id])
}

export function updateSyncPeerLastSync(id: number, boutiqueId: number) {
  return runWrite(
    `UPDATE sync_peers SET last_sync=datetime('now'), last_sync_boutique_id=? WHERE id=?`,
    [boutiqueId, id]
  )
}

export function applySyncChanges(changes: any[]) {
  let applied = 0; const errors: string[] = []
  for (const ch of changes) {
    try {
      const d = typeof ch.data_json === 'string' ? JSON.parse(ch.data_json) : ch.data_json
      if (ch.entity_type === 'vente') {
        // Import vente depuis une autre boutique (lecture seule pour les rapports)
        const existing = queryOne(`SELECT id FROM ventes WHERE numero_ticket=?`, [d.numero_ticket])
        if (!existing && d.numero_ticket) {
          db.run(`INSERT OR IGNORE INTO ventes
            (numero_ticket, date, total, remise, montant_paye, monnaie_rendue,
             mode_paiement, caissier_id, client_id, statut, boutique_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [d.numero_ticket, d.date, d.total, d.remise ?? 0, d.montant_paye ?? 0,
             d.monnaie_rendue ?? 0, d.mode_paiement ?? 'especes',
             null, null, d.statut ?? 'completed', d.boutique_id ?? ch.boutique_id])
          applied++
        }
      } else if (ch.entity_type === 'produit' && ch.action === 'update') {
        // Sync prix uniquement (pas le stock)
        if (d.id && d.prix_vente !== undefined) {
          const local = queryOne(`SELECT updated_at FROM produits WHERE id=?`, [d.id])
          if (!local || !local.updated_at || local.updated_at < ch.created_at) {
            db.run(`UPDATE produits SET prix_vente=?, updated_at=? WHERE id=?`,
              [d.prix_vente, ch.created_at, d.id])
            applied++
          }
        }
      } else if (ch.entity_type === 'client') {
        if (d.id) {
          const local = queryOne(`SELECT updated_at, points_fidelite FROM clients WHERE id=?`, [d.id])
          if (local && (!local.updated_at || local.updated_at < ch.created_at)) {
            db.run(`UPDATE clients SET points_fidelite=?, solde_credit=?, updated_at=? WHERE id=?`,
              [d.points_fidelite ?? local.points_fidelite, d.solde_credit ?? 0, ch.created_at, d.id])
            applied++
          }
        }
      }
    } catch (e: any) { errors.push(e.message) }
  }
  saveDb()
  return { applied, errors }
}

export function markSyncedIds(ids: number[]) {
  if (!ids.length) return
  db.run(`UPDATE sync_journal SET synced=1 WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
  saveDb()
}

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 8 — MOBILE & CLOUD
// ─────────────────────────────────────────────────────────────────────────────

export function getDashboardProprietaireData() {
  const today = new Date().toISOString().slice(0, 10)
  const firstDayMonth = today.slice(0, 8) + '01'
  const d7 = new Date(); d7.setDate(d7.getDate() - 6)
  const sub7 = d7.toISOString().slice(0, 10)

  const statsDuJour = queryOne(`
    SELECT COALESCE(SUM(total),0) as ca, COUNT(*) as nb_ventes,
           COALESCE(AVG(total),0) as panier_moyen
    FROM ventes WHERE statut='completed' AND date(date)=?
  `, [today])

  const statsMois = queryOne(`
    SELECT COALESCE(SUM(total),0) as ca_mois, COUNT(*) as nb_ventes_mois
    FROM ventes WHERE statut='completed' AND date(date) >= ?
  `, [firstDayMonth])

  const chargesMois = queryOne(`
    SELECT COALESCE(SUM(montant),0) as charges_mois
    FROM charges WHERE date(date) >= ?
  `, [firstDayMonth])

  const topProduits = queryAll(`
    SELECT COALESCE(vl.nom_libre, p.nom) as nom, SUM(vl.quantite) as qte, SUM(vl.total_ligne) as ca
    FROM vente_lignes vl
    LEFT JOIN produits p ON vl.produit_id = p.id
    JOIN ventes v ON vl.vente_id = v.id
    WHERE v.statut='completed' AND date(v.date)=?
    GROUP BY COALESCE(vl.nom_libre, p.nom) ORDER BY ca DESC LIMIT 5
  `, [today])

  const stockBas = queryAll(`
    SELECT nom, stock_actuel, stock_minimum, unite
    FROM produits WHERE actif=1 AND stock_actuel <= stock_minimum
    ORDER BY (stock_actuel - stock_minimum) ASC LIMIT 5
  `, [])

  const ca7j = queryAll(`
    SELECT date(date) as jour, COALESCE(SUM(total),0) as ca
    FROM ventes WHERE statut='completed'
    AND date(date) >= date(?,-6,'days') AND date(date) <= ?
    GROUP BY date(date) ORDER BY jour
  `, [today, today])

  const modePaiement = queryAll(`
    SELECT mode as mode_paiement, COUNT(*) as nb, COALESCE(SUM(montant),0) as montant
    FROM (
      SELECT vp.mode as mode, vp.montant as montant
      FROM vente_paiements vp JOIN ventes v ON vp.vente_id = v.id
      WHERE v.statut='completed' AND date(v.date)=?
      UNION ALL
      SELECT v.mode_paiement as mode, v.total as montant
      FROM ventes v
      WHERE v.statut='completed' AND date(v.date)=?
        AND NOT EXISTS (SELECT 1 FROM vente_paiements vp WHERE vp.vente_id = v.id)
    )
    GROUP BY mode ORDER BY montant DESC
  `, [today, today])

  // Comparatif multi-boutiques (côté à côté) avec marge/taux — 7 jours pour plus de sens
  const boutiques = getStatsBoutiqueConsolidee(sub7, today)

  return {
    today,
    statsDuJour,
    statsMois,
    chargesMois,
    topProduits,
    stockBas,
    ca7j,
    modePaiement,
    boutiques
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 9 — CLIENT 360°
// ─────────────────────────────────────────────────────────────────────────────

export function getClientProfile(clientId: number) {
  const client = queryOne(`
    SELECT c.*, u.nom as user_create_nom
    FROM clients c
    LEFT JOIN users u ON c.id = u.id
    WHERE c.id = ?
  `, [clientId])
  if (!client) return null

  const stats = queryOne(`
    SELECT COUNT(*) as nb_achats, COALESCE(SUM(total),0) as ca_total,
           COALESCE(AVG(total),0) as panier_moyen,
           MIN(date) as premier_achat, MAX(date) as dernier_achat
    FROM ventes WHERE client_id=? AND statut='completed'
  `, [clientId])

  const achatsRecents = queryAll(`
    SELECT v.id, v.numero_ticket, v.date, v.total, v.mode_paiement, v.statut
    FROM ventes v WHERE v.client_id=? ORDER BY v.date DESC LIMIT 10
  `, [clientId])

  const topProduits = queryAll(`
    SELECT COALESCE(vl.nom_libre, p.nom) as nom, SUM(vl.quantite) as qte_total, SUM(vl.total_ligne) as depense
    FROM vente_lignes vl
    JOIN ventes v ON vl.vente_id=v.id
    LEFT JOIN produits p ON vl.produit_id=p.id
    WHERE v.client_id=? AND v.statut='completed'
    GROUP BY COALESCE(vl.nom_libre, p.nom) ORDER BY depense DESC LIMIT 5
  `, [clientId])

  const soldeCredit = queryOne(`SELECT COALESCE(solde_credit,0) as solde FROM clients WHERE id=?`, [clientId])
  const pointsFidelite = queryOne(`SELECT COALESCE(points_fidelite,0) as pts FROM clients WHERE id=?`, [clientId])
  const soldeWallet = queryOne(`SELECT COALESCE(solde_portefeuille,0) as solde FROM clients WHERE id=?`, [clientId])

  const campagnesRecues = queryAll(`
    SELECT nom, date_envoi, statut FROM campagnes_sms
    WHERE segment='tous' OR statut='envoye'
    ORDER BY date_envoi DESC LIMIT 5
  `, [])

  return {
    client,
    stats,
    achatsRecents,
    topProduits,
    soldeCredit: Number(soldeCredit?.solde ?? 0),
    pointsFidelite: Number(pointsFidelite?.pts ?? 0),
    soldeWallet: Number(soldeWallet?.solde ?? 0),
    campagnesRecues
  }
}

export function getDestinatairesSegment(segment: string): any[] {
  switch (segment) {
    case 'tous':
      return queryAll(`SELECT id, nom, telephone FROM clients WHERE actif=1 AND telephone IS NOT NULL AND telephone != '' ORDER BY nom`, [])
    case 'vip':
      return queryAll(`
        SELECT c.id, c.nom, c.telephone, COUNT(v.id) as nb_achats
        FROM clients c JOIN ventes v ON v.client_id=c.id
        WHERE c.actif=1 AND c.telephone IS NOT NULL AND c.telephone != '' AND v.statut='completed'
        GROUP BY c.id HAVING nb_achats >= 3
        ORDER BY nb_achats DESC
      `, [])
    case 'inactifs':
      return queryAll(`
        SELECT c.id, c.nom, c.telephone, MAX(v.date) as dernier_achat
        FROM clients c LEFT JOIN ventes v ON v.client_id=c.id AND v.statut='completed'
        WHERE c.actif=1 AND c.telephone IS NOT NULL AND c.telephone != ''
        GROUP BY c.id
        HAVING dernier_achat IS NULL OR dernier_achat < datetime('now','-30 days')
        ORDER BY dernier_achat ASC
      `, [])
    case 'fideles':
      return queryAll(`
        SELECT id, nom, telephone, points_fidelite
        FROM clients WHERE actif=1 AND telephone IS NOT NULL AND telephone != ''
        AND points_fidelite >= 100
        ORDER BY points_fidelite DESC
      `, [])
    case 'anniversaire_mois':
      return queryAll(`
        SELECT id, nom, telephone, date_naissance
        FROM clients WHERE actif=1 AND telephone IS NOT NULL AND telephone != ''
        AND date_naissance IS NOT NULL
        AND strftime('%m', date_naissance) = strftime('%m', 'now')
        ORDER BY strftime('%d', date_naissance)
      `, [])
    default:
      return []
  }
}

export function getAllCampagnes() {
  return queryAll(`
    SELECT cmp.*, u.nom as user_nom
    FROM campagnes_sms cmp
    LEFT JOIN users u ON cmp.user_id = u.id
    ORDER BY cmp.created_at DESC
  `, [])
}

export function createCampagne(data: {
  nom: string; segment: string; message_template: string
  date_programmee?: string; user_id?: number
}) {
  const dest = getDestinatairesSegment(data.segment)
  const { lastInsertRowid } = runWrite(`
    INSERT INTO campagnes_sms (nom, segment, message_template, date_programmee, nb_destinataires, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [data.nom, data.segment, data.message_template, data.date_programmee ?? null, dest.length, data.user_id ?? null])
  return { id: lastInsertRowid, nb_destinataires: dest.length }
}

export function deleteCampagne(id: number) {
  return runWrite('DELETE FROM campagnes_sms WHERE id = ?', [id])
}

export function marquerCampagneEnvoyee(id: number, nbEnvoyes: number, nbEchecs: number) {
  return runWrite(`
    UPDATE campagnes_sms SET statut='envoye', date_envoi=datetime('now'),
    nb_envoyes=?, nb_echecs=? WHERE id=?
  `, [nbEnvoyes, nbEchecs, id])
}

export function checkAnniversairesAujourdhui() {
  return queryAll(`
    SELECT id, nom, telephone, date_naissance
    FROM clients
    WHERE actif=1 AND telephone IS NOT NULL AND telephone != ''
    AND date_naissance IS NOT NULL
    AND strftime('%m-%d', date_naissance) = strftime('%m-%d', 'now')
  `, [])
}

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 10 — FINANCE PRO
// ─────────────────────────────────────────────────────────────────────────────

function generateFactureNumber(): string {
  const now = new Date()
  const yr = now.getFullYear()
  const seq = (queryOne(`SELECT COUNT(*) as c FROM factures WHERE strftime('%Y',created_at)=?`, [String(yr)])?.c ?? 0)
  return `FAC-${yr}-${String(Number(seq) + 1).padStart(5, '0')}`
}

export function getAllFactures(statut?: string) {
  let q = `
    SELECT f.*, c.telephone as client_tel, u.nom as user_nom
    FROM factures f
    LEFT JOIN clients c ON f.client_id = c.id
    LEFT JOIN users u ON f.user_id = u.id
    WHERE 1=1
  `
  const params: any[] = []
  if (statut) { q += ' AND f.statut = ?'; params.push(statut) }
  q += ' ORDER BY f.created_at DESC LIMIT 200'
  return queryAll(q, params)
}

export function getFactureById(id: number) {
  const facture = queryOne(`
    SELECT f.*, c.telephone as client_tel, u.nom as user_nom
    FROM factures f LEFT JOIN clients c ON f.client_id=c.id
    LEFT JOIN users u ON f.user_id=u.id WHERE f.id=?
  `, [id])
  if (!facture) return null
  const lignes = queryAll('SELECT * FROM facture_lignes WHERE facture_id=? ORDER BY id', [id])
  return { ...facture, lignes }
}

export function createFacture(data: {
  vente_id?: number
  client_id?: number
  client_nom?: string
  client_nif?: string
  client_rccm?: string
  client_adresse?: string
  tva_taux?: number
  date_echeance?: string
  notes?: string
  user_id?: number
  lignes: { designation: string; quantite: number; prix_unitaire_ht: number; tva_taux?: number }[]
}) {
  const tvaTaux = data.tva_taux ?? 18
  const numero = generateFactureNumber()

  let montantHT = 0
  let tvaMontant = 0
  for (const l of data.lignes) {
    const ht = l.quantite * l.prix_unitaire_ht
    const tva = ht * ((l.tva_taux ?? tvaTaux) / 100)
    montantHT += ht
    tvaMontant += tva
  }
  const montantTTC = montantHT + tvaMontant

  const { lastInsertRowid: factureId } = runWrite(`
    INSERT INTO factures (numero, vente_id, client_id, client_nom, client_nif, client_rccm,
      client_adresse, montant_ht, tva_taux, tva_montant, montant_ttc, date_echeance, notes, user_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `, [numero, data.vente_id ?? null, data.client_id ?? null, data.client_nom ?? null,
      data.client_nif ?? null, data.client_rccm ?? null, data.client_adresse ?? null,
      montantHT, tvaTaux, tvaMontant, montantTTC,
      data.date_echeance ?? null, data.notes ?? null, data.user_id ?? null])

  for (const l of data.lignes) {
    const ht = l.quantite * l.prix_unitaire_ht
    const taux = l.tva_taux ?? tvaTaux
    const ttc = ht * (1 + taux / 100)
    db.run(`INSERT INTO facture_lignes (facture_id, designation, quantite, prix_unitaire_ht, tva_taux, total_ht, total_ttc)
            VALUES (?,?,?,?,?,?,?)`,
      [factureId, l.designation, l.quantite, l.prix_unitaire_ht, taux, ht, ttc])
  }
  saveDb()
  return { factureId, numero, montantTTC }
}

export function updateFactureStatut(id: number, statut: string) {
  return runWrite('UPDATE factures SET statut=? WHERE id=?', [statut, id])
}

export function getCompteResultat(annee: number, mois?: number) {
  const debut = mois
    ? `${annee}-${String(mois).padStart(2, '0')}-01`
    : `${annee}-01-01`
  const fin = mois
    ? new Date(annee, mois, 0).toISOString().slice(0, 10)
    : `${annee}-12-31`

  const params = getAllParametres()
  const tvaTaux = parseFloat(params.tva_taux ?? '0') / 100

  const venteData = queryOne(`
    SELECT COALESCE(SUM(total),0) as ca_ttc, COUNT(*) as nb_ventes
    FROM ventes WHERE statut='completed' AND date(date) >= ? AND date(date) <= ?
  `, [debut, fin])

  const caTTC = Number(venteData?.ca_ttc ?? 0)
  const caHT = tvaTaux > 0 ? caTTC / (1 + tvaTaux) : caTTC
  const tvaCollectee = caTTC - caHT

  const chargesData = queryOne(`
    SELECT COALESCE(SUM(montant),0) as total_charges
    FROM charges WHERE date(date) >= ? AND date(date) <= ?
  `, [debut, fin])
  const totalCharges = Number(chargesData?.total_charges ?? 0)

  const achatsData = queryOne(`
    SELECT COALESCE(SUM(cl.quantite_recue * cl.prix_unitaire),0) as total_achats
    FROM commandes_lignes cl
    JOIN commandes_fournisseur c ON cl.commande_id = c.id
    WHERE c.statut IN ('recu','partiel') AND date(c.date_commande) >= ? AND date(c.date_commande) <= ?
  `, [debut, fin])
  const totalAchats = Number(achatsData?.total_achats ?? 0)

  const chargesParCategorie = queryAll(`
    SELECT categorie, COALESCE(SUM(montant),0) as montant
    FROM charges WHERE date(date) >= ? AND date(date) <= ?
    GROUP BY categorie ORDER BY montant DESC
  `, [debut, fin])

  const ventesParJour = queryAll(`
    SELECT date(date) as jour, SUM(total) as ca
    FROM ventes WHERE statut='completed' AND date(date) >= ? AND date(date) <= ?
    GROUP BY date(date) ORDER BY jour
  `, [debut, fin])

  const resultatNet = caHT - totalAchats - totalCharges

  return {
    periode: { debut, fin, annee, mois },
    chiffreAffaires: { ttc: caTTC, ht: caHT, tva_collectee: tvaCollectee, nb_ventes: Number(venteData?.nb_ventes ?? 0) },
    charges: { achats_marchandises: totalAchats, charges_courantes: totalCharges, total: totalAchats + totalCharges, detail: chargesParCategorie },
    resultatNet,
    margeNette: caHT > 0 ? (resultatNet / caHT) * 100 : 0,
    ventesParJour
  }
}

// ─── JOURNAL D'AUDIT ─────────────────────────────────────────────────────────

let _currentAuditUser: { id: number; nom: string } | null = null

export function setAuditUser(user: { id: number; nom: string } | null) {
  _currentAuditUser = user
}

export function getAuditUser() {
  return _currentAuditUser
}

export function logAudit(data: {
  user_id?: number
  user_nom?: string
  action: string
  entite: string
  entite_id?: number
  details?: any
}) {
  const uid = data.user_id ?? _currentAuditUser?.id ?? null
  const uname = data.user_nom ?? _currentAuditUser?.nom ?? null
  const detailsStr = data.details ? JSON.stringify(data.details) : null
  runWrite(
    `INSERT INTO audit_log (user_id, user_nom, action, entite, entite_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
    [uid, uname, data.action, data.entite, data.entite_id ?? null, detailsStr]
  )
}

export function getAuditLog(dateDebut?: string, dateFin?: string, entite?: string, limit = 500) {
  const where: string[] = []
  const params: any[] = []
  if (dateDebut) { where.push('date(date_heure) >= ?'); params.push(dateDebut) }
  if (dateFin) { where.push('date(date_heure) <= ?'); params.push(dateFin) }
  if (entite) { where.push('entite = ?'); params.push(entite) }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : ''
  return queryAll(
    `SELECT * FROM audit_log ${clause} ORDER BY date_heure DESC LIMIT ?`,
    [...params, limit]
  )
}

// ─── RAPPORT TVA ──────────────────────────────────────────────────────────────
// période. Chaque ligne de vente (vente_lignes) est un montant TTC. Le taux
// effectif d'un article est son taux par produit (produits.taux_tva) si celui-ci
// est appliqué (tva_applicable=1) ; sinon on retombe sur le taux global
// paramètre (params.tva_taux), cohérent avec le mode de calcul du compte de
// résultat. Les ventes annulées / remboursées sont exclues.
export function getRapportTVA(dateDebut?: string, dateFin?: string) {
  const where: string[] = ["v.statut = 'completed'"]
  const params: any[] = []
  if (dateDebut) { where.push('date(v.date) >= ?'); params.push(dateDebut) }
  if (dateFin) { where.push('date(v.date) <= ?'); params.push(dateFin) }

  const paramsGlobaux = getAllParametres()
  const tauxGlobal = parseFloat(paramsGlobaux.tva_taux ?? '0')

  const rows = queryAll(`
    SELECT
      CASE
        WHEN p.tva_applicable = 1 AND COALESCE(p.taux_tva, 0) > 0 THEN p.taux_tva
        WHEN p.id IS NULL THEN 0
        ELSE ${tauxGlobal}
      END AS taux_effectif,
      COUNT(DISTINCT vl.id) AS nb_lignes,
      COUNT(DISTINCT v.id) AS nb_ventes,
      SUM(vl.total_ligne) AS total_ttc
    FROM vente_lignes vl
    JOIN ventes v ON vl.vente_id = v.id
    LEFT JOIN produits p ON vl.produit_id = p.id
    WHERE ${where.join(' AND ')}
    GROUP BY taux_effectif
    ORDER BY taux_effectif
  `, params)

  // Nombre de tickets distincts sur la période
  const nbTickets = queryOne(`
    SELECT COUNT(*) AS n FROM ventes v
    WHERE ${where.join(' AND ')}
  `, params)?.n ?? 0

  let totalHT = 0
  let totalTVA = 0
  let totalTTC = 0
  const parTaux = rows.map((r: any) => {
    const taux = Number(r.taux_effectif ?? 0)
    const ttc = Number(r.total_ttc ?? 0)
    const tva = taux > 0 ? ttc - (ttc / (1 + taux / 100)) : 0
    const ht = ttc - tva
    totalHT += ht
    totalTVA += tva
    totalTTC += ttc
    return {
      taux,
      nb_lignes: Number(r.nb_lignes ?? 0),
      base_ht: Math.round(ht * 100) / 100,
      tva: Math.round(tva * 100) / 100,
      total_ttc: Math.round(ttc * 100) / 100
    }
  })

  return {
    periode: { debut: dateDebut ?? null, fin: dateFin ?? null },
    taux_global: tauxGlobal,
    nb_ventes: Number(nbTickets),
    parTaux,
    totaux: {
      base_ht: Math.round(totalHT * 100) / 100,
      tva: Math.round(totalTVA * 100) / 100,
      total_ttc: Math.round(totalTTC * 100) / 100
    }
  }
}
