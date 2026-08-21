import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { signSession, verifySession } from './auth'

const ORIGINAL_SECRET = process.env.AUTH_SECRET

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-secret-for-vitest'
})

afterEach(() => {
  process.env.AUTH_SECRET = ORIGINAL_SECRET
})

describe('session sign/verify round-trip', () => {
  it('verifySession returns the same payload that was signed', async () => {
    const token = await signSession({ sub: 'user-123', username: 'joao', role: 'user' })
    const payload = await verifySession(token)
    expect(payload).toEqual({ sub: 'user-123', username: 'joao', role: 'user' })
  })

  it('preserves the admin role', async () => {
    const token = await signSession({ sub: 'admin-1', username: 'admin', role: 'admin' })
    const payload = await verifySession(token)
    expect(payload?.role).toBe('admin')
  })
})

describe('verifySession rejects invalid tokens', () => {
  it('rejects garbage input', async () => {
    expect(await verifySession('not-a-real-token')).toBeNull()
  })

  it('rejects an empty string', async () => {
    expect(await verifySession('')).toBeNull()
  })

  it('rejects a token signed with a different secret (tampering / secret rotation)', async () => {
    process.env.AUTH_SECRET = 'secret-a'
    const token = await signSession({ sub: 'user-1', username: 'joao', role: 'user' })

    // Simulates AUTH_SECRET being rotated — all previously issued sessions
    // must stop validating, forcing everyone to log in again.
    process.env.AUTH_SECRET = 'secret-b'
    expect(await verifySession(token)).toBeNull()
  })

  it('rejects a token whose payload was tampered with (signature no longer matches)', async () => {
    const token = await signSession({ sub: 'user-1', username: 'joao', role: 'user' })
    const [header, payload, signature] = token.split('.')
    // Flip the role claim in the payload segment without re-signing.
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
    decoded.role = 'admin'
    const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString('base64url')
    const tamperedToken = `${header}.${tamperedPayload}.${signature}`

    expect(await verifySession(tamperedToken)).toBeNull()
  })
})
