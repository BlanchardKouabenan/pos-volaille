import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'

// Supprime les erreurs de cache GPU inoffensives
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('disable-gpu-program-cache')
app.commandLine.appendSwitch('no-sandbox')
import { initDatabase, loginUser, getAllUsers, createUser, updateUser, deleteUser,
  getAllCategories, createCategorie, updateCategorie,
  getAllProduits, getProduitByBarcode, createProduit, updateProduit, deleteProduit, getLowStockProduits,
  addMouvement, getMouvements,
  createVente, getVentes, getVenteById, getVenteStats,
  getAllClients, createClient, updateClient, deleteClient, getClientVentes,
  getPrixClients, getPrixClient, setPrixClient, setPrixClientsBulk,
  getAllParametres, setParametre, setParametres,
  getAlertes, marquerAlerteLue,
  ouvrirSessionCaisse, getSessionCaisseOuverte, cloturerSessionCaisse, getSessionsCaisse,
  logTiroir, getTiroirLog,
  createMouvementCaisse, getMouvementsCaisse, getMouvementsCaisseParSession,
  getAllCharges, createCharge, updateCharge, deleteCharge, getChargesStats,
  verifieCodeSuperviseur, getCodesSuperviseur, createCodeSuperviseur, updateCodeSuperviseur,
  getStatsDuJour,
  logConnexion, getConnexionsLog, getEtatComplet,
  getProduitsExpirant, getProduitsExpires, getPortsCOM,
  getAllFournisseurs, createFournisseur, updateFournisseur, deleteFournisseur,
  getAllCommandes, getCommandeById, createCommande, updateCommandeStatut, recevoirCommande, deleteCommande,
  getAllInventaires, getInventaireById, createInventaire, updateInventaireLigne, updateInventaireJustification, cloturerInventaire,
  getAllPromotions, createPromotion, updatePromotion, deletePromotion, getPromosPourProduit,
  createBackup, listBackups, deleteBackup, restoreBackup, setBackupDir, getBackupDirPath, purgeOldBackups, monthlyBackupExists,
  getClientSolde, getHistoriqueArdoise, vendreACredit, rembourserCredit, getClientsAvecCredit,
  getFideliteRegle, setFideliteRegle, ajouterPoints, utiliserPoints, getHistoriqueFidelite,
  crediterPortefeuille, debiterPortefeuille, getHistoriquePortefeuille,
  getAllDevis, getDevisById, createDevis, updateDevisStatut, deleteDevis, transformerDevisEnVente,
  getDashboardCommercial,
  genererCodeRotation, getCurrentCodeRotationInfo, verifieCodeRotation,
  getVenteByTicket, creerRetour, getRetours,
  getAnalyticsDashboard, getAnalyticsComparaison,
  getAllBoutiques, createBoutique, updateBoutique, deleteBoutique, getStatsBoutiqueConsolidee,
  getAlertesRegles, updateAlerteRegle, runAlertesAuto,
  importProduits, importClients,
  exportProduitsList, exportVentesList, exportClientsList, getImportLog,
  getAllEntrepots, createEntrepot, updateEntrepot, deleteEntrepot, getStockParEntrepot,
  getAllTransferts, getTransfertById, createTransfert, validerTransfert, annulerTransfert,
  getPrixAchatHistorique, getPrixAchatStatsProduits, getCommandePdfData,
  getSyncJournal, getSyncPeers, createSyncPeer, deleteSyncPeer, updateSyncPeerLastSync, applySyncChanges, markSyncedIds,
  getDashboardProprietaireData,
  getClientProfile, getDestinatairesSegment, getAllCampagnes, createCampagne, deleteCampagne,
  marquerCampagneEnvoyee, checkAnniversairesAujourdhui,
  getAllFactures, getFactureById, createFacture, updateFactureStatut, getCompteResultat,
  getProfileCommerce, listProfils, applyProfileCommerce,
  listAttributs, listAttributsActifs, getAttributsProduit, setAttributsProduit, getAttributionsTousProduits,
  getVariantesProduit, setVariantesProduit,
  nbSessionsOuvertes, getEmailsJournal
} from './database'
import http from 'http'
import { printReceipt, generateReceiptText, openCashDrawer, buildPrinterInterface } from './printer'
import { sendSms, formatSmsTicket } from './sms'
import { envoyerFondCaisseCloture, envoyerPointVenteHoraire, envoyerControleReleve, envoyerAlerteForfait, envoyerTestEmail, envoyerResumeJournalier, envoyerEtatInventaire, envoyerAlertesStock } from './reports'
import { getForfaitInfo, prolongerForfaitLocal, appliquerLicence, genererLicence } from './license'

// ─── MISE À JOUR AUTOMATIQUE ──────────────────────────────────────────────────
import { autoUpdater } from 'electron-updater'
import { EventEmitter } from 'events'

const updaterEvents = new EventEmitter()

function sendUpdateStatus(state: string, info?: any, progress?: number) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('app:updateStatus', { state, info, progress })
  }
  updaterEvents.emit('status', { state, info, progress })
}

function setUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'))
  autoUpdater.on('update-available', (info) => sendUpdateStatus('available', info))
  autoUpdater.on('update-not-available', (info) => sendUpdateStatus('not-available', info))
  autoUpdater.on('download-progress', (p) => sendUpdateStatus('downloading', undefined, p.percent))
  autoUpdater.on('update-downloaded', (info) => sendUpdateStatus('downloaded', info))
  autoUpdater.on('error', (err) => {
    console.error('Auto-update error:', err)
    sendUpdateStatus('error', err.message)
  })
}

let updatesConfigured = false
function configureUpdater() {
  if (updatesConfigured) return
  updatesConfigured = true
  setUpdater()
  try { autoUpdater.checkForUpdatesAndNotify() } catch (e) { console.error(e) }
}

let mainWindow: BrowserWindow | null = null
let customerWindow: BrowserWindow | null = null
let syncHttpServer: http.Server | null = null

function createCustomerWindow() {
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.show(); customerWindow.focus(); return
  }
  const displays = require('electron').screen.getAllDisplays()
  const external = displays.find((d: any) => d.id !== require('electron').screen.getPrimaryDisplay().id)
  customerWindow = new BrowserWindow({
    width: external?.bounds.width ?? 1280,
    height: external?.bounds.height ?? 800,
    x: external?.bounds.x ?? 0,
    y: external?.bounds.y ?? 0,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    title: 'Écran Client',
    frame: true,
    fullscreen: !!external,
    backgroundColor: '#065f46',
    show: false
  })
  const baseUrl = process.env.VITE_DEV_SERVER_URL
    ? `${process.env.VITE_DEV_SERVER_URL}?mode=customer`
    : `file://${path.join(__dirname, '../dist/index.html')}?mode=customer`
  customerWindow.loadURL(baseUrl)
  customerWindow.once('ready-to-show', () => customerWindow?.show())
  customerWindow.on('closed', () => { customerWindow = null })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    title: 'KB POS',
    backgroundColor: '#f3f4f6',
    show: false
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ─── AUTO-BACKUP SCHEDULER ────────────────────────────────────────────────────
let autoBackupInterval: NodeJS.Timeout | null = null

