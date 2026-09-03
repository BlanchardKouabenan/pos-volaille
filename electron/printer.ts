import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer'
import os from 'os'
import path from 'path'
import fs from 'fs'

// Bascules d'une file Windows (winspool) sans module natif : on passe par le spouleur .NET
// (PrintQueue.AddJob écrit des octets bruts = ESC/POS intact). Nécessite uniquement PowerShell 5.1.
function winspoolQueues(): string[] {
  try {
    const { execSync } = require('child_process') as typeof import('child_process')
    const out = execSync(
      'powershell -NoProfile -NonInteractive -Command "Get-Printer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name"',
      { timeout: 8000, windowsHide: true, encoding: 'utf8' }
    )
    return String(out).split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  } catch { return [] }
}

const THERMAL_RE = /(TM[-\s]?T[\dIVX]+|T(?:20|88|70)\d*|6000|\bthermal\b|receipt|esc[- ]?pos|80mm)/i

function winspoolDriver(): any {
  return {
    printDirect(args: any) {
      const printer: string = args.printer
      const data: Buffer = Buffer.from(args.data)
      const tmp = path.join(os.tmpdir(), `kbpos-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`)
      try {
        fs.writeFileSync(tmp, data)
        const script = [
          'Add-Type -AssemblyName System.Printing',
          '$p = New-Object System.Printing.LocalPrintServer',
          '$q = $p.GetPrintQueue($env:KB_PRINTER)',
          "$doc = 'KB POS'",
          '$j = $q.AddJob($doc)',
          '$s = $j.JobStream',
          '$b = [IO.File]::ReadAllBytes($env:KB_TMP)',
          '$s.Write($b,0,$b.Length)',
          '$s.Close()'
        ].join('; ')
        const { execSync } = require('child_process') as typeof import('child_process')
        execSync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${script}"`, {
          timeout: 30000,
          windowsHide: true,
          env: { ...process.env as any, KB_PRINTER: printer, KB_TMP: tmp }
        })
        args.success && args.success(Date.now())
      } catch (e: any) {
        args.error && args.error(e?.message || String(e))
      } finally {
        try { fs.unlinkSync(tmp) } catch {}
      }
    },
    getPrinters() {
      // Utilisé par l'interface "printer:auto" : priorité aux files thermo visibles
      const queues = winspoolQueues()
      const thermal = queues.filter(n => THERMAL_RE.test(n))
      return (thermal.length ? thermal : queues).map(n => ({ name: n, attributes: ['RAW-ONLY'] }))
    },
    getPrinter(name: string) {
      return { name, status: ['ONLINE'] }
    }
  }
}

