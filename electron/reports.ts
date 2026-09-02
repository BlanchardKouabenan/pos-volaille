import { sendEmail, verifySmtp } from './email'
import {
  getEmailConfig, getVenteStats, getChargesStats,
  getSessionsCaisse, getVentesDerniereHeure, getAllParametres,
  getMouvementsCaisse, getInventaireById, getProduitsStockFaible
} from './database'
import { getForfaitInfo } from './license'

const MODE_LABELS: Record<string, string> = {
  especes: 'Espèces', wave: 'Wave', orange_money: 'Orange Money',
  mtn: 'MTN Money', carte: 'Carte', ardoise: 'Ardoise'
}

function fmt(n: number, monnaie = 'FCFA'): string {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} ${monnaie}`
}

function addrs(joined?: string): string {
  return (joined || '').replace(/[;,]/g, ' ').split(/\s+/).filter(Boolean).join(',')
}

async function send(config: ReturnType<typeof getEmailConfig>, to: string, subject: string, body: string, type?: string) {
  if (!to) return { success: false, error: 'Aucun destinataire configuré' } as { success: boolean; error?: string }
  return sendEmail({
    config,
    to,
    subject,
    text: body,
    type,
    html: `<pre style="font-family:Consolas,monospace;font-size:13px;white-space:pre-wrap;">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`
  })
}

// ─── FOND DE CAISSE (envoyé à la clôture) ────────────────────────────────────
export async function envoyerFondCaisseCloture(sessionId: number): Promise<{ success: boolean; error?: string }> {
  const config = getEmailConfig()
  const p = getAllParametres()
  const monnaie = p.monnaie || 'FCFA'
  const nom = p.nom_entreprise || 'KB POS'
  const sessions = getSessionsCaisse() as any[]
  const session = sessions.find((s: any) => s.id === sessionId)
  if (!session) return { success: false, error: 'Session introuvable' }
  const date = session.date
  const stats = getVenteStats(date, date)
  const charges = getChargesStats(date, date)
  const fond = Number(session.fond_caisse) || 0
  const totalVentes = Number(stats?.totalVentes?.ca) || 0
  const totalCharges = Number(charges?.total?.total) || 0
  const ventesEspeces = (stats?.parModePaiement || []).find((m: any) => m.mode_paiement === 'especes')?.total || 0
  const mvts = getMouvementsCaisse(date, date) as any[]
  const totalVersements = (mvts || []).filter((m: any) => m.type === 'versement').reduce((s: number, m: any) => s + (m.montant || 0), 0)
  const totalRetraits = (mvts || []).filter((m: any) => m.type === 'retrait').reduce((s: number, m: any) => s + (m.montant || 0), 0)
  const especesAttendues = fond + ventesEspeces + totalVersements - totalRetraits
  const compte = Number(session.montant_final_especes) || 0
  const ecart = compte - especesAttendues

  const lines: string[] = []
  lines.push(`${nom} — FOND DE CAISSE`)
  lines.push('═'.repeat(32))
  lines.push(`Date : ${date}`)
  lines.push(`Session : #${session.id} (${session.user_nom || '—'})`)
  lines.push(`Ouverture : ${session.heure_ouverture} — Clôture : ${session.heure_cloture || '—'}`)
  lines.push('')
  lines.push('Ventes par mode :')
  for (const m of stats?.parModePaiement || []) {
    lines.push(`  ${(MODE_LABELS[m.mode_paiement] || m.mode_paiement).padEnd(14)} ${m.nb} vente(s)  ${fmt(m.total, monnaie)}`)
  }
  lines.push(`  ${'TOTAL VENTES'.padEnd(14)} ${fmt(totalVentes, monnaie)}`)
  lines.push('')
  lines.push(`Charges du jour : ${fmt(totalCharges, monnaie)}`)
  lines.push('')
  lines.push(`Fond initial : ${fmt(fond, monnaie)}`)
  lines.push(`Ventes espèces : +${fmt(ventesEspeces, monnaie)}`)
  if (totalVersements > 0) lines.push(`Versements : +${fmt(totalVersements, monnaie)}`)
  if (totalRetraits > 0) lines.push(`Retraits : -${fmt(totalRetraits, monnaie)}`)
  lines.push(`Espèces attendues : ${fmt(especesAttendues, monnaie)}`)
  lines.push(`Espèces comptées : ${fmt(compte, monnaie)}`)
  lines.push(`Écart : ${ecart >= 0 ? '+' : ''}${fmt(ecart, monnaie)}`)
  lines.push('')
  lines.push('═'.repeat(32))
  lines.push('Merci !')

  const to = addrs(config.email_fond_caisse || config.email_rapports)
  return send(config, to, `Fond de caisse — ${nom} — ${date}`, lines.join('\n'), 'fond_caisse')
}

