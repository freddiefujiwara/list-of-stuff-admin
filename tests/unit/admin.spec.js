import { describe, expect, it } from 'vitest'
import {
  emptyItem,
  emptySubscription,
  filterFlagged,
  formFromSubscription,
  subscriptionCost,
  formFromItem,
  formatPrice,
  isFlagged,
  itemMeta,
  shareLinkView,
  sheetLabel,
} from '../../src/utils/admin.js'

describe('admin utils', () => {
  it('detects the tidy-up flag and filters by it', () => {
    expect(isFlagged({ flag: '整理対象' })).toBe(true)
    expect(isFlagged({ flag: '' })).toBe(false)
    expect(isFlagged({})).toBe(false)
    expect(isFlagged(null)).toBe(false)
    const list = [{ flag: '整理対象' }, { flag: '' }, {}]
    expect(filterFlagged(list, true)).toEqual([{ flag: '整理対象' }])
    expect(filterFlagged(list, false)).toBe(list)
  })

it('builds a blank subscription form with the yearly basis', () => {
    expect(emptySubscription()).toEqual({ service: '', purpose: '', basis: 'yearly', amount: '', url: '' })
  })

  it('maps a subscription into the form on its basis side', () => {
    expect(
      formFromSubscription({ service: 'NHK', purpose: 'tv', basis: 'yearly', yearly: 21765, monthly: 1813, url: 'u' }),
    ).toEqual({ service: 'NHK', purpose: 'tv', basis: 'yearly', amount: 21765, url: 'u' })
    expect(
      formFromSubscription({ service: 'M', purpose: '', basis: 'monthly', yearly: 6000, monthly: 500, url: '' }).amount,
    ).toBe(500)
    expect(formFromSubscription({})).toEqual({ service: '', purpose: '', basis: 'yearly', amount: '', url: '' })
    expect(formFromSubscription({ basis: 'monthly' }).amount).toBe('')
  })

  it('formats the subscription cost line', () => {
    expect(subscriptionCost({ yearly: 21765, monthly: 1813.75, ratio: 0.015 })).toBe('年 ¥21,765 / 月 ¥1,814 / 1.5%')
    expect(subscriptionCost({ yearly: '', monthly: '', ratio: '' })).toBe('')
    expect(subscriptionCost({ yearly: 3000, monthly: 250, ratio: 0 })).toBe('年 ¥3,000 / 月 ¥250')
  })

  it('emptyItem starts blank with one unit', () => {
    expect(emptyItem()).toEqual({
      title: '',
      image: '',
      url: '',
      price: '',
      unit: 1,
      genre: '',
      comment: '',
    })
  })

  it('sheetLabel maps keys to display labels', () => {
    expect(sheetLabel('workman')).toBe('ワークマン')
    expect(sheetLabel('variety')).toBe('ダイソー・100均')
    expect(sheetLabel('others')).toBe('その他')
    expect(sheetLabel('room')).toBe('楽天ROOM')
    expect(sheetLabel('unknown-key')).toBe('unknown-key')
  })

  it('formatPrice formats numbers and hides blanks', () => {
    expect(formatPrice(2029)).toBe('¥2,029')
    expect(formatPrice('¥4,380')).toBe('¥4,380')
    expect(formatPrice('')).toBe('')
    expect(formatPrice(null)).toBe('')
    expect(formatPrice('abc')).toBe('')
    expect(formatPrice('-')).toBe('')
  })

  it('itemMeta joins price, unit, genre and comment', () => {
    expect(itemMeta({ price: 1500, unit: 2, genre: 'G', comment: 'c' })).toBe('¥1,500 ×2 / G / c')
    expect(itemMeta({ price: 1500, unit: 1, genre: '', comment: '' })).toBe('¥1,500')
    expect(itemMeta({ price: '', unit: '', genre: 'G', comment: '' })).toBe('G')
    expect(itemMeta({ price: '', unit: '', genre: '', comment: '' })).toBe('')
  })

  it('formFromItem of an empty object is all blanks', () => {
    expect(formFromItem({})).toEqual({
      title: '',
      image: '',
      url: '',
      price: '',
      unit: '',
      genre: '',
      comment: '',
    })
  })

  it('shareLinkView is blank before issue and filled after', () => {
    const now = Date.parse('2026-11-07T00:00:00Z')
    expect(shareLinkView(null, 'https://example.com/app/', now)).toEqual({
      url: '',
      remaining: '',
      expires: '',
    })
    const view = shareLinkView(
      { share_token: 'tok', expires_at: '2026-12-07T00:00:00.000Z' },
      'https://example.com/app/',
      now,
    )
    expect(view.url).toBe('https://example.com/app/#share=tok')
    expect(view.remaining).toBe('残り約30日')
    const expiryDate = new Date('2026-12-07T00:00:00.000Z')
    const pad = (n) => String(n).padStart(2, '0')
    expect(view.expires).toBe(
      `${expiryDate.getFullYear()}${pad(expiryDate.getMonth() + 1)}${pad(expiryDate.getDate())} ${pad(expiryDate.getHours())}:${pad(expiryDate.getMinutes())}`,
    )
  })

  it('formFromItem copies fields and fills blanks', () => {
    expect(formFromItem({ title: 'A', price: 100 })).toEqual({
      title: 'A',
      image: '',
      url: '',
      price: 100,
      unit: '',
      genre: '',
      comment: '',
    })
  })
})
