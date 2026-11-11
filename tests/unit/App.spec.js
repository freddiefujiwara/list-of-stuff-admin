import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App.vue'

const toBase64Url = (obj) =>
  Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const credential = (payload) => `${toBase64Url({ alg: 'RS256' })}.${toBase64Url(payload)}.sig`

const ITEMS_BY_SHEET = {
  workman: [
    { row: 2, title: 'Workman A', image: 'https://img.example/a.jpg', url: 'https://example.com/a', price: 1500, unit: 2, genre: '衣料', comment: 'メモ' },
  ],
  variety: [],
  others: [
    { row: 2, title: 'Other C', image: '', url: '', price: '', unit: '', genre: '旧ジャンル', comment: '' },
  ],
  room: [
    { row: 2, title: 'Room Lamp', image: '', url: 'https://room.rakuten.co.jp/freddiefujiwara/111', price: 3000, unit: 1, genre: '家電にまつわる物', comment: '', flag: '整理対象' },
    { row: 3, title: 'Room Bag', image: '', url: 'https://room.rakuten.co.jp/freddiefujiwara/222', price: 500, unit: 1, genre: '暮らしにまつわる物', comment: '' },
  ],
}

let calls
let handler
let gisCallback
let wrapper

const SUBSCRIPTIONS = [
  { row: 2, service: 'NHK', purpose: 'テレビ', yearly: 21765, monthly: 1814, ratio: 0.015, url: 'https://www.nhk.or.jp/', basis: 'yearly', flag: '整理対象' },
  { row: 3, service: 'DAZN', purpose: '野球', yearly: 27600, monthly: 2300, ratio: 0.019, url: '', basis: 'monthly' },
  { row: 4, service: 'PurposeLess', purpose: '', yearly: 3000, monthly: 250, ratio: '', url: '', basis: 'yearly' },
]

const defaultHandler = (body) => {
  if (body.action === 'list_genres') {
    return { ok: true, genres: ['衣料', '住まい'] }
  }
  if (body.action === 'list_items' && body.sheet === 'subscriptions') {
    return {
      ok: true,
      sheet: 'subscriptions',
      subscriptions: SUBSCRIPTIONS,
      ...(body.share_token ? { _share: { expires_at: '2026-12-07T00:00:00.000Z' } } : {}),
    }
  }
  if (body.action === 'list_items') {
    return {
      ok: true,
      sheet: body.sheet,
      items: ITEMS_BY_SHEET[body.sheet] || [],
      ...(body.share_token ? { _share: { expires_at: '2026-12-07T00:00:00.000Z' } } : {}),
    }
  }
  if (body.action === 'issue_share')
    return { ok: true, share_token: 'sharetoken123', issued_at: '2026-11-07T00:00:00.000Z', expires_at: '2026-12-07T00:00:00.000Z', ttl_seconds: 2592000 }
  if (body.action === 'revoke_share') return { ok: true, revoked: true }
  return { ok: true, row: body.row || 4 }
}

const mountApp = async (hash = '') => {
  window.location.hash = hash
  wrapper = mount(App, { attachTo: document.body })
  await flushPromises()
  window.dispatchEvent(new Event('load'))
  await flushPromises()
  return wrapper
}

const signIn = async () => {
  gisCallback({ credential: credential({ email: 'owner@example.com' }) })
  await flushPromises()
}

beforeEach(() => {
  calls = []
  handler = defaultHandler
  gisCallback = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, opts) => {
      const body = JSON.parse(opts.body)
      calls.push(body)
      return { json: async () => handler(body) }
    }),
  )
  window.google = {
    accounts: {
      id: {
        initialize: vi.fn((opts) => {
          gisCallback = opts.callback
        }),
        renderButton: vi.fn(),
        disableAutoSelect: vi.fn(),
      },
    },
  }
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  window.location.hash = ''
  vi.unstubAllGlobals()
  delete window.google
})

