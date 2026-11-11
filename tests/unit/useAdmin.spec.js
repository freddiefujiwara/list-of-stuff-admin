import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAdmin } from '../../src/composables/useAdmin.js'

const toBase64Url = (obj) =>
  Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const credential = (payload) => `${toBase64Url({ alg: 'RS256' })}.${toBase64Url(payload)}.sig`

const ITEMS = [
  { row: 2, title: 'A', image: '', url: '', price: 100, unit: 1, genre: 'G', comment: '' },
]

const routeFetch = (handler) => {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, opts) => {
      const body = JSON.parse(opts.body)
      calls.push(body)
      return { json: async () => handler(body) }
    }),
  )
  return calls
}

const okHandler = (body) => {
  if (body.action === 'list_items') return { ok: true, sheet: body.sheet, items: ITEMS }
  if (body.action === 'issue_share')
    return { ok: true, share_token: 'tok', expires_at: '2026-12-07T00:00:00.000Z' }
  if (body.action === 'revoke_share') return { ok: true, revoked: true }
  return { ok: true, row: body.row || 4 }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAdmin', () => {
  it('stays on the gate without a share hash', async () => {
    const admin = useAdmin()
    expect(await admin.initFromHash('')).toBe(false)
    expect(admin.phase.value).toBe('gate')
  })

  it('loads items after a Google credential', async () => {
    const calls = routeFetch(okHandler)
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    expect(admin.phase.value).toBe('ready')
    expect(admin.email.value).toBe('owner@example.com')
    expect(admin.items.value).toEqual(ITEMS)
    expect(admin.listStatus.value).toBe('1件')
    expect(calls[0]).toMatchObject({ action: 'list_items', sheet: 'workman' })
    expect(calls[0].idToken).toContain('.')
  })

  it('returns to the gate when the server rejects the account', async () => {
    routeFetch(() => ({ ok: false, status: 403, error: 'forbidden email' }))
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'stranger@example.com' }))
    expect(admin.phase.value).toBe('gate')
    expect(admin.gateError.value).toBe('このアカウントでは利用できません')
  })

  it('tolerates an undecodable credential and still asks the server', async () => {
    routeFetch(() => ({ ok: false, status: 401, error: 'token verification failed' }))
    const admin = useAdmin()
    await admin.onCredential('not-a-jwt')
    expect(admin.email.value).toBe('')
    expect(admin.phase.value).toBe('gate')
  })

  it('falls back to a generic message when a load error has no text', async () => {
    routeFetch(() => ({ ok: false }))
    const admin = useAdmin()
    await admin.loadItems()
    expect(admin.listStatus.value).toBe('読み込みに失敗しました')
  })

  it('leaves the email blank when the token payload has none', async () => {
    routeFetch(okHandler)
    const admin = useAdmin()
    await admin.onCredential(credential({ sub: '123' }))
    expect(admin.email.value).toBe('')
    expect(admin.phase.value).toBe('ready')
  })

  it('reports a network failure while loading', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const admin = useAdmin()
    const res = await admin.loadItems()
    expect(res.ok).toBe(false)
    expect(admin.listStatus.value).toBe('読み込みに失敗しました')
  })

  it('shows a server error while loading', async () => {
    routeFetch(() => ({ ok: false, error: 'sheet is not editable: room' }))
    const admin = useAdmin()
    await admin.loadItems()
    expect(admin.listStatus.value).toBe('sheet is not editable: room')
  })

  it('switches sheets and reloads', async () => {
    const calls = routeFetch(okHandler)
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    await admin.selectSheet('variety')
    expect(admin.currentSheet.value).toBe('variety')
    expect(calls[calls.length - 1]).toMatchObject({ action: 'list_items', sheet: 'variety' })
  })

  it('creates, updates and deletes items, reloading after each success', async () => {
    const calls = routeFetch(okHandler)
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    const before = calls.filter((c) => c.action === 'list_items').length

    await admin.createItem({ title: 'N' })
    expect(calls.find((c) => c.action === 'create_item')).toMatchObject({
      sheet: 'workman',
      item: { title: 'N' },
    })
    await admin.updateItem(2, { title: 'U' })
    expect(calls.find((c) => c.action === 'update_item')).toMatchObject({ row: 2 })
    await admin.deleteItem(2)
    expect(calls.find((c) => c.action === 'delete_item')).toMatchObject({ row: 2 })
    expect(calls.filter((c) => c.action === 'list_items').length).toBe(before + 3)
  })

  it('sets a flag by row and reloads the list', async () => {
    const calls = routeFetch(okHandler)
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    const before = calls.filter((c) => c.action === 'list_items').length
    const res = await admin.setFlag({ row: 2 }, true)
    expect(res.ok).toBe(true)
    const sent = calls.find((c) => c.action === 'set_flag')
    expect(sent).toMatchObject({ sheet: 'workman', row: 2, flagged: true })
    expect(sent.url).toBeUndefined()
    expect(calls.filter((c) => c.action === 'list_items').length).toBe(before + 1)
  })

  it('sets a room flag by URL and reloads the list', async () => {
    const calls = routeFetch(okHandler)
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    await admin.selectSheet('room')
    const before = calls.filter((c) => c.action === 'list_items').length
    await admin.setFlag({ url: 'https://room.example/1' }, false)
    const sent = calls.find((c) => c.action === 'set_flag')
    expect(sent).toMatchObject({ sheet: 'room', url: 'https://room.example/1', flagged: false })
    expect(sent.row).toBeUndefined()
    expect(calls.filter((c) => c.action === 'list_items').length).toBe(before + 1)
  })

  it('loads the combined view across every sheet, tagging the source', async () => {
    const SUBS = [{ row: 2, service: 'NHK', purpose: '', yearly: 100, monthly: 10, ratio: '', url: '', basis: 'yearly' }]
    routeFetch((body) => {
      if (body.action === 'list_items' && body.sheet === 'subscriptions')
        return { ok: true, sheet: 'subscriptions', subscriptions: SUBS }
      if (body.action === 'list_items') return { ok: true, sheet: body.sheet, items: ITEMS }
      return { ok: true }
    })
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    await admin.selectSheet('all')
    // workman, variety, others and room return ITEMS each; the
    // subscriptions sheet returns SUBS.
    expect(admin.combined.value).toHaveLength(5)
    expect(admin.combined.value[0]).toMatchObject({ title: 'A', sheet: 'workman', kind: 'items' })
    expect(admin.combined.value[3]).toMatchObject({ title: 'A', sheet: 'room', kind: 'room' })
    expect(admin.combined.value[4]).toMatchObject({ service: 'NHK', sheet: 'subscriptions', kind: 'subscriptions' })
    expect(admin.listStatus.value).toBe('5件')
  })

  it('reports the failing sheet error in the combined view', async () => {
    routeFetch((body) => {
      if (body.action === 'list_items' && body.sheet === 'variety') return { ok: false, error: 'variety boom' }
      if (body.action === 'list_items') return { ok: true, sheet: body.sheet, items: ITEMS }
      return { ok: true }
    })
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    await admin.selectSheet('all')
    expect(admin.listStatus.value).toBe('variety boom')
    expect(admin.combined.value).toEqual([])
  })

  it('falls back to a generic message when a combined sheet fails without a reason', async () => {
    routeFetch((body) => {
      if (body.action === 'list_items' && body.sheet === 'room') return { ok: false }
      if (body.action === 'list_items' && body.sheet === 'subscriptions')
        return { ok: true, sheet: 'subscriptions', subscriptions: [] }
      if (body.action === 'list_items') return { ok: true, sheet: body.sheet, items: ITEMS }
      return { ok: true }
    })
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    await admin.selectSheet('all')
    expect(admin.listStatus.value).toBe('読み込みに失敗しました')
  })

  it('reports a generic failure when the combined load throws', async () => {
    routeFetch((body) => {
      if (body.action === 'list_items' && body.sheet === 'others') throw new Error('down')
      if (body.action === 'list_items') return { ok: true, sheet: body.sheet, items: ITEMS }
      return { ok: true }
    })
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    const res = await admin.selectSheet('all')
    expect(res).toBeUndefined()
    expect(admin.listStatus.value).toBe('読み込みに失敗しました')
  })

  it('flags an entry from the combined view through its own sheet', async () => {
    const calls = routeFetch((body) => {
      if (body.action === 'list_items' && body.sheet === 'subscriptions')
        return { ok: true, sheet: 'subscriptions', subscriptions: [] }
      if (body.action === 'list_items') return { ok: true, sheet: body.sheet, items: ITEMS }
      return { ok: true, row: body.row || 4 }
    })
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    await admin.selectSheet('all')
    await admin.setFlag({ sheet: 'room', url: 'https://room.example/9' }, true)
    expect(calls.filter((c) => c.action === 'set_flag')[0]).toMatchObject({
      sheet: 'room',
      url: 'https://room.example/9',
      flagged: true,
    })
    await admin.setFlag({ sheet: 'subscriptions', row: 3 }, false)
    expect(calls.filter((c) => c.action === 'set_flag')[1]).toMatchObject({
      sheet: 'subscriptions',
      row: 3,
      flagged: false,
    })
  })

  it('surfaces a failed update without reloading', async () => {
    routeFetch((body) =>
      body.action === 'list_items'
        ? { ok: true, sheet: body.sheet, items: ITEMS }
        : { ok: false, error: 'boom' },
    )
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    const res = await admin.updateItem(2, { title: 'X' })
    expect(res.ok).toBe(false)
  })

  it('surfaces a failed create without reloading', async () => {
    routeFetch((body) =>
      body.action === 'list_items'
        ? { ok: true, sheet: body.sheet, items: ITEMS }
        : { ok: false, error: 'boom' },
    )
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    const res = await admin.createItem({ title: 'X' })
    expect(res.ok).toBe(false)
  })

  it('reloads the list after a delete even when the delete fails', async () => {
    const calls = routeFetch((body) =>
      body.action === 'list_items'
        ? { ok: true, sheet: body.sheet, items: ITEMS }
        : { ok: false, error: 'row out of range: 9' },
    )
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    const res = await admin.deleteItem(9)
    expect(res.ok).toBe(false)
    expect(calls.filter((c) => c.action === 'list_items')).toHaveLength(2)
  })

  it('does not reload after a failed create', async () => {
    const calls = routeFetch((body) =>
      body.action === 'list_items'
        ? { ok: true, sheet: body.sheet, items: ITEMS }
        : { ok: false, error: 'nope' },
    )
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    const res = await admin.createItem({ title: 'x' })
    expect(res.ok).toBe(false)
    expect(calls.filter((c) => c.action === 'list_items')).toHaveLength(1)
  })

  it('exposes a loading flag while a list load is in flight', async () => {
    let resolveList
    routeFetch((body) => {
      if (body.action === 'list_items')
        return new Promise((resolve) => {
          resolveList = () => resolve({ ok: true, sheet: body.sheet, items: ITEMS })
        })
      return { ok: true, genres: [] }
    })
    const admin = useAdmin()
    const pending = admin.loadItems()
    expect(admin.loading.value).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    resolveList()
    await pending
    expect(admin.loading.value).toBe(false)
    expect(admin.items.value).toEqual(ITEMS)
  })

  it('clears the loading flag when the load fails', async () => {
    routeFetch(() => ({ ok: false, status: 403, error: 'forbidden email' }))
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'stranger@example.com' }))
    expect(admin.loading.value).toBe(false)
  })

  it('loads the genre options after sign-in', async () => {
    routeFetch((body) => {
      if (body.action === 'list_items') return { ok: true, sheet: body.sheet, items: ITEMS }
      if (body.action === 'list_genres') return { ok: true, genres: ['【衣】服にまつわる物', '【住】暮らしにまつわる物'] }
      return { ok: true }
    })
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    expect(admin.genres.value).toEqual(['【衣】服にまつわる物', '【住】暮らしにまつわる物'])
  })

  it('keeps genres empty when the genre call fails or throws', async () => {
    routeFetch((body) => {
      if (body.action === 'list_items') return { ok: true, sheet: body.sheet, items: ITEMS }
      if (body.action === 'list_genres') throw new Error('down')
      return { ok: true }
    })
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    expect(admin.genres.value).toEqual([])
  })

  it('loads subscriptions on the subscriptions sheet', async () => {
    const SUBS = [{ row: 2, service: 'NHK', purpose: 'tv', yearly: 21765, monthly: 1813, ratio: 0.015, url: '', basis: 'yearly' }]
    routeFetch((body) => {
      if (body.action === 'list_items' && body.sheet === 'subscriptions')
        return { ok: true, sheet: 'subscriptions', subscriptions: SUBS }
      if (body.action === 'list_items') return { ok: true, sheet: body.sheet, items: ITEMS }
      return { ok: true, genres: [] }
    })
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    await admin.selectSheet('subscriptions')
    expect(admin.subscriptions.value).toEqual(SUBS)
    expect(admin.listStatus.value).toBe('1件')
  })

  it('authenticates with a share token from the hash', async () => {
    const calls = routeFetch((body) => ({
      ok: true,
      sheet: body.sheet,
      items: ITEMS,
      _share: { expires_at: '2026-12-07T00:00:00.000Z' },
    }))
    const admin = useAdmin()
    expect(await admin.initFromHash('#share=tok123')).toBe(true)
    expect(admin.isShareSession.value).toBe(true)
    expect(admin.phase.value).toBe('ready')
    expect(admin.shareExpiresAt.value).toBe('2026-12-07T00:00:00.000Z')
    expect(calls[0]).toMatchObject({ share_token: 'tok123' })
  })

  it('moves to the expired state when the share session is rejected', async () => {
    routeFetch(() => ({ ok: false, status: 401, error: 'share session expired or invalid' }))
    const admin = useAdmin()
    await admin.initFromHash('#share=dead')
    expect(admin.phase.value).toBe('share-expired')
  })

  it('issues and revokes share links with the owner token', async () => {
    const calls = routeFetch(okHandler)
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    const issued = await admin.issueShare()
    expect(issued.share_token).toBe('tok')
    expect(calls.find((c) => c.action === 'issue_share').idToken).toContain('.')
    const revoked = await admin.revokeShare()
    expect(revoked.revoked).toBe(true)
  })

  it('logs out back to the gate', async () => {
    routeFetch(okHandler)
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    admin.logout()
    expect(admin.phase.value).toBe('gate')
    expect(admin.email.value).toBe('')
  })
})

