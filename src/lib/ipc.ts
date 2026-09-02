import type { Produit, Client, Categorie, Vente, MouvementStock, Parametres, Alerte, VenteStats, PrintReceiptData, User, SessionCaisse, TiroirLog, Charge, CodeSuperviseur, StatsDuJour, ConnexionLog, EtatComplet, MouvementCaisse } from '@/types'

const api = () => (window as any).electronAPI

// ─── Auth ─────────────────────────────────────────────────────────────────────
export type LoginResult = User | null | { forfaitExpire: true; expiration: string }
export const login = (username: string, password: string): Promise<LoginResult> =>
  api().db.login(username, password)

// ─── Users ────────────────────────────────────────────────────────────────────
export const getUsers = (): Promise<User[]> => api().db.getUsers()
export const createUser = (data: { username: string; password: string; role: string; nom: string }): Promise<any> => api().db.createUser(data)
export const updateUser = (id: number, data: Partial<User & { password: string }>): Promise<any> => api().db.updateUser(id, data)
export const deleteUser = (id: number): Promise<any> => api().db.deleteUser(id)

// ─── Categories ───────────────────────────────────────────────────────────────
export const getCategories = (): Promise<Categorie[]> => api().db.getCategories()
export const createCategorie = (data: Omit<Categorie, 'id'>): Promise<any> => api().db.createCategorie(data)
export const updateCategorie = (id: number, data: Partial<Categorie>): Promise<any> => api().db.updateCategorie(id, data)

// ─── Produits ─────────────────────────────────────────────────────────────────
export const getProduits = (categorieId?: number, search?: string): Promise<Produit[]> =>
  api().db.getProduits(categorieId, search)
export const getProduitByBarcode = (code: string): Promise<Produit | null> => api().db.getProduitByBarcode(code)
export const createProduit = (data: Omit<Produit, 'id' | 'created_at'>): Promise<any> => api().db.createProduit(data)
export const updateProduit = (id: number, data: Partial<Produit>): Promise<any> => api().db.updateProduit(id, data)
export const deleteProduit = (id: number): Promise<any> => api().db.deleteProduit(id)
export const getLowStockProduits = (): Promise<Produit[]> => api().db.getLowStockProduits()

// ─── Stock ────────────────────────────────────────────────────────────────────
export const addMouvement = (data: { produit_id: number; type: string; quantite: number; raison?: string; user_id?: number }): Promise<any> =>
  api().db.addMouvement(data)
export const getMouvements = (produitId?: number, limit?: number): Promise<MouvementStock[]> =>
  api().db.getMouvements(produitId, limit)

// ─── Ventes ───────────────────────────────────────────────────────────────────
export const createVente = (data: any): Promise<{ venteId: number; ticket: string }> => api().db.createVente(data)
export const getVentes = (dateDebut?: string, dateFin?: string, limit?: number): Promise<Vente[]> =>
  api().db.getVentes(dateDebut, dateFin, limit)
export const getVenteById = (id: number): Promise<Vente | null> => api().db.getVenteById(id)
export const getVenteStats = (dateDebut: string, dateFin: string): Promise<VenteStats> =>
  api().db.getVenteStats(dateDebut, dateFin)

// ─── Clients ──────────────────────────────────────────────────────────────────
export const getClients = (): Promise<Client[]> => api().db.getClients()
export const createClient = (data: Omit<Client, 'id' | 'actif' | 'created_at'>): Promise<any> => api().db.createClient(data)
export const updateClient = (id: number, data: Partial<Client>): Promise<any> => api().db.updateClient(id, data)
export const deleteClient = (id: number): Promise<any> => api().db.deleteClient(id)
export const getClientVentes = (clientId: number): Promise<Vente[]> => api().db.getClientVentes(clientId)

// ─── Prix par client (tarifs spécifiques) ─────────────────────────────────────
export const getPrixClients = (clientId: number): Promise<{ id: number; produit_id: number; prix: number }[]> =>
  api().db.getPrixClients(clientId)
