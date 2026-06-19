/**
 * PPlaner — Session Management
 *
 * Uses JWE (JSON Web Encryption) via the `jose` library to store session data
 * in an encrypted HttpOnly cookie. Tokens are NEVER exposed to the client.
 *
 * Security:
 *  - Algorithm: dir + A256GCM (authenticated encryption)
 *  - Key derived from SESSION_SECRET via SHA-256
 *  - Cookies: HttpOnly, Secure (in production), SameSite=Lax
 *  - 7-day session expiry
 *
 * TODO(security): In production, set SESSION_SECRET as a Vercel env var
 * with at least 32 random characters. Rotate it periodically.
 */

import { EncryptJWT, jwtDecrypt } from 'jose';
import { createHash } from 'node:crypto';
import type { SessionData } from '../types/index.js';

const SESSION_COOKIE_NAME = 'pplaner-session';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Derives a 32-byte AES key from the SESSION_SECRET environment variable.
 * Throws in production if the secret is not set or is too short.
 * In development, uses a fixed dev-only fallback (logged as a warning).
 */
function getEncryptionKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      // Fail closed in production — no fallback
      throw new Error(
        '[PPlaner] SESSION_SECRET must be set in production. ' +
        'Generate one with: openssl rand -hex 32'
      );
    }
    // Development fallback — ephemeral, consistent within a process
    // TODO(security): Set SESSION_SECRET in .env for stable dev sessions
    console.warn(
      '[PPlaner][SECURITY WARNING] SESSION_SECRET is not set or too short. ' +
      'Using dev fallback. Sessions will not persist after restart!'
    );
    return new Uint8Array(
      createHash('sha256').update('pplaner-dev-fallback-not-for-production').digest()
    );
  }

  return new Uint8Array(createHash('sha256').update(secret).digest());
}

/**
 * Reads and decrypts the session cookie from an incoming Request.
 * Returns an empty object if no session cookie exists or if decryption fails.
 */
export async function getSession(request: Request): Promise<SessionData> {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const sessionCookie = parseCookie(cookieHeader, SESSION_COOKIE_NAME);

  if (!sessionCookie) return {};

  try {
    const key = getEncryptionKey();
    const { payload } = await jwtDecrypt(sessionCookie, key);
    return payload as unknown as SessionData;
  } catch {
    // Invalid or expired token — treat as no session
    return {};
  }
}

/**
 * Encrypts session data into a JWE token and returns a Set-Cookie header value.
 * Call this when you want to create or update a session.
 */
export async function createSessionCookie(data: SessionData): Promise<string> {
  const key = getEncryptionKey();

  const token = await new EncryptJWT(data as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .encrypt(key);

  const isProduction = process.env.NODE_ENV === 'production';

  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ...(isProduction ? ['Secure'] : []),
  ];

  return parts.join('; ');
}

/**
 * Returns a Set-Cookie header value that clears the session cookie.
 */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');
    if (key?.trim() === name) {
      return valueParts.join('=').trim() || null;
    }
  }
  return null;
}