describe('App gate and sign-in', () => {
  it('shows the Google gate and initializes GIS', async () => {
    const w = await mountApp()
    expect(w.text()).toContain('Googleログインが必要です')
    expect(window.google.accounts.id.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: expect.stringContaining('apps.googleusercontent.com') }),
    )
    expect(window.google.accounts.id.renderButton).toHaveBeenCalled()
  })

  it('does not crash when the GIS script is unavailable', async () => {
    delete window.google
    const w = await mountApp()
    expect(w.text()).toContain('Googleログインが必要です')
  })

  it('signs in and lists the items of the first sheet', async () => {
    const w = await mountApp()
    await signIn()
    expect(w.text()).toContain('owner@example.com')
    expect(w.text()).toContain('Workman A')
    expect(w.text()).toContain('¥1,500 ×2 / 衣料 / メモ')
    expect(w.text()).toContain('1件')
    expect(w.text()).toContain('共有')
  })
})

describe('App list interactions', () => {
  it('shows the cross-sheet tab and the five sheet tabs with their short labels', async () => {
    const w = await mountApp()
    await signIn()
    const tabs = w.findAll('.sheet-tabs .builder-tab')
    expect(tabs.map((t) => t.text())).toEqual(['すべて', 'ワークマン', 'ダイソー', 'その他', 'ROOM', 'サブスク'])
  })

  it('switches sheets and reloads', async () => {
    const w = await mountApp()
    await signIn()
    await w.findAll('.sheet-tabs .builder-tab').find((t) => t.text() === 'その他').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Other C')
    expect(calls[calls.length - 1]).toMatchObject({ action: 'list_items', sheet: 'others' })
    await w.findAll('button').find((b) => b.text() === '再読み込み').trigger('click')
    await flushPromises()
    expect(calls.filter((c) => c.action === 'list_items' && c.sheet === 'others')).toHaveLength(2)
  })

  it('swaps a broken thumbnail to the fallback image', async () => {
    const w = await mountApp()
    await signIn()
    const img = w.find('img.item-thumb')
    await img.trigger('error')
    expect(img.element.src).toContain('junbi.jpg')
    await img.trigger('error')
    expect(img.element.src).toContain('junbi.jpg')
  })

  it('deletes an item after confirmation', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const w = await mountApp()
    await signIn()
    await w.findAll('button').find((b) => b.attributes('aria-label') === '削除').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.action === 'delete_item')).toMatchObject({ sheet: 'workman', row: 2 })
  })

  it('keeps the item when deletion is cancelled', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const w = await mountApp()
    await signIn()
    await w.findAll('button').find((b) => b.attributes('aria-label') === '削除').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.action === 'delete_item')).toBeUndefined()
  })
})