function startAutoBackup() {
  if (autoBackupInterval) clearInterval(autoBackupInterval)
  const params = getAllParametres()
  const hourlyOn = params.backup_auto === '1'
  const monthlyOn = params.backup_mensuel !== '0'
  if (!hourlyOn && !monthlyOn) return

  const run = () => {
    try {
      const p = getAllParametres()
      if (p.backup_dir) setBackupDir(p.backup_dir)
      // Sauvegarde à intervalle régulier (heures) si activée
      if (p.backup_auto === '1') {
        const result = createBackup('auto')
        if (result.success) {
          const maxDays = parseInt(p.backup_max_count || '30', 10)
          if (maxDays > 0) purgeOldBackups(maxDays)
        }
      }
      // Sauvegarde mensuelle automatique : une par mois (label "mensuel", conservées à vie)
      if (p.backup_mensuel !== '0' && !monthlyBackupExists()) {
        createBackup('mensuel')
      }
    } catch {}
  }
  run()
  const intervalH = hourlyOn ? Math.max(1, parseInt(params.backup_interval_h || '24', 10)) : 12
  autoBackupInterval = setInterval(run, intervalH * 60 * 60 * 1000)
}

// ─── EMAIL SCHEDULER (point de vente horaire) ─────────────────────────────────
let emailHourlyInterval: NodeJS.Timeout | null = null

function startEmailScheduler() {
  if (emailHourlyInterval) { clearInterval(emailHourlyInterval); emailHourlyInterval = null }
  // Vérifie toutes les minutes ; envoie si l'heure a changé et que l'envoi est activé
  let lastSentMinute = -1
  emailHourlyInterval = setInterval(() => {
    const now = new Date()
    if (now.getMinutes() !== 0) { lastSentMinute = -1; return }
    if (now.getMinutes() === lastSentMinute) return
    lastSentMinute = now.getMinutes()
    try {
      const p = getAllParametres()
      if (p.auto_envoi_horaire === '1') envoyerPointVenteHoraire().catch(() => {})
      if (p.auto_envoi_stock === '1') envoyerAlertesStock().catch(() => {})
    } catch {}
  }, 60 * 1000)
  // Vérification de l'alerte forfait (J-5 / jour J) chaque heure
  envoyerAlerteForfait().catch(() => {})
  if (forfaitAlertInterval) clearInterval(forfaitAlertInterval)
  forfaitAlertInterval = setInterval(() => {
    envoyerAlerteForfait().catch(() => {})
  }, 60 * 60 * 1000)
  // Alerte stock minimum au démarrage (1 mail / jour max)
  envoyerAlertesStock().catch(() => {})
}

let forfaitAlertInterval: NodeJS.Timeout | null = null


app.whenReady().then(async () => {
  await initDatabase()
  // Initialiser le dossier backup selon params
  const params = getAllParametres()
  if (params.backup_dir) setBackupDir(params.backup_dir)
  startAutoBackup()
  startEmailScheduler()
  // Lancer la vérification automatique des alertes au démarrage
  try { runAlertesAuto() } catch {}
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  // Vérifier les mises à jour au démarrage (uniquement en app installée/packagée)
  if (app.isPackaged) {
    setTimeout(() => { try { configureUpdater() } catch {} }, 4000)
  }
})