// node-thermal-printer v4 n'accepte que: tcp://hôte[:port], `printer:<nom>` (avec driver système)
// ou un chemin/fichier. Toute autre chaîne (ex: "USB001") est interprétée comme un fichier → rien ne sort.
export function buildPrinterInterface(params: { printer_interface?: string; printer_port?: string }): string {
  const mode = (params.printer_interface || '').toUpperCase()
  const port = (params.printer_port || '').trim()
  if (mode === 'NETWORK') {
    const target = port.replace(/^tcp:\/\//i, '').trim()
    if (!target) return 'printer:auto'
    // Ajoute le port 9100 par défaut (impression réseau ESC/POS)
    return /:\d+$/.test(target) ? `tcp://${target}` : `tcp://${target}:9100`
  }
  if (mode === 'SERIAL' || /^COM\d+/i.test(port)) {
    return `\\.\\${(port || 'COM1').toUpperCase()}`
  }
  if (port) return `printer:${port}`
  return 'printer:auto'
}

// Driver d'impression "file Windows" fourni par l'app (aucun module natif requis).
// L'interface `printer:<nom>` l'utilise pour spooler les octets ESC/POS bruts.
let windowsPrinterDriver: any = null
function getWindowsPrinterDriver(): any {
  if (windowsPrinterDriver === null) windowsPrinterDriver = winspoolDriver()
  return windowsPrinterDriver
}

// Envoie des octets bruts sur une file Windows (utilisé pour ZPL/EPL d'étiquettes)
export async function spoolRawBytes(printerName: string, data: Buffer): Promise<void> {
  const driver = getWindowsPrinterDriver()
  await new Promise<void>((resolve, reject) => {
    driver.printDirect({
      printer: printerName,
      data,
      success: () => resolve(),
      error: (e: any) => reject(new Error(e?.message || String(e)))
    })
  })
}

export interface ReceiptData {
  ticket: string
  date: string
  caissier: string
  client?: string
  client_telephone?: string
  lignes: { nom: string; quantite: number; prix_unitaire: number; total_ligne: number; unite: string; details?: string; nom_libre?: string; type?: 'retour' | 'echange'; detail?: string }[]
  total: number
  remise: number
  montant_paye: number
  monnaie_rendue: number
  especes_comptees?: number
  mode_paiement: string
  paiements?: { mode: string; montant: number }[]
  header?: string
  footer?: string
  nom_entreprise?: string
  adresse?: string
  telephone?: string
  monnaie?: string
  // Échange / retour
  type?: 'remboursement' | 'echange'
  montant_echange?: number
  montant_reliquat?: number
  // Fidélité
  points_utilises?: number
  points_gagnes?: number
  solde_points?: number
  reduction_points?: number
  valeur_point_fcfa?: number   // pour afficher l'équivalent monétaire
  // Paiements multiples
  cagnotte_utilisee?: number
  portefeuille_utilise?: number
  monnaie_creditee_wallet?: number
  solde_portefeuille?: number
  codeRetour?: string
}

const MODE_LABELS: Record<string, string> = {
  especes: 'Espèces',
  wave: 'Wave',
  orange_money: 'Orange Money',
  mtn: 'MTN Money',
  carte: 'Carte bancaire'
}

function centerPad(text: string, width: number): string {
  if (text.length >= width) return text.substring(0, width)
  const pad = Math.floor((width - text.length) / 2)
  return ' '.repeat(pad) + text + ' '.repeat(width - text.length - pad)
}

function rightAlign(left: string, right: string, width: number): string {
  const available = width - left.length - right.length
  if (available <= 0) return left + ' ' + right
  return left + ' '.repeat(available) + right
}

export async function printReceipt(data: ReceiptData, printerConfig: { type: string; interface: string }): Promise<{ success: boolean; error?: string }> {
  try {
    const iface = printerConfig.interface || 'printer:auto'
    const driver = iface.startsWith('printer:') ? getWindowsPrinterDriver() : null
    if (iface.startsWith('printer:') && !driver) {
      return {
        success: false,
        error: 'Aucun pilote système détecté. Installez le pilote de votre imprimante thermique puis choisissez-la dans la liste, ou utilisez le mode "Réseau" (tcp://IP).'
      }
    }
    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: iface,
      driver: driver || undefined,
      characterSet: CharacterSet.PC858_EURO,
      removeSpecialCharacters: false,
      lineCharacter: '-',
      options: { timeout: 5000 }
    })

    const monnaie = data.monnaie || 'FCFA'
    const width = 42

    printer.alignCenter()
    printer.setTextSize(1, 1)
    printer.bold(true)
    printer.println(data.nom_entreprise || 'KB POS')
    printer.bold(false)
    printer.setTextNormal()

    if (data.adresse) printer.println(data.adresse)
    if (data.telephone) printer.println(`Tél: ${data.telephone}`)

    if (data.header) {
      printer.drawLine()
      const lines = data.header.split('\n')
      for (const line of lines) printer.println(line)
    }

    printer.drawLine()
    printer.alignLeft()
    printer.println(`Ticket: ${data.ticket}`)
    printer.println(`Date  : ${data.date}`)
    printer.println(`Caisse: ${data.caissier}`)
    if (data.client) printer.println(`Client: ${data.client}`)
    printer.drawLine()

    // Header
    printer.println(rightAlign('ARTICLE', 'TOTAL', width))
    printer.println('  Qté x P.U.')
    printer.drawLine()

    // Lines
    if (data.type === 'echange' && data.montant_echange !== undefined) {
      // Reçu d'échange : articles retournés (barrés, en inverse) + articles de remplacement
      const retournes = data.lignes.filter(l => l.type === 'retour')
      const remplacements = data.lignes.filter(l => l.type === 'echange' || !l.type)

      printer.println(rightAlign('ARTICLES RETOURNES', 'MONTANT', width))
      printer.drawLine()
      for (const ligne of retournes) {
        const totalStr = `${ligne.total_ligne.toLocaleString('fr-FR')} ${monnaie}`
        const nomAff = ligne.nom_libre || ligne.nom
        printer.invert(true)
        printer.println(rightAlign(`✗ ${nomAff.substring(0, 20)}`, totalStr, width))
        printer.invert(false)
        printer.println(`  ${ligne.quantite} ${ligne.unite} x ${ligne.prix_unitaire.toLocaleString('fr-FR')} ${monnaie}`)
        if (ligne.details) printer.println(`    ${ligne.details.substring(0, 26)}`)
      }
      if (!retournes.length) printer.println('  (aucun)')

      printer.drawLine()
      printer.println(rightAlign('REMPLACEMENT +', 'MONTANT', width))
      printer.drawLine()
      for (const ligne of remplacements) {
        const totalStr = `${ligne.total_ligne.toLocaleString('fr-FR')} ${monnaie}`
        const nomAff = ligne.nom_libre || ligne.nom
        printer.println(rightAlign(`+ ${nomAff.substring(0, 21)}`, totalStr, width))
        printer.println(`  ${ligne.quantite} ${ligne.unite} x ${ligne.prix_unitaire.toLocaleString('fr-FR')} ${monnaie}`)
        if (ligne.details) printer.println(`    ${ligne.details.substring(0, 26)}`)
      }
      if (!remplacements.length) printer.println('  (aucun)')

      printer.drawLine()
      if (data.montant_reliquat && data.montant_reliquat > 0) {
        const valeurRetournee = (data.montant_echange ?? 0) - data.montant_reliquat
        printer.println(rightAlign('Valeur retournée:', `${Math.max(0, valeurRetournee).toLocaleString('fr-FR')} ${monnaie}`, width))
        printer.println(rightAlign('Valeur remplacement:', `${data.montant_echange.toLocaleString('fr-FR')} ${monnaie}`, width))
        printer.bold(true)
        printer.println(rightAlign('Reliquat à restituer:', `${data.montant_reliquat.toLocaleString('fr-FR')} ${monnaie}`, width))
        printer.bold(false)
      } else if (data.montant_reliquat === 0 && data.montant_paye > 0) {
        const valeurRetournee = (data.montant_echange ?? 0) - data.montant_paye
        printer.println(rightAlign('Valeur retournée:', `${Math.max(0, valeurRetournee).toLocaleString('fr-FR')} ${monnaie}`, width))
        printer.println(rightAlign('Valeur remplacement:', `${data.montant_echange.toLocaleString('fr-FR')} ${monnaie}`, width))
        printer.bold(true)
        printer.println(rightAlign('Complément payé:', `${data.montant_paye.toLocaleString('fr-FR')} ${monnaie}`, width))
        printer.bold(false)
      }
      printer.bold(true)
      printer.setTextSize(1, 0)
      printer.println(rightAlign('TOTAL ÉCHANGE:', `${data.total.toLocaleString('fr-FR')} ${monnaie}`, width))
      printer.setTextNormal()
      printer.bold(false)
    } else {
      for (const ligne of data.lignes) {
        const totalStr = `${ligne.total_ligne.toLocaleString('fr-FR')} ${monnaie}`
        const nomAff = ligne.nom_libre || ligne.nom
        printer.println(rightAlign(nomAff.substring(0, 22), totalStr, width))
        printer.println(`  ${ligne.quantite} ${ligne.unite} x ${ligne.prix_unitaire.toLocaleString('fr-FR')} ${monnaie}`)
        if (ligne.details) printer.println(`    ${ligne.details.substring(0, 26)}`)
      }

      printer.drawLine()

      if (data.remise > 0) {
        printer.println(rightAlign('Sous-total:', `${(data.total + data.remise).toLocaleString('fr-FR')} ${monnaie}`, width))
        printer.println(rightAlign('Remise:', `-${data.remise.toLocaleString('fr-FR')} ${monnaie}`, width))
      }

      printer.bold(true)
      printer.setTextSize(1, 0)
      printer.println(rightAlign('TOTAL:', `${data.total.toLocaleString('fr-FR')} ${monnaie}`, width))
      printer.setTextNormal()
      printer.bold(false)
    }

    printer.drawLine()
    // Détail de tous les modes de paiement
    const hasMultiPay = (data.cagnotte_utilisee || 0) + (data.portefeuille_utilise || 0) > 0
    const hasSplit = data.paiements && data.paiements.length > 0
    if (hasSplit) {
      const modesAffiches = data.paiements!
      if (modesAffiches.length === 1 && !hasMultiPay && data.monnaie_rendue === 0 &&
          modesAffiches[0].mode === data.mode_paiement && modesAffiches[0].montant === data.montant_paye) {
        printer.println(`Paiement: ${MODE_LABELS[data.mode_paiement] || data.mode_paiement}`)
        printer.println(rightAlign('Montant payé:', `${data.montant_paye.toLocaleString('fr-FR')} ${monnaie}`, width))
      } else {
        printer.println('Paiement(s):')
        for (const p of modesAffiches) {
          printer.println(rightAlign(`  ${MODE_LABELS[p.mode] || p.mode}:`, `${p.montant.toLocaleString('fr-FR')} ${monnaie}`, width))
        }
        if (data.montant_paye > 0 && modesAffiches.reduce((s, x) => s + x.montant, 0) < data.montant_paye) {
          printer.println(rightAlign('Montant payé:', `${data.montant_paye.toLocaleString('fr-FR')} ${monnaie}`, width))
        }
      }
    } else if (hasMultiPay) {
      if (data.cagnotte_utilisee && data.cagnotte_utilisee > 0) {
        printer.println(rightAlign('★ Cagnotte:', `-${data.cagnotte_utilisee.toLocaleString('fr-FR')} ${monnaie}`, width))
        if (data.points_utilises && data.points_utilises > 0) {
          printer.println(rightAlign('  (points débités:', `-${data.points_utilises} pts)`, width))
        }
      }
      if (data.portefeuille_utilise && data.portefeuille_utilise > 0) {
        printer.println(rightAlign('Porte-monnaie:', `-${data.portefeuille_utilise.toLocaleString('fr-FR')} ${monnaie}`, width))
      }
      if (data.montant_paye > 0) {
        printer.println(rightAlign(`${MODE_LABELS[data.mode_paiement] || data.mode_paiement}:`, `${data.montant_paye.toLocaleString('fr-FR')} ${monnaie}`, width))
      }
    } else {
      printer.println(`Paiement: ${MODE_LABELS[data.mode_paiement] || data.mode_paiement}`)
      printer.println(rightAlign('Montant payé:', `${data.montant_paye.toLocaleString('fr-FR')} ${monnaie}`, width))
    }
    if (data.monnaie_rendue > 0) {
      if (data.especes_comptees && data.especes_comptees > 0) {
        printer.println(rightAlign('Espèces comptées:', `${data.especes_comptees.toLocaleString('fr-FR')} ${monnaie}`, width))
      }
      printer.println(rightAlign('Monnaie rendue:', `${data.monnaie_rendue.toLocaleString('fr-FR')} ${monnaie}`, width))
    }
    if (data.monnaie_creditee_wallet && data.monnaie_creditee_wallet > 0) {
      printer.println(rightAlign('→ Ajouté au porte-monnaie:', `+${data.monnaie_creditee_wallet.toLocaleString('fr-FR')} ${monnaie}`, width))
      if (data.solde_portefeuille !== undefined) {
        printer.println(rightAlign('Solde porte-monnaie:', `${data.solde_portefeuille.toLocaleString('fr-FR')} ${monnaie}`, width))
      }
    }

    // Fidélité
    if (data.client && (data.points_gagnes || data.solde_points !== undefined)) {
      const vp = data.valeur_point_fcfa ?? 1
      printer.drawLine()
      printer.alignCenter()
      printer.bold(true)
      printer.println('★ CARTE FIDELITE ★')
      printer.bold(false)
      printer.alignLeft()
      if (data.points_gagnes && data.points_gagnes > 0) {
        const equiv = Math.round(data.points_gagnes * vp)
        printer.println(rightAlign('Points gagnés:', `+${data.points_gagnes} pts (${equiv.toLocaleString('fr-FR')} ${monnaie})`, width))
      }
      if (data.solde_points !== undefined) {
        const soldeEquiv = Math.round(data.solde_points * vp)
        printer.bold(true)
        printer.println(rightAlign('Solde fidélité:', `${data.solde_points} pts`, width))
        printer.println(rightAlign('  soit:', `${soldeEquiv.toLocaleString('fr-FR')} ${monnaie}`, width))
        printer.bold(false)
      }
    }

    if (data.footer) {
      printer.drawLine()
      printer.alignCenter()
      const lines = data.footer.split('\n')
      for (const line of lines) printer.println(line)
    }

    printer.drawLine()
    printer.alignCenter()
    printer.println(centerPad(`*** ${data.lignes.length} article(s) ***`, width))

    // QR code ticket (vérification client)
    printer.newLine()
    printer.alignCenter()
    printer.printQR(
      `KB POS | ${data.ticket} | ${data.date} | Total: ${data.total.toLocaleString('fr-FR')} ${monnaie}`,
      { cellSize: 4, correction: 'M' }
    )
    printer.alignCenter()
    printer.println('Scannez pour vérifier ce ticket')
    printer.newLine()

    // Code-barres retour / échange : à scanner en caisse pour lancer directement le retour
    const codeRetour = data.codeRetour || data.ticket
    printer.newLine()
    printer.alignCenter()
    printer.println(centerPad('Code de retour / échange', width))
    printer.code128(codeRetour, { width: 'LARGE', height: 70, text: 1 })
    printer.println(centerPad(codeRetour, width))
    printer.newLine()

    printer.cut()
    await printer.execute()
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function openCashDrawer(printerConfig: { type: string; interface: string }): Promise<{ success: boolean; error?: string }> {
  try {
    const iface = printerConfig.interface || 'printer:auto'
    const driver = iface.startsWith('printer:') ? getWindowsPrinterDriver() : null
    if (iface.startsWith('printer:') && !driver) {
      return {
        success: false,
        error: 'Aucun pilote système détecté pour ouvrir le tiroir (interface "printer:"). Installez le pilote ou utilisez la connexion réseau.'
      }
    }
    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: iface,
      driver: driver || undefined,
      characterSet: CharacterSet.PC858_EURO,
      removeSpecialCharacters: false,
      lineCharacter: '-',
      options: { timeout: 3000 }
    })
    // Commande ESC/POS d'ouverture de tiroir: ESC p m t1 t2
    // m=0 (pin 2), t1=25 (pulse time1), t2=250 (pulse time2)
    printer.raw(Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]))
    await printer.execute()
    return { success: true }
  } catch (err: any) {
    console.log('[Tiroir] Ouverture tiroir (simulation):', err.message)
    return { success: false, error: err.message }
  }
}

