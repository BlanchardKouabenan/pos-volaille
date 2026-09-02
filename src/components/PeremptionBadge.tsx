import { AlertTriangle, Clock, CheckCircle } from 'lucide-react'

interface Props {
  datePeremption?: string | null
  joursAlerte?: number
  compact?: boolean
}

export function getPeremptionStatus(date?: string | null, joursAlerte = 7): 'expiré' | 'urgent' | 'alerte' | 'ok' | null {
  if (!date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exp = new Date(date)
  exp.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((exp.getTime() - today.getTime()) / 86400000)
  if (diffDays < 0) return 'expiré'
  if (diffDays === 0) return 'urgent'
  if (diffDays <= joursAlerte) return 'alerte'
  return 'ok'
}

export function getJoursRestants(date?: string | null): number | null {
  if (!date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exp = new Date(date)
  exp.setHours(0, 0, 0, 0)
  return Math.floor((exp.getTime() - today.getTime()) / 86400000)
}

export default function PeremptionBadge({ datePeremption, joursAlerte = 7, compact = false }: Props) {
  const status = getPeremptionStatus(datePeremption, joursAlerte)
  if (!status) return null

  const jours = getJoursRestants(datePeremption)

  const config = {
    expiré: {
      bg: 'bg-red-100 text-red-700 border border-red-200',
      icon: <AlertTriangle size={compact ? 11 : 13} />,
      label: 'EXPIRÉ',
      sub: datePeremption
    },
    urgent: {
      bg: 'bg-red-500 text-white',
      icon: <AlertTriangle size={compact ? 11 : 13} />,
      label: "Exp. aujourd'hui",
      sub: null
    },
    alerte: {
      bg: 'bg-orange-100 text-orange-700 border border-orange-200',
      icon: <Clock size={compact ? 11 : 13} />,
      label: `Exp. dans ${jours}j`,
      sub: datePeremption
    },
    ok: {
      bg: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
      icon: <CheckCircle size={compact ? 11 : 13} />,
      label: datePeremption!,
      sub: null
    }
  }[status]

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-semibold ${config.bg}`}>
        {config.icon}
        {status === 'expiré' ? 'EXP' : status === 'urgent' ? 'TODAY' : `${jours}j`}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold ${config.bg}`}>
      {config.icon}
      <span>{config.label}</span>
    </span>
  )
}