describe('useAdmin read retries', () => {
  it('retries a read that fails at the transport level, then succeeds', async () => {
    let listCalls = 0
    routeFetch((body) => {
      if (body.action === 'list_items') {
        listCalls++
        if (listCalls <= 2) throw new Error('Failed to fetch')
        return { ok: true, sheet: body.sheet, items: ITEMS }
      }
      return { ok: true, genres: [] }
    })
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    expect(admin.items.value).toEqual(ITEMS)
    expect(listCalls).toBe(3)
    expect(admin.listStatus.value).toBe('1件')
  })

  it('gives up after three attempts and reports the failure', async () => {
    let listCalls = 0
    routeFetch((body) => {
      if (body.action === 'list_items') {
        listCalls++
        throw new Error('Failed to fetch')
      }
      return { ok: true, genres: [] }
    })
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    expect(listCalls).toBe(3)
    expect(admin.listStatus.value).toBe('読み込みに失敗しました')
    expect(admin.loading.value).toBe(false)
  })

  it('does not retry a business error', async () => {
    let listCalls = 0
    routeFetch((body) => {
      if (body.action === 'list_items') {
        listCalls++
        return { ok: false, error: 'sheet is not editable: room' }
      }
      return { ok: true, genres: [] }
    })
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    expect(listCalls).toBe(1)
    expect(admin.listStatus.value).toBe('sheet is not editable: room')
  })

  it('retries the genre read once and still fills the options', async () => {
    let genreCalls = 0
    routeFetch((body) => {
      if (body.action === 'list_items') return { ok: true, sheet: body.sheet, items: ITEMS }
      if (body.action === 'list_genres') {
        genreCalls++
        if (genreCalls === 1) throw new Error('Failed to fetch')
        return { ok: true, genres: ['G1'] }
      }
      return { ok: true }
    })
    const admin = useAdmin()
    await admin.onCredential(credential({ email: 'owner@example.com' }))
    expect(admin.genres.value).toEqual(['G1'])
    expect(genreCalls).toBe(2)
  })
})