export const getPrixClient = (clientId: number, produitId: number): Promise<number | null> =>
  api().db.getPrixClient(clientId, produitId)
export const setPrixClient = (clientId: number, produitId: number, prix: number): Promise<any> =>
  api().db.setPrixClient(clientId, produitId, prix)
export const setPrixClientsBulk = (clientId: number, items: { produit_id: number; prix: number }[]): Promise<any> =>
  api().db.setPrixClientsBulk(clientId, items)

// ─── Parametres ───────────────────────────────────────────────────────────────
export const getParametres = (): Promise<Parametres> => api().db.getParametres()
export const setParametre = (cle: string, valeur: string): Promise<any> => api().db.setParametre(cle, valeur)
export const setParametres = (params: Partial<Parametres>): Promise<any> => api().db.setParametres(params)

// ─── Type de commerce (profil) ────────────────────────────────────────────────
import type { ProfilListEntry, ProfilCommerceAplique, AttributComplet, AttributionProduit, VarianteProduit, VarianteComboInput } from '@/types'
const prof = () => api().profile
export const profilGet = (): Promise<ProfilCommerceAplique | null> => prof().get()
export const profilList = (): Promise<ProfilListEntry[]> => prof().list()
export const profilApply = (id: string, opts?: { remplacerCatalogue?: boolean }): Promise<ProfilCommerceAplique> => prof().apply(id, opts)

// ─── Attributs / Variantes ────────────────────────────────────────────────────
const attr = () => api().attributs
export const listAttributs = (actifsSeulement = false): Promise<AttributComplet[]> => attr().list(actifsSeulement)
export const getAttributsProduit = (produitId: number): Promise<AttributionProduit[]> => attr().byProduit(produitId)
export const getAttributionsTousProduits = (): Promise<AttributionProduit[] & { produit_id: number }[]> => attr().allProduits()
export const setAttributsProduit = (produitId: number, attributions: { attribut_id: number; valeur_id: number | null }[]): Promise<any> =>
  attr().setProduit(produitId, attributions)

// ─── Variantes : stock par combinaison (taille × couleur) ─────────────────────
const variants = () => api().variantes
export const variantesList = (produitId: number): Promise<VarianteProduit[]> => variants().list(produitId)
export const variantesSet = (produitId: number, combos: VarianteComboInput[]): Promise<any> => variants().set(produitId, combos)

// ─── Alertes ──────────────────────────────────────────────────────────────────
export const getAlertes = (lu?: boolean): Promise<Alerte[]> => api().db.getAlertes(lu)
export const marquerAlerteLue = (id: number): Promise<any> => api().db.marquerAlerteLue(id)

// ─── Printer ──────────────────────────────────────────────────────────────────
export const printReceipt = (data: PrintReceiptData): Promise<{ success: boolean; error?: string }> =>
  api().printer.print(data)
export const getReceiptText = (data: PrintReceiptData): Promise<string> => api().printer.getReceiptText(data)
export const testImprimante = (): Promise<{ success: boolean; error?: string; interface_utilisee?: string }> =>
  api().printer.test()
export const listeImprimantes = (): Promise<{ name: string; thermal: boolean }[]> => api().printer.list()

// ─── Sessions caisse ──────────────────────────────────────────────────────────
export const ouvrirSession = (userId: number, fondCaisse: number): Promise<any> =>
  api().db.ouvrirSession(userId, fondCaisse)
export const getSessionOuverte = (userId: number): Promise<SessionCaisse | null> =>
  api().db.getSessionOuverte(userId)
export const cloturerSession = (sessionId: number, montantFinal: number): Promise<any> =>
  api().db.cloturerSession(sessionId, montantFinal)
export const getSessionsCaisse = (dateDebut?: string, dateFin?: string): Promise<SessionCaisse[]> =>
  api().db.getSessionsCaisse(dateDebut, dateFin)

// ─── Tiroir ───────────────────────────────────────────────────────────────────
export const ouvrirTiroir = (data: { type: 'vente' | 'ouverture_simple'; vente_id?: number; user_id: number; session_id?: number; motif?: string }): Promise<any> =>
  api().tiroir.ouvrir(data)
