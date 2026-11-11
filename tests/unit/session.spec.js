import { afterEach, describe, expect, it } from 'vitest'
import {
  SESSION_TOKEN_STORAGE_KEY,
  loadSavedSessionToken,
  saveSessionToken,
  loadSavedSessionEmail,
  saveSessionEmail,
  clearSavedSession,
  sessionKey,
} from '../../src/session.js'

function fakeStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    map,
  }
}

afterEach(() => {
  localStorage.clear()
})

describe('session storage', () => {
  it('round-trips the session token and email', () => {
    const storage = fakeStorage()
    saveSessionToken('sess-1', storage, false)
    saveSessionEmail('owner@example.com', storage, false)
    expect(storage.map.get('list-of-stuff-admin-session-token')).toBe('sess-1')
    expect(loadSavedSessionToken(storage, false)).toBe('sess-1')
    expect(loadSavedSessionEmail(storage, false)).toBe('owner@example.com')
  })

  it('clears both values', () => {
    const storage = fakeStorage()
    saveSessionToken('sess-1', storage, false)
    saveSessionEmail('owner@example.com', storage, false)
    clearSavedSession(storage, false)
    expect(loadSavedSessionToken(storage, false)).toBe('')
    expect(loadSavedSessionEmail(storage, false)).toBe('')
  })

  it('keeps staging and production sessions apart', () => {
    const storage = fakeStorage()
    saveSessionToken('prod', storage, false)
    saveSessionToken('staging', storage, true)
    expect(sessionKey(SESSION_TOKEN_STORAGE_KEY, true)).toBe(
      'list-of-stuff-admin-session-token:staging',
    )
    expect(loadSavedSessionToken(storage, false)).toBe('prod')
    expect(loadSavedSessionToken(storage, true)).toBe('staging')
    clearSavedSession(storage, true)
    expect(loadSavedSessionToken(storage, false)).toBe('prod')
  })

  it('uses the localStorage of the page by default', () => {
    saveSessionToken('default-token')
    saveSessionEmail('owner@example.com')
    expect(loadSavedSessionToken()).toBe('default-token')
    expect(loadSavedSessionEmail()).toBe('owner@example.com')
    clearSavedSession()
    expect(loadSavedSessionToken()).toBe('')
  })

  it('tolerates missing storage', () => {
    expect(loadSavedSessionToken(null, false)).toBe('')
    expect(loadSavedSessionEmail(null, false)).toBe('')
  })

  it('tolerates unavailable storage', () => {
    const throwing = {
      getItem() { throw new Error('denied') },
      setItem() { throw new Error('denied') },
      removeItem() { throw new Error('denied') },
    }
    expect(loadSavedSessionToken(throwing, false)).toBe('')
    expect(() => saveSessionToken('t', throwing, false)).not.toThrow()
    expect(() => clearSavedSession(throwing, false)).not.toThrow()
  })
})