app.on('window-all-closed', () => {
  if (syncHttpServer) syncHttpServer.close()
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC HANDLERS ─────────────────────────────────────────────────────────────

// Auth
ipcMain.handle('db:login', (_e, username, password) => loginUser(username, password))

// Users
ipcMain.handle('db:getUsers', () => getAllUsers())
ipcMain.handle('db:createUser', (_e, data) => createUser(data))
ipcMain.handle('db:updateUser', (_e, id, data) => updateUser(id, data))
ipcMain.handle('db:deleteUser', (_e, id) => deleteUser(id))

// Categories
ipcMain.handle('db:getCategories', () => getAllCategories())
ipcMain.handle('db:createCategorie', (_e, data) => createCategorie(data))
ipcMain.handle('db:updateCategorie', (_e, id, data) => updateCategorie(id, data))

// Produits
ipcMain.handle('db:getProduits', (_e, categorieId, search) => getAllProduits(categorieId, search))
ipcMain.handle('db:getProduitByBarcode', (_e, code) => getProduitByBarcode(code))
ipcMain.handle('db:createProduit', (_e, data) => createProduit(data))
ipcMain.handle('db:updateProduit', (_e, id, data) => updateProduit(id, data))
ipcMain.handle('db:deleteProduit', (_e, id) => deleteProduit(id))
ipcMain.handle('db:getLowStockProduits', () => getLowStockProduits())

// Stock
ipcMain.handle('db:addMouvement', (_e, data) => addMouvement(data))
ipcMain.handle('db:getMouvements', (_e, produitId, limit) => getMouvements(produitId, limit))

// Ventes
ipcMain.handle('db:createVente', (_e, data) => createVente(data))
ipcMain.handle('db:getVentes', (_e, dateDebut, dateFin, limit) => getVentes(dateDebut, dateFin, limit))
ipcMain.handle('db:getVenteById', (_e, id) => getVenteById(id))
ipcMain.handle('db:getVenteStats', (_e, dateDebut, dateFin) => getVenteStats(dateDebut, dateFin))

// Clients
ipcMain.handle('db:getClients', () => getAllClients())
ipcMain.handle('db:createClient', (_e, data) => createClient(data))
ipcMain.handle('db:updateClient', (_e, id, data) => updateClient(id, data))
ipcMain.handle('db:deleteClient', (_e, id) => deleteClient(id))
ipcMain.handle('db:getClientVentes', (_e, clientId) => getClientVentes(clientId))
ipcMain.handle('db:getPrixClients', (_e, clientId) => getPrixClients(clientId))
ipcMain.handle('db:getPrixClient', (_e, clientId, produitId) => getPrixClient(clientId, produitId))
ipcMain.handle('db:setPrixClient', (_e, clientId, produitId, prix) => setPrixClient(clientId, produitId, prix))
ipcMain.handle('db:setPrixClientsBulk', (_e, clientId, items) => setPrixClientsBulk(clientId, items))

// Parametres
ipcMain.handle('db:getParametres', () => getAllParametres())
  ipcMain.handle('db:setParametre', (_e, cle, valeur) => setParametre(cle, valeur))
  ipcMain.handle('db:setParametres', (_e, params) => setParametres(params))

  // Type de commerce (profil paramétrable)
  ipcMain.handle('profile:get', () => getProfileCommerce())
  ipcMain.handle('profile:list', () => listProfils())
  ipcMain.handle('profile:apply', (_e, id: string, opts?: { remplacerCatalogue?: boolean }) => applyProfileCommerce(id, opts))

  // Attributs / variantes
  ipcMain.handle('attributs:list', (_e, actifsSeulement?: boolean) => actifsSeulement ? listAttributsActifs() : listAttributs())
  ipcMain.handle('attributs:byProduit', (_e, produitId: number) => getAttributsProduit(produitId))
  ipcMain.handle('attributs:allProduits', () => getAttributionsTousProduits())
  ipcMain.handle('attributs:setProduit', (_e, produitId: number, attributions: { attribut_id: number; valeur_id: number | null }[]) => setAttributsProduit(produitId, attributions))
  ipcMain.handle('variantes:list', (_e, produitId: number) => getVariantesProduit(produitId))
  ipcMain.handle('variantes:set', (_e, produitId: number, combos: { combinaison: Record<number, number>; stock: number; prix_vente?: number | null; prix_achat?: number | null; sku?: string | null }[]) => setVariantesProduit(produitId, combos))

// Alertes
ipcMain.handle('db:getAlertes', (_e, lu) => getAlertes(lu))
ipcMain.handle('db:marquerAlerteLue', (_e, id) => marquerAlerteLue(id))

// Printer
function printerConfig() {
  const params = getAllParametres()
  return { type: params.printer_type || 'EPSON', interface: buildPrinterInterface(params) }
}

ipcMain.handle('printer:print', async (_e, data) => {
  const params = getAllParametres()
  return printReceipt({ ...data, nom_entreprise: params.nom_entreprise, adresse: params.adresse, telephone: params.telephone, header: params.receipt_header, footer: params.receipt_footer, monnaie: params.monnaie }, printerConfig())
})

ipcMain.handle('printer:getReceiptText', (_e, data) => {
  const params = getAllParametres()
  return generateReceiptText({ ...data, nom_entreprise: params.nom_entreprise, adresse: params.adresse, telephone: params.telephone, header: params.receipt_header, footer: params.receipt_footer, monnaie: params.monnaie })
})

// Ticket de test d'impression
ipcMain.handle('printer:test', async () => {
  const params = getAllParametres()
  const config = printerConfig()
  const r = await printReceipt({
    ticket: 'TEST',
    date: new Date().toLocaleString('fr-FR'),
    caissier: 'Test',
    lignes: [{ nom: 'Ticket de test KB POS', quantite: 1, prix_unitaire: 0, total_ligne: 0, unite: '' }],
    total: 0,
    remise: 0,
    montant_paye: 0,
    monnaie_rendue: 0,
    mode_paiement: 'especes'
  } as any, config)
  return { success: r.success, error: r.error, interface_utilisee: config.interface }
})

// Liste des imprimantes installées sur Windows (winspool) via PowerShell
ipcMain.handle('imprimantes:list', () => {
  try {
    const { execSync } = require('child_process') as typeof import('child_process')
    const out = execSync(
      'powershell -NoProfile -Command "Get-Printer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name"',
      { timeout: 8000, windowsHide: true, encoding: 'utf8' }
    )
    const names = String(out).split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    const THERMAL_RE = /(TM[-\s]?T[\dIVX]+|T(?:20|88|70)\d*|6000|\bthermal\b|receipt|esc[- ]?pos|80mm)/i
    return names.map(name => ({ name, thermal: THERMAL_RE.test(name) }))
  } catch (err: any) {
    console.log('[Imprimantes] Énumération échouée:', err.message)
    return []
  }
})

// ─── SESSIONS CAISSE ──────────────────────────────────────────────────────────
ipcMain.handle('db:ouvrirSession', (_e, userId, fondCaisse) => ouvrirSessionCaisse(userId, fondCaisse))
ipcMain.handle('db:getSessionOuverte', (_e, userId) => getSessionCaisseOuverte(userId))
ipcMain.handle('db:cloturerSession', async (_e, sessionId, montantFinal) => {
  const result = cloturerSessionCaisse(sessionId, montantFinal)
  // Envoi du fond de caisse par mail (configurable)
  try {
    const p = getAllParametres()
    if (p.auto_envoi_fond_caisse === '1') {
      envoyerFondCaisseCloture(sessionId).catch(() => {})
    }
    // Résumé journalier : quand la dernière caisse du jour est clôturée
    if (p.auto_envoi_journalier === '1' && nbSessionsOuvertes() === 0) {
      envoyerResumeJournalier().catch(() => {})
    }
  } catch {}
  return result
})
ipcMain.handle('db:getSessionsCaisse', (_e, dateDebut, dateFin) => getSessionsCaisse(dateDebut, dateFin))

// ─── TIROIR ───────────────────────────────────────────────────────────────────
ipcMain.handle('tiroir:ouvrir', async (_e, data) => {
  try {
    await openCashDrawer(printerConfig())
    return logTiroir(data)
  } catch (err: any) {
    // Même si l'imprimante ne répond pas, on log quand même
    try { return logTiroir(data) } catch {}
    return { success: false, error: err.message }
  }
})
ipcMain.handle('db:getTiroirLog', (_e, dateDebut, dateFin) => getTiroirLog(dateDebut, dateFin))

// ─── MOUVEMENTS DE CAISSE ──────────────────────────────────────────────────────
ipcMain.handle('db:createMouvementCaisse', (_e, data) => createMouvementCaisse(data))
ipcMain.handle('db:getMouvementsCaisse', (_e, dateDebut, dateFin) => getMouvementsCaisse(dateDebut, dateFin))
ipcMain.handle('db:getMouvementsCaisseParSession', (_e, sessionId) => getMouvementsCaisseParSession(sessionId))

// ─── CHARGES ──────────────────────────────────────────────────────────────────
ipcMain.handle('db:getCharges', (_e, dateDebut, dateFin) => getAllCharges(dateDebut, dateFin))
ipcMain.handle('db:createCharge', (_e, data) => createCharge(data))
ipcMain.handle('db:updateCharge', (_e, id, data) => updateCharge(id, data))
ipcMain.handle('db:deleteCharge', (_e, id) => deleteCharge(id))
ipcMain.handle('db:getChargesStats', (_e, dateDebut, dateFin) => getChargesStats(dateDebut, dateFin))

// ─── CODES SUPERVISEUR ────────────────────────────────────────────────────────
ipcMain.handle('db:verifieCodeSuperviseur', (_e, code) => verifieCodeSuperviseur(code))
ipcMain.handle('db:getCodesSuperviseur', () => getCodesSuperviseur())
ipcMain.handle('db:createCodeSuperviseur', (_e, code, userId) => createCodeSuperviseur(code, userId))
ipcMain.handle('db:updateCodeSuperviseur', (_e, id, data) => updateCodeSuperviseur(id, data))

// ─── STATS TEMPS RÉEL ─────────────────────────────────────────────────────────
ipcMain.handle('db:getStatsDuJour', () => getStatsDuJour())

// ─── CONNEXIONS LOG ───────────────────────────────────────────────────────────
ipcMain.handle('db:logConnexion', (_e, data) => logConnexion(data))
ipcMain.handle('db:getConnexionsLog', (_e, dateDebut, dateFin) => getConnexionsLog(dateDebut, dateFin))

// ─── ÉTATS COMPLETS ───────────────────────────────────────────────────────────
ipcMain.handle('db:getEtatComplet', (_e, dateDebut, dateFin) => getEtatComplet(dateDebut, dateFin))

// ─── PÉREMPTION ───────────────────────────────────────────────────────────────
ipcMain.handle('db:getProduitsExpirant', (_e, jours) => getProduitsExpirant(jours))
ipcMain.handle('db:getProduitsExpires', () => getProduitsExpires())

// ─── BALANCE / PORTS COM ──────────────────────────────────────────────────────
ipcMain.handle('balance:getPortsCOM', () => getPortsCOM())

// Lecture balance série (polling simple)
let balancePort: any = null
ipcMain.handle('balance:connect', async (_e, port: string, baudRate: number) => {
  try {
    // Tentative d'ouverture via child_process (lecture non-bloquante)
    balancePort = { port, baudRate, connected: true }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})
ipcMain.handle('balance:disconnect', () => {
  balancePort = null
  return { success: true }
})
ipcMain.handle('balance:isConnected', () => !!balancePort)

// ─── FOURNISSEURS ─────────────────────────────────────────────────────────────
ipcMain.handle('db:getFournisseurs', () => getAllFournisseurs())
ipcMain.handle('db:createFournisseur', (_e, data) => createFournisseur(data))
ipcMain.handle('db:updateFournisseur', (_e, id, data) => updateFournisseur(id, data))
ipcMain.handle('db:deleteFournisseur', (_e, id) => deleteFournisseur(id))

// ─── COMMANDES FOURNISSEUR ────────────────────────────────────────────────────
ipcMain.handle('db:getCommandes', (_e, fournisseurId) => getAllCommandes(fournisseurId))
ipcMain.handle('db:getCommandeById', (_e, id) => getCommandeById(id))
ipcMain.handle('db:createCommande', (_e, data) => createCommande(data))
ipcMain.handle('db:updateCommandeStatut', (_e, id, statut) => updateCommandeStatut(id, statut))
ipcMain.handle('db:recevoirCommande', (_e, id, receptions, userId) => recevoirCommande(id, receptions, userId))
ipcMain.handle('db:deleteCommande', (_e, id) => deleteCommande(id))

// ─── INVENTAIRE ───────────────────────────────────────────────────────────────
ipcMain.handle('db:getInventaires', () => getAllInventaires())
ipcMain.handle('db:getInventaireById', (_e, id) => getInventaireById(id))
ipcMain.handle('db:createInventaire', (_e, data) => createInventaire(data))
ipcMain.handle('db:updateInventaireLigne', (_e, invId, prodId, stockCompte) => updateInventaireLigne(invId, prodId, stockCompte))
ipcMain.handle('db:updateInventaireJustification', (_e, invId, prodId, justification) => updateInventaireJustification(invId, prodId, justification))
ipcMain.handle('db:cloturerInventaire', async (_e, id, userId) => {
  const result = cloturerInventaire(id, userId)
  // État d'inventaire par mail (configurable)
  if (result?.success) {
    try {
      const p = getAllParametres()
      if (p.auto_envoi_inventaire === '1') envoyerEtatInventaire(id).catch(() => {})
    } catch {}
  }
  return result
})

// ─── PROMOTIONS ───────────────────────────────────────────────────────────────
ipcMain.handle('db:getPromotions', () => getAllPromotions())
ipcMain.handle('db:createPromotion', (_e, data) => createPromotion(data))
ipcMain.handle('db:updatePromotion', (_e, id, data) => updatePromotion(id, data))
ipcMain.handle('db:deletePromotion', (_e, id) => deletePromotion(id))
ipcMain.handle('db:getPromosPourProduit', (_e, produitId, categorieId, quantite, date) =>
  getPromosPourProduit(produitId, categorieId, quantite, date))

// ─── BACKUP ───────────────────────────────────────────────────────────────────
ipcMain.handle('backup:create', (_e, label?: string) => {
  const params = getAllParametres()
  if (params.backup_dir) setBackupDir(params.backup_dir)
  return createBackup(label)
})
ipcMain.handle('backup:list', () => listBackups())
ipcMain.handle('backup:delete', (_e, filename: string) => deleteBackup(filename))
ipcMain.handle('backup:getDir', () => getBackupDirPath())
ipcMain.handle('backup:browseDir', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.filePaths[0] ?? null
})
ipcMain.handle('backup:setDir', (_e, dir: string) => {
  setBackupDir(dir)
  return { success: true }
})
ipcMain.handle('backup:restore', (_e, filename: string) => {
  const result = restoreBackup(filename)
  if (result.success && result.requiresRestart) {
    // Redémarrer l'app pour recharger la DB restaurée
    setTimeout(() => { app.relaunch(); app.quit() }, 1500)
  }
  return result
})
ipcMain.handle('backup:restartScheduler', () => {
  startAutoBackup()
  return { success: true }
})

// ─── EMAIL (envoi du fond de caisse / point de vente) ─────────────────────────
ipcMain.handle('email:restartScheduler', () => {
  startEmailScheduler()
  return { success: true }
})
ipcMain.handle('email:testFondCaisse', async () => {
  const sess = getAllParametres()
  // envoi de test version horaire sur les destinataires configurés
  return envoyerPointVenteHoraire()
})
ipcMain.handle('email:envoyerFondCaisse', async (_e, sessionId) => envoyerFondCaisseCloture(sessionId))
ipcMain.handle('email:envoyerHoraire', async () => envoyerPointVenteHoraire())
ipcMain.handle('email:envoyerControle', async (_e, sessionId, montantCompte) => envoyerControleReleve(sessionId, montantCompte))
ipcMain.handle('email:testConfig', async () => envoyerTestEmail())
ipcMain.handle('email:getJournal', async () => getEmailsJournal(100))

// Forfait / abonnement
ipcMain.handle('forfait:get', () => getForfaitInfo())
ipcMain.handle('forfait:prolonger', (_e, mois) => prolongerForfaitLocal(mois))
ipcMain.handle('forfait:genererLicence', (_e, mois) => genererLicence(mois))
ipcMain.handle('forfait:appliquerLicence', (_e, token) => appliquerLicence(token))

// ─── EXPORT PDF (printToPDF via hidden window) ────────────────────────────────
ipcMain.handle('pdf:export', async (_e, html: string, defaultName: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (!result.filePath) return { success: false, cancelled: true }

  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise(r => win.webContents.once('did-finish-load', r))
  const pdfData = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', landscape: false })
  win.destroy()
  try {
    fs.writeFileSync(result.filePath, pdfData)
    await shell.openPath(result.filePath)
    return { success: true, path: result.filePath }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// ─── EXPORT FICHIER (dialog save) ─────────────────────────────────────────────
ipcMain.handle('dialog:saveFile', async (_e, defaultName: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'Fichiers Excel', extensions: ['xlsx'] }]
  })
  return result.filePath ?? null
})

ipcMain.handle('shell:openPath', async (_e, filePath: string) => {
  await shell.openPath(filePath)
})

// ─── VOLET COMMERCIAL ─────────────────────────────────────────────────────────

ipcMain.handle('commercial:getClientSolde', (_e, clientId: number) => getClientSolde(clientId))
ipcMain.handle('commercial:getHistoriqueArdoise', (_e, clientId: number, limit?: number) => getHistoriqueArdoise(clientId, limit))
ipcMain.handle('commercial:vendreACredit', (_e, data: any) => vendreACredit(data))
ipcMain.handle('commercial:rembourserCredit', (_e, data: any) => rembourserCredit(data))
ipcMain.handle('commercial:getClientsAvecCredit', () => getClientsAvecCredit())

ipcMain.handle('commercial:crediterPortefeuille', (_e, data: any) => crediterPortefeuille(data))
ipcMain.handle('commercial:debiterPortefeuille', (_e, data: any) => debiterPortefeuille(data))
ipcMain.handle('commercial:getHistoriquePortefeuille', (_e, clientId: number, limit?: number) => getHistoriquePortefeuille(clientId, limit))

ipcMain.handle('commercial:getFideliteRegle', () => getFideliteRegle())
ipcMain.handle('commercial:setFideliteRegle', (_e, data: any) => setFideliteRegle(data))
ipcMain.handle('commercial:ajouterPoints', (_e, clientId: number, montant: number, venteId?: number) => ajouterPoints(clientId, montant, venteId))
ipcMain.handle('commercial:utiliserPoints', (_e, clientId: number, points: number, venteId?: number) => utiliserPoints(clientId, points, venteId))
ipcMain.handle('commercial:getHistoriqueFidelite', (_e, clientId: number, limit?: number) => getHistoriqueFidelite(clientId, limit))

ipcMain.handle('commercial:getAllDevis', (_e, statut?: string) => getAllDevis(statut))
ipcMain.handle('commercial:getDevisById', (_e, id: number) => getDevisById(id))
ipcMain.handle('commercial:createDevis', (_e, data: any) => createDevis(data))
ipcMain.handle('commercial:updateDevisStatut', (_e, id: number, statut: string) => updateDevisStatut(id, statut))
ipcMain.handle('commercial:deleteDevis', (_e, id: number) => deleteDevis(id))
ipcMain.handle('commercial:transformerDevisEnVente', (_e, devisId: number, caissierId: number, modePaiement: string, montantPaye: number) => transformerDevisEnVente(devisId, caissierId, modePaiement, montantPaye))

ipcMain.handle('commercial:getDashboard', (_e, dateDebut: string, dateFin: string) => getDashboardCommercial(dateDebut, dateFin))

// ─── CODE ROTATION ────────────────────────────────────────────────────────────
ipcMain.handle('rotation:generer', (_e, userId: number) => genererCodeRotation(userId))
ipcMain.handle('rotation:getInfo', () => getCurrentCodeRotationInfo())
ipcMain.handle('rotation:verifier', (_e, code: string) => verifieCodeRotation(code))

// ─── RETOURS ARTICLES ─────────────────────────────────────────────────────────
ipcMain.handle('retour:getVenteByTicket', (_e, ticket: string) => getVenteByTicket(ticket))
ipcMain.handle('retour:creer', (_e, data: any) => creerRetour(data))
ipcMain.handle('retour:getListe', (_e, dateDebut?: string, dateFin?: string) => getRetours(dateDebut, dateFin))

// ─── ENTREPÔTS & TRANSFERTS ───────────────────────────────────────────────────
ipcMain.handle('entrepot:getAll', () => getAllEntrepots())
ipcMain.handle('entrepot:create', (_e, data: any) => createEntrepot(data))
ipcMain.handle('entrepot:update', (_e, id: number, data: any) => updateEntrepot(id, data))
ipcMain.handle('entrepot:delete', (_e, id: number) => deleteEntrepot(id))
ipcMain.handle('entrepot:getStock', (_e, entrepotId?: number) => getStockParEntrepot(entrepotId))
ipcMain.handle('transfert:getAll', (_e, limit?: number) => getAllTransferts(limit))
ipcMain.handle('transfert:getById', (_e, id: number) => getTransfertById(id))
ipcMain.handle('transfert:create', (_e, data: any) => createTransfert(data))
ipcMain.handle('transfert:valider', (_e, id: number) => validerTransfert(id))
ipcMain.handle('transfert:annuler', (_e, id: number) => annulerTransfert(id))

// ─── PRIX ACHAT HISTORIQUE ────────────────────────────────────────────────────
ipcMain.handle('prixAchat:historique', (_e, produitId: number) => getPrixAchatHistorique(produitId))
ipcMain.handle('prixAchat:stats', () => getPrixAchatStatsProduits())
ipcMain.handle('commande:pdfData', (_e, commandeId: number) => getCommandePdfData(commandeId))

// ─── ANALYTICS ────────────────────────────────────────────────────────────────
ipcMain.handle('analytics:dashboard', (_e, dateDebut: string, dateFin: string, boutiqueId?: number) =>
  getAnalyticsDashboard(dateDebut, dateFin, boutiqueId))
ipcMain.handle('analytics:comparaison', (_e, p1: any, p2: any) => getAnalyticsComparaison(p1, p2))

// ─── BOUTIQUES ────────────────────────────────────────────────────────────────
ipcMain.handle('boutique:getAll', () => getAllBoutiques())
ipcMain.handle('boutique:create', (_e, data: any) => createBoutique(data))
ipcMain.handle('boutique:update', (_e, id: number, data: any) => updateBoutique(id, data))
ipcMain.handle('boutique:delete', (_e, id: number) => deleteBoutique(id))
ipcMain.handle('boutique:statsConsolidees', (_e, dateDebut: string, dateFin: string) =>
  getStatsBoutiqueConsolidee(dateDebut, dateFin))

// ─── ALERTES AUTO ─────────────────────────────────────────────────────────────
ipcMain.handle('alertes:getRegles', () => getAlertesRegles())
ipcMain.handle('alertes:updateRegle', (_e, id: number, data: any) => updateAlerteRegle(id, data))
ipcMain.handle('alertes:runAuto', () => runAlertesAuto())

// ─── IMPORT / EXPORT ──────────────────────────────────────────────────────────
ipcMain.handle('import:produits', (_e, lignes: any[], userId?: number) => importProduits(lignes, userId))
ipcMain.handle('import:clients', (_e, lignes: any[], userId?: number) => importClients(lignes, userId))
ipcMain.handle('export:produits', () => exportProduitsList())
ipcMain.handle('export:ventes', (_e, dateDebut: string, dateFin: string) => exportVentesList(dateDebut, dateFin))
ipcMain.handle('export:clients', () => exportClientsList())
ipcMain.handle('import:getLog', () => getImportLog())

// ─── ÉCRAN CLIENT ─────────────────────────────────────────────────────────────
ipcMain.handle('customer:open', () => { createCustomerWindow(); return true })
ipcMain.handle('customer:close', () => { customerWindow?.close(); return true })
ipcMain.handle('customer:isOpen', () => !!(customerWindow && !customerWindow.isDestroyed()))
ipcMain.handle('customer:push', (_e, payload: any) => {
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.webContents.send('customer:update', payload)
  }
  return true
})