export const getTiroirLog = (dateDebut?: string, dateFin?: string): Promise<TiroirLog[]> =>
  api().db.getTiroirLog(dateDebut, dateFin)

// ─── Mouvements de caisse (versements / retraits) ─────────────────────────────
export const createMouvementCaisse = (data: { session_id?: number; type: 'versement' | 'retrait'; montant: number; motif?: string; user_id: number }): Promise<any> =>
  api().db.createMouvementCaisse(data)
export const getMouvementsCaisse = (dateDebut?: string, dateFin?: string): Promise<MouvementCaisse[]> =>
  api().db.getMouvementsCaisse(dateDebut, dateFin)
export const getMouvementsCaisseParSession = (sessionId: number): Promise<MouvementCaisse[]> =>
  api().db.getMouvementsCaisseParSession(sessionId)

// ─── Charges ──────────────────────────────────────────────────────────────────
export const getCharges = (dateDebut?: string, dateFin?: string): Promise<Charge[]> =>
  api().db.getCharges(dateDebut, dateFin)
export const createCharge = (data: Omit<Charge, 'id' | 'created_at' | 'user_nom'>): Promise<any> =>
  api().db.createCharge(data)
export const updateCharge = (id: number, data: Partial<Charge>): Promise<any> =>
  api().db.updateCharge(id, data)
export const deleteCharge = (id: number): Promise<any> => api().db.deleteCharge(id)
export const getChargesStats = (dateDebut: string, dateFin: string): Promise<any> =>
  api().db.getChargesStats(dateDebut, dateFin)

// ─── Codes superviseur ────────────────────────────────────────────────────────
export const verifieCodeSuperviseur = (code: string): Promise<boolean> =>
  api().db.verifieCodeSuperviseur(code)
export const getCodesSuperviseur = (): Promise<CodeSuperviseur[]> =>
  api().db.getCodesSuperviseur()
export const createCodeSuperviseur = (code: string, userId: number): Promise<any> =>
  api().db.createCodeSuperviseur(code, userId)
export const updateCodeSuperviseur = (id: number, data: any): Promise<any> =>
  api().db.updateCodeSuperviseur(id, data)

// ─── Stats temps réel ─────────────────────────────────────────────────────────
export const getStatsDuJour = (): Promise<StatsDuJour> => api().db.getStatsDuJour()

// ─── Connexions log ───────────────────────────────────────────────────────────
export const logConnexion = (data: { user_id: number; type: 'connexion' | 'deconnexion' | 'cloture_session'; session_id?: number; note?: string }): Promise<any> =>
  api().db.logConnexion(data)
export const getConnexionsLog = (dateDebut?: string, dateFin?: string): Promise<ConnexionLog[]> =>
  api().db.getConnexionsLog(dateDebut, dateFin)

// ─── États complets ───────────────────────────────────────────────────────────
export const getEtatComplet = (dateDebut: string, dateFin: string): Promise<EtatComplet> =>
  api().db.getEtatComplet(dateDebut, dateFin)

// ─── Péremption ───────────────────────────────────────────────────────────────
export const getProduitsExpirant = (jours?: number): Promise<any[]> => api().db.getProduitsExpirant(jours)
export const getProduitsExpires = (): Promise<any[]> => api().db.getProduitsExpires()

// ─── Balance ──────────────────────────────────────────────────────────────────
export const balanceGetPortsCOM = (): Promise<string[]> => api().balance.getPortsCOM()
export const balanceConnect = (port: string, baudRate: number): Promise<{ success: boolean; error?: string }> => api().balance.connect(port, baudRate)
export const balanceDisconnect = (): Promise<{ success: boolean }> => api().balance.disconnect()
export const balanceIsConnected = (): Promise<boolean> => api().balance.isConnected()

