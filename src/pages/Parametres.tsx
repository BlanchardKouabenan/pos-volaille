import { useState, useEffect } from 'react'
import { getParametres, setParametres, getUsers, createUser, updateUser, deleteUser,
  getCodesSuperviseur, createCodeSuperviseur, updateCodeSuperviseur,
  backupCreate, backupList, backupDelete, backupRestore, backupBrowseDir, backupSetDir, backupRestartScheduler,
  balanceGetPortsCOM, balanceConnect, balanceDisconnect, balanceIsConnected,
  rotationGenerer, rotationGetInfo,
  profilList, profilApply, profilListApplied, profilAdd, profilRemove, getCategories,
  listeImprimantes, testImprimante,
  emailRestartScheduler, emailEnvoyerHoraire, emailTestConfig, emailGetJournal,
  forfaitGet, forfaitProlonger, forfaitGenererLicence, forfaitAppliquerLicence,
  appGetVersion, appCheckForUpdates, appQuitAndInstall, appOnUpdateStatus,
  notifConfigure, cloudTest, cloudUploadNow, cloudList } from '@/lib/ipc'
import { useAuthStore } from '@/store/authStore'
import { useProfilStore } from '@/store/profilStore'
import type { User, UserRole, CodeSuperviseur, ProfilListEntry, ProfilModule } from '@/types'
import { Settings, Users, Printer, Building, Save, Plus, Edit2, Trash2, X, Check,
  Eye, EyeOff, Shield, Clock, Smartphone, HardDrive, FolderOpen, RefreshCw, Download, Scale, Wifi, WifiOff,
  RotateCcw, AlertTriangle, Store, BadgeCheck, Sparkles, Mail, Send, Lock, CalendarClock, KeyRound, Upload, Bell } from 'lucide-react'

type Tab = 'entreprise' | 'commerce' | 'ticket' | 'imprimante' | 'utilisateurs' | 'superviseur' | 'session' | 'sms' | 'email' | 'sauvegardes' | 'balance' | 'forfait'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur', gestionnaire: 'Gestionnaire', caissier: 'Caissier', superviseur: 'Superviseur'
}

const PROFIL_MODULE_LABELS: Record<ProfilModule, string> = {
  pesee: 'Pesée / balance',
  variantes: 'Variantes (tailles, couleurs…)',
  peremption: 'Dates de péremption & lots',
  forfaits_client: 'Abonnements client (forfaits)',
  fidelite: 'Programme fidélité',
  ardoise: 'Crédit / ardoise',
  devis: 'Devis',
  commandes_fournisseurs: 'Commandes fournisseurs',
  inventaire: 'Inventaire',
  promotions: 'Promotions',
  campagnes: 'Campagnes SMS',
  multi_entrepots: 'Multi-entrepôts & transferts',
  factures: 'Factures & TVA',
  retours: 'Retours articles',
  sms: 'SMS & notifications',
}

const emptyUserForm = () => ({ username: '', password: '', role: 'caissier' as UserRole, nom: '' })

