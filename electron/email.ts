import nodemailer from 'nodemailer'
import { logEmail } from './database'

export interface EmailConfig {
  smtp_host: string
  smtp_port: string
  smtp_user: string
  smtp_pass: string
  smtp_secure: string      // '1' | '0'
  smtp_from: string        // nom/email d'expéditeur
  email_rapports: string   // destinataires séparés par ; ou ,
  email_fond_caisse: string // destinataires du fond de caisse (sinon email_rapports)
}

function createTransport(config: EmailConfig) {
  return nodemailer.createTransport({
    host: config.smtp_host,
    port: parseInt(config.smtp_port || '587', 10),
    secure: config.smtp_secure === '1',
    auth: { user: config.smtp_user, pass: config.smtp_pass },
    tls: { rejectUnauthorized: false }
  })
}

export async function verifySmtp(config: EmailConfig): Promise<{ ok: boolean; error?: string }> {
  if (!config.smtp_host || !config.smtp_user || !config.smtp_pass) {
    return { ok: false, error: 'Configuration SMTP incomplète' }
  }
  try {
    await createTransport(config).verify()
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

export async function sendEmail(params: {
  config: EmailConfig
  to: string
  subject: string
  text: string
  html?: string
  type?: string
}): Promise<{ success: boolean; error?: string }> {
  const { config } = params
  if (!config.smtp_host || !config.smtp_user || !config.smtp_pass) {
    await logEmail({ type: params.type, sujet: params.subject, destinataire: params.to, statut: 'echec', erreur: 'Configuration SMTP incomplète' })
    return { success: false, error: 'Configuration SMTP incomplète' }
  }
  const to = params.to.trim()
  if (!to) {
    await logEmail({ type: params.type, sujet: params.subject, destinataire: '', statut: 'echec', erreur: 'Aucun destinataire' })
    return { success: false, error: 'Aucun destinataire' }
  }
  try {
    const transporter = createTransport(config)
    const info = await transporter.sendMail({
      from: config.smtp_from || config.smtp_user,
      to,
      subject: params.subject,
      text: params.text,
      ...(params.html ? { html: params.html } : {})
    })
    await logEmail({ type: params.type, sujet: params.subject, destinataire: to, statut: 'envoye' })
    return { success: true }
  } catch (err: any) {
    await logEmail({ type: params.type, sujet: params.subject, destinataire: to, statut: 'echec', erreur: err.message })
    return { success: false, error: err.message }
  }
}