// ─── Fournisseurs ─────────────────────────────────────────────────────────────
export const getFournisseurs = (): Promise<any[]> => api().db.getFournisseurs()
export const createFournisseur = (data: any): Promise<any> => api().db.createFournisseur(data)
export const updateFournisseur = (id: number, data: any): Promise<any> => api().db.updateFournisseur(id, data)
export const deleteFournisseur = (id: number): Promise<any> => api().db.deleteFournisseur(id)

// ─── Commandes fournisseur ────────────────────────────────────────────────────
export const getCommandes = (fournisseurId?: number): Promise<any[]> => api().db.getCommandes(fournisseurId)
export const getCommandeById = (id: number): Promise<any> => api().db.getCommandeById(id)
export const createCommande = (data: any): Promise<any> => api().db.createCommande(data)
export const updateCommandeStatut = (id: number, statut: string): Promise<any> => api().db.updateCommandeStatut(id, statut)
export const recevoirCommande = (id: number, receptions: any[], userId?: number): Promise<any> => api().db.recevoirCommande(id, receptions, userId)
export const deleteCommande = (id: number): Promise<any> => api().db.deleteCommande(id)

// ─── Inventaire ───────────────────────────────────────────────────────────────
export const getInventaires = (): Promise<any[]> => api().db.getInventaires()
export const getInventaireById = (id: number): Promise<any> => api().db.getInventaireById(id)
export const createInventaire = (data: any): Promise<any> => api().db.createInventaire(data)
export const updateInventaireLigne = (invId: number, prodId: number, stockCompte: number): Promise<any> => api().db.updateInventaireLigne(invId, prodId, stockCompte)
export const updateInventaireJustification = (invId: number, prodId: number, justification: string): Promise<any> => api().db.updateInventaireJustification(invId, prodId, justification)
export const cloturerInventaire = (id: number, userId?: number): Promise<any> => api().db.cloturerInventaire(id, userId)

// ─── Promotions ───────────────────────────────────────────────────────────────
export const getPromotions = (): Promise<any[]> => api().db.getPromotions()
export const createPromotion = (data: any): Promise<any> => api().db.createPromotion(data)
export const updatePromotion = (id: number, data: any): Promise<any> => api().db.updatePromotion(id, data)
export const deletePromotion = (id: number): Promise<any> => api().db.deletePromotion(id)
export const getPromosPourProduit = (produitId: number, categorieId: number | null, quantite: number, date: string): Promise<any[]> =>
  api().db.getPromosPourProduit(produitId, categorieId, quantite, date)

// ─── Backup ───────────────────────────────────────────────────────────────────
export const backupCreate = (label?: string): Promise<{ success: boolean; filename?: string; error?: string }> =>
  api().backup.create(label)
export const backupList = (): Promise<{ filename: string; size: number; date: string; path: string }[]> =>
  api().backup.list()
export const backupDelete = (filename: string): Promise<{ success: boolean; error?: string }> =>
  api().backup.delete(filename)
export const backupRestore = (filename: string): Promise<{ success: boolean; error?: string; requiresRestart?: boolean }> =>
  api().backup.restore(filename)
export const backupGetDir = (): Promise<string> => api().backup.getDir()
export const backupBrowseDir = (): Promise<string | null> => api().backup.browseDir()
export const backupSetDir = (dir: string): Promise<{ success: boolean }> => api().backup.setDir(dir)
export const backupRestartScheduler = (): Promise<{ success: boolean }> => api().backup.restartScheduler()

// ─── Images produits ──────────────────────────────────────────────────────────
export const selectImageProduit = (): Promise<string | null> =>
  api().image.selectProduit()
export const deleteImageProduit = (fileUrl: string): Promise<void> =>
  api().image.deleteProduit(fileUrl)

// ─── Export PDF ───────────────────────────────────────────────────────────────
export const exportPdf = (html: string, defaultName: string): Promise<{ success: boolean; path?: string; cancelled?: boolean; error?: string }> =>
  api().pdf.export(html, defaultName)

// ─── Dialog / Shell ───────────────────────────────────────────────────────────
export const dialogSaveFile = (defaultName: string): Promise<string | null> =>
  api().dialog.saveFile(defaultName)