// ─── CONTRÔLE (relevé sans clôturer) ─────────────────────────────────────────
export async function envoyerControleReleve(sessionId: number, montantCompte: number): Promise<{ success: boolean; error?: string }> {
  const config = getEmailConfig()
  const p = getAllParametres()
  const monnaie = p.monnaie || 'FCFA'
  const nom = p.nom_entreprise || 'KB POS'
  const sessions = getSessionsCaisse() as any[]
  const session = sessions.find((s: any) => s.id === sessionId)
  if (!session) return { success: false, error: 'Session introuvable' }
  const date = session.date
  const stats = getVenteStats(date, date)
  const charges = getChargesStats(date, date)
  const fond = Number(session.fond_caisse) || 0
  const totalVentes = Number(stats?.totalVentes?.ca) || 0
  const totalCharges = Number(charges?.total?.total) || 0
  const ventesEspeces = (stats?.parModePaiement || []).find((m: any) => m.mode_paiement === 'especes')?.total || 0
  const mvts = getMouvementsCaisse(date, date) as any[]
  const totalVersements = (mvts || []).filter((m: any) => m.type === 'versement').reduce((s: number, m: any) => s + (m.montant || 0), 0)
  const totalRetraits = (mvts || []).filter((m: any) => m.type === 'retrait').reduce((s: number, m: any) => s + (m.montant || 0), 0)
  const especesAttendues = fond + ventesEspeces + totalVersements - totalRetraits
  const compte = Number(montantCompte) || 0
  const ecart = compte - especesAttendues

  const lines: string[] = []
  lines.push(`${nom} — CONTRÔLE DE CAISSE (sans clôture)`)
  lines.push('═'.repeat(32))
  lines.push(`Date : ${date}`)
  lines.push(`Session : #${session.id} (${session.user_nom || '—'})`)
  lines.push('')
  lines.push(`CA du jour : ${fmt(totalVentes, monnaie)}`)
  lines.push(`Charges : ${fmt(totalCharges, monnaie)}`)
  lines.push(`Fond initial : ${fmt(fond, monnaie)}`)
  lines.push(`Ventes espèces : +${fmt(ventesEspeces, monnaie)}`)
  if (totalVersements > 0) lines.push(`Versements : +${fmt(totalVersements, monnaie)}`)
  if (totalRetraits > 0) lines.push(`Retraits : -${fmt(totalRetraits, monnaie)}`)
  lines.push(`Espèces attendues : ${fmt(especesAttendues, monnaie)}`)
  lines.push(`Espèces comptées : ${fmt(compte, monnaie)}`)
  lines.push(`Écart : ${ecart >= 0 ? '+' : ''}${fmt(ecart, monnaie)}`)
  lines.push('')
  lines.push('═'.repeat(32))
  lines.push('La session reste ouverte.')

  const to = addrs(config.email_fond_caisse || config.email_rapports)
  return send(config, to, `Contrôle de caisse — ${nom} — ${date}`, lines.join('\n'), 'controle')
}