describe('App form', () => {
  it('creates an item from the 登録 tab', async () => {
    const w = await mountApp()
    await signIn()
    await w.findAll('.main-tab')[1].trigger('click')
    await w.find('#f-title').setValue('新しい商品')
    await w.find('#f-image').setValue('https://img.example/new.jpg')
    await w.find('#f-url').setValue('https://example.com/new')
    await w.findAll('input[type="number"]')[0].setValue(2980)
    await w.findAll('input[type="number"]')[1].setValue(2)
    await w.find('#f-genre').setValue('衣料')
    await w.find('#f-comment').setValue('買い替え')
    await w.findAll('button').find((b) => b.text() === '登録する').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.action === 'create_item')).toMatchObject({
      sheet: 'workman',
      item: {
        title: '新しい商品',
        image: 'https://img.example/new.jpg',
        url: 'https://example.com/new',
        price: 2980,
        unit: 2,
        genre: '衣料',
        comment: '買い替え',
      },
    })
    expect(w.text()).toContain('登録中のアイテム')
  })

  it('creates into the sheet chosen on the form pills', async () => {
    const w = await mountApp()
    await signIn()
    await w.findAll('.main-tab')[1].trigger('click')
    const formPills = w.findAll('section .builder-tab')
    await formPills[2].trigger('click')
    await flushPromises()
    await w.find('#f-title').setValue('その他の商品')
    await w.findAll('button').find((b) => b.text() === '登録する').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.action === 'create_item')).toMatchObject({ sheet: 'others' })
    await w.findAll('.main-tab')[0].trigger('click')
    expect(w.text()).toContain('登録中のアイテム')
  })

  it('edits an item and returns to the list', async () => {
    const w = await mountApp()
    await signIn()
    await w.findAll('button').find((b) => b.attributes('aria-label') === '編集').trigger('click')
    expect(w.find('#f-title').element.value).toBe('Workman A')
    expect(w.text()).toContain('ワークマンのアイテムを編集中')
    await w.find('#f-title').setValue('Workman A2')
    await w.findAll('button').find((b) => b.text() === '更新する').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.action === 'update_item')).toMatchObject({
      sheet: 'workman',
      row: 2,
      item: { title: 'Workman A2' },
    })
    expect(w.text()).toContain('登録中のアイテム')
  })

  it('cancels an edit without saving', async () => {
    const w = await mountApp()
    await signIn()
    await w.findAll('button').find((b) => b.attributes('aria-label') === '編集').trigger('click')
    await w.findAll('button').find((b) => b.text() === '編集をやめる').trigger('click')
    expect(w.text()).toContain('登録中のアイテム')
    expect(calls.find((c) => c.action === 'update_item')).toBeUndefined()
  })

  it('shows the server error when saving fails', async () => {
    handler = (body) =>
      body.action === 'create_item' ? { ok: false, error: 'sheet is not editable: room' } : defaultHandler(body)
    const w = await mountApp()
    await signIn()
    await w.findAll('.main-tab')[1].trigger('click')
    await w.find('#f-title').setValue('X')
    await w.findAll('button').find((b) => b.text() === '登録する').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('sheet is not editable: room')
  })

  it('shows the generic save error when the server gives no reason', async () => {
    handler = (body) =>
      body.action === 'create_item' ? { ok: false } : defaultHandler(body)
    const w = await mountApp()
    await signIn()
    await w.findAll('.main-tab')[1].trigger('click')
    await w.find('#f-title').setValue('X')
    await w.findAll('button').find((b) => b.text() === '登録する').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('保存に失敗しました')
  })

  it('shows a generic error when saving throws', async () => {
    const w = await mountApp()
    await signIn()
    await w.findAll('.main-tab')[1].trigger('click')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await w.findAll('button').find((b) => b.text() === '登録する').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('保存に失敗しました')
  })
})