export function generateReceiptText(data: ReceiptData): string {
  const monnaie = data.monnaie || 'FCFA'
  const width = 42
  const line = '-'.repeat(width)
  const lines: string[] = []

  lines.push(centerPad(data.nom_entreprise || 'KB POS', width))
  if (data.adresse) lines.push(centerPad(data.adresse, width))
  if (data.telephone) lines.push(centerPad(`Tél: ${data.telephone}`, width))
  if (data.header) lines.push(...data.header.split('\n').map(l => centerPad(l, width)))
  lines.push(line)
  lines.push(`Ticket: ${data.ticket}`)
  lines.push(`Date  : ${data.date}`)
  lines.push(`Caisse: ${data.caissier}`)
  if (data.client) lines.push(`Client: ${data.client}`)
  lines.push(line)
  lines.push(rightAlign('ARTICLE', 'TOTAL', width))
  lines.push('  Qté x P.U.')
  lines.push(line)

  if (data.type === 'echange' && data.montant_echange !== undefined) {
    const retournes = data.lignes.filter(l => l.type === 'retour')
    const remplacements = data.lignes.filter(l => l.type === 'echange' || !l.type)

    lines.push(rightAlign('ARTICLES RETOURNES', 'MONTANT', width))
    lines.push(line)
    for (const ligne of retournes) {
      const totalStr = `${ligne.total_ligne.toLocaleString('fr-FR')} ${monnaie}`
      const nomAff = ligne.nom_libre || ligne.nom
      const nom = nomAff.substring(0, 20)
      lines.push(rightAlign(`[X] ${nom}`, totalStr, width))
      lines.push(`  ${ligne.quantite} ${ligne.unite} x ${ligne.prix_unitaire.toLocaleString('fr-FR')} ${monnaie}`)
      // Simule le "barré" : souligne le nom retourné
      lines.push(`  ${'-'.repeat(Math.min(nom.length + 3, width - 8))}`)
      if (ligne.details) lines.push(`    ${ligne.details.substring(0, 26)}`)
    }
    if (!retournes.length) lines.push('  (aucun)')
    lines.push(line)
    lines.push(rightAlign('REMPLACEMENT +', 'MONTANT', width))
    lines.push(line)
    for (const ligne of remplacements) {
      const totalStr = `${ligne.total_ligne.toLocaleString('fr-FR')} ${monnaie}`
      const nomAff = ligne.nom_libre || ligne.nom
      lines.push(rightAlign(`+ ${nomAff.substring(0, 21)}`, totalStr, width))
      lines.push(`  ${ligne.quantite} ${ligne.unite} x ${ligne.prix_unitaire.toLocaleString('fr-FR')} ${monnaie}`)
      if (ligne.details) lines.push(`    ${ligne.details.substring(0, 26)}`)
    }
    if (!remplacements.length) lines.push('  (aucun)')
    lines.push(line)
    if (data.montant_reliquat && data.montant_reliquat > 0) {
      const valeurRetournee = (data.montant_echange ?? 0) - data.montant_reliquat
      lines.push(rightAlign('Valeur retournée:', `${Math.max(0, valeurRetournee).toLocaleString('fr-FR')} ${monnaie}`, width))
      lines.push(rightAlign('Valeur remplacement:', `${data.montant_echange.toLocaleString('fr-FR')} ${monnaie}`, width))
      lines.push(rightAlign('Reliquat à restituer:', `${data.montant_reliquat.toLocaleString('fr-FR')} ${monnaie}`, width))
    } else if (data.montant_reliquat === 0 && data.montant_paye > 0) {
      const valeurRetournee = (data.montant_echange ?? 0) - data.montant_paye
      lines.push(rightAlign('Valeur retournée:', `${Math.max(0, valeurRetournee).toLocaleString('fr-FR')} ${monnaie}`, width))
      lines.push(rightAlign('Valeur remplacement:', `${data.montant_echange.toLocaleString('fr-FR')} ${monnaie}`, width))
      lines.push(rightAlign('Complément payé:', `${data.montant_paye.toLocaleString('fr-FR')} ${monnaie}`, width))
    }
    lines.push(rightAlign('TOTAL ÉCHANGE:', `${data.total.toLocaleString('fr-FR')} ${monnaie}`, width))
  } else {
    for (const ligne of data.lignes) {
      const totalStr = `${ligne.total_ligne.toLocaleString('fr-FR')} ${monnaie}`
      const nomAff = ligne.nom_libre || ligne.nom
      lines.push(rightAlign(nomAff.substring(0, 22), totalStr, width))
      lines.push(`  ${ligne.quantite} ${ligne.unite} x ${ligne.prix_unitaire.toLocaleString('fr-FR')} ${monnaie}`)
      if (ligne.details) lines.push(`    ${ligne.details.substring(0, 26)}`)
    }

    lines.push(line)
    if (data.remise > 0) {
      lines.push(rightAlign('Sous-total:', `${(data.total + data.remise).toLocaleString('fr-FR')} ${monnaie}`, width))
      lines.push(rightAlign('Remise:', `-${data.remise.toLocaleString('fr-FR')} ${monnaie}`, width))
    }
    lines.push(rightAlign('TOTAL:', `${data.total.toLocaleString('fr-FR')} ${monnaie}`, width))
  }
  lines.push(line)
  const hasMultiPay2 = (data.cagnotte_utilisee || 0) + (data.portefeuille_utilise || 0) > 0
  const hasSplit2 = data.paiements && data.paiements.length > 0
  if (hasSplit2) {
    const modesAffiches = data.paiements!
    if (modesAffiches.length === 1 && !hasMultiPay2 && data.monnaie_rendue === 0 &&
        modesAffiches[0].mode === data.mode_paiement && modesAffiches[0].montant === data.montant_paye) {
      lines.push(`Paiement: ${MODE_LABELS[data.mode_paiement] || data.mode_paiement}`)
      lines.push(rightAlign('Montant payé:', `${data.montant_paye.toLocaleString('fr-FR')} ${monnaie}`, width))
    } else {
      lines.push('Paiement(s):')
      for (const p of modesAffiches) {
        lines.push(rightAlign(`  ${MODE_LABELS[p.mode] || p.mode}:`, `${p.montant.toLocaleString('fr-FR')} ${monnaie}`, width))
      }
      if (data.montant_paye > 0 && modesAffiches.reduce((s, x) => s + x.montant, 0) < data.montant_paye) {
        lines.push(rightAlign('Montant payé:', `${data.montant_paye.toLocaleString('fr-FR')} ${monnaie}`, width))
      }
    }
  } else if (hasMultiPay2) {
    if (data.cagnotte_utilisee && data.cagnotte_utilisee > 0) {
      lines.push(rightAlign('★ Cagnotte:', `-${data.cagnotte_utilisee.toLocaleString('fr-FR')} ${monnaie}`, width))
      if (data.points_utilises && data.points_utilises > 0)
        lines.push(rightAlign('  (pts débités:', `-${data.points_utilises} pts)`, width))
    }
    if (data.portefeuille_utilise && data.portefeuille_utilise > 0)
      lines.push(rightAlign('Porte-monnaie:', `-${data.portefeuille_utilise.toLocaleString('fr-FR')} ${monnaie}`, width))
    if (data.montant_paye > 0)
      lines.push(rightAlign(`${MODE_LABELS[data.mode_paiement] || data.mode_paiement}:`, `${data.montant_paye.toLocaleString('fr-FR')} ${monnaie}`, width))
  } else {
    lines.push(`Paiement: ${MODE_LABELS[data.mode_paiement] || data.mode_paiement}`)
    lines.push(rightAlign('Montant payé:', `${data.montant_paye.toLocaleString('fr-FR')} ${monnaie}`, width))
  }
  if (data.monnaie_rendue > 0) {
    if (data.especes_comptees && data.especes_comptees > 0)
      lines.push(rightAlign('Espèces comptées:', `${data.especes_comptees.toLocaleString('fr-FR')} ${monnaie}`, width))
    lines.push(rightAlign('Monnaie rendue:', `${data.monnaie_rendue.toLocaleString('fr-FR')} ${monnaie}`, width))
  }
  if (data.monnaie_creditee_wallet && data.monnaie_creditee_wallet > 0) {
    lines.push(rightAlign('→ Ajouté porte-monnaie:', `+${data.monnaie_creditee_wallet.toLocaleString('fr-FR')} ${monnaie}`, width))
    if (data.solde_portefeuille !== undefined)
      lines.push(rightAlign('Solde porte-monnaie:', `${data.solde_portefeuille.toLocaleString('fr-FR')} ${monnaie}`, width))
  }
  // Fidélité sur ticket texte
  if (data.client && (data.points_gagnes || data.solde_points !== undefined)) {
    const vp = data.valeur_point_fcfa ?? 1
    lines.push(line)
    lines.push(centerPad('★ CARTE FIDELITE ★', width))
    if (data.points_gagnes && data.points_gagnes > 0) {
      const equiv = Math.round(data.points_gagnes * vp)
      lines.push(rightAlign('Points gagnés:', `+${data.points_gagnes} pts (${equiv.toLocaleString('fr-FR')} ${monnaie})`, width))
    }
    if (data.solde_points !== undefined) {
      const soldeEquiv = Math.round(data.solde_points * vp)
      lines.push(rightAlign('Solde fidélité:', `${data.solde_points} pts`, width))
      lines.push(rightAlign('  soit:', `${soldeEquiv.toLocaleString('fr-FR')} ${monnaie}`, width))
    }
  }
  if (data.footer) { lines.push(line); lines.push(...data.footer.split('\n').map(l => centerPad(l, width))) }
  lines.push(line)
  lines.push(centerPad(`*** ${data.lignes.length} article(s) ***`, width))

  // Code-barres retour / échange (aperçu texte : le vrai code-barres est imprimé physiquement)
  const codeRetour = data.codeRetour || data.ticket
  lines.push(line)
  lines.push(centerPad('Code de retour / échange', width))
  lines.push(centerPad(`|| ${'█'.repeat(12)} ||  `, width))
  lines.push(centerPad(codeRetour, width))

  return lines.join('\n')
}
