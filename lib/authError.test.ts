import { describe, it, expect } from 'vitest'
import { isAuthError, markIntentionalSignOut, consumeIntentionalSignOut } from './authError'

describe('isAuthError', () => {
  it('matches PostgREST JWT error code', () => {
    expect(isAuthError({ code: 'PGRST301', message: 'JWT expired' })).toBe(true)
  })

  it('matches HTTP 401 status', () => {
    expect(isAuthError({ status: 401, message: 'Unauthorized' })).toBe(true)
  })

  it('matches a message mentioning jwt/token', () => {
    expect(isAuthError({ message: 'JWT expired' })).toBe(true)
    expect(isAuthError({ message: 'invalid token' })).toBe(true)
  })

  it('does not match an unrelated database error', () => {
    expect(isAuthError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false)
  })

  it('does not match null, non-objects, or errors without a matching signal', () => {
    expect(isAuthError(null)).toBe(false)
    expect(isAuthError(undefined)).toBe(false)
    expect(isAuthError('plain string error')).toBe(false)
    expect(isAuthError({ message: 'network error' })).toBe(false)
  })
})

describe('intentional sign-out flag', () => {
  it('is false until marked, and consuming it clears it', () => {
    expect(consumeIntentionalSignOut()).toBe(false)
    markIntentionalSignOut()
    expect(consumeIntentionalSignOut()).toBe(true)
    expect(consumeIntentionalSignOut()).toBe(false)
  })
})