export const shellOpenPath = (filePath: string): Promise<void> =>
  api().shell.openPath(filePath)

// ─── Volet Commercial ─────────────────────────────────────────────────────────
const com = () => api().commercial

export const commercialGetClientSolde = (clientId: number) => com().getClientSolde(clientId)
export const commercialGetHistoriqueArdoise = (clientId: number, limit?: number) => com().getHistoriqueArdoise(clientId, limit)
export const commercialVendreACredit = (data: any) => com().vendreACredit(data)
export const commercialRembourserCredit = (data: any) => com().rembourserCredit(data)
export const commercialGetClientsAvecCredit = () => com().getClientsAvecCredit()
export const commercialCrediterPortefeuille = (data: any) => com().crediterPortefeuille(data)
export const commercialDebiterPortefeuille = (data: any) => com().debiterPortefeuille(data)
export const commercialGetHistoriquePortefeuille = (clientId: number, limit?: number) => com().getHistoriquePortefeuille(clientId, limit)
export const commercialGetFideliteRegle = () => com().getFideliteRegle()
export const commercialSetFideliteRegle = (data: any) => com().setFideliteRegle(data)
export const commercialAjouterPoints = (clientId: number, montant: number, venteId?: number, _userId?: number) => com().ajouterPoints(clientId, montant, venteId)
export const commercialUtiliserPoints = (clientId: number, points: number, venteId?: number) => com().utiliserPoints(clientId, points, venteId)
export const commercialGetHistoriqueFidelite = (clientId: number, limit?: number) => com().getHistoriqueFidelite(clientId, limit)
export const commercialGetAllDevis = (statut?: string) => com().getAllDevis(statut)
export const commercialGetDevisById = (id: number) => com().getDevisById(id)
export const commercialCreateDevis = (data: any) => com().createDevis(data)
export const commercialUpdateDevisStatut = (id: number, statut: string) => com().updateDevisStatut(id, statut)
export const commercialDeleteDevis = (id: number) => com().deleteDevis(id)
export const commercialTransformerDevis = (devisId: number, caissierId: number, modePaiement: string, montantPaye: number) => com().transformerDevisEnVente(devisId, caissierId, modePaiement, montantPaye)
export const commercialGetDashboard = (dateDebut: string, dateFin: string) => com().getDashboard(dateDebut, dateFin)

// ─── Code Rotation Superviseur ────────────────────────────────────────────────
const rot = () => api().rotation
export const rotationGenerer = (userId: number): Promise<string> => rot().generer(userId)
export const rotationGetInfo = (): Promise<{ expire_a: string; genere_le: string; genere_par_nom: string; reste_secondes: number; actif: boolean } | null> => rot().getInfo()
export const rotationVerifier = (code: string): Promise<{ ok: boolean; codeId?: number; raison?: string }> => rot().verifier(code)

// ─── Retours Articles ─────────────────────────────────────────────────────────
const ret = () => api().retour
export const retourGetVenteByTicket = (ticket: string): Promise<any> => ret().getVenteByTicket(ticket)
export const retourCreer = (data: any): Promise<any> => ret().creer(data)
export const retourGetListe = (dateDebut?: string, dateFin?: string): Promise<any[]> => ret().getListe(dateDebut, dateFin)

// ─── Entrepôts & Transferts ───────────────────────────────────────────────────
const ent = () => api().entrepot
export const entrepotGetAll = (): Promise<any[]> => ent().getAll()
export const entrepotCreate = (data: { nom: string; adresse?: string; responsable?: string }) => ent().create(data)
export const entrepotUpdate = (id: number, data: any) => ent().update(id, data)
export const entrepotDelete = (id: number) => ent().delete(id)
export const entrepotGetStock = (entrepotId?: number): Promise<any[]> => ent().getStock(entrepotId)

const trf = () => api().transfert
export const transfertGetAll = (limit?: number): Promise<any[]> => trf().getAll(limit)
export const transfertGetById = (id: number): Promise<any> => trf().getById(id)
export const transfertCreate = (data: any): Promise<any> => trf().create(data)
export const transfertValider = (id: number): Promise<any> => trf().valider(id)
export const transfertAnnuler = (id: number): Promise<any> => trf().annuler(id)