// ─── POINT DE VENTE HORAIRE (chaque heure) ───────────────────────────────────
export async function envoyerPointVenteHoraire(): Promise<{ success: boolean; error?: string }> {
  const config = getEmailConfig()
  const p = getAllParametres()
  const monnaie = p.monnaie || 'FCFA'
  const nom = p.nom_entreprise || 'KB POS'
  const data = getVentesDerniereHeure()
  const now = new Date()
  const heure = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const date = now.toISOString().slice(0, 10)
  const total = data?.total || {}
  const ca = Number(total.ca) || 0
  const nb = Number(total.nb) || 0

  const lines: string[] = []
  lines.push(`${nom} — POINT DE VENTE`)
  lines.push('═'.repeat(32))
  lines.push(`Date : ${date} — ${heure}`)
  lines.push('')
  lines.push(`CA de la dernière heure : ${fmt(ca, monnaie)}`)
  lines.push(`Nombre de ventes : ${nb}`)
  lines.push('')
  lines.push('Ventes par mode :')
  for (const m of data?.parMode || []) {
    lines.push(`  ${(MODE_LABELS[m.mode_paiement] || m.mode_paiement).padEnd(14)} ${m.nb} vente(s)  ${fmt(m.total, monnaie)}`)
  }
  lines.push('')
  const cumJ = getVenteStats(date, date)
  lines.push(`CA cumulé du jour : ${fmt(Number(cumJ?.totalVentes?.ca) || 0, monnaie)}`)
  lines.push('═'.repeat(32))

  const to = addrs(config.email_rapports || config.email_fond_caisse)
  return send(config, to, `Point de vente — ${nom} — ${date} ${heure}`, lines.join('\n'), 'horaire')
}

// ─── ALERTE FORFAIT (J-5 et jour J) ──────────────────────────────────────────
let forfaitAlerteLastDate = ''
export async function envoyerAlerteForfait(): Promise<{ success: boolean; error?: string; skip?: boolean }> {
  const p = getAllParametres()
  if (p.forfait_email_alerte !== '1') return { success: true, skip: true }
  const info = getForfaitInfo()
  if (!info.expiration) return { success: true, skip: true }
  const config = getEmailConfig()
  const nom = p.nom_entreprise || 'KB POS'
  const to = addrs(config.email_rapports || config.email_fond_caisse)
  const days = info.joursRestants
  const today = new Date().toISOString().slice(0, 10)

  const buildSubject = (d: number, prefix: string) => `${prefix} Forfait — ${nom} (expire le ${info.expiration})`
  let body = ''
  let subject = ''
  if (info.expire) {
    subject = buildSubject(days, '⚠️ EXPIRÉ')
    body = `Le forfait de ${nom} est ARRIVÉ À EXPIRATION le ${info.expiration}.\n` +
      `Tous les utilisateurs (hors administrateur) sont bloqués.\n` +
      `Veuillez prolonger l'abonnement dès que possible.`
  } else if (days === 5) {
    subject = buildSubject(days, 'Alerte')
    body = `Le forfait de ${nom} expire dans ${days} jours (le ${info.expiration}).\n` +
      `Pensez à le prolonger avant expiration pour éviter tout blocage.`
  } else if (days < 5 && days >= 0) {
    subject = buildSubject(days, 'Alerte')
    body = `Le forfait de ${nom} expire dans ${days} jour(s) (le ${info.expiration}).\nRapprochez-vous de votre administrateur.`
  } else {
    return { success: true, skip: true }
  }
  // N'envoyer qu'une fois par jour
  const key = `${today}:${days}:${info.expire}`
  if (forfaitAlerteLastDate === key) return { success: true, skip: true }
  const res = await send(config, to, subject, body, 'forfait')
  if (res.success) forfaitAlerteLastDate = key
  return res
}

// ─── TEST (connexion SMTP + envoi d'un email de vérification) ─────────────────
export async function envoyerTestEmail(): Promise<{ success: boolean; error?: string }> {
  const config = getEmailConfig()
  const p = getAllParametres()
  const nom = p.nom_entreprise || 'KB POS'
  const to = addrs(config.email_fond_caisse || config.email_rapports)
  if (!to) return { success: false, error: 'Aucun destinataire configuré (fond de caisse ou rapports)' }
  const v = await verifySmtp(config)
  if (!v.ok) return { success: false, error: `Connexion SMTP impossible : ${v.error}` }
  const body = `Ceci est un email de test envoyé par ${nom}.\nVotre configuration SMTP fonctionne correctement.`
  return send(config, to, `Test SMTP — ${nom}`, body, 'test')
}