describe('App share tab', () => {
  it('issues, copies, reissues and revokes a share link', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const w = await mountApp()
    await signIn()
    await w.findAll('.main-tab')[2].trigger('click')
    await w.findAll('button').find((b) => b.text() === '1か月間有効なURLを発行').trigger('click')
    await flushPromises()
    const input = w.find('.share-url-input')
    expect(input.element.value).toContain('#share=sharetoken123')
    expect(w.text()).toContain('残り約')
    await w.findAll('button').find((b) => b.text() === 'URLをコピー').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('#share=sharetoken123'))
    await w.findAll('button').find((b) => b.text() === '新しいURLを発行し直す').trigger('click')
    await flushPromises()
    expect(calls.filter((c) => c.action === 'issue_share')).toHaveLength(2)
    await w.findAll('button').find((b) => b.text() === '今すぐ無効化する').trigger('click')
    await flushPromises()
    expect(w.find('.share-url-input').exists()).toBe(false)
  })

  it('shows an error when issuing fails and when copying fails', async () => {
    handler = (body) =>
      body.action === 'issue_share' ? { ok: false, error: 'forbidden' } : defaultHandler(body)
    const w = await mountApp()
    await signIn()
    await w.findAll('.main-tab')[2].trigger('click')
    await w.findAll('button').find((b) => b.text() === '1か月間有効なURLを発行').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('forbidden')

    handler = defaultHandler
    await w.findAll('button').find((b) => b.text() === '1か月間有効なURLを発行').trigger('click')
    await flushPromises()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => { throw new Error('denied') }) },
      configurable: true,
    })
    await w.findAll('button').find((b) => b.text() === 'URLをコピー').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('コピーに失敗しました')
  })

  it('shows generic errors when issue and revoke give no reason', async () => {
    handler = (body) =>
      body.action === 'issue_share' || body.action === 'revoke_share'
        ? { ok: false }
        : defaultHandler(body)
    const w = await mountApp()
    await signIn()
    await w.findAll('.main-tab')[2].trigger('click')
    await w.findAll('button').find((b) => b.text() === '1か月間有効なURLを発行').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('発行に失敗しました')
    handler = (body) =>
      body.action === 'revoke_share' ? { ok: false } : defaultHandler(body)
    await w.findAll('button').find((b) => b.text() === '1か月間有効なURLを発行').trigger('click')
    await flushPromises()
    await w.findAll('button').find((b) => b.text() === '今すぐ無効化する').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('無効化に失敗しました')
  })

  it('shows generic errors when issue and revoke throw', async () => {
    const w = await mountApp()
    await signIn()
    await w.findAll('.main-tab')[2].trigger('click')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await w.findAll('button').find((b) => b.text() === '1か月間有効なURLを発行').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('発行に失敗しました')
  })

  it('shows a throw error when revoking throws', async () => {
    const w = await mountApp()
    await signIn()
    await w.findAll('.main-tab')[2].trigger('click')
    await w.findAll('button').find((b) => b.text() === '1か月間有効なURLを発行').trigger('click')
    await flushPromises()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await w.findAll('button').find((b) => b.text() === '今すぐ無効化する').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('無効化に失敗しました')
  })

  it('shows an error when revoking fails', async () => {
    handler = (body) =>
      body.action === 'revoke_share' ? { ok: false, error: 'nope' } : defaultHandler(body)
    const w = await mountApp()
    await signIn()
    await w.findAll('.main-tab')[2].trigger('click')
    await w.findAll('button').find((b) => b.text() === '1か月間有効なURLを発行').trigger('click')
    await flushPromises()
    await w.findAll('button').find((b) => b.text() === '今すぐ無効化する').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('nope')
    expect(w.find('.share-url-input').exists()).toBe(true)
  })
})

describe('App share sessions and chrome', () => {
  it('opens directly from a share link without the share tab or logout', async () => {
    const w = await mountApp('#share=tok123')
    expect(w.text()).toContain('Workman A')
    expect(w.text()).toContain('一時アクセスリンクで利用中')
    expect(w.text()).not.toContain('共有')
    expect(w.text()).not.toContain('ログアウト')
    expect(calls[0]).toMatchObject({ share_token: 'tok123' })
  })

  it('shows the expired screen for a dead share link', async () => {
    handler = () => ({ ok: false, status: 401, error: 'share session expired or invalid' })
    const w = await mountApp('#share=dead')
    expect(w.text()).toContain('リンクの有効期限が切れています')
  })

  it('toggles the theme and persists it', async () => {
    const w = await mountApp()
    const toggle = w.findAll('button').find((b) => b.text() === 'ライト')
    await toggle.trigger('click')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem('list-of-stuff-admin-theme')).toBe('light')
    expect(w.findAll('button').find((b) => b.text() === 'ダーク')).toBeTruthy()
  })

  it('logs out back to the gate', async () => {
    const w = await mountApp()
    await signIn()
    await w.findAll('button').find((b) => b.text() === 'ログアウト').trigger('click')
    expect(w.text()).toContain('Googleログインが必要です')
    expect(window.google.accounts.id.disableAutoSelect).toHaveBeenCalled()
  })

  it('logs out even when the GIS script is gone', async () => {
    const w = await mountApp()
    await signIn()
    delete window.google
    await w.findAll('button').find((b) => b.text() === 'ログアウト').trigger('click')
    expect(w.text()).toContain('Googleログインが必要です')
  })
})