// ─── Prix Achat Historique ────────────────────────────────────────────────────
const pa = () => api().prixAchat
export const prixAchatHistorique = (produitId: number): Promise<any[]> => pa().historique(produitId)
export const prixAchatStats = (): Promise<any[]> => pa().stats()
export const commandeGetPdfData = (commandeId: number): Promise<any> => pa().commandePdfData(commandeId)

// ─── Analytics ────────────────────────────────────────────────────────────────
const an = () => api().analytics
export const analyticsDashboard = (dateDebut: string, dateFin: string, boutiqueId?: number) =>
  an().dashboard(dateDebut, dateFin, boutiqueId)
export const analyticsComparaison = (p1: { debut: string; fin: string }, p2: { debut: string; fin: string }) =>
  an().comparaison(p1, p2)

// ─── Boutiques ────────────────────────────────────────────────────────────────
const bq = () => api().boutique
export const boutiqueGetAll = (): Promise<any[]> => bq().getAll()
export const boutiqueCreate = (data: { nom: string; adresse?: string; telephone?: string }) => bq().create(data)
export const boutiqueUpdate = (id: number, data: any) => bq().update(id, data)
export const boutiqueDelete = (id: number) => bq().delete(id)
export const boutiqueStatsConsolidees = (dateDebut: string, dateFin: string) => bq().statsConsolidees(dateDebut, dateFin)

// ─── Alertes automatisées ─────────────────────────────────────────────────────
const aa = () => api().alertesAuto
export const alertesGetRegles = (): Promise<any[]> => aa().getRegles()
export const alertesUpdateRegle = (id: number, data: { actif?: number; params?: string }) => aa().updateRegle(id, data)
export const alertesRunAuto = (): Promise<{ nouvelles: number; details: string[] }> => aa().runAuto()

// ─── Import / Export ──────────────────────────────────────────────────────────
const ie = () => api().importExport
export const importerProduits = (lignes: any[], userId?: number) => ie().importProduits(lignes, userId)
export const importerClients = (lignes: any[], userId?: number) => ie().importClients(lignes, userId)
export const exporterProduits = (): Promise<any[]> => ie().exportProduits()
export const exporterVentes = (dateDebut: string, dateFin: string): Promise<any[]> => ie().exportVentes(dateDebut, dateFin)
export const exporterClients = (): Promise<any[]> => ie().exportClients()
export const importGetLog = (): Promise<any[]> => ie().getLog()

// ─── Écran Client ─────────────────────────────────────────────────────────────
const cust = () => api().customer
export const customerOpen = (): Promise<boolean> => cust().open()
export const customerClose = (): Promise<boolean> => cust().close()
export const customerIsOpen = (): Promise<boolean> => cust().isOpen()
export const customerPush = (payload: any): Promise<boolean> => cust().push(payload)
export const customerOnUpdate = (cb: (data: any) => void) => cust().onUpdate(cb)
export const customerRemoveListeners = () => cust().removeListeners()

// ─── SMS ──────────────────────────────────────────────────────────────────────
const smsApi = () => api().sms
export const smsSend = (params: any): Promise<{ success: boolean; error?: string }> => smsApi().send(params)
export const smsFormatTicket = (data: any): Promise<string> => smsApi().formatTicket(data)

// ─── Email (fond de caisse + point de vente horaire) ─────────────────────────
const mail = () => api().email
export const emailRestartScheduler = (): Promise<{ success: boolean }> => mail().restartScheduler()
export const emailTestFondCaisse = (): Promise<{ success: boolean; error?: string }> => mail().testFondCaisse()
export const emailEnvoyerFondCaisse = (sessionId: number): Promise<{ success: boolean; error?: string }> => mail().envoyerFondCaisse(sessionId)
export const emailEnvoyerHoraire = (): Promise<{ success: boolean; error?: string }> => mail().envoyerHoraire()
export const emailEnvoyerControle = (sessionId: number, montantCompte: number): Promise<{ success: boolean; error?: string }> => mail().envoyerControle(sessionId, montantCompte)
export const emailTestConfig = (): Promise<{ success: boolean; error?: string }> => mail().testConfig()
export const emailGetJournal = (): Promise<{ type?: string; sujet: string; destinataire: string; statut: string; erreur?: string; date_envoi: string }[]> => mail().getJournal()