// ─── RÉSUMÉ JOURNALIER (envoyé à la clôture de la dernière caisse) ────────────
export async function envoyerResumeJournalier(): Promise<{ success: boolean; error?: string }> {
  const config = getEmailConfig()
  const p = getAllParametres()
  const monnaie = p.monnaie || 'FCFA'
  const nom = p.nom_entreprise || 'KB POS'
  const date = new Date().toISOString().slice(0, 10)
  const stats = getVenteStats(date, date)
  const charges = getChargesStats(date, date)
  const sessions = (getSessionsCaisse(date, date) as any[]).filter((s: any) => s.statut === 'cloture')
  const totalVentes = Number(stats?.totalVentes?.ca) || 0
  const nbVentes = Number(stats?.totalVentes?.nb) || 0
  const totalCharges = Number(charges?.total?.total) || 0
  const mvts = getMouvementsCaisse(date, date) as any[]
  const totalVersements = (mvts || []).filter((m: any) => m.type === 'versement').reduce((s: number, m: any) => s + (m.montant || 0), 0)
  const totalRetraits = (mvts || []).filter((m: any) => m.type === 'retrait').reduce((s: number, m: any) => s + (m.montant || 0), 0)
  const ventesEspeces = (stats?.parModePaiement || []).find((m: any) => m.mode_paiement === 'especes')?.total || 0

  const lines: string[] = []
  lines.push(`${nom} — RÉSUMÉ JOURNALIER`)
  lines.push('═'.repeat(32))
  lines.push(`Date : ${date}`)
  lines.push('')
  lines.push(`CA total : ${fmt(totalVentes, monnaie)} (${nbVentes} vente(s))`)
  lines.push(`Charges : ${fmt(totalCharges, monnaie)}`)
  if (totalVersements > 0) lines.push(`Versements : +${fmt(totalVersements, monnaie)}`)
  if (totalRetraits > 0) lines.push(`Retraits : -${fmt(totalRetraits, monnaie)}`)
  lines.push('')
  lines.push('Ventes par mode :')
  for (const m of stats?.parModePaiement || []) {
    lines.push(`  ${(MODE_LABELS[m.mode_paiement] || m.mode_paiement).padEnd(14)} ${m.nb} vente(s)  ${fmt(m.total, monnaie)}`)
  }
  lines.push('')
  lines.push(`Caisses clôturées (${sessions.length}) :`)
  for (const s of sessions) {
    const fond = Number(s.fond_caisse) || 0
    const compte = Number(s.montant_final_especes) || 0
    const attendues = fond + ventesEspeces + totalVersements - totalRetraits
    const ecart = compte - attendues
    lines.push(`  #${s.id} ${s.user_nom || '—'}  ${s.heure_ouverture}→${s.heure_cloture || '—'}`)
    lines.push(`      Fond ${fmt(fond, monnaie)} · Espèces ${fmt(compte, monnaie)} · Écart ${ecart >= 0 ? '+' : ''}${fmt(ecart, monnaie)}`)
  }
  lines.push('')
  lines.push(`Résultat du jour : ${fmt(totalVentes - totalCharges, monnaie)}`)
  lines.push('═'.repeat(32))

  const to = addrs(config.email_rapports || config.email_fond_caisse)
  return send(config, to, `Résumé journalier — ${nom} — ${date}`, lines.join('\n'), 'journalier')
}