describe('App v2: genre dropdown, form delete, subscriptions', () => {
  it('offers the genres as a dropdown and submits the chosen one', async () => {
    const w = await mountApp()
    await signIn()
    await w.findAll('.main-tab')[1].trigger('click')
    const select = w.find('#f-genre')
    expect(select.exists()).toBe(true)
    expect(select.findAll('option').map((o) => o.text())).toEqual(['衣料', '住まい'])
    await select.setValue('住まい')
    await w.find('#f-title').setValue('プルダウン商品')
    await w.find('.post-button').trigger('click')
    await flushPromises()
    const create = calls.find((c) => c.action === 'create_item')
    expect(create.item.genre).toBe('住まい')
  })

  it('deletes from the edit form and returns to the list with a notice', async () => {
    const w = await mountApp()
    await signIn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await w.findAll('button').find((b) => b.attributes('aria-label') === '編集').trigger('click')
    const deleteButton = w.findAll('button').find((b) => b.text() === '削除する')
    expect(deleteButton).toBeTruthy()
    await deleteButton.trigger('click')
    await flushPromises()
    expect(calls.some((c) => c.action === 'delete_item' && c.sheet === 'workman' && c.row === 2)).toBe(true)
    expect(w.text()).toContain('削除しました')
    expect(w.text()).toContain('登録中のアイテム')
  })

  it('keeps the form open when the form delete fails', async () => {
    handler = (body) =>
      body.action === 'delete_item' ? { ok: false, error: 'row out of range: 2' } : defaultHandler(body)
    const w = await mountApp()
    await signIn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await w.findAll('button').find((b) => b.attributes('aria-label') === '編集').trigger('click')
    const deleteButton = w.findAll('button').find((b) => b.text() === '削除する')
    await deleteButton.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('row out of range: 2')
    expect(w.find('#f-title').exists()).toBe(true)
  })

  it('lists subscriptions on their pill with the cost line', async () => {
    const w = await mountApp()
    await signIn()
    const subPill = w.findAll('.sheet-tabs .builder-tab').find((t) => t.text() === 'サブスク')
    await subPill.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('登録中のサブスクリプション')
    expect(w.text()).toContain('NHK')
    expect(w.text()).toContain('年 ¥21,765 / 月 ¥1,814 / 1.5%')
    expect(w.text()).toContain('DAZN')
  })

  it('creates a subscription with the monthly basis', async () => {
    const w = await mountApp()
    await signIn()
    await w.findAll('.main-tab')[1].trigger('click')
    const pills = w.findAll('.builder-tab')
    await pills[pills.length - 1].trigger('click')
    await flushPromises()
    await w.find('#f-service').setValue('NewSub')
    await w.find('#f-purpose').setValue('学習')
    const basisTabs = w.findAll('.builder-tab')
    await basisTabs[basisTabs.length - 1].trigger('click')
    await w.find('#f-amount').setValue('1500')
    await w.find('#f-sub-url').setValue('https://newsub.example/')
    await w.find('.post-button').trigger('click')
    await flushPromises()
    const create = calls.find((c) => c.action === 'create_item' && c.sheet === 'subscriptions')
    expect(create).toBeTruthy()
    expect(create.item).toMatchObject({ service: 'NewSub', purpose: '学習', basis: 'monthly', amount: 1500, url: 'https://newsub.example/' })
  })

  it('edits a subscription with its basis amount prefilled', async () => {
    const w = await mountApp()
    await signIn()
    const subPill = w.findAll('.sheet-tabs .builder-tab').find((t) => t.text() === 'サブスク')
    await subPill.trigger('click')
    await flushPromises()
    const editButtons = w.findAll('button').filter((b) => b.attributes('aria-label') === '編集')
    await editButtons[1].trigger('click')
    expect(w.find('#f-service').element.value).toBe('DAZN')
    expect(w.find('#f-amount').element.value).toBe('2300')
    const basisTabs = w.findAll('.builder-tab')
    await basisTabs[0].trigger('click')
    await w.find('#f-amount').setValue('24000')
    await w.find('.post-button').trigger('click')
    await flushPromises()
    const update = calls.find((c) => c.action === 'update_item' && c.sheet === 'subscriptions')
    expect(update).toMatchObject({ row: 3, item: { service: 'DAZN', basis: 'yearly', amount: 24000 } })
  })
})


