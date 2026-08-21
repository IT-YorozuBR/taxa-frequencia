import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 dias

export type Role = 'admin' | 'user'

export interface SessionPayload {
  sub: string // user id
  username: string
  role: Role
}

// AUTH_SECRET must be set in production (docker-compose / .env). Falls back
// to a fixed dev-only value so `npm run dev` works out of the box without
// extra setup — never rely on this fallback outside local development.
function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET || 'dev-only-insecure-secret-change-me'
  return new TextEncoder().encode(secret)
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ username: payload.username, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey())
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey())
    if (typeof payload.sub !== 'string' || typeof payload.username !== 'string' || typeof payload.role !== 'string') {
      return null
    }
    return { sub: payload.sub, username: payload.username, role: payload.role as Role }
  } catch {
    return null
  }
}

// secure:true means the browser only ever sends the session cookie over
// HTTPS — the right default in production. AUTH_ALLOW_INSECURE_COOKIE is an
// explicit, temporary escape hatch for deployments that aren't behind TLS
// yet (e.g. internal LAN without a certificate configured). Turning it on
// means the session cookie travels in cleartext on that network — remove
// this env var as soon as HTTPS is set up in front of the app.
const allowInsecureCookie = process.env.AUTH_ALLOW_INSECURE_COOKIE === 'true'
if (process.env.NODE_ENV === 'production' && allowInsecureCookie) {
  console.warn(
    '[auth] AUTH_ALLOW_INSECURE_COOKIE=true — o cookie de sessão está sendo enviado sem exigir HTTPS. ' +
    'Isso é esperado apenas como medida temporária até o HTTPS ser configurado na frente da aplicação.'
  )
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' && !allowInsecureCookie,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS,
}
