import { spoolRawBytes } from './printer'

// ─── Impression directe d'étiquettes en ZPL (Zebra / imprimantes d'étiquettes) ──
// Génère des commandes ZPL (^XA ... ^XZ) et les envoie en octets bruts sur une
// file Windows via le spouleur .NET (même mécanisme que printer.ts).

export interface LabelItem {
  nom: string
  prix?: number
  code_barre?: string
  monnaie?: string
  entreprise?: string
}

function escape(text: string): string {
  return String(text ?? '').replace(/[^ -~]/g, '').slice(0, 40)
}

// Barre de prix à droite, texte justifié à gauche pour un rendu propre sur étiquette 40x20mm
function buildLabelLines(l: LabelItem, w: number): string {
  const lines: string[] = []
  const ent = l.entreprise ? escape(l.entreprise).toUpperCase() : ''
  const nom = escape(l.nom || 'Produit')
  const prix = l.prix != null ? `${Math.round(l.prix).toLocaleString('fr-FR')} ${l.monnaie || 'FCFA'}` : ''

  if (ent) lines.push(`^FO10,${8}^A0N,20,20^FD${ent}^FS`)
  // Nom (peut occuper 2 lignes si long) — sur une ligne tronquée par sécurité
  const yNom = ent ? 30 : 8
  let textField = nom
  // Si le prix doit être affiché à droite en même temps, on raccourcit le nom
  const yPrix = ent ? 55 : 40
  const yCode = ent ? 75 : 62

  if (prix) {
    lines.push(`^FO10,${yNom}^A0N,24,24^FD${textField.slice(0, 24)}^FS`)
    lines.push(`^FO${w - 60},${yNom}^A0N,26,26^FR^FD${prix}^FS`)
  } else {
    lines.push(`^FO10,${yNom}^A0N,24,24^FD${textField.slice(0, 26)}^FS`)
  }

  if (l.code_barre) {
    const code = escape(l.code_barre)
    // Code128 : ^BCn,h,f,g,e,m
    lines.push(`^FO15,${yCode}^BY2,2.2,50^BCN,50,Y,N,N^FD${code}^FS`)
  }
  return lines.join('\n')
}

// Génère un document ZPL multipage/label. `copies` = nombre d'étiquettes identiques.
export function generateZpl(items: LabelInfo[]): string {
  const w = 300
  const labelH = 100
  const parts: string[] = []
  for (const it of items) {
    const body = buildLabelLines(it, w)
    for (let c = 0; c < (it.copies || 1); c++) {
      parts.push(`^XA^CI28\n${body}\n^XZ`)
    }
  }
  return parts.join('\n')
}

export interface LabelInfo extends LabelItem {
  copies?: number
}

// Envoie un document ZPL en octets bruts sur la file Windows "printer" via le spouleur.
export async function printZplFromString(zpl: string, printerName: string): Promise<{ success: boolean; error?: string }> {
  try {
    const data = Buffer.from(zpl, 'utf8')
    await spoolRawBytes(printerName, data)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) }
  }
}
