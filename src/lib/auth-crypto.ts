/**
 * Cryptographic utilities for Pass 5 auth
 */

import { createHash } from 'crypto'

/**
 * SHA-256 hash a PIN (4-digit string)
 */
export function hashPin(pin: string): string {
  return createHash('sha256').update(pin).digest('hex')
}

/**
 * Compare a plaintext PIN with a hash
 */
export function verifyPin(plainPin: string, hash: string): boolean {
  return hashPin(plainPin) === hash
}

/**
 * SHA-256 hash a password (for account password_hash)
 * In production, use bcrypt/argon2. For now matching bracket_users pattern.
 */
export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

/**
 * Verify password against hash
 */
export function verifyPassword(plainPassword: string, hash: string): boolean {
  return hashPassword(plainPassword) === hash
}

/**
 * Validate PIN format (must be exactly 4 digits)
 */
export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}