// ─── SMS ───────────────────────────────────────────────────────────────────────
ipcMain.handle('sms:send', async (_e, params: any) => sendSms(params))
ipcMain.handle('sms:formatTicket', (_e, data: any) => formatSmsTicket(data))

// ─── DASHBOARD PROPRIÉTAIRE ───────────────────────────────────────────────────
ipcMain.handle('dashboard:getData', () => getDashboardProprietaireData())

// ─── SYNC LAN ─────────────────────────────────────────────────────────────────
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk; if (body.length > 5_000_000) reject(new Error('body too large')) })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function startSyncServer(port: number) {
  if (syncHttpServer) { syncHttpServer.close(); syncHttpServer = null }
  syncHttpServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    const url = new URL(req.url ?? '/', `http://localhost:${port}`)

    if (url.pathname === '/api/stats') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      try { res.writeHead(200); res.end(JSON.stringify({ ok: true, data: getDashboardProprietaireData() })) }
      catch { res.writeHead(500); res.end(JSON.stringify({ ok: false })) }

    } else if (url.pathname === '/api/sync/pull') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      try {
        const since = url.searchParams.get('since') ?? undefined
        const boutiqueId = url.searchParams.get('boutique_id') ? Number(url.searchParams.get('boutique_id')) : undefined
        const changes = getSyncJournal(since, boutiqueId)
        res.writeHead(200); res.end(JSON.stringify({ ok: true, changes, count: changes.length, server_time: new Date().toISOString() }))
      } catch (e: any) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message })) }

    } else if (url.pathname === '/api/sync/push' && req.method === 'POST') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      try {
        const body = await readBody(req)
        const { changes } = JSON.parse(body)
        const result = applySyncChanges(changes ?? [])
        res.writeHead(200); res.end(JSON.stringify({ ok: true, ...result }))
      } catch (e: any) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: e.message })) }

    } else if (url.pathname === '/api/rotation') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      try { res.writeHead(200); res.end(JSON.stringify({ ok: true, data: getCurrentCodeRotationInfo() })) }
      catch { res.writeHead(500); res.end(JSON.stringify({ ok: false })) }

    } else if (url.pathname === '/api/rotation/generer' && req.method === 'POST') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      try {
        const body = await readBody(req)
        const { username, password } = JSON.parse(body)
        const resUser = loginUser(username, password)
        if (!resUser || 'forfaitExpire' in resUser || (resUser.role !== 'admin' && resUser.role !== 'gestionnaire')) {
          res.writeHead(401); res.end(JSON.stringify({ ok: false, error: 'Identifiants invalides ou rôle insuffisant' })); return
        }
        const code = genererCodeRotation(resUser.id)
        res.writeHead(200); res.end(JSON.stringify({ ok: true, code, expire_dans: '30 minutes' }))
      } catch (e: any) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message })) }

    } else if (url.pathname === '/api/dashboard' || url.pathname === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      try { const html = buildDashboardHtml(getDashboardProprietaireData(), getCurrentCodeRotationInfo()); res.writeHead(200); res.end(html) }
      catch { res.writeHead(500); res.end('Erreur') }

    } else {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.writeHead(404); res.end(JSON.stringify({ ok: false, error: 'Not found' }))
    }
  })
  syncHttpServer.listen(port, '0.0.0.0')
  return { ok: true, port }
}