describe('App v2 coverage: fallbacks and remaining branches', () => {
  it('keeps a legacy genre selectable when editing', async () => {
    const w = await mountApp()
    await signIn()
    await w.findAll('.sheet-tabs .builder-tab').find((t) => t.text() === 'その他').trigger('click')
    await flushPromises()
    await w.findAll('button').find((b) => b.attributes('aria-label') === '編集').trigger('click')
    const select = w.find('#f-genre')
    expect(select.element.value).toBe('旧ジャンル')
    expect(select.findAll('option').map((o) => o.text())).toEqual(['衣料', '住まい', '旧ジャンル'])
  })

  it('creates with a blank genre when the genre list could not load', async () => {
    handler = (body) =>
      body.action === 'list_genres' ? { ok: false, error: 'down' } : defaultHandler(body)
    const w = await mountApp()
    await signIn()
    await w.findAll('.main-tab')[1].trigger('click')
    expect(w.find('#f-genre').findAll('option')).toHaveLength(0)
    await w.find('#f-title').setValue('ジャンルなし商品')
    await w.find('.post-button').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.action === 'create_item').item.genre).toBe('')
  })

  it('shows the generic notice when a list delete fails without a reason', async () => {
    handler = (body) => (body.action === 'delete_item' ? { ok: false } : defaultHandler(body))
    const w = await mountApp()
    await signIn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await w.findAll('button').find((b) => b.attributes('aria-label') === '削除').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('削除に失敗しました')
  })

  it('deletes a subscription from the list', async () => {
    const w = await mountApp()
    await signIn()
    const subPill = w.findAll('.sheet-tabs .builder-tab').find((t) => t.text() === 'サブスク')
    await subPill.trigger('click')
    await flushPromises()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await w.findAll('button').find((b) => b.attributes('aria-label') === '削除').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.action === 'delete_item')).toMatchObject({ sheet: 'subscriptions', row: 2 })
    expect(w.text()).toContain('削除しました')
  })

  it('stays on the form when the form delete is cancelled', async () => {
    const w = await mountApp()
    await signIn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await w.findAll('button').find((b) => b.attributes('aria-label') === '編集').trigger('click')
    const deleteButton = w.findAll('button').find((b) => b.text() === '削除する')
    await deleteButton.trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.action === 'delete_item')).toBeUndefined()
    expect(w.find('#f-title').exists()).toBe(true)
  })

  it('deletes a subscription from its edit form', async () => {
    const w = await mountApp()
    await signIn()
    const subPill = w.findAll('.sheet-tabs .builder-tab').find((t) => t.text() === 'サブスク')
    await subPill.trigger('click')
    await flushPromises()
    await w.findAll('button').find((b) => b.attributes('aria-label') === '編集').trigger('click')
    expect(w.text()).toContain('サブスクリプションを編集')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const deleteButton = w.findAll('button').find((b) => b.text() === '削除する')
    await deleteButton.trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.action === 'delete_item')).toMatchObject({ sheet: 'subscriptions', row: 2 })
    expect(w.text()).toContain('削除しました')
  })

  it('shows the generic form error when the form delete fails without a reason', async () => {
    handler = (body) => (body.action === 'delete_item' ? { ok: false } : defaultHandler(body))
    const w = await mountApp()
    await signIn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await w.findAll('button').find((b) => b.attributes('aria-label') === '編集').trigger('click')
    const deleteButton = w.findAll('button').find((b) => b.text() === '削除する')
    await deleteButton.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('削除に失敗しました')
    expect(w.find('#f-title').exists()).toBe(true)
  })
})


describe('App loading state', () => {
  it('hides the previous rows and shows a loading row while the next sheet loads', async () => {
    let resolveOthers
    handler = (body) => {
      if (body.action === 'list_items' && body.sheet === 'others')
        return new Promise((resolve) => {
          resolveOthers = () =>
            resolve({ ok: true, sheet: 'others', items: ITEMS_BY_SHEET.others })
        })
      return defaultHandler(body)
    }
    const w = await mountApp()
    await signIn()
    expect(w.text()).toContain('Workman A')
    await w.findAll('.sheet-tabs .builder-tab').find((t) => t.text() === 'その他').trigger('click')
    expect(w.text().split('読み込み中…')).toHaveLength(2)
    expect(w.text()).not.toContain('Workman A')
    resolveOthers()
    await flushPromises()
    expect(w.text()).toContain('Other C')
    expect(w.text()).not.toContain('読み込み中…')
  })
})

