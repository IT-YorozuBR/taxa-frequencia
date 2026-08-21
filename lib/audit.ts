import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

export type AuditAction =
  | 'attendance.update'
  | 'user.create'
  | 'user.delete'
  | 'user.password_reset'
  | 'user.change_password'

interface LogAuditParams {
  userId: string | null
  username: string
  action: AuditAction
  target: string
  details?: Record<string, unknown>
}

// Best-effort: a failure here must never break the actual operation being
// audited, so errors are swallowed (and logged to the server console).
export async function logAudit({ userId, username, action, target, details }: LogAuditParams) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        username,
        action,
        target,
        details: details as Prisma.InputJsonValue | undefined,
      },
    })
  } catch (error) {
    console.error('[audit] falha ao registrar log', error)
  }
}