function stopSyncServer() {
  if (syncHttpServer) { syncHttpServer.close(); syncHttpServer = null }
  return { ok: true }
}

function buildDashboardHtml(data: any, rotationInfo: any): string {
  const ca = Math.round(Number(data.statsDuJour?.ca ?? 0)).toLocaleString('fr-FR')
  const nb = data.statsDuJour?.nb_ventes ?? 0
  const panier = Math.round(Number(data.statsDuJour?.panier_moyen ?? 0)).toLocaleString('fr-FR')
  const caMois = Math.round(Number(data.statsMois?.ca_mois ?? 0)).toLocaleString('fr-FR')
  const charges = Math.round(Number(data.chargesMois?.charges_mois ?? 0)).toLocaleString('fr-FR')
  const topP = (data.topProduits as any[]).map((p: any) =>
    `<tr><td>${p.nom}</td><td style="text-align:right">${Math.round(Number(p.ca)).toLocaleString('fr-FR')} FCFA</td></tr>`
  ).join('')
  const stockBas = (data.stockBas as any[]).map((p: any) =>
    `<tr style="color:#dc2626"><td>${p.nom}</td><td>${p.stock_actuel} ${p.unite}</td><td>min ${p.stock_minimum}</td></tr>`
  ).join('')

  const resteMin = rotationInfo?.actif ? Math.floor(rotationInfo.reste_secondes / 60) : 0
  const resteSec = rotationInfo?.actif ? rotationInfo.reste_secondes % 60 : 0
  const codeActifHtml = rotationInfo?.actif
    ? `<div style="background:#0f172a;border-radius:12px;padding:20px;text-align:center;margin-bottom:16px">
        <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px">Code actif — à dicter à la caissière</div>
        <div id="code-display" style="font-size:52px;font-weight:900;color:#f97316;letter-spacing:12px;font-family:monospace">??????</div>
        <div style="font-size:12px;color:#64748b;margin-top:8px">⏱ Expire dans <span id="countdown">${resteMin}m ${String(resteSec).padStart(2,'0')}s</span></div>
        <div style="font-size:11px;color:#475569;margin-top:4px">Généré par ${rotationInfo.genere_par_nom}</div>
      </div>`
    : `<div style="background:#0f172a;border-radius:12px;padding:16px;text-align:center;margin-bottom:16px;color:#475569">
        Aucun code actif — générez-en un ci-dessous
      </div>`

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dashboard Propriétaire — KB POS</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;background:#0f172a;color:#e2e8f0;padding:16px;max-width:600px;margin:0 auto}
  h1{font-size:20px;margin-bottom:4px;color:#f59e0b}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px}
  .card{background:#1e293b;border-radius:12px;padding:14px}
  .card .label{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px}
  .card .value{font-size:24px;font-weight:900;color:#f59e0b;margin-top:2px}
  table{width:100%;border-collapse:collapse}
  .card table td{padding:5px 6px;font-size:12px;border-bottom:1px solid #334155}
  .card h2{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
  .section-title{font-size:13px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1px;margin:20px 0 10px;display:flex;align-items:center;gap:6px}
  input{width:100%;padding:10px 12px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:15px;margin-bottom:10px;outline:none}
  input:focus{border-color:#f97316}
  button{width:100%;padding:12px;border-radius:10px;border:none;background:#f97316;color:#fff;font-size:15px;font-weight:700;cursor:pointer}
  button:active{background:#ea580c}
  button:disabled{background:#374151;color:#6b7280;cursor:not-allowed}
  .msg{padding:10px 12px;border-radius:8px;font-size:13px;margin-top:10px;text-align:center}
  .msg.ok{background:#052e16;color:#4ade80;border:1px solid #166534}
  .msg.err{background:#1f0a0a;color:#f87171;border:1px solid #7f1d1d}
  .reveal-btn{background:#1e293b;color:#f97316;border:1px solid #f97316;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;width:auto;margin-top:8px}
  .refresh{font-size:10px;color:#334155;margin-top:16px;text-align:center}
</style>
</head><body>

<h1>📊 Dashboard Propriétaire</h1>
<p style="color:#475569;font-size:11px;margin-bottom:14px">${new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}</p>

<div class="grid">
  <div class="card"><div class="label">CA aujourd'hui</div><div class="value">${ca}</div><div style="font-size:10px;color:#64748b">FCFA</div></div>
  <div class="card"><div class="label">Ventes</div><div class="value">${nb}</div><div style="font-size:10px;color:#64748b">transactions</div></div>
  <div class="card"><div class="label">Panier moyen</div><div class="value">${panier}</div><div style="font-size:10px;color:#64748b">FCFA</div></div>
  <div class="card"><div class="label">CA du mois</div><div class="value">${caMois}</div><div style="font-size:10px;color:#64748b">FCFA</div></div>
  <div class="card"><div class="label">Charges mois</div><div class="value" style="color:#f87171">${charges}</div><div style="font-size:10px;color:#64748b">FCFA</div></div>
</div>

<div class="grid">
  <div class="card"><h2>🏆 Top produits</h2><table>${topP||'<tr><td style="color:#64748b">Aucune vente</td></tr>'}</table></div>
  <div class="card"><h2>⚠️ Stock faible</h2><table>${stockBas||'<tr><td style="color:#22c55e">Tout est OK</td></tr>'}</table></div>
</div>

<!-- ═══ SECTION CODE SUPERVISEUR ═══ -->
<div class="section-title">🔐 Code superviseur retour</div>
<div class="card">
  ${codeActifHtml}

  <div id="reveal-zone" style="display:none;text-align:center;margin-bottom:12px">
    <div id="code-plain" style="font-size:52px;font-weight:900;color:#f97316;letter-spacing:12px;font-family:monospace;background:#0f172a;border-radius:12px;padding:16px"></div>
    <div style="font-size:11px;color:#94a3b8;margin-top:6px">Dictez ce code à votre caissière par téléphone</div>
  </div>

  <form id="gen-form">
    <div style="font-size:12px;color:#94a3b8;margin-bottom:8px">Connectez-vous pour générer un nouveau code :</div>
    <input type="text" id="usr" placeholder="Nom d'utilisateur (admin ou gestionnaire)" autocomplete="username" />
    <input type="password" id="pwd" placeholder="Mot de passe" autocomplete="current-password" />
    <button type="submit" id="gen-btn">🔄 Générer un code (valable 30 min)</button>
    <div id="gen-msg"></div>
  </form>
</div>

<p class="refresh">Actualisez la page pour rafraîchir les stats • Port forwarding ou VPN requis pour accès externe</p>

<script>
// Countdown du code existant
var secs = ${rotationInfo?.actif ? rotationInfo.reste_secondes : 0};
if (secs > 0) {
  var t = setInterval(function() {
    secs--;
    if (secs <= 0) { clearInterval(t); document.getElementById('countdown').textContent = 'Expiré'; return; }
    var m = Math.floor(secs/60), s = secs%60;
    document.getElementById('countdown').textContent = m + 'm ' + String(s).padStart(2,'0') + 's';
  }, 1000);
}

// Soumission du formulaire
document.getElementById('gen-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  var btn = document.getElementById('gen-btn');
  var msg = document.getElementById('gen-msg');
  btn.disabled = true; btn.textContent = 'Génération…'; msg.textContent = '';
  try {
    var r = await fetch('/api/rotation/generer', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ username: document.getElementById('usr').value, password: document.getElementById('pwd').value })
    });
    var d = await r.json();
    if (d.ok) {
      msg.className = 'msg ok';
      msg.textContent = '✓ Code généré — valable 30 minutes';
      document.getElementById('pwd').value = '';
      // Afficher le code en clair dans la zone révélation
      document.getElementById('code-display') && (document.getElementById('code-display').textContent = d.code);
      var rz = document.getElementById('reveal-zone');
      rz.style.display = 'block';
      document.getElementById('code-plain').textContent = d.code;
      // Relancer le countdown à 30min
      secs = 1800;
      clearInterval(t);
      t = setInterval(function() {
        secs--;
        if (secs <= 0) { clearInterval(t); return; }
        var m2 = Math.floor(secs/60), s2 = secs%60;
        var el = document.getElementById('countdown');
        if (el) el.textContent = m2 + 'm ' + String(s2).padStart(2,'0') + 's';
      }, 1000);
    } else {
      msg.className = 'msg err';
      msg.textContent = '✗ ' + (d.error || 'Erreur inconnue');
    }
  } catch(ex) {
    msg.className = 'msg err';
    msg.textContent = '✗ Impossible de joindre le serveur';
  }
  btn.disabled = false; btn.textContent = '🔄 Générer un code (valable 30 min)';
});
</script>
</body></html>`
}

// ─── SYNC PEERS ───────────────────────────────────────────────────────────────
ipcMain.handle('sync:getPeers', () => getSyncPeers())
ipcMain.handle('sync:createPeer', (_e, data: any) => createSyncPeer(data))
ipcMain.handle('sync:deletePeer', (_e, id: number) => deleteSyncPeer(id))
ipcMain.handle('sync:getJournal', (_e, since?: string) => getSyncJournal(since))

ipcMain.handle('sync:pushTo', async (_e, peerId: number, ip: string, port: number) => {
  try {
    const peers = getSyncPeers()
    const peer = peers.find((p: any) => p.id === peerId)
    const lastSync = peer?.last_sync ?? undefined
    const boutiqueId = Number(getAllParametres()?.boutique_id_local ?? 1)
    const changes = getSyncJournal(lastSync)
    if (!changes.length) {
      updateSyncPeerLastSync(peerId, boutiqueId)
      return { ok: true, pushed: 0, message: 'Rien à envoyer' }
    }
    const resp = await fetch(`http://${ip}:${port}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes }),
      signal: AbortSignal.timeout(10000)
    })
    const result = await resp.json()
    if (result.ok) {
      markSyncedIds(changes.map((c: any) => c.id))
      updateSyncPeerLastSync(peerId, boutiqueId)
    }
    return { ok: result.ok, pushed: changes.length, applied: result.applied, errors: result.errors }
  } catch (e: any) { return { ok: false, error: e.message } }
})

ipcMain.handle('sync:pullFrom', async (_e, peerId: number, ip: string, port: number) => {
  try {
    const peers = getSyncPeers()
    const peer = peers.find((p: any) => p.id === peerId)
    const lastSync = peer?.last_sync ?? undefined
    const url = `http://${ip}:${port}/api/sync/pull${lastSync ? `?since=${encodeURIComponent(lastSync)}` : ''}`
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const result = await resp.json()
    if (!result.ok) return { ok: false, error: 'Serveur a retourné une erreur' }
    const r = applySyncChanges(result.changes ?? [])
    updateSyncPeerLastSync(peerId, 0)
    return { ok: true, received: result.count, applied: r.applied, errors: r.errors }
  } catch (e: any) { return { ok: false, error: e.message } }
})

ipcMain.handle('sync:startServer', (_e, port: number) => {
  try { return startSyncServer(port) }
  catch (e: any) { return { ok: false, error: e.message } }
})
ipcMain.handle('sync:stopServer', () => stopSyncServer())
ipcMain.handle('sync:isRunning', () => !!(syncHttpServer && syncHttpServer.listening))
ipcMain.handle('sync:getLocalIp', () => {
  const { networkInterfaces } = require('os')
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return '127.0.0.1'
})

// ─── WhatsApp ─────────────────────────────────────────────────────────────────
ipcMain.handle('whatsapp:openTicket', async (_e, phone: string, message: string) => {
  const clean = phone.replace(/\D/g, '')
  const url = `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
  await shell.openExternal(url)
  return { ok: true }
})

// ─── CAMPAGNES SMS (Sprint 9) ─────────────────────────────────────────────────
ipcMain.handle('campagne:getAll', () => getAllCampagnes())
ipcMain.handle('campagne:create', (_e, data: any) => createCampagne(data))
ipcMain.handle('campagne:delete', (_e, id: number) => deleteCampagne(id))
ipcMain.handle('campagne:getDestinataires', (_e, segment: string) => getDestinatairesSegment(segment))
ipcMain.handle('campagne:marquerEnvoyee', (_e, id: number, nb: number, nbEchec: number) => marquerCampagneEnvoyee(id, nb, nbEchec))
ipcMain.handle('anniversaire:check', () => checkAnniversairesAujourdhui())
ipcMain.handle('client:profile', (_e, clientId: number) => getClientProfile(clientId))

// ─── FACTURES (Sprint 10) ─────────────────────────────────────────────────────
ipcMain.handle('facture:getAll', (_e, statut?: string) => getAllFactures(statut))
ipcMain.handle('facture:getById', (_e, id: number) => getFactureById(id))
ipcMain.handle('facture:create', (_e, data: any) => createFacture(data))
ipcMain.handle('facture:updateStatut', (_e, id: number, statut: string) => updateFactureStatut(id, statut))
ipcMain.handle('finance:compteResultat', (_e, annee: number, mois?: number) => getCompteResultat(annee, mois))

ipcMain.handle('fs:writeFile', async (_e, filePath: string, data: number[]) => {
  try {
    fs.writeFileSync(filePath, Buffer.from(data))
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// Lecture d'un fichier texte (utilisé pour charger un fichier de licence .kbkey)
ipcMain.handle('fs:readText', async (_e, filePath: string) => {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch (err: any) {
    throw new Error(err.message)
  }
})

// Sélection d'un fichier (licence d'extension) → retourne le chemin ou null
ipcMain.handle('dialog:openFile', async (_e, extensions: string[]) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Licence', extensions: extensions && extensions.length ? extensions : ['kbkey', 'txt'] }]
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

// ─── IMAGES PRODUITS ──────────────────────────────────────────────────────────

// Dossier de stockage des images
function getImagesDir(): string {
  const dir = path.join(app.getPath('userData'), 'product-images')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// Sélectionner et copier une image → retourne le chemin file://
ipcMain.handle('image:selectProduit', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choisir une image pour le produit',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths[0]) return null

  const srcPath = result.filePaths[0]
  const ext = path.extname(srcPath).toLowerCase()
  const filename = `prod_${Date.now()}${ext}`
  const destPath = path.join(getImagesDir(), filename)

  try {
    fs.copyFileSync(srcPath, destPath)
    // Retourne une URL file:// que le renderer peut utiliser directement
    return `file://${destPath.replace(/\\/g, '/')}`
  } catch (err: any) {
    return null
  }
})

// Supprimer une image du dossier (nettoyage)
ipcMain.handle('image:deleteProduit', async (_e, fileUrl: string) => {
  try {
    if (!fileUrl?.startsWith('file://')) return
    const filePath = fileUrl.replace('file://', '').replace(/\//g, path.sep)
    // Sécurité : on ne supprime que dans notre dossier product-images
    if (filePath.includes('product-images') && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch {}
})

// ─── MISE À JOUR (IPC vers le renderer) ───────────────────────────────────────
ipcMain.handle('app:getVersion', () => app.getVersion())

ipcMain.handle('app:checkForUpdates', async () => {
  if (!app.isPackaged) return { status: 'dev' }
  try {
    configureUpdater()
    const result = await autoUpdater.checkForUpdates()
    return { status: 'checked', updateAvailable: !!result?.updateInfo }
  } catch (e: any) {
    return { status: 'error', error: e?.message }
  }
})

ipcMain.handle('app:quitAndInstall', () => {
  try { autoUpdater.quitAndInstall() } catch {}
})
