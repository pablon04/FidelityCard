import { Link } from 'react-router'
import { APPROVAL } from '../../services/adminService.js'

/** Estado de autorizacion: siempre con texto (no solo color). */
export function ApprovalChip({ status }) {
  const cls =
    status === 'approved'
      ? 'border-success text-success'
      : status === 'pending'
        ? 'border-warning text-warning'
        : 'border-danger text-danger'
  return (
    <span
      className={`whitespace-nowrap rounded-chip border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {APPROVAL[status] ?? status}
    </span>
  )
}

export function Stat({ icon: Icon, label, value, sub, to }) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-sm font-medium text-text-muted">
        {Icon && <Icon aria-hidden="true" size={18} />}
        {label}
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums text-text">{value}</p>
      {sub && <p className="mt-1 text-sm text-text-muted">{sub}</p>}
    </>
  )
  const cls = 'block rounded-card border border-border-subtle bg-surface p-4'
  return to ? (
    <Link to={to} className={`${cls} hover:border-border`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
