import { describe, expect, it } from 'vitest'
import { ALL_TAB, API_URL, GOOGLE_CLIENT_ID, SHEETS, sheetKind } from '../../src/constants/app.js'

describe('constants', () => {
  it('keeps the API placeholder the CI injects', () => {
    expect(API_URL).toBe('<API>')
  })

  it('uses the shared Google client ID', () => {
    expect(GOOGLE_CLIENT_ID).toContain('.apps.googleusercontent.com')
  })

  it('lists the sheets with the ROOM tab among them', () => {
    expect(SHEETS.map((s) => s.key)).toEqual(['workman', 'variety', 'others', 'room', 'subscriptions'])
  })

  it('gives every sheet a short tab label for the one-row tab bar', () => {
    expect(SHEETS.map((s) => s.tabLabel)).toEqual(['ワークマン', 'ダイソー', 'その他', 'ROOM', 'サブスク'])
  })

  it('defines the cross-sheet tab outside the sheets', () => {
    expect(ALL_TAB).toEqual({ key: 'all', label: 'すべて', tabLabel: 'すべて' })
    expect(SHEETS.map((s) => s.key)).not.toContain('all')
  })

  it('marks the subscriptions sheet and the read-only ROOM tab with their own kinds', () => {
    expect(sheetKind('subscriptions')).toBe('subscriptions')
    expect(sheetKind('room')).toBe('room')
    expect(sheetKind('workman')).toBe('items')
    expect(sheetKind('unknown-key')).toBe('items')
  })
})