describe('App tidy-up flags', () => {
  const sheetPill = (w, label) =>
    w.findAll('.sheet-tabs .builder-tab').find((t) => t.text() === label)
  const flagButtonOf = (w, rowText) =>
    w
      .findAll('.alarm-row')
      .find((r) => r.text().includes(rowText))
      .findAll('button')
      .find((b) => b.attributes('aria-label') === '整理対象フラグ')

  it('flags an item by row from the list', async () => {
    const w = await mountApp()
    await signIn()
    await flagButtonOf(w, 'Workman A').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.action === 'set_flag')).toMatchObject({
      sheet: 'workman',
      row: 2,
      flagged: true,
    })
  })

  it('lists ROOM items read-only, with the badge on the flagged one', async () => {
    const w = await mountApp()
    await signIn()
    await sheetPill(w, 'ROOM').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Room Lamp')
    expect(w.text()).toContain('Room Bag')
    expect(w.findAll('.flag-badge')).toHaveLength(1)
    const lampRow = w.findAll('.alarm-row').find((r) => r.text().includes('Room Lamp'))
    const labels = lampRow.findAll('button').map((b) => b.attributes('aria-label'))
    expect(labels).toEqual(['整理対象フラグ'])
  })

  it('flags a room item by URL, never by row', async () => {
    const w = await mountApp()
    await signIn()
    await sheetPill(w, 'ROOM').trigger('click')
    await flushPromises()
    await flagButtonOf(w, 'Room Bag').trigger('click')
    await flushPromises()
    const sent = calls.find((c) => c.action === 'set_flag')
    expect(sent).toMatchObject({
      sheet: 'room',
      url: 'https://room.rakuten.co.jp/freddiefujiwara/222',
      flagged: true,
    })
    expect(sent.row).toBeUndefined()
  })

  it('unflags an already flagged room item', async () => {
    const w = await mountApp()
    await signIn()
    await sheetPill(w, 'ROOM').trigger('click')
    await flushPromises()
    await flagButtonOf(w, 'Room Lamp').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.action === 'set_flag')).toMatchObject({
      sheet: 'room',
      url: 'https://room.rakuten.co.jp/freddiefujiwara/111',
      flagged: false,
    })
  })

  it('narrows the list to flagged entries with the 整理対象のみ filter', async () => {
    const w = await mountApp()
    await signIn()
    await sheetPill(w, 'ROOM').trigger('click')
    await flushPromises()
    const filter = w
      .findAll('.builder-tab')
      .find((t) => t.text() === '整理対象のみ')
    await filter.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Room Lamp')
    expect(w.text()).not.toContain('Room Bag')
    const allTabs = w.findAll('.builder-tab').filter((t) => t.text() === 'すべて')
    await allTabs[allTabs.length - 1].trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Room Bag')
  })

  it('flags a subscription by row and shows its badge', async () => {
    const w = await mountApp()
    await signIn()
    await sheetPill(w, 'サブスク').trigger('click')
    await flushPromises()
    expect(w.findAll('.flag-badge')).toHaveLength(1)
    await flagButtonOf(w, 'DAZN').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.action === 'set_flag')).toMatchObject({
      sheet: 'subscriptions',
      row: 3,
      flagged: true,
    })
  })

  it('shows the server error when flagging fails', async () => {
    handler = (body) =>
      body.action === 'set_flag' ? { ok: false, error: 'flag boom' } : defaultHandler(body)
    const w = await mountApp()
    await signIn()
    await flagButtonOf(w, 'Workman A').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('flag boom')
  })

  it('shows a generic notice when flagging fails without a reason', async () => {
    handler = (body) => (body.action === 'set_flag' ? { ok: false } : defaultHandler(body))
    const w = await mountApp()
    await signIn()
    await flagButtonOf(w, 'Workman A').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('フラグの更新に失敗しました')
  })

  it('opens the create form on a writable sheet from the ROOM tab', async () => {
    const w = await mountApp()
    await signIn()
    await sheetPill(w, 'ROOM').trigger('click')
    await flushPromises()
    await w.findAll('.main-tab')[1].trigger('click')
    await flushPromises()
    expect(w.text()).toContain('新しいアイテム')
    const formPills = w.findAll('.sheet-tabs .builder-tab')
    expect(formPills.map((t) => t.text())).toEqual(['ワークマン', 'ダイソー', 'その他', 'サブスク'])
    expect(calls[calls.length - 1]).toMatchObject({ action: 'list_items', sheet: 'workman' })
  })
})