// ─── ÉTAT D'INVENTAIRE (envoyé à la clôture d'un inventaire) ──────────────────
export async function envoyerEtatInventaire(inventaireId: number): Promise<{ success: boolean; error?: string }> {
  const config = getEmailConfig()
  const p = getAllParametres()
  const monnaie = p.monnaie || 'FCFA'
  const nom = p.nom_entreprise || 'KB POS'
  const inv: any = getInventaireById(inventaireId)
  if (!inv) return { success: false, error: 'Inventaire introuvable' }
  const lignes: any[] = inv.lignes || []
  const ecarts = lignes.filter((l: any) => l.ecart !== null && l.ecart !== 0)
  const n = (x: any) => Number(x ?? 0)
  const valeurManque = lignes.reduce((s: number, l: any) => s + (l.ecart !== null && l.ecart < 0 ? Math.abs(n(l.ecart)) * n(l.prix_vente) : 0), 0)
  const valeurSurplus = lignes.reduce((s: number, l: any) => s + (l.ecart !== null && l.ecart > 0 ? n(l.ecart) * n(l.prix_vente) : 0), 0)

  const lines: string[] = []
  lines.push(`${nom} — ÉTAT DE L'INVENTAIRE`)
  lines.push('═'.repeat(40))
  lines.push(`Référence : ${inv.reference}`)
  lines.push(`Date : ${inv.date} · Statut : ${inv.statut === 'cloture' ? 'Clôturé' : 'En cours'}`)
  if (inv.notes) lines.push(`Notes : ${inv.notes}`)
  lines.push('')
  lines.push(`Articles : ${lignes.length} · Écarts : ${ecarts.length}`)
  lines.push(`Manque : ${fmt(valeurManque, monnaie)} · Excédent : ${fmt(valeurSurplus, monnaie)}`)
  lines.push('')
  if (ecarts.length === 0) {
    lines.push('✓ Aucun écart détecté.')
  }
  for (const l of ecarts) {
    lines.push(`${l.produit_nom}`)
    lines.push(`  Théorique ${n(l.stock_theorique)} ${l.unite} · Compté ${l.stock_compte !== null ? n(l.stock_compte) + ' ' + l.unite : '—'} · Écart ${l.ecart > 0 ? '+' : ''}${n(l.ecart)} (${fmt(n(l.ecart) * n(l.prix_vente), monnaie)})`)
    if (l.justification) lines.push(`  Motif : ${l.justification}`)
  }
  lines.push('')
  lines.push('═'.repeat(40))

  const to = addrs(config.email_rapports || config.email_fond_caisse)
  return send(config, to, `État d'inventaire — ${nom} — ${inv.reference}`, lines.join('\n'), 'inventaire')
}

// ─── ALERTE STOCK MINIMUM (1 mail / jour) ─────────────────────────────────────
let stockAlerteLastDate = ''
export async function envoyerAlertesStock(): Promise<{ success: boolean; error?: string; skip?: boolean }> {
  const p = getAllParametres()
  if (p.auto_envoi_stock !== '1') return { success: true, skip: true }
  const produits = getProduitsStockFaible()
  if (!produits.length) return { success: true, skip: true }
  const today = new Date().toISOString().slice(0, 10)
  if (stockAlerteLastDate === today) return { success: true, skip: true }
  const config = getEmailConfig()
  const monnaie = p.monnaie || 'FCFA'
  const nom = p.nom_entreprise || 'KB POS'
  const to = addrs(config.email_rapports || config.email_fond_caisse)

  const lines: string[] = []
  lines.push(`${nom} — ALERTE STOCK MINIMUM`)
  lines.push('═'.repeat(32))
  lines.push(`Date : ${today} · ${produits.length} produit(s) sous le seuil`)
  lines.push('')
  for (const pr of produits) {
    lines.push(`  ${pr.nom}`)
    lines.push(`      Stock actuel : ${pr.stock_actuel} ${pr.unite} (min ${pr.stock_minimum} ${pr.unite})`)
  }
  lines.push('')
  lines.push('═'.repeat(32))

  const res = await send(config, to, `Alerte stock — ${nom} — ${today}`, lines.join('\n'), 'stock')
  if (res.success) stockAlerteLastDate = today
  return res
}