// ─── Forfait / abonnement ─────────────────────────────────────────────────────
export interface ForfaitInfo {
  expiration: string
  joursRestants: number
  expire: boolean
  procheExpiration: boolean
  moisRestants: number
}
const forfait = () => api().forfait
export const forfaitGet = (): Promise<ForfaitInfo> => forfait().get()
export const forfaitProlonger = (mois: number): Promise<ForfaitInfo> => forfait().prolonger(mois)
export const forfaitGenererLicence = (mois: number): Promise<string> => forfait().genererLicence(mois)
export const forfaitAppliquerLicence = (token: string): Promise<ForfaitInfo> => forfait().appliquerLicence(token)

// ─── Sprint 8 — Dashboard & Sync ──────────────────────────────────────────────
export const dashboardGetData = (): Promise<any> => api().dashboard.getData()
export const syncStartServer = (port: number): Promise<any> => api().sync.startServer(port)
export const syncStopServer = (): Promise<any> => api().sync.stopServer()
export const syncIsRunning = (): Promise<boolean> => api().sync.isRunning()
export const syncGetLocalIp = (): Promise<string> => api().sync.getLocalIp()
export const syncGetPeers = (): Promise<any[]> => api().sync.getPeers()
export const syncCreatePeer = (data: { nom: string; ip: string; port?: number }): Promise<any> => api().sync.createPeer(data)
export const syncDeletePeer = (id: number): Promise<any> => api().sync.deletePeer(id)
export const syncGetJournal = (since?: string): Promise<any[]> => api().sync.getJournal(since)
export const syncPushTo = (peerId: number, ip: string, port: number): Promise<any> => api().sync.pushTo(peerId, ip, port)
export const syncPullFrom = (peerId: number, ip: string, port: number): Promise<any> => api().sync.pullFrom(peerId, ip, port)
export const whatsappOpenTicket = (phone: string, message: string): Promise<any> => api().whatsapp.openTicket(phone, message)

// ─── Sprint 9 — Client 360° & Campagnes ───────────────────────────────────────
export const campagneGetAll = (): Promise<any[]> => api().campagne.getAll()
export const campagneCreate = (data: any): Promise<any> => api().campagne.create(data)
export const campagneDelete = (id: number): Promise<any> => api().campagne.delete(id)
export const campagneGetDestinataires = (segment: string): Promise<any[]> => api().campagne.getDestinataires(segment)
export const campagneMarquerEnvoyee = (id: number, nb: number, nbEchec: number): Promise<any> => api().campagne.marquerEnvoyee(id, nb, nbEchec)
export const anniversaireCheck = (): Promise<any[]> => api().anniversaire.check()
export const clientProfileGet = (clientId: number): Promise<any> => api().clientProfile.get(clientId)

// ─── Sprint 10 — Finance Pro ──────────────────────────────────────────────────
export const factureGetAll = (statut?: string): Promise<any[]> => api().facture.getAll(statut)
export const factureGetById = (id: number): Promise<any> => api().facture.getById(id)
export const factureCreate = (data: any): Promise<any> => api().facture.create(data)
export const factureUpdateStatut = (id: number, statut: string): Promise<any> => api().facture.updateStatut(id, statut)
export const financeCompteResultat = (annee: number, mois?: number): Promise<any> => api().finance.compteResultat(annee, mois)

// ─── Utils ────────────────────────────────────────────────────────────────────
export const isElectron = (): boolean => typeof (window as any).electronAPI !== 'undefined'

export const formatCurrency = (amount: number, monnaie = 'FCFA'): string =>
  `${amount.toLocaleString('fr-FR')} ${monnaie}`

export const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