describe('App cross-sheet view', () => {
  const sheetPill = (w, label) =>
    w.findAll('.sheet-tabs .builder-tab').find((t) => t.text() === label)
  const flagButtonOf = (w, rowText) =>
    w
      .findAll('.alarm-row')
      .find((r) => r.text().includes(rowText))
      .findAll('button')
      .find((b) => b.attributes('aria-label') === '整理対象フラグ')

  it('lists every sheet in one list with source badges', async () => {
    const w = await mountApp()
    await signIn()
    await sheetPill(w, 'すべて').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('すべての持ち物・サブスクリプション')
    for (const text of ['Workman A', 'Other C', 'Room Lamp', 'Room Bag', 'NHK', 'DAZN']) {
      expect(w.text()).toContain(text)
    }
    expect(w.findAll('.sheet-badge')).toHaveLength(7)
    expect(w.findAll('.flag-badge')).toHaveLength(2)
    expect(w.text()).toContain('7件')
    // the combined view is for viewing and flagging: no edit or
    // delete buttons anywhere
    const labels = w.findAll('button').map((b) => b.attributes('aria-label'))
    expect(labels).not.toContain('編集')
    expect(labels).not.toContain('削除')
  })

  it('flags entries through their own sheet from the combined view', async () => {
    const w = await mountApp()
    await signIn()
    await sheetPill(w, 'すべて').trigger('click')
    await flushPromises()
    await flagButtonOf(w, 'Room Bag').trigger('click')
    await flushPromises()
    expect(calls.filter((c) => c.action === 'set_flag')[0]).toMatchObject({
      sheet: 'room',
      url: 'https://room.rakuten.co.jp/freddiefujiwara/222',
      flagged: true,
    })
    await flagButtonOf(w, 'DAZN').trigger('click')
    await flushPromises()
    expect(calls.filter((c) => c.action === 'set_flag')[1]).toMatchObject({
      sheet: 'subscriptions',
      row: 3,
      flagged: true,
    })
    await flagButtonOf(w, 'Workman A').trigger('click')
    await flushPromises()
    expect(calls.filter((c) => c.action === 'set_flag')[2]).toMatchObject({
      sheet: 'workman',
      row: 2,
      flagged: true,
    })
  })

  it('narrows the combined list to flagged entries across all sheets', async () => {
    const w = await mountApp()
    await signIn()
    await sheetPill(w, 'すべて').trigger('click')
    await flushPromises()
    const filter = w.findAll('.builder-tab').find((t) => t.text() === '整理対象のみ')
    await filter.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Room Lamp')
    expect(w.text()).toContain('NHK')
    expect(w.text()).not.toContain('Workman A')
    expect(w.text()).not.toContain('Room Bag')
    expect(w.text()).not.toContain('DAZN')
  })

  it('opens the create form on a writable sheet from the combined view', async () => {
    const w = await mountApp()
    await signIn()
    await sheetPill(w, 'すべて').trigger('click')
    await flushPromises()
    await w.findAll('.main-tab')[1].trigger('click')
    await flushPromises()
    expect(w.text()).toContain('新しいアイテム')
    expect(calls[calls.length - 1]).toMatchObject({ action: 'list_items', sheet: 'workman' })
  })
})