export default function Parametres() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('entreprise')
  const [params, setParams] = useState<Record<string, string>>({})
  const [users, setUsers] = useState<User[]>([])
  const [codes, setCodes] = useState<CodeSuperviseur[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [userForm, setUserForm] = useState(emptyUserForm())
  const [showPass, setShowPass] = useState(false)
  const [userError, setUserError] = useState('')
  const [savingUser, setSavingUser] = useState(false)

  // Mise à jour automatique
  const [appVersion, setAppVersion] = useState('')
  const [updateState, setUpdateState] = useState('')
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [updateProgress, setUpdateProgress] = useState(0)
  const [checkingUpdate, setCheckingUpdate] = useState(false)

  // Type de commerce
  const current = useProfilStore(s => s.current)
  const reloadProfil = useProfilStore(s => s.load)
  const [profils, setProfils] = useState<ProfilListEntry[]>([])
  const [profilSelection, setProfilSelection] = useState<string>('')
  const [profilSaving, setProfilSaving] = useState(false)
  const [profilMsg, setProfilMsg] = useState('')
  const [nbCategories, setNbCategories] = useState(0)
  const [remplacer, setRemplacer] = useState(false)
  const [appliedProfiles, setAppliedProfiles] = useState<{ id: string; label: string; applique_le?: string }[]>([])
  const [addProfilId, setAddProfilId] = useState('')
  const [addProfilLoading, setAddProfilLoading] = useState(false)
  const [removeProfilLoading, setRemoveProfilLoading] = useState<string | null>(null)

  // Code rotatif (30min)
  const [rotationInfo, setRotationInfo] = useState<{ expire_a: string; genere_le: string; genere_par_nom: string; reste_secondes: number; actif: boolean } | null>(null)
  const [rotationCode, setRotationCode] = useState<string | null>(null)
  const [rotationLoading, setRotationLoading] = useState(false)
  const [rotationCountdown, setRotationCountdown] = useState(0)

  // Code superviseur
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [editingCode, setEditingCode] = useState<CodeSuperviseur | null>(null)
  const [codeForm, setCodeForm] = useState({ code: '', user_id: '' })
  const [showCodeVal, setShowCodeVal] = useState(false)
  const [codeError, setCodeError] = useState('')
  const [savingCode, setSavingCode] = useState(false)

  // Backup state
  const [backups, setBackups] = useState<{ filename: string; size: number; date: string; path: string }[]>([])
  const [backupLoading, setBackupLoading] = useState(false)
const [backupMsg, setBackupMsg] = useState('')
const [backupError, setBackupError] = useState('')
const [cloudBusy, setCloudBusy] = useState(false)
const [cloudMsg, setCloudMsg] = useState('')
const [cloudError, setCloudError] = useState('')
const [cloudFiles, setCloudFiles] = useState<string[]>([])

  // Balance
  const [portsCOM, setPortsCOM] = useState<string[]>([])
  const [balanceConnected, setBalanceConnected] = useState(false)
  const [balanceTesting, setBalanceTesting] = useState(false)

  // Imprimante
  const [printers, setPrinters] = useState<{ name: string; thermal: boolean }[]>([])
  const [printTesting, setPrintTesting] = useState(false)
  const [printTestMsg, setPrintTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Email
const [mailBusy, setMailBusy] = useState(false)
const [mailMsg, setMailMsg] = useState('')
const [journalEmails, setJournalEmails] = useState<any[]>([])
const [journalBusy, setJournalBusy] = useState(false)

const loadJournal = async () => {
  setJournalBusy(true)
  try { setJournalEmails(await emailGetJournal()) } catch {}
  setJournalBusy(false)
}
const [forfait, setForfait] = useState<any>(null)
const [forfaitBusy, setForfaitBusy] = useState(false)
const [forfaitMsg, setForfaitMsg] = useState<{ ok: boolean; text: string } | null>(null)
const [licenceToken, setLicenceToken] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const [p, u, c, ri, pl, cats, prs, applied] = await Promise.all([getParametres(), getUsers(), getCodesSuperviseur(), rotationGetInfo(), profilList(), getCategories(), listeImprimantes(), profilListApplied()])
        setParams(p as any)
        setUsers(u)
        setCodes(c)
        setProfils(pl)
        setAppliedProfiles(applied as any)
        setNbCategories(Array.isArray(cats) ? cats.length : 0)
        setPrinters(Array.isArray(prs) ? prs : [])
        if (ri) { setRotationInfo(ri); setRotationCountdown(ri.reste_secondes) }
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (tab === 'forfait') forfaitGet().then(setForfait).catch(() => {})
  }, [tab])

  useEffect(() => {
    if (tab === 'email') loadJournal()
  }, [tab])

  const handleForfaitProlonger = async (mois: number) => {
    setForfaitBusy(true); setForfaitMsg(null)
    try {
      const r = await forfaitProlonger(mois)
      setForfait(r)
      setForfaitMsg({ ok: true, text: `Forfait prolongé de ${mois} mois. Nouvelle expiration : ${r.expiration || 'illimité'}.` })
    } catch (e: any) { setForfaitMsg({ ok: false, text: 'Erreur : ' + (e.message || '') }) }
    setForfaitBusy(false)
  }

  const handleForfaitGenererLicence = async (mois: number) => {
    setForfaitBusy(true); setForfaitMsg(null)
    try {
      const token = await forfaitGenererLicence(mois)
      setLicenceToken(token)
      setForfait(await forfaitGet())
      setForfaitMsg({ ok: true, text: 'Licence générée. Copiez-la ci-dessous ou enregistrez-la dans un fichier .kbkey pour prolonger à distance.' })
    } catch (e: any) { setForfaitMsg({ ok: false, text: 'Erreur : ' + (e.message || '') }) }
    setForfaitBusy(false)
  }

  const handleForfaitAppliquerLicence = async () => {
    if (!licenceToken.trim()) { setForfaitMsg({ ok: false, text: 'Collez ou chargez une licence.' }); return }
    setForfaitBusy(true); setForfaitMsg(null)
    try {
      const r = await forfaitAppliquerLicence(licenceToken.trim())
      setForfait(r)
      setLicenceToken('')
      setForfaitMsg({ ok: true, text: 'Licence appliquée avec succès. Nouvelle expiration : ' + (r.expiration || 'illimité') })
    } catch (e: any) { setForfaitMsg({ ok: false, text: 'Erreur : ' + (e.message || '') }) }
    setForfaitBusy(false)
  }

  const handleForfaitLoadFile = async () => {
    try {
      const api = (window as any).electronAPI
      if (!api?.dialog?.openFile) { setForfaitMsg({ ok: false, text: 'Sélection de fichier non disponible.' }); return }
      const path = await api.dialog.openFile(['kbkey', 'txt'])
      if (!path) return
      const content = await api.fs?.readText?.(path)
      setLicenceToken((content || '').trim())
    } catch (e: any) { setForfaitMsg({ ok: false, text: 'Erreur : ' + (e.message || '') }) }
  }

  const handleApplyProfil = async (id: string) => {
    const changementType = id !== current?.id
    const vaRemplacer = nbCategories > 0 && (changementType || remplacer)
    if (vaRemplacer) {
      const ok = window.confirm(
        `Appliquer « ${profils.find(p => p.id === id)?.label ?? id} » ?\n\n` +
        `Cela remplace les ${nbCategories} catégories et tous les produits actuels par le catalogue de ce type de commerce. L'historique des ventes est conservé.`
      )
      if (!ok) return
    }
    setProfilSaving(true)
    setProfilMsg('')
    try {
      await profilApply(id, { remplacerCatalogue: remplacer })
      const applied = await profilListApplied()
      setAppliedProfiles(applied as any)
      await reloadProfil()
      setProfilSelection('')
      setRemplacer(false)
      setProfilMsg('Type de commerce appliqué, paramètres mis à jour.')
      setTimeout(() => setProfilMsg(''), 3500)
    } catch {
      setProfilMsg('Erreur pendant l\'application du profil.')
    }
    setProfilSaving(false)
  }

  const handleAddProfil = async () => {
    if (!addProfilId) return
    setAddProfilLoading(true)
    setProfilMsg('')
    try {
      await profilAdd(addProfilId)
      const applied = await profilListApplied()
      setAppliedProfiles(applied as any)
      setAddProfilId('')
      setProfilMsg('Type de commerce ajouté.')
      await reloadProfil()
      setTimeout(() => setProfilMsg(''), 3500)
    } catch {
      setProfilMsg("Erreur lors de l'ajout du type de commerce.")
    }
    setAddProfilLoading(false)
  }

  const handleRemoveProfil = async (id: string) => {
    const label = profils.find(p => p.id === id)?.label ?? id
    const isPrincipal = appliedProfiles.findIndex(a => a.id === id) === 0
    const principalNote = isPrincipal
      ? `\n\nCe type est le PRINCIPAL. S'il en reste d'autres, le type suivant deviendra le nouveau principal (et déterminera devise et TVA).`
      : ''
    if (!window.confirm(`Retirer « ${label} » du magasin ?\n\nSes catégories et produits seront supprimés du stock (les catégories partagées avec un autre type sont conservées).${principalNote}`)) return
    setRemoveProfilLoading(id)
    setProfilMsg('')
    try {
      await profilRemove(id)
      const applied = await profilListApplied()
      setAppliedProfiles(applied as any)
      setProfilMsg('Type de commerce retiré.')
      await reloadProfil()
      setTimeout(() => setProfilMsg(''), 3500)
    } catch {
      setProfilMsg('Erreur lors du retrait du type de commerce.')
    }
    setRemoveProfilLoading(null)
  }

  // Countdown ticker pour le code rotatif
  useEffect(() => {
    if (rotationCountdown <= 0) return
    const t = setInterval(() => setRotationCountdown(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [rotationCountdown])

  const handleSave = async () => {
    setSaving(true)
    try {
      await setParametres(params)
      try { await emailRestartScheduler() } catch {}
      try {
        await notifConfigure({
          vente: (params.notif_vente ?? '1') !== '0',
          stock: (params.notif_stock ?? '1') !== '0',
          ardoise: (params.notif_ardoise ?? '1') !== '0',
          fidelite: (params.notif_fidelite ?? '1') !== '0',
          rapport: (params.notif_rapport ?? '1') !== '0'
        })
      } catch {}
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {}
    setSaving(false)
  }

  const openCreateUser = () => {
    setEditingUser(null)
    setUserForm(emptyUserForm())
    setUserError('')
    setShowUserModal(true)
  }

  const openEditUser = (u: User) => {
    setEditingUser(u)
    setUserForm({ username: u.username, password: '', role: u.role, nom: u.nom })
    setUserError('')
    setShowUserModal(true)
  }

  const handleSaveUser = async () => {
    if (!userForm.nom.trim()) { setUserError('Le nom est requis'); return }
    if (!userForm.username.trim()) { setUserError('L\'identifiant est requis'); return }
    if (!editingUser && !userForm.password) { setUserError('Le mot de passe est requis'); return }
    setSavingUser(true)
    try {
      if (editingUser) {
        const data: any = { nom: userForm.nom, username: userForm.username, role: userForm.role }
        if (userForm.password) data.password = userForm.password
        await updateUser(editingUser.id, data)
      } else {
        await createUser(userForm)
      }
      const u = await getUsers()
      setUsers(u)
      setShowUserModal(false)
    } catch { setUserError('Erreur lors de la sauvegarde') }
    setSavingUser(false)
  }

  const handleDeleteUser = async (u: User) => {
    if (u.role === 'admin') { alert('Le compte administrateur ne peut pas être supprimé'); return }
    if (!confirm(`Supprimer l'utilisateur "${u.nom}" ?`)) return
    try {
      await deleteUser(u.id)
      setUsers(await getUsers())
    } catch { alert('Impossible de supprimer ce compte (administrateur protégé)') }
  }

  // Codes superviseur
  const openCreateCode = () => {
    setEditingCode(null)
    setCodeForm({ code: '', user_id: users[0]?.id?.toString() ?? '' })
    setCodeError('')
    setShowCodeModal(true)
  }

  const openEditCode = (c: CodeSuperviseur) => {
    setEditingCode(c)
    setCodeForm({ code: '', user_id: String(c.user_id) })
    setCodeError('')
    setShowCodeModal(true)
  }

  const handleSaveCode = async () => {
    if (!codeForm.code && !editingCode) { setCodeError('Le code est requis'); return }
    if (codeForm.code && !/^\d{4}$/.test(codeForm.code)) { setCodeError('Le code doit être 4 chiffres'); return }
    if (!codeForm.user_id) { setCodeError('L\'utilisateur est requis'); return }
    setSavingCode(true)
    setCodeError('')
    try {
      if (editingCode) {
        const data: any = { user_id: parseInt(codeForm.user_id) }
        if (codeForm.code) data.code = codeForm.code
        await updateCodeSuperviseur(editingCode.id, data)
      } else {
        await createCodeSuperviseur(codeForm.code, parseInt(codeForm.user_id))
      }
      setCodes(await getCodesSuperviseur())
      setShowCodeModal(false)
    } catch { setCodeError('Erreur lors de la sauvegarde') }
    setSavingCode(false)
  }

  const handleToggleCode = async (c: CodeSuperviseur) => {
    await updateCodeSuperviseur(c.id, { actif: c.actif ? 0 : 1 })
    setCodes(await getCodesSuperviseur())
  }

  const loadBackups = async () => {
    try { setBackups(await backupList()) } catch {}
  }

  const handleCreateBackup = async () => {
    setBackupLoading(true)
    setBackupMsg('')
    setBackupError('')
    try {
      const result = await backupCreate('manuel')
      if (result.success) {
        setBackupMsg(`Sauvegarde créée : ${result.filename}`)
        await loadBackups()
      } else {
        setBackupError(result.error ?? 'Erreur inconnue')
      }
    } catch (e: any) { setBackupError(e.message) }
    setBackupLoading(false)
  }

  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(`Supprimer la sauvegarde "${filename}" ?`)) return
    await backupDelete(filename)
    await loadBackups()
  }

  const handleBrowseBackupDir = async () => {
    const dir = await backupBrowseDir()
    if (dir) {
      await backupSetDir(dir)
      setParams(p => ({ ...p, backup_dir: dir }))
      await setParametres({ ...params, backup_dir: dir })
      await loadBackups()
    }
  }

  const handleSaveBackupSettings = async () => {
    await setParametres(params)
    await backupRestartScheduler()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleCloudTest = async () => {
    setCloudBusy(true); setCloudMsg(''); setCloudError('')
    try {
      const r = await cloudTest()
      if (r.success) setCloudMsg('Connexion WebDAV réussie ✅'); else setCloudError(r.error || 'Échec')
    } catch (e: any) { setCloudError(e.message) }
    setCloudBusy(false)
  }

  const handleCloudUploadNow = async () => {
    setCloudBusy(true); setCloudMsg(''); setCloudError('')
    try {
      const r = await cloudUploadNow('cloud')
      if (r.success) { setCloudMsg('Backup envoyé au cloud ✅'); loadCloudFiles() }
      else setCloudError(r.error || 'Échec de l\'upload')
    } catch (e: any) { setCloudError(e.message) }
    setCloudBusy(false)
  }

  const loadCloudFiles = async () => {
    try {
      const r = await cloudList()
      if (r.success && r.files) setCloudFiles(r.files)
    } catch {}
  }

  useEffect(() => {
    if (tab === 'sauvegardes') { loadBackups(); loadCloudFiles() }
    if (tab === 'balance') {
      balanceGetPortsCOM().then(setPortsCOM).catch(() => {})
      balanceIsConnected().then(setBalanceConnected).catch(() => {})
    }
  }, [tab])

  // Mise à jour : version courante + écoute des événements
  useEffect(() => {
    appGetVersion().then(v => setAppVersion(v || '')).catch(() => {})
    const off = appOnUpdateStatus((st: any) => {
      setUpdateState(st.state)
      setUpdateInfo(st.info || null)
      if (typeof st.progress === 'number') setUpdateProgress(st.progress)
    })
    return off
  }, [])

  const verifierMaj = async () => {
    setCheckingUpdate(true)
    try {
      const r = await appCheckForUpdates()
      if (r?.status === 'dev') setUpdateState('dev')
      else if (r?.status === 'checked' && !r.updateAvailable) setUpdateState('up-to-date')
    } catch { setUpdateState('error') }
    setCheckingUpdate(false)
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const tabs: { id: Tab; label: string; icon: JSX.Element }[] = [
    { id: 'entreprise', label: 'Entreprise', icon: <Building size={18} /> },
    { id: 'commerce', label: 'Type de commerce', icon: <Store size={18} /> },
    { id: 'ticket', label: 'Ticket', icon: <Settings size={18} /> },
    { id: 'imprimante', label: 'Imprimante', icon: <Printer size={18} /> },
    { id: 'utilisateurs', label: 'Utilisateurs', icon: <Users size={18} /> },
    { id: 'superviseur', label: 'Superviseur', icon: <Shield size={18} /> },
    { id: 'session', label: 'Session', icon: <Clock size={18} /> },
    { id: 'sms', label: 'SMS', icon: <Smartphone size={18} /> },
    { id: 'email', label: 'Email', icon: <Mail size={18} /> },
    { id: 'forfait', label: 'Forfait', icon: <CalendarClock size={18} /> },
    { id: 'sauvegardes', label: 'Sauvegarde', icon: <HardDrive size={18} /> },
    { id: 'balance', label: 'Balance', icon: <Scale size={18} /> },
  ]

  const showSaveButton = tab !== 'utilisateurs' && tab !== 'superviseur' && tab !== 'sauvegardes' && tab !== 'balance' && tab !== 'commerce' && tab !== 'forfait'

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-800">Paramètres</h1>
          {showSaveButton && (
            <button onClick={handleSave} disabled={saving}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
              {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
              {saved ? 'Enregistré !' : 'Enregistrer'}
            </button>
          )}
        </div>
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-shrink-0 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${tab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {/* Entreprise */}
        {tab === 'entreprise' && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
              <h2 className="font-bold text-gray-800 text-lg">Informations de l'entreprise</h2>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nom de l'entreprise</label>
                <input type="text" value={params.nom_entreprise || ''} onChange={e => setParams(p => ({ ...p, nom_entreprise: e.target.value }))}
                  className="input-field" placeholder="KB POS" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Adresse</label>
                <input type="text" value={params.adresse || ''} onChange={e => setParams(p => ({ ...p, adresse: e.target.value }))}
                  className="input-field" placeholder="Abidjan, Côte d'Ivoire" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Téléphone</label>
                  <input type="tel" value={params.telephone || ''} onChange={e => setParams(p => ({ ...p, telephone: e.target.value }))}
                    className="input-field" placeholder="+225 07 00 00 00 00" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                  <input type="email" value={params.email || ''} onChange={e => setParams(p => ({ ...p, email: e.target.value }))}
                    className="input-field" placeholder="contact@entreprise.ci" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Monnaie</label>
                  <select value={params.monnaie || 'FCFA'} onChange={e => setParams(p => ({ ...p, monnaie: e.target.value }))} className="input-field">
                    <option value="FCFA">FCFA</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GNF">GNF</option>
                    <option value="XOF">XOF</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">TVA (%)</label>
                  <input type="number" value={params.tva_taux || '0'} onChange={e => setParams(p => ({ ...p, tva_taux: e.target.value }))}
                    className="input-field" min="0" max="100" step="0.5" />
                </div>
              </div>
            </div>

            {/* À propos / Mise à jour */}
            <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
              <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2"><Download size={18} className="text-blue-600" /> Mise à jour de l'application</h2>
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex justify-between"><span className="text-gray-400">Version installée</span><span className="font-mono font-bold">{appVersion || '—'}</span></div>
                <p className="text-xs text-gray-400 pt-1">
                  Votre base de données (articles, ventes, clients…) est conservée dans un dossier séparé et n'est <strong>jamais touchée</strong> lors d'une mise à jour.
                </p>
              </div>

              {updateState === 'checking' && (
                <div className="flex items-center gap-2 text-sm text-gray-500"><RefreshCw size={16} className="animate-spin" /> Vérification des mises à jour…</div>
              )}
              {updateState === 'dev' && (
                <p className="text-sm text-gray-400">Mise à jour automatique active uniquement dans l'application installée (pas en mode développement).</p>
              )}
              {updateState === 'available' && (
                <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl p-3 text-sm flex items-center gap-2">
                  <Download size={16} /> Nouvelle version disponible : <span className="font-mono font-bold">{updateInfo?.version}</span> — téléchargement…
                </div>
              )}
              {updateState === 'downloading' && (
                <div className="space-y-1">
                  <div className="flex justify-between text-sm text-blue-700"><span>Téléchargement…</span><span className="font-mono">{Math.round(updateProgress)}%</span></div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 transition-all" style={{ width: `${updateProgress}%` }} />
                  </div>
                </div>
              )}
              {updateState === 'downloaded' && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-sm flex items-center gap-2">
                  <Download size={16} /> Nouvelle version prête à installer.
                  <button onClick={() => appQuitAndInstall()} className="ml-auto btn-success text-xs px-3 py-1.5 rounded-lg font-bold">Redémarrer & installer</button>
                </div>
              )}
              {updateState === 'up-to-date' && (
                <p className="text-sm text-emerald-600 flex items-center gap-2"><Check size={16} /> L'application est à jour.</p>
              )}
              {updateState === 'error' && (
                <p className="text-sm text-red-600 flex items-center gap-2"><AlertTriangle size={16} /> Erreur lors de la vérification. Vérifiez la connexion Internet.</p>
              )}
              {updateState === 'not-available' && (
                <p className="text-sm text-gray-500">Aucune mise à jour pour le moment.</p>
              )}

              <button onClick={verifierMaj} disabled={checkingUpdate || updateState === 'downloading' || updateState === 'downloaded'}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                <RefreshCw size={15} className={checkingUpdate ? 'animate-spin' : ''} /> Vérifier les mises à jour
              </button>
            </div>
          </div>
        )}

        {/* Type de commerce */}
        {tab === 'commerce' && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-white rounded-2xl shadow-card p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="font-bold text-gray-800 text-lg">Type de commerce</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    L'application adapte unités, devise, TVA, paiements et modules à votre activité.
                  </p>
                </div>
                <Sparkles size={24} className="text-indigo-500" />
              </div>

              {appliedProfiles.length > 0 && (
                <div className="mb-5">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Types de commerce de votre magasin
                  </div>
                  <div className="space-y-2">
                    {appliedProfiles.map((ap, idx) => {
                      const p = profils.find(x => x.id === ap.id)
                      const isPrincipal = idx === 0
                      return (
                        <div key={ap.id} className={`flex items-center gap-3 rounded-2xl border-2 p-3 ${isPrincipal ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-white'}`}>
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                            style={{ backgroundColor: (p?.couleur || '#6366f1') + '22' }}
                          >
                            {p?.icone || '🏪'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-800 text-sm truncate">{ap.label}</span>
                              {isPrincipal && (
                                <span className="text-[10px] font-bold bg-indigo-500 text-white px-1.5 py-0.5 rounded-full shrink-0">
                                  PRINCIPAL
                                </span>
                              )}
                              {!isPrincipal && (
                                <span className="text-[10px] font-bold bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full shrink-0">
                                  ADDITIF
                                </span>
                              )}
                            </div>
                            {ap.applique_le && (
                              <div className="text-xs text-gray-400">
                                Ajouté le {new Date(ap.applique_le).toLocaleDateString('fr-FR')}
                              </div>
                            )}
                          </div>
                          {isPrincipal ? (
                            <BadgeCheck className="text-indigo-400 shrink-0" size={20} />
                          ) : null}
                          {isPrincipal && appliedProfiles.length > 1 && (
                            <button
                              onClick={() => handleRemoveProfil(ap.id)}
                              disabled={removeProfilLoading === ap.id}
                              className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                              title={`Retirer ${ap.label} (devient le principal s'il reste des types)`}
                            >
                              {removeProfilLoading === ap.id ? (
                                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          )}
                          {!isPrincipal && (
                            <button
                              onClick={() => handleRemoveProfil(ap.id)}
                              disabled={removeProfilLoading === ap.id}
                              className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                              title={`Retirer ${ap.label}`}
                            >
                              {removeProfilLoading === ap.id ? (
                                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {appliedProfiles.length > 0 && (
                <div className="bg-gray-50 rounded-2xl p-4 mb-5">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Ajouter un type de commerce
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={addProfilId}
                      onChange={e => setAddProfilId(e.target.value)}
                      className="input-field flex-1 h-10 text-sm"
                    >
                      <option value="">Choisir un type…</option>
                      {profils
                        .filter(p => !appliedProfiles.some(a => a.id === p.id))
                        .map(p => (
                          <option key={p.id} value={p.id}>{p.icone} {p.label}</option>
                        ))}
                    </select>
                    <button
                      onClick={handleAddProfil}
                      disabled={!addProfilId || addProfilLoading}
                      className="btn-primary px-4 h-10 text-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      {addProfilLoading ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <><Plus size={14} /> Ajouter</>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {appliedProfiles.length === 0 && current && (
                <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-5">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                    style={{ backgroundColor: (current.couleur || '#3b82f6') + '22' }}
                  >
                    {current.icone || '🏪'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-500">Type de commerce actuel</div>
                    <div className="font-bold text-gray-800 truncate">{current.label}</div>
                  </div>
                  <BadgeCheck className="text-indigo-500 shrink-0" size={22} />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1 mb-4">
                {profils.map(p => {
                  const actif = current?.id === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setProfilSelection(p.id)
                        setProfilMsg('')
                      }}
                      className={`text-left rounded-2xl border-2 p-4 transition-all ${
                        profilSelection === p.id
                          ? 'border-blue-500 bg-blue-50 shadow-md'
                          : actif
                            ? 'border-emerald-300 bg-emerald-50/60'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                          style={{ backgroundColor: p.couleur + '22' }}
                        >
                          {p.icone}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-gray-800 text-sm">{p.label}</span>
                            {actif && <Check size={14} className="text-emerald-600 shrink-0" />}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {profilMsg && (
                <div className={`mb-3 px-4 py-3 rounded-xl text-sm font-medium ${profilMsg.startsWith('Erreur') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
                  {profilMsg}
                </div>
              )}

              <div className="flex items-center justify-between gap-4">
                <button
                  onClick={() => profilSelection && handleApplyProfil(profilSelection)}
                  disabled={!profilSelection || profilSaving}
                  className="btn-primary px-5 h-11 text-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {profilSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Store size={16} />}
                  Appliquer ce type de commerce
                </button>
                <p className="text-xs text-gray-400 text-right">
                  Changer de type de commerce remplace les produits/catégories si la
                  typologie ne correspond pas (historique des ventes conservé).
                </p>
              </div>
            </div>

            {nbCategories > 0 && (
              <div className="bg-white rounded-2xl shadow-card p-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-gray-800">
                      {nbCategories} catégories et des produits existent
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      Quand vous changez de type de commerce, les articles incompatibles avec la
                      nouvelle activité (ex. volaille → vêtements) sont automatiquement remplacés.
                      Cochez cette option pour forcer le remplacement complet du catalogue,
                      même si vous ré-appliquez le même type de commerce.
                    </p>
                    <label className="inline-flex items-center gap-2 mt-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={remplacer}
                        onChange={e => setRemplacer(e.target.checked)}
                        className="w-4 h-4 accent-amber-500"
                      />
                      <span className="text-sm font-semibold text-gray-800">
                        Remplacer les produits et catégories par ceux du type choisi
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {current && current.modules && (
              <div className="bg-white rounded-2xl shadow-card p-6">
                <h3 className="font-bold text-gray-800 mb-3">Modules adaptés pour {current.label}</h3>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(current.modules) as [ProfilModule, boolean][])
                    .filter(([, actif]) => actif)
                    .map(([mod]) => (
                      <span key={mod} className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-full">
                        <Check size={12} />
                        {PROFIL_MODULE_LABELS[mod] ?? mod}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ticket */}
        {tab === 'ticket' && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
              <h2 className="font-bold text-gray-800 text-lg">En-tête et pied de ticket</h2>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">En-tête du ticket</label>
                <textarea value={params.receipt_header || ''} onChange={e => setParams(p => ({ ...p, receipt_header: e.target.value }))}
                  className="input-field resize-none" rows={4}
                  placeholder="Bienvenue chez KB POS&#10;Produits frais de qualité" />
                <p className="text-xs text-gray-400 mt-1">Chaque ligne = une ligne sur le ticket</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Pied de page du ticket</label>
                <textarea value={params.receipt_footer || ''} onChange={e => setParams(p => ({ ...p, receipt_footer: e.target.value }))}
                  className="input-field resize-none" rows={4}
                  placeholder="Merci de votre confiance!&#10;Conservez ce ticket pour tout échange." />
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-card p-6">
              <h3 className="font-bold text-gray-700 mb-3 text-sm">Aperçu du ticket</h3>
              <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4 font-mono text-xs text-gray-700 whitespace-pre-line">
                {`${params.nom_entreprise || 'KB POS'}\n${params.adresse || ''}\nTél: ${params.telephone || ''}\n${'─'.repeat(32)}\n${params.receipt_header || ''}\n${'─'.repeat(32)}\nTicket: TK-20241201-0001\nDate  : 01/12/2024 10:30\nCaisse: Admin\n${'─'.repeat(32)}\nPoulet entier        3 500 FCFA\n  1 pièce x 3 500 FCFA\n${'─'.repeat(32)}\nTOTAL:          3 500 FCFA\n${'─'.repeat(32)}\nPaiement: Espèces\nMontant payé: 5 000 FCFA\nMonnaie:      1 500 FCFA\n${'─'.repeat(32)}\n${params.receipt_footer || ''}`}
              </div>
            </div>
          </div>
        )}

        {/* Imprimante */}
        {tab === 'imprimante' && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
              <h2 className="font-bold text-gray-800 text-lg">Configuration de l'imprimante</h2>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Type d'imprimante</label>
                <select value={params.printer_type || 'EPSON'} onChange={e => setParams(p => ({ ...p, printer_type: e.target.value }))} className="input-field">
                  <option value="EPSON">Epson ESC/POS</option>
                  <option value="STAR">Star</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Interface</label>
                <select value={params.printer_interface || 'USB'} onChange={e => setParams(p => ({ ...p, printer_interface: e.target.value }))} className="input-field">
                  <option value="USB">USB</option>
                  <option value="NETWORK">Réseau (TCP/IP)</option>
                  <option value="SERIAL">Série (COM)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Imprimantes détectées (Windows)</label>
                <div className="flex gap-2">
                  <select
                    value={printers.some(x => x.name === (params.printer_port || '')) ? params.printer_port : ''}
                    onChange={e => {
                      if (e.target.value) setParams(p => ({ ...p, printer_port: e.target.value, printer_interface: p.printer_interface || 'USB' }))
                    }}
                    className="input-field flex-1"
                  >
                    <option value="">— Choix de l'imprimante de la liste —</option>
                    {printers.map(x => <option key={x.name} value={x.name}>{x.name}{x.thermal ? ' (thermique)' : ''}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => listeImprimantes().then(setPrinters).catch(() => {})}
                    className="btn btn-secondary px-3 py-2"
                    title="Rafraîchir la liste des imprimantes"
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {printers.length === 0
                    ? 'Aucune imprimante installée détectée. Installez le pilote de votre imprimante thermique (ex: Epson TM) puis cliquez pour rafraîchir.'
                    : 'Sélectionnez la file d\'impression de votre thermique (pilote installé requis).'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Port / Adresse
                  <span className="text-gray-400 font-normal ml-2 text-xs">
                    {params.printer_interface === 'NETWORK' ? 'Ex: 192.168.1.100' : params.printer_interface === 'SERIAL' ? 'Ex: COM3' : 'Ex: EPSON TM-T6000'}
                  </span>
                </label>
                <input type="text" value={params.printer_port || ''} onChange={e => setParams(p => ({ ...p, printer_port: e.target.value }))}
                  className="input-field font-mono" />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    if (!(params.printer_port || '').trim()) {
                      setPrintTestMsg({ ok: false, text: "Renseignez d'abord le port / adresse (ou choisissez une imprimante de la liste)." })
                      return
                    }
                    setPrintTesting(true)
                    setPrintTestMsg(null)
                    const r = await testImprimante()
                    setPrintTesting(false)
                    if (r && r.success) setPrintTestMsg({ ok: true, text: `Ticket de test envoyé → ${r.interface_utilisee || ''}`.trim() })
                    else setPrintTestMsg({ ok: false, text: r?.error || "Échec de l'impression." + (r?.interface_utilisee ? ' (cible: ' + r.interface_utilisee + ')' : '') })
                  }}
                  disabled={printTesting}
                  className="btn-primary flex items-center gap-2 py-2 px-4"
                >
                  {printTesting ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Printer size={16} />}
                  Tester l'impression
                </button>
                {printTestMsg && (
                  <span className={`text-sm font-medium ${printTestMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                    {printTestMsg.ok ? '✓ ' : '✗ '}{printTestMsg.text}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Users */}
        {tab === 'utilisateurs' && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800 text-lg">Gestion des utilisateurs</h2>
              <button onClick={openCreateUser} className="btn-primary flex items-center gap-2 py-2 px-4">
                <Plus size={16} /> Nouvel utilisateur
              </button>
            </div>
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nom</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Identifiant</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rôle</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm">
                            {u.nom.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-gray-800 text-sm">{u.nom}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-600">{u.username}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                          u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                          u.role === 'gestionnaire' ? 'bg-blue-100 text-blue-700' :
                          u.role === 'superviseur' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${u.actif ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {u.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEditUser(u)} className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors">
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u)}
                            disabled={u.role === 'admin'}
                            title={u.role === 'admin' ? 'Le compte administrateur ne peut pas être supprimé' : 'Supprimer'}
                            className={`p-2 rounded-lg transition-colors ${
                              u.role === 'admin'
                                ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                                : 'bg-red-50 hover:bg-red-100 text-red-600'
                            }`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Codes superviseur */}
        {tab === 'superviseur' && (
          <div className="max-w-2xl space-y-6">

            {/* ── CODE ROTATIF (30min) ── */}
            <div className="bg-white rounded-2xl shadow-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <RotateCcw size={20} className="text-orange-500" />
                <h2 className="font-bold text-gray-800 text-lg">Code rotatif (autorisation retours)</h2>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Ce code à 6 chiffres s'utilise pour autoriser les retours d'articles depuis la caisse.
                Il est valable <strong>30 minutes</strong> puis expire automatiquement.
              </p>

              {rotationCode ? (
                <div className="bg-orange-50 border-2 border-orange-300 rounded-2xl p-5 text-center">
                  <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide mb-1">Code actuel</p>
                  <div className="text-5xl font-mono font-bold tracking-[0.3em] text-orange-700 mb-2">
                    {rotationCode}
                  </div>
                  <p className="text-sm text-orange-600">
                    Expire dans : <strong>{Math.floor(rotationCountdown / 60)}:{String(rotationCountdown % 60).padStart(2, '0')}</strong>
                  </p>
                  <p className="text-xs text-orange-400 mt-1">Communiquez ce code verbalement à la caissière.</p>
                </div>
              ) : rotationInfo ? (
                <div className={`rounded-xl p-4 text-sm ${rotationInfo.actif && rotationCountdown > 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  {rotationInfo.actif && rotationCountdown > 0 ? (
                    <>
                      <p className="text-green-700 font-semibold">Un code est actif</p>
                      <p className="text-green-600">Expire dans : <strong>{Math.floor(rotationCountdown / 60)}:{String(rotationCountdown % 60).padStart(2, '0')}</strong></p>
                      <p className="text-green-500 text-xs mt-1">Généré par {rotationInfo.genere_par_nom}</p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-red-700 font-semibold mb-1">
                        <AlertTriangle size={16} /> Code expiré
                      </div>
                      <p className="text-red-600 text-xs">Générez un nouveau code pour autoriser les retours.</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-400 text-center">
                  Aucun code généré aujourd'hui.
                </div>
              )}

              <button
                onClick={async () => {
                  if (!user) return
                  setRotationLoading(true)
                  try {
                    const code = await rotationGenerer(user.id)
                    setRotationCode(code)
                    setRotationCountdown(30 * 60)
                    const ri = await rotationGetInfo()
                    if (ri) setRotationInfo(ri)
                  } catch {}
                  setRotationLoading(false)
                }}
                disabled={rotationLoading}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-all"
              >
                {rotationLoading
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <RotateCcw size={16} />}
                Générer un nouveau code (30 min)
              </button>
            </div>

            {/* ── CODES PERMANENTS ── */}
            <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold text-gray-800 text-lg">Codes superviseur permanents</h2>
                <p className="text-sm text-gray-500">Codes pour les annulations et opérations en caisse.</p>
              </div>
              <button onClick={openCreateCode} className="btn-primary flex items-center gap-2 py-2 px-4">
                <Plus size={16} /> Nouveau code
              </button>
            </div>

            {codes.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-card p-8 text-center">
                <Shield size={48} className="mx-auto mb-3 text-gray-300" />
                <p className="text-gray-400">Aucun code superviseur configuré</p>
                <p className="text-xs text-gray-400 mt-1">Code par défaut: 1234</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-card overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Code</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Utilisateur</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {codes.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Shield size={16} className={c.actif ? 'text-emerald-600' : 'text-gray-300'} />
                            <span className="font-mono font-bold text-gray-700">••••</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-xs font-bold">
                              {(c.user_nom || '?').charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm text-gray-700">{c.user_nom || 'Inconnu'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleToggleCode(c)}
                            className={`text-xs px-2 py-1 rounded-full font-semibold transition-all ${c.actif ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                          >
                            {c.actif ? 'Actif' : 'Inactif'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEditCode(c)} className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors">
                              <Edit2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </div>
          </div>
        )}

        {/* Session & Clôture */}
        {tab === 'session' && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
              <h2 className="font-bold text-gray-800 text-lg">Paramètres de session</h2>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Heure de clôture automatique
                  <span className="text-gray-400 font-normal ml-2 text-xs">(format HH:MM)</span>
                </label>
                <input
                  type="time"
                  value={params.heure_cloture_auto || '20:00'}
                  onChange={e => setParams(p => ({ ...p, heure_cloture_auto: e.target.value }))}
                  className="input-field max-w-xs"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Un rappel sera affiché à cette heure pour clôturer la caisse.
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Numéro patronne / responsable
                  <span className="text-gray-400 font-normal ml-2 text-xs">(pour rapports SMS)</span>
                </label>
                <input
                  type="tel"
                  value={params.sms_patronne || ''}
                  onChange={e => setParams(p => ({ ...p, sms_patronne: e.target.value }))}
                  className="input-field max-w-xs"
                  placeholder="+225 07 00 00 00 00"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Verrouillage automatique (min d'inactivité)
                  <span className="text-gray-400 font-normal ml-2 text-xs">(0 = désactivé)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={params.auto_lock_minutes || '30'}
                  onChange={e => setParams(p => ({ ...p, auto_lock_minutes: e.target.value }))}
                  className="input-field max-w-xs"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Après ce délai sans activité, l'écran se verrouille et demande une connexion pour reprendre.
                  Ex. 30 = pause automatique après 30 min d'inactivité.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* SMS */}
        {tab === 'sms' && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
              <h2 className="font-bold text-gray-800 text-lg">Configuration SMS</h2>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Fournisseur SMS</label>
                <select
                  value={params.sms_provider || ''}
                  onChange={e => setParams(p => ({ ...p, sms_provider: e.target.value }))}
                  className="input-field"
                >
                  <option value="">— Désactivé —</option>
                  <option value="twilio">Twilio</option>
                  <option value="orange">Orange SMS CI</option>
                </select>
              </div>
              {params.sms_provider === 'twilio' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Twilio Account SID</label>
                    <input type="text" value={params.sms_api_key || ''}
                      onChange={e => setParams(p => ({ ...p, sms_api_key: e.target.value }))}
                      className="input-field font-mono" placeholder="ACxxxxxxxxxxxxxxxx" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Twilio Auth Token</label>
                    <div className="relative">
                      <input type={showCodeVal ? 'text' : 'password'}
                        value={params.sms_token || ''}
                        onChange={e => setParams(p => ({ ...p, sms_token: e.target.value }))}
                        className="input-field font-mono pr-12" placeholder="Token..." />
                      <button type="button" onClick={() => setShowCodeVal(!showCodeVal)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                        {showCodeVal ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Numéro expéditeur Twilio</label>
                    <input type="tel" value={params.sms_from || ''}
                      onChange={e => setParams(p => ({ ...p, sms_from: e.target.value }))}
                      className="input-field" placeholder="+1234567890" />
                  </div>
                </>
              )}
              {params.sms_provider === 'orange' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Clé API Orange SMS</label>
                    <input type="text" value={params.sms_api_key || ''}
                      onChange={e => setParams(p => ({ ...p, sms_api_key: e.target.value }))}
                      className="input-field font-mono" placeholder="Votre clé API..." />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Numéro expéditeur</label>
                    <input type="tel" value={params.sms_from || ''}
                      onChange={e => setParams(p => ({ ...p, sms_from: e.target.value }))}
                      className="input-field" placeholder="+225xxxxxxxxxx" />
                  </div>
                </>
              )}
              {params.sms_provider && (
                <div className="pt-2">
                  <button className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-sm font-semibold transition-colors">
                    <Smartphone size={16} />
                    Tester l'envoi SMS
                  </button>
                  <p className="text-xs text-gray-400 mt-1">Envoie un SMS test au numéro patronne configuré dans "Session".</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Email */}
        {tab === 'email' && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
              <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                <Mail size={18} className="text-blue-600" />
                Serveur SMTP
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Hôte SMTP</label>
                  <input type="text" value={params.smtp_host || ''}
                    onChange={e => setParams(p => ({ ...p, smtp_host: e.target.value }))}
                    className="input-field" placeholder="smtp.gmail.com" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Port</label>
                  <input type="number" value={params.smtp_port || '587'}
                    onChange={e => setParams(p => ({ ...p, smtp_port: e.target.value }))}
                    className="input-field" placeholder="587" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Utilisateur</label>
                  <input type="text" value={params.smtp_user || ''}
                    onChange={e => setParams(p => ({ ...p, smtp_user: e.target.value }))}
                    className="input-field" placeholder="compte@exemple.com" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Mot de passe / clé applicative</label>
                  <input type="password" value={params.smtp_pass || ''}
                    onChange={e => setParams(p => ({ ...p, smtp_pass: e.target.value }))}
                    className="input-field" placeholder="••••••••" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Expéditeur (nom)</label>
                  <input type="text" value={params.smtp_from || ''}
                    onChange={e => setParams(p => ({ ...p, smtp_from: e.target.value }))}
                    className="input-field" placeholder="KB POS" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Connexion sécurisée (SSL/TLS)</label>
                  <select value={params.smtp_secure || '0'}
                    onChange={e => setParams(p => ({ ...p, smtp_secure: e.target.value }))}
                    className="input-field">
                    <option value="0">Non (StartTLS, port 587)</option>
                    <option value="1">Oui (SSL, port 465)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
              <h2 className="font-bold text-gray-800 text-lg">Envois automatiques</h2>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Destinataires du fond de caisse
                  <span className="text-gray-400 font-normal ml-2 text-xs">(séparés par ; ou ,)</span>
                </label>
                <input type="text" value={params.email_fond_caisse || ''}
                  onChange={e => setParams(p => ({ ...p, email_fond_caisse: e.target.value }))}
                  className="input-field" placeholder="patronne@exemple.com; gerant@exemple.com" />
                <p className="text-xs text-gray-400 mt-1">Envoyé automatiquement à chaque clôture de caisse.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Destinataires du point de vente horaire
                  <span className="text-gray-400 font-normal ml-2 text-xs">(séparés par ; ou ,)</span>
                </label>
                <input type="text" value={params.email_rapports || ''}
                  onChange={e => setParams(p => ({ ...p, email_rapports: e.target.value }))}
                  className="input-field" placeholder="patronne@exemple.com" />
                <p className="text-xs text-gray-400 mt-1">Si vide, les destinataires du fond de caisse sont utilisés.</p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-semibold text-gray-700">Envoi du fond de caisse à la clôture</label>
                  <p className="text-xs text-gray-400">Email avec le récapitulatif + écart à chaque clôture.</p>
                </div>
                <select value={params.auto_envoi_fond_caisse || '1'}
                  onChange={e => setParams(p => ({ ...p, auto_envoi_fond_caisse: e.target.value }))}
                  className="input-field w-32">
                  <option value="1">Activé</option>
                  <option value="0">Désactivé</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-semibold text-gray-700">Envoi du point de vente chaque heure</label>
                  <p className="text-xs text-gray-400">Résumé des ventes de l'heure par email.</p>
                </div>
                <select value={params.auto_envoi_horaire || '0'}
                  onChange={e => setParams(p => ({ ...p, auto_envoi_horaire: e.target.value }))}
                  className="input-field w-32">
                  <option value="1">Activé</option>
                  <option value="0">Désactivé</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-semibold text-gray-700">Résumé journalier</label>
                  <p className="text-xs text-gray-400">Envoyé à la clôture de la dernière caisse du jour.</p>
                </div>
                <select value={params.auto_envoi_journalier || '0'}
                  onChange={e => setParams(p => ({ ...p, auto_envoi_journalier: e.target.value }))}
                  className="input-field w-32">
                  <option value="1">Activé</option>
                  <option value="0">Désactivé</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-semibold text-gray-700">État d'inventaire à la clôture</label>
                  <p className="text-xs text-gray-400">Écarts + justifications envoyés par email après chaque inventaire.</p>
                </div>
                <select value={params.auto_envoi_inventaire || '0'}
                  onChange={e => setParams(p => ({ ...p, auto_envoi_inventaire: e.target.value }))}
                  className="input-field w-32">
                  <option value="1">Activé</option>
                  <option value="0">Désactivé</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-semibold text-gray-700">Alerte stock minimum</label>
                  <p className="text-xs text-gray-400">Email quotidien quand un produit passe sous son seuil.</p>
                </div>
                <select value={params.auto_envoi_stock || '0'}
                  onChange={e => setParams(p => ({ ...p, auto_envoi_stock: e.target.value }))}
                  className="input-field w-32">
                  <option value="1">Activé</option>
                  <option value="0">Désactivé</option>
                </select>
              </div>
              <div className="pt-3 border-t border-gray-100 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      setMailMsg('')
                      try {
                        setMailBusy(true)
                        const r = await emailTestConfig()
                        setMailMsg(r.success ? 'Test SMTP envoyé avec succès.' : ('Échec : ' + (r.error || '')))
                      } catch (e: any) { setMailMsg('Échec : ' + (e.message || '')) }
                      setMailBusy(false)
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
                  >
                    <Send size={16} /> {mailBusy ? 'Envoi...' : 'Tester le SMTP (email de test)'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setMailMsg('')
                      try {
                        setMailBusy(true)
                        const r = await emailEnvoyerHoraire()
                        setMailMsg(r.success ? 'Point de vente horaire de test envoyé.' : ('Échec : ' + (r.error || '')))
                      } catch (e: any) { setMailMsg('Échec : ' + (e.message || '')) }
                      setMailBusy(false)
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-sm font-semibold transition-colors"
                  >
                    <RefreshCw size={15} /> Tester le point de vente horaire
                  </button>
                </div>
                {mailMsg && <p className={`text-xs ${mailMsg.startsWith('Échec') ? 'text-red-600' : 'text-emerald-600'}`}>{mailMsg}</p>}
              </div>
            </div>

            {/* Notifications desktop */}
            <div className="bg-white rounded-2xl shadow-card p-6 space-y-3">
              <div className="flex items-center gap-3">
                <Bell size={18} className="text-indigo-500" />
                <h2 className="font-bold text-gray-800 text-lg">Notifications desktop</h2>
              </div>
              <p className="text-xs text-gray-400">Popups natives du système pour vous alerter en temps réel (même si l'application est en arrière-plan).</p>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-semibold text-gray-700">Ventes en temps réel</label>
                  <p className="text-xs text-gray-400">À chaque vente enregistrée.</p>
                </div>
                <select value={params.notif_vente ?? '1'}
                  onChange={e => setParams(p => ({ ...p, notif_vente: e.target.value }))}
                  className="input-field w-32">
                  <option value="1">Activé</option>
                  <option value="0">Désactivé</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-semibold text-gray-700">Stock faible</label>
                  <p className="text-xs text-gray-400">Produit sous son seuil minimum.</p>
                </div>
                <select value={params.notif_stock ?? '1'}
                  onChange={e => setParams(p => ({ ...p, notif_stock: e.target.value }))}
                  className="input-field w-32">
                  <option value="1">Activé</option>
                  <option value="0">Désactivé</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-semibold text-gray-700">Ardoises anciennes</label>
                  <p className="text-xs text-gray-400">Crédit client resté impayé trop longtemps.</p>
                </div>
                <select value={params.notif_ardoise ?? '1'}
                  onChange={e => setParams(p => ({ ...p, notif_ardoise: e.target.value }))}
                  className="input-field w-32">
                  <option value="1">Activé</option>
                  <option value="0">Désactivé</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-semibold text-gray-700">Fidélité</label>
                  <p className="text-xs text-gray-400">Client ayant atteint un palier de points.</p>
                </div>
                <select value={params.notif_fidelite ?? '1'}
                  onChange={e => setParams(p => ({ ...p, notif_fidelite: e.target.value }))}
                  className="input-field w-32">
                  <option value="1">Activé</option>
                  <option value="0">Désactivé</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-semibold text-gray-700">Rapports / forfait</label>
                  <p className="text-xs text-gray-400">Alerte d'expiration du forfait, rappels.</p>
                </div>
                <select value={params.notif_rapport ?? '1'}
                  onChange={e => setParams(p => ({ ...p, notif_rapport: e.target.value }))}
                  className="input-field w-32">
                  <option value="1">Activé</option>
                  <option value="0">Désactivé</option>
                </select>
              </div>
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400">Pensez à cliquer sur « Enregistrer » pour appliquer ces réglages.</p>
              </div>
            </div>

            {/* Journal des envois */}
            <div className="bg-white rounded-2xl shadow-card p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-800 text-lg">Journal des envois</h2>
                <button onClick={loadJournal} disabled={journalBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold">
                  <RefreshCw size={13} className={journalBusy ? 'animate-spin' : ''} /> Actualiser
                </button>
              </div>
              {journalEmails.length === 0 ? (
                <p className="text-sm text-gray-400">Aucun envoi pour le moment.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 rounded-xl border border-gray-100">
                  {journalEmails.map(j => (
                    <div key={j.id} className="px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-800 truncate">{j.sujet}</div>
                          <div className="text-xs text-gray-400 truncate">
                            {j.destinataire || '—'} · {j.date_envoi?.replace('T', ' ')}
                          </div>
                          {j.erreur && <div className="text-xs text-red-500 truncate mt-0.5">{j.erreur}</div>}
                        </div>
                        <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          j.statut === 'envoye' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {j.statut === 'envoye' ? <><Check size={10} /> Envoyé</> : <><AlertTriangle size={10} /> Échec</>}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={loadJournal} disabled={journalBusy}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-semibold">
                <RefreshCw size={12} /> Charger le journal
              </button>
            </div>
          </div>
        )}

        {/* ─── FORFAIT ─────────────────────────────────────────────────────── */}
        {tab === 'forfait' && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
              <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                <CalendarClock size={20} className="text-blue-600" /> Abonnement / Forfait
              </h2>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                {!forfait ? <p className="text-gray-500">Chargement…</p> : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Date d'expiration</span>
                      <span className="font-bold">{forfait.expiration ? forfait.expiration : 'Illimité'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Jours restants</span>
                      <span className={`font-bold ${forfait.expire ? 'text-red-600' : forfait.procheExpiration ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {forfait.expiration ? (forfait.expire ? 'Expiré' : `${forfait.joursRestants} jour(s)`) : '—'}
                      </span>
                    </div>
                  </>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 text-sm mb-2">Prolonger l'abonnement (sur cette caisse)</h3>
                <div className="flex flex-wrap gap-2">
                  {[2, 3, 6, 12].map(m => (
                    <button key={m} onClick={() => handleForfaitProlonger(m)} disabled={forfaitBusy}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold">
                      {m} mois
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 text-sm mb-2">Générer une licence (extension à distance)</h3>
                <p className="text-xs text-gray-500 mb-3">Générez un code pour X mois, puis transmettez-le à une autre caisse qui le chargera (ou pour un fichier .kbkey).</p>
                <div className="flex flex-wrap gap-2">
                  {[2, 3, 6, 12].map(m => (
                    <button key={m} onClick={() => handleForfaitGenererLicence(m)} disabled={forfaitBusy}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold">
                      Générer {m} mois
                    </button>
                  ))}
                </div>
                {licenceToken && (
                  <textarea readOnly value={licenceToken} rows={3}
                    className="mt-3 w-full input-field font-mono text-xs" onFocus={e => e.target.select()} />
                )}
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 text-sm mb-2">Appliquer une licence reçue</h3>
                <div className="flex items-center gap-2">
                  <button onClick={handleForfaitLoadFile} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold flex items-center gap-1.5">
                    <Upload size={15} /> Charger un fichier
                  </button>
                  <button onClick={handleForfaitAppliquerLicence} disabled={forfaitBusy}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold">
                    {forfaitBusy ? 'Application…' : 'Appliquer'}
                  </button>
                </div>
                <textarea value={licenceToken} onChange={e => setLicenceToken(e.target.value)} rows={3}
                  placeholder="Collez ici le code de licence (ou chargez un fichier .kbkey)"
                  className="mt-3 w-full input-field font-mono text-xs" />
              </div>
              {forfaitMsg && (
                <div className={`px-4 py-3 rounded-xl text-sm font-medium ${forfaitMsg.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {forfaitMsg.text}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── SAUVEGARDES ─────────────────────────────────────────────────── */}
        {tab === 'sauvegardes' && (
          <div className="max-w-2xl space-y-5">
            {/* Config */}
            <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
              <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                <HardDrive size={20} className="text-blue-600" /> Configuration sauvegarde
              </h2>

              {/* Dossier */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Dossier de sauvegarde</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={params.backup_dir || '(dossier par défaut)'}
                    className="input-field flex-1 bg-gray-50 text-gray-500 text-sm"
                  />
                  <button
                    onClick={handleBrowseBackupDir}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-sm font-semibold transition-colors flex-shrink-0"
                  >
                    <FolderOpen size={16} /> Parcourir
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Choisissez un dossier local, une clé USB, ou un dossier cloud synchronisé (Dropbox, Google Drive).</p>
              </div>

              {/* Auto-backup toggle */}
              <div className="flex items-center justify-between py-3 border-t border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Sauvegarde automatique</p>
                  <p className="text-xs text-gray-400">Crée une sauvegarde à intervalle régulier</p>
                </div>
                <button
                  onClick={() => setParams(p => ({ ...p, backup_auto: p.backup_auto === '1' ? '0' : '1' }))}
                  className={`w-12 h-6 rounded-full transition-colors ${params.backup_auto === '1' ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${params.backup_auto === '1' ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Sauvegarde mensuelle toggle */}
              <div className="flex items-center justify-between py-3 border-t border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Sauvegarde mensuelle automatique</p>
                  <p className="text-xs text-gray-400">Une sauvegarde par mois (archivée, conservée). Idéal pour restaurer les données d'un mois.</p>
                </div>
                <button
                  onClick={() => setParams(p => ({ ...p, backup_mensuel: p.backup_mensuel === '0' ? '1' : '0' }))}
                  className={`w-12 h-6 rounded-full transition-colors ${params.backup_mensuel !== '0' ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${params.backup_mensuel !== '0' ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              {params.backup_auto === '1' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Intervalle (heures)</label>
                    <input
                      type="number" min="1" max="168"
                      value={params.backup_interval_h || '24'}
                      onChange={e => setParams(p => ({ ...p, backup_interval_h: e.target.value }))}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Nb. max. conservés</label>
                    <input
                      type="number" min="1" max="100"
                      value={params.backup_max_count || '10'}
                      onChange={e => setParams(p => ({ ...p, backup_max_count: e.target.value }))}
                      className="input-field"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSaveBackupSettings}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  <Save size={16} /> Enregistrer les paramètres
                </button>
              </div>
            </div>

            {/* Sauvegarde cloud WebDAV */}
            <div className="bg-white rounded-2xl shadow-card p-6 space-y-4">
              <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                <Upload size={20} className="text-indigo-600" /> Sauvegarde cloud (WebDAV)
              </h2>
              <p className="text-xs text-gray-400">
                Envoyez automatiquement vos sauvegardes vers un serveur WebDAV (Nextcloud, ownCloud, ou un dossier
                synchronisé compatible). Renseignez l'URL, l'utilisateur et le mot de passe, puis activez.
              </p>

              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Activer la sauvegarde cloud</p>
                  <p className="text-xs text-gray-400">Upload automatique à chaque sauvegarde locale</p>
                </div>
                <button
                  onClick={() => setParams(p => ({ ...p, cloud_backup_actif: p.cloud_backup_actif === '1' ? '0' : '1' }))}
                  className={`w-12 h-6 rounded-full transition-colors ${params.cloud_backup_actif === '1' ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${params.cloud_backup_actif === '1' ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">URL du serveur WebDAV</label>
                <input
                  type="text"
                  placeholder="https://nextcloud.example.com/remote.php/dav/files/user"
                  value={params.cloud_backup_url || ''}
                  onChange={e => setParams(p => ({ ...p, cloud_backup_url: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Utilisateur</label>
                  <input
                    type="text"
                    value={params.cloud_backup_user || ''}
                    onChange={e => setParams(p => ({ ...p, cloud_backup_user: e.target.value }))}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Mot de passe</label>
                  <input
                    type="password"
                    value={params.cloud_backup_pass || ''}
                    onChange={e => setParams(p => ({ ...p, cloud_backup_pass: e.target.value }))}
                    className="input-field"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Dossier distant (sous-dossier)</label>
                <input
                  type="text"
                  placeholder="kb-pos"
                  value={params.cloud_backup_dossier || 'kb-pos'}
                  onChange={e => setParams(p => ({ ...p, cloud_backup_dossier: e.target.value }))}
                  className="input-field"
                />
              </div>

              {cloudMsg && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 rounded-xl text-sm flex items-center gap-2">
                  <Check size={14} /> {cloudMsg}
                </div>
              )}
              {cloudError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-sm">⚠ {cloudError}</div>
              )}

              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  onClick={handleSaveBackupSettings}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  <Save size={16} /> Enregistrer les paramètres
                </button>
                <button
                  onClick={handleCloudTest}
                  disabled={cloudBusy}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  <Wifi size={16} /> {cloudBusy ? 'Test...' : 'Tester la connexion'}
                </button>
                <button
                  onClick={handleCloudUploadNow}
                  disabled={cloudBusy}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  <Upload size={16} /> {cloudBusy ? 'Envoi...' : 'Uploader maintenant'}
                </button>
              </div>

              {cloudFiles.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Fichiers dans le cloud ({cloudFiles.length})</p>
                  <div className="max-h-32 overflow-y-auto divide-y divide-gray-50 rounded-xl border border-gray-100">
                    {cloudFiles.map((f, i) => (
                      <div key={i} className="px-3 py-1.5 text-xs text-gray-600 font-mono">{f}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sauvegarde manuelle */}
            <div className="bg-white rounded-2xl shadow-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800">Sauvegardes disponibles</h3>
                <div className="flex gap-2">
                  <button
                    onClick={loadBackups}
                    className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-colors"
                    title="Actualiser"
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button
                    onClick={handleCreateBackup}
                    disabled={backupLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-semibold transition-colors"
                  >
                    {backupLoading
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Download size={16} />}
                    Sauvegarder maintenant
                  </button>
                </div>
              </div>

              {backupMsg && (
                <div className="mb-3 bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 rounded-xl text-sm flex items-center gap-2">
                  <Check size={14} /> {backupMsg}
                </div>
              )}
              {backupError && (
                <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-sm">
                  ⚠ {backupError}
                </div>
              )}

              {backups.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <HardDrive size={40} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Aucune sauvegarde pour l'instant</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {backups.map((b, i) => (
                    <div key={b.filename} className={`flex items-center justify-between p-3 rounded-xl ${i === 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50'}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{b.filename}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(b.date).toLocaleString('fr-FR')} · {(b.size / 1024).toFixed(0)} Ko
                          {i === 0 && <span className="ml-2 text-emerald-600 font-semibold">● Dernière</span>}
                        </p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 ml-2">
                        <button
                          onClick={async () => {
                            if (!confirm(`Restaurer la sauvegarde "${b.filename}" ? L'application redémarrera.`)) return
                            const r = await backupRestore(b.filename)
                            if (!r.success) setBackupError(r.error ?? 'Erreur')
                          }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Restaurer"
                        >
                          <RefreshCw size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteBackup(b.filename)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {/* ─── BALANCE ─────────────────────────────────────────────────────── */}
        {tab === 'balance' && (
          <div className="max-w-2xl space-y-5">
            {/* Statut connexion */}
            <div className="bg-white rounded-2xl shadow-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                  <Scale size={20} className="text-blue-600" /> Balance poids
                </h2>
                <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${
                  balanceConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {balanceConnected ? <><Wifi size={14} /> Connectée</> : <><WifiOff size={14} /> Déconnectée</>}
                </span>
              </div>

              <div className="space-y-4">
                {/* Port COM */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Port série (COM)</label>
                  <div className="flex gap-2">
                    <select
                      value={params.balance_port || ''}
                      onChange={e => setParams(p => ({ ...p, balance_port: e.target.value }))}
                      className="input-field flex-1"
                    >
                      <option value="">— Sélectionner un port —</option>
                      {portsCOM.map(p => <option key={p} value={p}>{p}</option>)}
                      {/* Ports manuels si non détectés */}
                      {!portsCOM.includes('COM1') && <option value="COM1">COM1</option>}
                      {!portsCOM.includes('COM2') && <option value="COM2">COM2</option>}
                      {!portsCOM.includes('COM3') && <option value="COM3">COM3</option>}
                      {!portsCOM.includes('COM4') && <option value="COM4">COM4</option>}
                    </select>
                    <button
                      onClick={() => balanceGetPortsCOM().then(setPortsCOM)}
                      className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                      title="Détecter les ports"
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                  {portsCOM.length > 0 && (
                    <p className="text-xs text-emerald-600 mt-1">✓ {portsCOM.length} port(s) détecté(s) : {portsCOM.join(', ')}</p>
                  )}
                </div>

                {/* Vitesse */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Vitesse (baud rate)</label>
                  <select
                    value={params.balance_baud || '9600'}
                    onChange={e => setParams(p => ({ ...p, balance_baud: e.target.value }))}
                    className="input-field"
                  >
                    {['1200','2400','4800','9600','19200','38400','57600','115200'].map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                {/* Protocole */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Protocole / Marque</label>
                  <select
                    value={params.balance_protocole || 'generique'}
                    onChange={e => setParams(p => ({ ...p, balance_protocole: e.target.value }))}
                    className="input-field"
                  >
                    <option value="generique">Générique (trame libre)</option>
                    <option value="toledo">Toledo / Mettler</option>
                    <option value="cas">CAS</option>
                    <option value="digi">Digi SM</option>
                    <option value="ohaus">Ohaus</option>
                    <option value="kern">Kern</option>
                  </select>
                </div>

                {/* Seuil alerte péremption */}
                <div className="border-t border-gray-100 pt-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Alerte péremption — jours avant expiration
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={params.peremption_alerte_jours || '7'}
                    onChange={e => setParams(p => ({ ...p, peremption_alerte_jours: e.target.value }))}
                    className="input-field w-32"
                  />
                  <p className="text-xs text-gray-400 mt-1">Un badge orange s'affiche X jours avant la date de péremption.</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={async () => {
                      setBalanceTesting(true)
                      if (balanceConnected) {
                        await balanceDisconnect()
                        setBalanceConnected(false)
                      } else if (params.balance_port) {
                        const r = await balanceConnect(params.balance_port, parseInt(params.balance_baud || '9600'))
                        setBalanceConnected(r.success)
                      }
                      setBalanceTesting(false)
                    }}
                    disabled={balanceTesting || !params.balance_port}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:bg-gray-200 disabled:text-gray-400 ${
                      balanceConnected
                        ? 'bg-red-50 hover:bg-red-100 text-red-600'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {balanceTesting ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> :
                      balanceConnected ? <WifiOff size={16} /> : <Wifi size={16} />}
                    {balanceConnected ? 'Déconnecter' : 'Tester la connexion'}
                  </button>
                  <button
                    onClick={async () => { await setParametres(params); setSaved(true); setTimeout(() => setSaved(false), 2000) }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-xl text-sm font-semibold transition-colors"
                  >
                    <Save size={16} /> {saved ? 'Enregistré !' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            </div>

            {/* Mode de fonctionnement */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
              <h3 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                <Scale size={16} /> Comment ça fonctionne
              </h3>
              <ul className="text-sm text-blue-700 space-y-1.5">
                <li>• En caisse, les produits dont l'unité est <strong>kg</strong> ou <strong>g</strong> ouvrent automatiquement le clavier de saisie du poids.</li>
                <li>• Si une balance série est connectée au port COM configuré, le poids est lu automatiquement.</li>
                <li>• Sans balance, la saisie est manuelle via le numpad tactile.</li>
                <li>• Le total est calculé en temps réel : poids × prix unitaire.</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Modal utilisateur */}
      {showUserModal && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="bg-blue-600 text-white p-5 rounded-t-2xl flex items-center justify-between">
              <h2 className="font-bold text-lg">{editingUser ? 'Modifier utilisateur' : 'Nouvel utilisateur'}</h2>
              <button onClick={() => setShowUserModal(false)} className="p-2 hover:bg-blue-700 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {userError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{userError}</div>}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nom complet *</label>
                <input type="text" value={userForm.nom} onChange={e => setUserForm(f => ({ ...f, nom: e.target.value }))}
                  placeholder="Prénom Nom" className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Identifiant *</label>
                <input type="text" value={userForm.username} onChange={e => setUserForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="login" className="input-field font-mono" autoCapitalize="off" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Mot de passe {editingUser && <span className="text-gray-400 font-normal">(laisser vide pour ne pas modifier)</span>}
                </label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={userForm.password}
                    onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))}
                    placeholder={editingUser ? '••••••••' : 'Mot de passe'} className="input-field pr-12" />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Rôle</label>
                <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value as UserRole }))} className="input-field">
                  <option value="caissier">Caissier</option>
                  <option value="gestionnaire">Gestionnaire</option>
                  <option value="superviseur">Superviseur</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowUserModal(false)} className="flex-1 btn-ghost">Annuler</button>
                <button onClick={handleSaveUser} disabled={savingUser} className="flex-1 btn-primary flex items-center justify-center gap-2">
                  {savingUser ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={18} />}
                  {editingUser ? 'Modifier' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal code superviseur */}
      {showCodeModal && (
        <div className="modal-overlay">
          <div className="modal-content max-w-sm">
            <div className="bg-orange-600 text-white p-5 rounded-t-2xl flex items-center justify-between">
              <h2 className="font-bold text-lg">{editingCode ? 'Modifier le code' : 'Nouveau code superviseur'}</h2>
              <button onClick={() => setShowCodeModal(false)} className="p-2 hover:bg-orange-700 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {codeError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{codeError}</div>}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Code (4 chiffres) {editingCode && <span className="text-gray-400 font-normal">(laisser vide pour ne pas modifier)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showCodeVal ? 'text' : 'password'}
                    value={codeForm.code}
                    onChange={e => setCodeForm(f => ({ ...f, code: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                    placeholder="••••"
                    maxLength={4}
                    className="input-field font-mono text-2xl tracking-widest pr-12"
                  />
                  <button type="button" onClick={() => setShowCodeVal(!showCodeVal)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                    {showCodeVal ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Associé à l'utilisateur</label>
                <select value={codeForm.user_id}
                  onChange={e => setCodeForm(f => ({ ...f, user_id: e.target.value }))}
                  className="input-field">
                  {users.map(u => <option key={u.id} value={u.id}>{u.nom} ({u.role})</option>)}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCodeModal(false)} className="flex-1 btn-ghost">Annuler</button>
                <button onClick={handleSaveCode} disabled={savingCode}
                  className="flex-1 h-12 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                  {savingCode ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={18} />}
                  {editingCode ? 'Modifier' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
