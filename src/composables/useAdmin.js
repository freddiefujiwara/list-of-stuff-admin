import { ref } from 'vue'
import { API_URL, SHEETS, sheetKind } from '../constants/app.js'
import { callApi } from '../api.js'
import { decodeJwtPayload } from '../auth.js'
import { parseShareToken } from '../share.js'
import {
  loadSavedSessionToken,
  loadSavedSessionEmail,
  saveSessionToken,
  saveSessionEmail,
  clearSavedSession,
} from '../session.js'

// State and API orchestration for the admin page, mirroring the alarm
// site's main.js: the owner's session token (exchanged from the
// Google ID token at sign-in) or a share token from a temporary
// access link authenticates every call, and a share-auth failure
// moves the page to the expired-link state.
export function useAdmin() {
  const phase = ref('gate') // 'gate' | 'ready' | 'share-expired'
  const email = ref('')
  const isShareSession = ref(false)
  const shareExpiresAt = ref('')
  const currentSheet = ref(SHEETS[0].key)
  const items = ref([])
  const subscriptions = ref([])
  const combined = ref([])
  const genres = ref([])
  const loading = ref(false)
  const listStatus = ref('')
  const gateError = ref('')

  let sessionToken = null
  let shareToken = null

  const isShareError = (res) =>
    Boolean(
      shareToken &&
        res &&
        typeof res.error === 'string' &&
        res.error.includes('share session'),
    )

  const isSessionError = (res) =>
    Boolean(sessionToken && res && res.error === 'session expired or invalid')

  const api = async (body) => {
    const res = shareToken
      ? await callApi(API_URL, null, { ...body, share_token: shareToken })
      : await callApi(API_URL, null, { ...body, session_token: sessionToken })
    if (isShareError(res)) {
      phase.value = 'share-expired'
    } else if (isSessionError(res)) {
      // The saved owner session is dead (expired or revoked): drop
      // it and return to the sign-in gate.
      sessionToken = null
      clearSavedSession()
      phase.value = 'gate'
    } else if (res && res._share) {
      shareExpiresAt.value = res._share.expires_at
    }
    return res
  }

  // Reads go through apiRead: when a call fails at the transport
  // level (the fetch rejects, or the response is not JSON — the GAS
  // redirect chain drops out now and then, especially on mobile
  // networks), retry up to twice before surfacing the failure.
  // Business errors ({ ok: false }) are definitive and return at
  // once; mutations are never retried, because a retry could apply
  // a change whose response was lost.
  const RETRY_DELAYS_MS = [500, 1500]
  const apiRead = async (body) => {
    let lastError
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await api(body)
      } catch (err) {
        lastError = err
        if (attempt < RETRY_DELAYS_MS.length) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
        }
      }
    }
    throw lastError
  }

  // The cross-sheet view's rows: every sheet's entries in SHEETS
  // order, each tagged with the sheet it came from (and its kind),
  // so the list can show a source badge and route flag writes back
  // to the owning sheet.
  const loadAll = async () => {
    const entries = []
    for (const sheet of SHEETS) {
      const res = await apiRead({ action: 'list_items', sheet: sheet.key })
      if (!res.ok) {
        listStatus.value = res.error || '読み込みに失敗しました'
        return res
      }
      if (sheet.kind === 'subscriptions') {
        entries.push(
          ...res.subscriptions.map((sub) => ({ ...sub, sheet: sheet.key, kind: sheet.kind })),
        )
      } else {
        entries.push(
          ...res.items.map((item) => ({ ...item, sheet: sheet.key, kind: sheet.kind })),
        )
      }
    }
    combined.value = entries
    listStatus.value = `${entries.length}件`
    return { ok: true }
  }

  // Load the current sheet's rows: items for the item sheets,
  // subscriptions for the subscriptions sheet. While a load is in
  // flight, `loading` is true so the page can hide the previous
  // sheet's rows instead of leaving them on screen.
  const loadItems = async () => {
    if (currentSheet.value === 'all') {
      loading.value = true
      listStatus.value = ''
      try {
        return await loadAll()
      } catch (err) {
        listStatus.value = '読み込みに失敗しました'
        return { ok: false, error: String(err) }
      } finally {
        loading.value = false
      }
    }
    loading.value = true
    // The loading row in the list says 読み込み中…; the status line
    // stays blank meanwhile so the text appears only once.
    listStatus.value = ''
    try {
      const res = await apiRead({ action: 'list_items', sheet: currentSheet.value })
      if (!res.ok) {
        listStatus.value = res.error || '読み込みに失敗しました'
        return res
      }
      if (sheetKind(currentSheet.value) === 'subscriptions') {
        subscriptions.value = res.subscriptions
        listStatus.value = `${res.subscriptions.length}件`
      } else {
        items.value = res.items
        listStatus.value = `${res.items.length}件`
      }
      return res
    } catch (err) {
      listStatus.value = '読み込みに失敗しました'
      return { ok: false, error: String(err) }
    } finally {
      loading.value = false
    }
  }

  // The genre dropdown options, collected across the item sheets.
  const loadGenres = async () => {
    try {
      const res = await apiRead({ action: 'list_genres' })
      if (res.ok) {
        genres.value = res.genres || []
      }
      return res
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }

  const selectSheet = async (key) => {
    currentSheet.value = key
    await loadItems()
  }

  // Start from a #share= link: the token replaces the sign-in gate.
  const initFromHash = async (hash) => {
    const token = parseShareToken(hash)
    if (!token) {
      return false
    }
    shareToken = token
    isShareSession.value = true
    phase.value = 'ready'
    await loadItems()
    await loadGenres()
    return true
  }

  const onCredential = async (credential) => {
    // No client-side authorization gate: list-of-stuff-gas verifies
    // the token and the account, and rejects unauthorized calls
    // server-side.
    try {
      email.value = decodeJwtPayload(credential).email || ''
    } catch {
      email.value = ''
    }
    gateError.value = ''
    // Exchange the (1-hour) ID token for a 30-day owner session and
    // save that, so the next visit restores the session instead of
    // starting at the gate.
    let res
    try {
      res = await callApi(API_URL, credential, { action: 'exchange_session' })
    } catch {
      res = null
    }
    if (!res || !res.ok || !res.session_token) {
      phase.value = 'gate'
      gateError.value = 'このアカウントでは利用できません'
      return
    }
    sessionToken = res.session_token
    saveSessionToken(sessionToken)
    saveSessionEmail(email.value)
    phase.value = 'ready'
    await loadItems()
    await loadGenres()
  }

  // Restore a saved owner session at boot, without a Google sign-in.
  // Returns false when there is no saved session, or when the saved
  // session turned out to be dead (the load drops back to the gate).
  const restoreSession = async () => {
    const saved = loadSavedSessionToken()
    if (!saved) {
      return false
    }
    sessionToken = saved
    email.value = loadSavedSessionEmail()
    phase.value = 'ready'
    await loadItems()
    await loadGenres()
    return phase.value === 'ready'
  }

  const logout = () => {
    const endingSession = sessionToken
    sessionToken = null
    clearSavedSession()
    if (endingSession) {
      // Revoke the owner session server-side; local logout proceeds
      // regardless of the outcome.
      callApi(API_URL, null, {
        action: 'revoke_session',
        session_token: endingSession,
      }).catch(() => {})
    }
    email.value = ''
    phase.value = 'gate'
  }

  const createItem = async (form) => {
    const res = await api({
      action: 'create_item',
      sheet: currentSheet.value,
      item: form,
    })
    if (res.ok) {
      await loadItems()
    }
    return res
  }

  const updateItem = async (row, form) => {
    const res = await api({
      action: 'update_item',
      sheet: currentSheet.value,
      row,
      item: form,
    })
    if (res.ok) {
      await loadItems()
    }
    return res
  }

  // Flag or unflag an entry as a tidy-up target. Room entries are
  // keyed by their URL because the ROOM sync owns that sheet and
  // rewrites its rows; everything else is keyed by row. Like a
  // delete, the list is always re-read afterwards so the screen
  // matches the stored flag even when the call failed partway.
  const setFlag = async (entry, flagged) => {
    const sheet = entry.sheet || currentSheet.value
    const body = { action: 'set_flag', sheet, flagged }
    if (sheet === 'room') {
      body.url = entry.url
    } else {
      body.row = entry.row
    }
    const res = await api(body)
    await loadItems()
    return res
  }

  // After a delete the list is always re-read, whatever the outcome,
  // so the screen matches the sheet even when the delete itself
  // failed partway.
  const deleteItem = async (row) => {
    const res = await api({
      action: 'delete_item',
      sheet: currentSheet.value,
      row,
    })
    await loadItems()
    return res
  }

  const issueShare = async () =>
    callApi(API_URL, null, { action: 'issue_share', session_token: sessionToken })

  const revokeShare = async () =>
    callApi(API_URL, null, { action: 'revoke_share', session_token: sessionToken })

  return {
    phase,
    email,
    isShareSession,
    shareExpiresAt,
    currentSheet,
    items,
    subscriptions,
    combined,
    genres,
    loading,
    listStatus,
    gateError,
    initFromHash,
    onCredential,
    restoreSession,
    logout,
    loadItems,
    loadGenres,
    selectSheet,
    createItem,
    updateItem,
    deleteItem,
    setFlag,
    issueShare,
    revokeShare,
  }
}
