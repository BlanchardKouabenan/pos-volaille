import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  db: {
    // Auth
    login: (username: string, password: string) => ipcRenderer.invoke('db:login', username, password),

    // Users
    getUsers: () => ipcRenderer.invoke('db:getUsers'),
    createUser: (data: any) => ipcRenderer.invoke('db:createUser', data),
    updateUser: (id: number, data: any) => ipcRenderer.invoke('db:updateUser', id, data),
    deleteUser: (id: number) => ipcRenderer.invoke('db:deleteUser', id),

    // Categories
    getCategories: () => ipcRenderer.invoke('db:getCategories'),
    createCategorie: (data: any) => ipcRenderer.invoke('db:createCategorie', data),
    updateCategorie: (id: number, data: any) => ipcRenderer.invoke('db:updateCategorie', id, data),

    // Produits
    getProduits: (categorieId?: number, search?: string) => ipcRenderer.invoke('db:getProduits', categorieId, search),
    getProduitByBarcode: (code: string) => ipcRenderer.invoke('db:getProduitByBarcode', code),
    createProduit: (data: any) => ipcRenderer.invoke('db:createProduit', data),
    updateProduit: (id: number, data: any) => ipcRenderer.invoke('db:updateProduit', id, data),
    deleteProduit: (id: number) => ipcRenderer.invoke('db:deleteProduit', id),
    getLowStockProduits: () => ipcRenderer.invoke('db:getLowStockProduits'),

    // Stock
    addMouvement: (data: any) => ipcRenderer.invoke('db:addMouvement', data),
    getMouvements: (produitId?: number, limit?: number) => ipcRenderer.invoke('db:getMouvements', produitId, limit),

    // Ventes
    createVente: (data: any) => ipcRenderer.invoke('db:createVente', data),
    getVentes: (dateDebut?: string, dateFin?: string, limit?: number) => ipcRenderer.invoke('db:getVentes', dateDebut, dateFin, limit),
    getVenteById: (id: number) => ipcRenderer.invoke('db:getVenteById', id),
    getVenteStats: (dateDebut: string, dateFin: string) => ipcRenderer.invoke('db:getVenteStats', dateDebut, dateFin),

    // Clients
    getClients: () => ipcRenderer.invoke('db:getClients'),
    createClient: (data: any) => ipcRenderer.invoke('db:createClient', data),
    updateClient: (id: number, data: any) => ipcRenderer.invoke('db:updateClient', id, data),
    deleteClient: (id: number) => ipcRenderer.invoke('db:deleteClient', id),
    getClientVentes: (clientId: number) => ipcRenderer.invoke('db:getClientVentes', clientId),

    // Prix par client
    getPrixClients: (clientId: number) => ipcRenderer.invoke('db:getPrixClients', clientId),
    getPrixClient: (clientId: number, produitId: number) => ipcRenderer.invoke('db:getPrixClient', clientId, produitId),
    setPrixClient: (clientId: number, produitId: number, prix: number) => ipcRenderer.invoke('db:setPrixClient', clientId, produitId, prix),
    setPrixClientsBulk: (clientId: number, items: any[]) => ipcRenderer.invoke('db:setPrixClientsBulk', clientId, items),

    // Parametres
    getParametres: () => ipcRenderer.invoke('db:getParametres'),
    setParametre: (cle: string, valeur: string) => ipcRenderer.invoke('db:setParametre', cle, valeur),
    setParametres: (params: Record<string, string>) => ipcRenderer.invoke('db:setParametres', params),

    // Alertes
    getAlertes: (lu?: boolean) => ipcRenderer.invoke('db:getAlertes', lu),
    marquerAlerteLue: (id: number) => ipcRenderer.invoke('db:marquerAlerteLue', id),

    // Sessions caisse
    ouvrirSession: (userId: number, fondCaisse: number) => ipcRenderer.invoke('db:ouvrirSession', userId, fondCaisse),
    getSessionOuverte: (userId: number) => ipcRenderer.invoke('db:getSessionOuverte', userId),
    cloturerSession: (sessionId: number, montantFinal: number) => ipcRenderer.invoke('db:cloturerSession', sessionId, montantFinal),
    getSessionsCaisse: (dateDebut?: string, dateFin?: string) => ipcRenderer.invoke('db:getSessionsCaisse', dateDebut, dateFin),

    // Ventes par caisse + clôtures POS
    getVentesParCaisse: (dateDebut?: string, dateFin?: string) => ipcRenderer.invoke('db:getVentesParCaisse', dateDebut, dateFin),
    getCloturesPos: (dateDebut?: string, dateFin?: string) => ipcRenderer.invoke('db:getCloturesPos', dateDebut, dateFin),

    // Tiroir
    getTiroirLog: (dateDebut?: string, dateFin?: string) => ipcRenderer.invoke('db:getTiroirLog', dateDebut, dateFin),

    // Mouvements de caisse (versements / retraits)
    createMouvementCaisse: (data: any) => ipcRenderer.invoke('db:createMouvementCaisse', data),
    getMouvementsCaisse: (dateDebut?: string, dateFin?: string) => ipcRenderer.invoke('db:getMouvementsCaisse', dateDebut, dateFin),
    getMouvementsCaisseParSession: (sessionId: number) => ipcRenderer.invoke('db:getMouvementsCaisseParSession', sessionId),

    // Charges
    getCharges: (dateDebut?: string, dateFin?: string) => ipcRenderer.invoke('db:getCharges', dateDebut, dateFin),
    createCharge: (data: any) => ipcRenderer.invoke('db:createCharge', data),
    updateCharge: (id: number, data: any) => ipcRenderer.invoke('db:updateCharge', id, data),
    deleteCharge: (id: number) => ipcRenderer.invoke('db:deleteCharge', id),
    getChargesStats: (dateDebut: string, dateFin: string) => ipcRenderer.invoke('db:getChargesStats', dateDebut, dateFin),

    // Codes superviseur
    verifieCodeSuperviseur: (code: string) => ipcRenderer.invoke('db:verifieCodeSuperviseur', code),
    getCodesSuperviseur: () => ipcRenderer.invoke('db:getCodesSuperviseur'),
    createCodeSuperviseur: (code: string, userId: number) => ipcRenderer.invoke('db:createCodeSuperviseur', code, userId),
    updateCodeSuperviseur: (id: number, data: any) => ipcRenderer.invoke('db:updateCodeSuperviseur', id, data),

    // Stats temps réel
    getStatsDuJour: () => ipcRenderer.invoke('db:getStatsDuJour'),

    // Connexions log
    logConnexion: (data: any) => ipcRenderer.invoke('db:logConnexion', data),
    getConnexionsLog: (dateDebut?: string, dateFin?: string) => ipcRenderer.invoke('db:getConnexionsLog', dateDebut, dateFin),

    // États complets
    getEtatComplet: (dateDebut: string, dateFin: string) => ipcRenderer.invoke('db:getEtatComplet', dateDebut, dateFin),

    // Péremption
    getProduitsExpirant: (jours?: number) => ipcRenderer.invoke('db:getProduitsExpirant', jours),
    getProduitsExpires: () => ipcRenderer.invoke('db:getProduitsExpires'),

    // Fournisseurs
    getFournisseurs: () => ipcRenderer.invoke('db:getFournisseurs'),
    createFournisseur: (data: any) => ipcRenderer.invoke('db:createFournisseur', data),
    updateFournisseur: (id: number, data: any) => ipcRenderer.invoke('db:updateFournisseur', id, data),
    deleteFournisseur: (id: number) => ipcRenderer.invoke('db:deleteFournisseur', id),

    // Commandes fournisseur
    getCommandes: (fournisseurId?: number) => ipcRenderer.invoke('db:getCommandes', fournisseurId),
    getCommandeById: (id: number) => ipcRenderer.invoke('db:getCommandeById', id),
    createCommande: (data: any) => ipcRenderer.invoke('db:createCommande', data),
    updateCommandeStatut: (id: number, statut: string) => ipcRenderer.invoke('db:updateCommandeStatut', id, statut),
    recevoirCommande: (id: number, receptions: any[], userId?: number) => ipcRenderer.invoke('db:recevoirCommande', id, receptions, userId),
    deleteCommande: (id: number) => ipcRenderer.invoke('db:deleteCommande', id),

    // Inventaire
    getInventaires: () => ipcRenderer.invoke('db:getInventaires'),
    getInventaireById: (id: number) => ipcRenderer.invoke('db:getInventaireById', id),
    createInventaire: (data: any) => ipcRenderer.invoke('db:createInventaire', data),
    updateInventaireLigne: (invId: number, prodId: number, stockCompte: number) => ipcRenderer.invoke('db:updateInventaireLigne', invId, prodId, stockCompte),
    updateInventaireJustification: (invId: number, prodId: number, justification: string) => ipcRenderer.invoke('db:updateInventaireJustification', invId, prodId, justification),
    cloturerInventaire: (id: number, userId?: number) => ipcRenderer.invoke('db:cloturerInventaire', id, userId),

    // Promotions
    getPromotions: () => ipcRenderer.invoke('db:getPromotions'),
    createPromotion: (data: any) => ipcRenderer.invoke('db:createPromotion', data),
    updatePromotion: (id: number, data: any) => ipcRenderer.invoke('db:updatePromotion', id, data),
    deletePromotion: (id: number) => ipcRenderer.invoke('db:deletePromotion', id),
    getPromosPourProduit: (produitId: number, categorieId: number | null, quantite: number, date: string) =>
      ipcRenderer.invoke('db:getPromosPourProduit', produitId, categorieId, quantite, date),
  },
  profile: {
    get: () => ipcRenderer.invoke('profile:get'),
    list: () => ipcRenderer.invoke('profile:list'),
    apply: (id: string, opts?: { remplacerCatalogue?: boolean }) => ipcRenderer.invoke('profile:apply', id, opts),
    listApplied: () => ipcRenderer.invoke('profile:listApplied'),
    add: (id: string) => ipcRenderer.invoke('profile:add', id),
    remove: (id: string) => ipcRenderer.invoke('profile:remove', id),
  },
  attributs: {
    list: (actifsSeulement?: boolean) => ipcRenderer.invoke('attributs:list', actifsSeulement),
    byProduit: (produitId: number) => ipcRenderer.invoke('attributs:byProduit', produitId),
    allProduits: () => ipcRenderer.invoke('attributs:allProduits'),
    setProduit: (produitId: number, attributions: { attribut_id: number; valeur_id: number | null }[]) =>
      ipcRenderer.invoke('attributs:setProduit', produitId, attributions),
  },
  variantes: {
    list: (produitId: number) => ipcRenderer.invoke('variantes:list', produitId),
    set: (produitId: number, combos: { combinaison: Record<number, number>; stock: number; prix_vente?: number | null; prix_achat?: number | null; sku?: string | null }[]) =>
      ipcRenderer.invoke('variantes:set', produitId, combos),
  },
  balance: {
    getPortsCOM: () => ipcRenderer.invoke('balance:getPortsCOM'),
    connect: (port: string, baudRate: number) => ipcRenderer.invoke('balance:connect', port, baudRate),
    disconnect: () => ipcRenderer.invoke('balance:disconnect'),
    isConnected: () => ipcRenderer.invoke('balance:isConnected'),
  },
  backup: {
    create: (label?: string) => ipcRenderer.invoke('backup:create', label),
    list: () => ipcRenderer.invoke('backup:list'),
    delete: (filename: string) => ipcRenderer.invoke('backup:delete', filename),
    restore: (filename: string) => ipcRenderer.invoke('backup:restore', filename),
    getDir: () => ipcRenderer.invoke('backup:getDir'),
    browseDir: () => ipcRenderer.invoke('backup:browseDir'),
    setDir: (dir: string) => ipcRenderer.invoke('backup:setDir', dir),
    restartScheduler: () => ipcRenderer.invoke('backup:restartScheduler'),
  },
  cloud: {
    test: () => ipcRenderer.invoke('cloud:test'),
    uploadNow: (label?: string) => ipcRenderer.invoke('cloud:uploadNow', label),
    list: () => ipcRenderer.invoke('cloud:list'),
  },
  email: {
    restartScheduler: () => ipcRenderer.invoke('email:restartScheduler'),
    testFondCaisse: () => ipcRenderer.invoke('email:testFondCaisse'),
    envoyerFondCaisse: (sessionId: number) => ipcRenderer.invoke('email:envoyerFondCaisse', sessionId),
    envoyerHoraire: () => ipcRenderer.invoke('email:envoyerHoraire'),
    envoyerControle: (sessionId: number, montantCompte: number) => ipcRenderer.invoke('email:envoyerControle', sessionId, montantCompte),
    testConfig: () => ipcRenderer.invoke('email:testConfig'),
    getJournal: () => ipcRenderer.invoke('email:getJournal'),
  },
  forfait: {
    get: () => ipcRenderer.invoke('forfait:get'),
    prolonger: (mois: number) => ipcRenderer.invoke('forfait:prolonger', mois),
    genererLicence: (mois: number) => ipcRenderer.invoke('forfait:genererLicence', mois),
    appliquerLicence: (token: string) => ipcRenderer.invoke('forfait:appliquerLicence', token),
  },
  printer: {
    print: (data: any) => ipcRenderer.invoke('printer:print', data),
    getReceiptText: (data: any) => ipcRenderer.invoke('printer:getReceiptText', data),
    test: () => ipcRenderer.invoke('printer:test'),
    list: () => ipcRenderer.invoke('imprimantes:list'),
    printZpl: (items: any[], printerName: string) => ipcRenderer.invoke('etiquette:printZpl', items, printerName)
  },
  tiroir: {
    ouvrir: (data: any) => ipcRenderer.invoke('tiroir:ouvrir', data)
  },
  dialog: {
    saveFile: (defaultName: string) => ipcRenderer.invoke('dialog:saveFile', defaultName),
    openFile: (extensions?: string[]) => ipcRenderer.invoke('dialog:openFile', extensions)
  },
  shell: {
    openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath)
  },
  fs: {
    writeFile: (filePath: string, data: number[]) => ipcRenderer.invoke('fs:writeFile', filePath, data),
    readText: (filePath: string) => ipcRenderer.invoke('fs:readText', filePath)
  },
  pdf: {
    export: (html: string, defaultName: string) => ipcRenderer.invoke('pdf:export', html, defaultName)
  },
  image: {
    selectProduit: () => ipcRenderer.invoke('image:selectProduit'),
    deleteProduit: (fileUrl: string) => ipcRenderer.invoke('image:deleteProduit', fileUrl)
  },
  entrepot: {
    getAll: () => ipcRenderer.invoke('entrepot:getAll'),
    create: (data: any) => ipcRenderer.invoke('entrepot:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('entrepot:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('entrepot:delete', id),
    getStock: (entrepotId?: number) => ipcRenderer.invoke('entrepot:getStock', entrepotId),
  },
  transfert: {
    getAll: (limit?: number) => ipcRenderer.invoke('transfert:getAll', limit),
    getById: (id: number) => ipcRenderer.invoke('transfert:getById', id),
    create: (data: any) => ipcRenderer.invoke('transfert:create', data),
    valider: (id: number) => ipcRenderer.invoke('transfert:valider', id),
    annuler: (id: number) => ipcRenderer.invoke('transfert:annuler', id),
  },
  prixAchat: {
    historique: (produitId: number) => ipcRenderer.invoke('prixAchat:historique', produitId),
    stats: () => ipcRenderer.invoke('prixAchat:stats'),
    commandePdfData: (commandeId: number) => ipcRenderer.invoke('commande:pdfData', commandeId),
  },
  analytics: {
    dashboard: (dateDebut: string, dateFin: string, boutiqueId?: number) => ipcRenderer.invoke('analytics:dashboard', dateDebut, dateFin, boutiqueId),
    comparaison: (p1: any, p2: any) => ipcRenderer.invoke('analytics:comparaison', p1, p2),
  },
  boutique: {
    getAll: () => ipcRenderer.invoke('boutique:getAll'),
    create: (data: any) => ipcRenderer.invoke('boutique:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('boutique:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('boutique:delete', id),
    statsConsolidees: (dateDebut: string, dateFin: string) => ipcRenderer.invoke('boutique:statsConsolidees', dateDebut, dateFin),
  },
  alertesAuto: {
    getRegles: () => ipcRenderer.invoke('alertes:getRegles'),
    updateRegle: (id: number, data: any) => ipcRenderer.invoke('alertes:updateRegle', id, data),
    runAuto: () => ipcRenderer.invoke('alertes:runAuto'),
    setAutoInterval: (minutes: number) => ipcRenderer.invoke('alertes:setAutoInterval', minutes),
  },
  notifications: {
    configure: (enabled: { [K: string]: boolean }) => ipcRenderer.invoke('notif:configure', enabled),
  },
  importExport: {
    importProduits: (lignes: any[], userId?: number) => ipcRenderer.invoke('import:produits', lignes, userId),
    importClients: (lignes: any[], userId?: number) => ipcRenderer.invoke('import:clients', lignes, userId),
    exportProduits: () => ipcRenderer.invoke('export:produits'),
    exportVentes: (dateDebut: string, dateFin: string) => ipcRenderer.invoke('export:ventes', dateDebut, dateFin),
    exportStock: () => ipcRenderer.invoke('export:stock'),
    exportClients: () => ipcRenderer.invoke('export:clients'),
    getLog: () => ipcRenderer.invoke('import:getLog'),
  },
  customer: {
    open: () => ipcRenderer.invoke('customer:open'),
    close: () => ipcRenderer.invoke('customer:close'),
    isOpen: () => ipcRenderer.invoke('customer:isOpen'),
    push: (payload: any) => ipcRenderer.invoke('customer:push', payload),
    onUpdate: (cb: (data: any) => void) => ipcRenderer.on('customer:update', (_e, data) => cb(data)),
    removeListeners: () => ipcRenderer.removeAllListeners('customer:update'),
  },
  sms: {
    send: (params: any) => ipcRenderer.invoke('sms:send', params),
    formatTicket: (data: any) => ipcRenderer.invoke('sms:formatTicket', data),
  },
  dashboard: {
    getData: () => ipcRenderer.invoke('dashboard:getData'),
  },
  sync: {
    startServer: (port: number) => ipcRenderer.invoke('sync:startServer', port),
    stopServer: () => ipcRenderer.invoke('sync:stopServer'),
    isRunning: () => ipcRenderer.invoke('sync:isRunning'),
    getLocalIp: () => ipcRenderer.invoke('sync:getLocalIp'),
    getPeers: () => ipcRenderer.invoke('sync:getPeers'),
    createPeer: (data: any) => ipcRenderer.invoke('sync:createPeer', data),
    deletePeer: (id: number) => ipcRenderer.invoke('sync:deletePeer', id),
    getJournal: (since?: string) => ipcRenderer.invoke('sync:getJournal', since),
    pushTo: (peerId: number, ip: string, port: number) => ipcRenderer.invoke('sync:pushTo', peerId, ip, port),
    pullFrom: (peerId: number, ip: string, port: number) => ipcRenderer.invoke('sync:pullFrom', peerId, ip, port),
    setAutoInterval: (minutes: number) => ipcRenderer.invoke('sync:setAutoInterval', minutes),
  },
  rt: {
    setRole: (role: string, ip?: string, port?: number, caisseId?: string) => ipcRenderer.invoke('rt:setRole', role, ip, port, caisseId),
    getStatus: () => ipcRenderer.invoke('rt:getStatus'),
    inherit: () => ipcRenderer.invoke('rt:inherit'),
    sendCloture: (data: any) => ipcRenderer.invoke('rt:sendCloture', data),
  },
  whatsapp: {
    openTicket: (phone: string, message: string) => ipcRenderer.invoke('whatsapp:openTicket', phone, message),
  },
  campagne: {
    getAll: () => ipcRenderer.invoke('campagne:getAll'),
    create: (data: any) => ipcRenderer.invoke('campagne:create', data),
    delete: (id: number) => ipcRenderer.invoke('campagne:delete', id),
    getDestinataires: (segment: string) => ipcRenderer.invoke('campagne:getDestinataires', segment),
    marquerEnvoyee: (id: number, nb: number, nbEchec: number) => ipcRenderer.invoke('campagne:marquerEnvoyee', id, nb, nbEchec),
  },
  anniversaire: {
    check: () => ipcRenderer.invoke('anniversaire:check'),
  },
  clientProfile: {
    get: (clientId: number) => ipcRenderer.invoke('client:profile', clientId),
  },
  facture: {
    getAll: (statut?: string) => ipcRenderer.invoke('facture:getAll', statut),
    getById: (id: number) => ipcRenderer.invoke('facture:getById', id),
    create: (data: any) => ipcRenderer.invoke('facture:create', data),
    updateStatut: (id: number, statut: string) => ipcRenderer.invoke('facture:updateStatut', id, statut),
  },
  finance: {
    compteResultat: (annee: number, mois?: number) => ipcRenderer.invoke('finance:compteResultat', annee, mois),
    rapportTVA: (dateDebut?: string, dateFin?: string) => ipcRenderer.invoke('finance:rapportTVA', dateDebut, dateFin),
  },
  audit: {
    getLog: (dateDebut?: string, dateFin?: string, entite?: string) => ipcRenderer.invoke('audit:getLog', dateDebut, dateFin, entite),
  },
  rotation: {
    generer: (userId: number) => ipcRenderer.invoke('rotation:generer', userId),
    getInfo: () => ipcRenderer.invoke('rotation:getInfo'),
    verifier: (code: string) => ipcRenderer.invoke('rotation:verifier', code),
  },
  retour: {
    getVenteByTicket: (ticket: string) => ipcRenderer.invoke('retour:getVenteByTicket', ticket),
    creer: (data: any) => ipcRenderer.invoke('retour:creer', data),
    getListe: (dateDebut?: string, dateFin?: string) => ipcRenderer.invoke('retour:getListe', dateDebut, dateFin),
  },
  commercial: {
    getClientSolde: (clientId: number) => ipcRenderer.invoke('commercial:getClientSolde', clientId),
    getHistoriqueArdoise: (clientId: number, limit?: number) => ipcRenderer.invoke('commercial:getHistoriqueArdoise', clientId, limit),
    vendreACredit: (data: any) => ipcRenderer.invoke('commercial:vendreACredit', data),
    rembourserCredit: (data: any) => ipcRenderer.invoke('commercial:rembourserCredit', data),
    getClientsAvecCredit: () => ipcRenderer.invoke('commercial:getClientsAvecCredit'),
    crediterPortefeuille: (data: any) => ipcRenderer.invoke('commercial:crediterPortefeuille', data),
    debiterPortefeuille: (data: any) => ipcRenderer.invoke('commercial:debiterPortefeuille', data),
    getHistoriquePortefeuille: (clientId: number, limit?: number) => ipcRenderer.invoke('commercial:getHistoriquePortefeuille', clientId, limit),
    getFideliteRegle: () => ipcRenderer.invoke('commercial:getFideliteRegle'),
    setFideliteRegle: (data: any) => ipcRenderer.invoke('commercial:setFideliteRegle', data),
    ajouterPoints: (clientId: number, montant: number, venteId?: number) => ipcRenderer.invoke('commercial:ajouterPoints', clientId, montant, venteId),
    utiliserPoints: (clientId: number, points: number, venteId?: number) => ipcRenderer.invoke('commercial:utiliserPoints', clientId, points, venteId),
    getHistoriqueFidelite: (clientId: number, limit?: number) => ipcRenderer.invoke('commercial:getHistoriqueFidelite', clientId, limit),
    getAllDevis: (statut?: string) => ipcRenderer.invoke('commercial:getAllDevis', statut),
    getDevisById: (id: number) => ipcRenderer.invoke('commercial:getDevisById', id),
    createDevis: (data: any) => ipcRenderer.invoke('commercial:createDevis', data),
    updateDevisStatut: (id: number, statut: string) => ipcRenderer.invoke('commercial:updateDevisStatut', id, statut),
    deleteDevis: (id: number) => ipcRenderer.invoke('commercial:deleteDevis', id),
    transformerDevisEnVente: (devisId: number, caissierId: number, modePaiement: string, montantPaye: number) => ipcRenderer.invoke('commercial:transformerDevisEnVente', devisId, caissierId, modePaiement, montantPaye),
    getDashboard: (dateDebut: string, dateFin: string) => ipcRenderer.invoke('commercial:getDashboard', dateDebut, dateFin),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
    quitAndInstall: () => ipcRenderer.invoke('app:quitAndInstall'),
    onUpdateStatus: (cb: (status: { state: string; info?: any; progress?: number }) => void) => {
      const listener = (_e: any, status: any) => cb(status)
      ipcRenderer.on('app:updateStatus', listener)
      return () => ipcRenderer.removeListener('app:updateStatus', listener)
    },
  }
})
