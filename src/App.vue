<script setup>
import { computed, onMounted, ref } from 'vue'
import { ALL_TAB, FALLBACK_IMAGE_URL, GOOGLE_CLIENT_ID, SHEETS, sheetKind } from './constants/app.js'
import { useAdmin } from './composables/useAdmin.js'
import {
  emptyItem,
  emptySubscription,
  filterFlagged,
  formFromItem,
  formFromSubscription,
  itemMeta,
  shareLinkView,
  sheetLabel,
  subscriptionCost,
} from './utils/admin.js'
import { THEME_KEY, applyTheme, nextTheme, resolveTheme } from './theme.js'
import {
  formatShareExpiry,
  formatShareRemaining,
  shareSecondsLeft,
} from './share.js'

const admin = useAdmin()
const {
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
} = admin

const tab = ref('list')
const flagOnly = ref(false)
const themeButton = ref(null)
const theme = ref(resolveTheme(localStorage.getItem(THEME_KEY)))

const applyCurrentTheme = () => {
  applyTheme(document.documentElement, themeButton.value, theme.value)
}

const toggleTheme = () => {
  theme.value = nextTheme(theme.value)
  localStorage.setItem(THEME_KEY, theme.value)
  applyCurrentTheme()
}

const shareBanner = computed(() => {
  if (!isShareSession.value || !shareExpiresAt.value) {
    return ''
  }
  const remaining = formatShareRemaining(shareSecondsLeft(shareExpiresAt.value, Date.now()))
  return `一時アクセスリンクで利用中（${formatShareExpiry(shareExpiresAt.value)} まで有効、${remaining}）`
})

// --- Entry form (登録 tab doubles as the edit form) ---
// The form shape follows the current sheet's kind: item fields for
// the item sheets, subscription fields for the subscriptions sheet.
const isSubForm = computed(() => sheetKind(currentSheet.value) === 'subscriptions')
const blankForm = () => (isSubForm.value ? emptySubscription() : emptyItem())
const form = ref(emptyItem())
const editingRow = ref(null)
// True while an edit opened from the cross-sheet (すべて) view is
// in flight: the form works on the entry's own sheet and returns
// to the cross-sheet view when it closes.
const editFromAll = ref(false)
const formStatus = ref('')
const saving = ref(false)
const notice = ref('')

// Genre dropdown options: the collected genres, plus the edited
// entry's own genre when it is not among them (legacy values stay
// selectable instead of being silently replaced).
const genreOptions = computed(() => {
  const options = [...genres.value]
  const current = form.value.genre
  if (current && !options.includes(current)) {
    options.push(current)
  }
  return options
})

// The create/edit form covers only the writable sheets; the ROOM
// tab is read-only, so it never appears among the form's sheets.
const formSheets = SHEETS.filter((sheet) => sheet.kind !== 'room')

// The list's tab bar: the cross-sheet すべて view first, then the
// sheets themselves.
const listSheets = [ALL_TAB, ...SHEETS]

const openCreate = async () => {
  if (!formSheets.some((sheet) => sheet.key === currentSheet.value)) {
    await admin.selectSheet(formSheets[0].key)
  }
  editingRow.value = null
  form.value = blankForm()
  if (!isSubForm.value && genres.value.length > 0) {
    form.value.genre = genres.value[0]
  }
  formStatus.value = ''
  tab.value = 'form'
}

const openEdit = async (entry) => {
  // The form is bound to one sheet, so an edit opened from the
  // cross-sheet view first moves to the entry's own sheet; closing
  // the form then returns to the cross-sheet view.
  editFromAll.value = currentSheet.value === ALL_TAB.key
  if (editFromAll.value) {
    await admin.selectSheet(entry.sheet)
  }
  editingRow.value = entry.row
  form.value = isSubForm.value ? formFromSubscription(entry) : formFromItem(entry)
  formStatus.value = ''
  tab.value = 'form'
}

const backToAllIfNeeded = async () => {
  if (editFromAll.value) {
    editFromAll.value = false
    await admin.selectSheet(ALL_TAB.key)
  }
}

const cancelEdit = async () => {
  editingRow.value = null
  form.value = blankForm()
  formStatus.value = ''
  await backToAllIfNeeded()
  tab.value = 'list'
}

// Switching sheets from the create form resets the form to the new
// sheet kind's blank shape.
// The form's sheet pills render only in create mode, so switching
// sheets there always resets the form.
const onFormSheet = async (key) => {
  await admin.selectSheet(key)
  form.value = blankForm()
  if (!isSubForm.value && genres.value.length > 0) {
    form.value.genre = genres.value[0]
  }
}

const onListSheet = async (key) => {
  notice.value = ''
  await admin.selectSheet(key)
}

const submit = async () => {
  saving.value = true
  formStatus.value = ''
  try {
    const res =
      editingRow.value === null
        ? await admin.createItem({ ...form.value })
        : await admin.updateItem(editingRow.value, { ...form.value })
    if (res.ok) {
      editingRow.value = null
      form.value = blankForm()
      await backToAllIfNeeded()
      tab.value = 'list'
    } else {
      formStatus.value = res.error || '保存に失敗しました'
    }
  } catch {
    formStatus.value = '保存に失敗しました'
  } finally {
    saving.value = false
  }
}

const remove = async (entry) => {
  // Combined-view entries carry their own sheet and kind; per-sheet
  // rows fall back to the current sheet.
  const sheet = entry.sheet || currentSheet.value
  const name = sheet === 'subscriptions' ? entry.service : entry.title
  if (!window.confirm(`「${name}」を削除しますか？`)) {
    return
  }
  const res = await admin.deleteItem(entry.row, sheet)
  notice.value = res.ok ? '削除しました' : res.error || '削除に失敗しました'
}

// The edit form carries its own delete button, mirroring the list.
const removeFromForm = async () => {
  const name = isSubForm.value ? form.value.service : form.value.title
  if (!window.confirm(`「${name}」を削除しますか？`)) {
    return
  }
  const res = await admin.deleteItem(editingRow.value)
  if (res.ok) {
    notice.value = '削除しました'
    editingRow.value = null
    form.value = blankForm()
    formStatus.value = ''
    await backToAllIfNeeded()
    tab.value = 'list'
  } else {
    formStatus.value = res.error || '削除に失敗しました'
  }
}

// The list filter: 整理対象のみ narrows the current sheet's rows to
// the flagged ones.
const visibleItems = computed(() => filterFlagged(items.value, flagOnly.value))
const visibleSubscriptions = computed(() =>
  filterFlagged(subscriptions.value, flagOnly.value),
)
const visibleCombined = computed(() => filterFlagged(combined.value, flagOnly.value))

const toggleFlag = async (entry) => {
  const res = await admin.setFlag(entry, !entry.flag)
  if (!res.ok) {
    notice.value = res.error || 'フラグの更新に失敗しました'
  }
}

const formTitle = computed(() => {
  if (isSubForm.value) {
    return editingRow.value === null ? '新しいサブスクリプション' : 'サブスクリプションを編集'
  }
  return editingRow.value === null ? '新しいアイテム' : 'アイテムを編集'
})

const listTitle = computed(() => {
  if (currentSheet.value === 'all') {
    return 'すべての持ち物・サブスクリプション'
  }
  return sheetKind(currentSheet.value) === 'subscriptions'
    ? '登録中のサブスクリプション'
    : '登録中のアイテム'
})

const onThumbError = (event) => {
  const img = event.target
  if (img.src !== FALLBACK_IMAGE_URL) {
    img.src = FALLBACK_IMAGE_URL
  }
}

// --- Share link management (owner only, same as the alarm site) ---
const issuedShare = ref(null)
const shareError = ref('')

const shareView = computed(() =>
  shareLinkView(
    issuedShare.value,
    `${window.location.origin}${import.meta.env.BASE_URL}`,
    Date.now(),
  ),
)
const shareUrl = computed(() => shareView.value.url)
const shareRemaining = computed(() => shareView.value.remaining)
const shareExpires = computed(() => shareView.value.expires)

const issue = async () => {
  shareError.value = ''
  try {
    const res = await admin.issueShare()
    if (res.ok) {
      issuedShare.value = res
    } else {
      shareError.value = res.error || '発行に失敗しました'
    }
  } catch {
    shareError.value = '発行に失敗しました'
  }
}

const revoke = async () => {
  shareError.value = ''
  try {
    const res = await admin.revokeShare()
    if (res.ok) {
      issuedShare.value = null
    } else {
      shareError.value = res.error || '無効化に失敗しました'
    }
  } catch {
    shareError.value = '無効化に失敗しました'
  }
}

const copyShareUrl = async () => {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
  } catch {
    shareError.value = 'コピーに失敗しました'
  }
}

const initGoogleSignIn = () => {
  if (!window.google?.accounts?.id) {
    return
  }
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (response) => admin.onCredential(response.credential),
  })
  window.google.accounts.id.renderButton(document.getElementById('signin'), {
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
  })
}

onMounted(async () => {
  applyCurrentTheme()
  if (await admin.initFromHash(window.location.hash)) {
    return
  }
  if (await admin.restoreSession()) {
    return
  }
  window.addEventListener('load', initGoogleSignIn, { once: true })
})

const onLogout = () => {
  issuedShare.value = null
  if (window.google?.accounts?.id) {
    window.google.accounts.id.disableAutoSelect()
  }
  admin.logout()
}
</script>

<template>
  <div class="layout">
    <header class="header">
      <h1>持ち物管理</h1>
      <div class="header-actions">
        <div class="header-buttons">
          <button ref="themeButton" class="theme-toggle" type="button" @click="toggleTheme">
            ライト
          </button>
          <button
            v-if="phase === 'ready' && !isShareSession"
            class="theme-toggle"
            type="button"
            @click="onLogout"
          >
            ログアウト
          </button>
        </div>
      </div>
    </header>
    <main>
      <nav v-if="phase === 'ready'" class="main-tabs" aria-label="画面切り替え">
        <button
          type="button"
          class="main-tab"
          :class="{ active: tab === 'list' }"
          :aria-selected="tab === 'list'"
          @click="tab = 'list'"
        >
          一覧
        </button>
        <button
          type="button"
          class="main-tab"
          :class="{ active: tab === 'form' }"
          :aria-selected="tab === 'form'"
          @click="openCreate"
        >
          登録
        </button>
        <button
          v-if="!isShareSession"
          type="button"
          class="main-tab"
          :class="{ active: tab === 'share' }"
          :aria-selected="tab === 'share'"
          @click="tab = 'share'"
        >
          共有
        </button>
      </nav>
      <div id="status"></div>

      <section v-if="phase === 'gate'" class="table-wrap auth-gate">
        <h2 class="section-title">Googleログインが必要です</h2>
        <p class="meta">許可されたアカウントでサインインしてください。</p>
        <div id="signin" class="google-login-button"></div>
        <p class="error">{{ gateError }}</p>
      </section>

      <section v-if="phase === 'share-expired'" class="table-wrap">
        <h2 class="section-title">リンクの有効期限が切れています</h2>
        <p class="meta">
          この一時アクセスリンクは失効しています。発行者に新しいリンクを依頼してください。
        </p>
      </section>

      <section v-if="phase === 'ready' && tab === 'list'" class="table-wrap">
        <div class="section-head">
          <h2 class="section-title">{{ listTitle }}</h2>
          <button class="theme-toggle" type="button" @click="admin.reload()">再読み込み</button>
        </div>
        <p v-if="notice" class="meta">{{ notice }}</p>
        <p v-if="shareBanner" class="meta">{{ shareBanner }}</p>
        <p v-if="email" class="meta">{{ email }}</p>
        <div class="builder-tabs sheet-tabs" role="tablist" aria-label="シート">
          <button
            v-for="sheet in listSheets"
            :key="sheet.key"
            type="button"
            class="builder-tab"
            :class="{ active: currentSheet === sheet.key }"
            role="tab"
            :aria-selected="currentSheet === sheet.key"
            @click="onListSheet(sheet.key)"
          >
            {{ sheet.tabLabel }}
          </button>
        </div>
        <div class="builder-tabs" role="tablist" aria-label="表示フィルター">
          <button
            type="button"
            class="builder-tab"
            :class="{ active: !flagOnly }"
            role="tab"
            :aria-selected="!flagOnly"
            @click="flagOnly = false"
          >
            すべて
          </button>
          <button
            type="button"
            class="builder-tab"
            :class="{ active: flagOnly }"
            role="tab"
            :aria-selected="flagOnly"
            @click="flagOnly = true"
          >
            整理対象のみ
          </button>
        </div>
        <div v-if="loading" class="alarm-row">
          <span class="meta">読み込み中…</span>
        </div>
        <template v-else>
        <div v-if="currentSheet === 'all'">
          <div v-for="entry in visibleCombined" :key="`${entry.sheet}:${entry.row}`" class="alarm-row" :class="{ flagged: Boolean(entry.flag) }">
            <div v-if="entry.kind === 'subscriptions'" class="item-main">
              <div>
                <div class="item-title"><a v-if="entry.url" class="item-link" :href="entry.url" target="_blank" rel="noopener noreferrer">{{ entry.service }}</a><template v-else>{{ entry.service }}</template><span class="sheet-badge">{{ sheetLabel(entry.sheet) }}</span><span v-if="entry.flag" class="flag-badge">整理対象</span></div>
                <div v-if="entry.purpose" class="alarm-commands">{{ entry.purpose }}</div>
                <div class="alarm-commands">{{ subscriptionCost(entry) }}</div>
                <div v-if="entry.url" class="alarm-commands">{{ entry.url }}</div>
              </div>
            </div>
            <div v-else class="item-main">
              <img
                class="item-thumb"
                :src="entry.image || FALLBACK_IMAGE_URL"
                alt=""
                loading="lazy"
                @error="onThumbError"
              />
              <div>
                <div class="item-title"><a v-if="entry.url" class="item-link" :href="entry.url" target="_blank" rel="noopener noreferrer">{{ entry.title }}</a><template v-else>{{ entry.title }}</template><span class="sheet-badge">{{ sheetLabel(entry.sheet) }}</span><span v-if="entry.flag" class="flag-badge">整理対象</span></div>
                <div class="alarm-commands">{{ itemMeta(entry) }}</div>
                <div v-if="entry.url" class="alarm-commands">{{ entry.url }}</div>
              </div>
            </div>
            <div class="row-actions">
              <button
                type="button"
                class="icon-btn flag-btn"
                :class="{ active: Boolean(entry.flag) }"
                title="整理対象"
                aria-label="整理対象フラグ"
                :aria-pressed="Boolean(entry.flag)"
                @click="toggleFlag(entry)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
              </button>
              <button
                v-if="entry.sheet !== 'room'"
                type="button"
                class="icon-btn"
                title="編集"
                aria-label="編集"
                @click="openEdit(entry)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
              </button>
              <button
                v-if="entry.sheet !== 'room'"
                type="button"
                class="icon-btn"
                title="削除"
                aria-label="削除"
                @click="remove(entry)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          </div>
        </div>
        <div v-else-if="sheetKind(currentSheet) !== 'subscriptions'">
          <div v-for="item in visibleItems" :key="item.row" class="alarm-row" :class="{ flagged: Boolean(item.flag) }">
            <div class="item-main">
              <img
                class="item-thumb"
                :src="item.image || FALLBACK_IMAGE_URL"
                alt=""
                loading="lazy"
                @error="onThumbError"
              />
              <div>
                <div class="item-title"><a v-if="item.url" class="item-link" :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.title }}</a><template v-else>{{ item.title }}</template><span v-if="item.flag" class="flag-badge">整理対象</span></div>
                <div class="alarm-commands">{{ itemMeta(item) }}</div>
                <div v-if="item.url" class="alarm-commands">{{ item.url }}</div>
              </div>
            </div>
            <div class="row-actions">
              <button
                type="button"
                class="icon-btn flag-btn"
                :class="{ active: Boolean(item.flag) }"
                title="整理対象"
                aria-label="整理対象フラグ"
                :aria-pressed="Boolean(item.flag)"
                @click="toggleFlag(item)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
              </button>
              <template v-if="sheetKind(currentSheet) !== 'room'">
              <button
                type="button"
                class="icon-btn"
                title="編集"
                aria-label="編集"
                @click="openEdit(item)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
              </button>
              <button
                type="button"
                class="icon-btn"
                title="削除"
                aria-label="削除"
                @click="remove(item)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              </template>
            </div>
          </div>
        </div>
        <div v-else>
          <div v-for="sub in visibleSubscriptions" :key="sub.row" class="alarm-row" :class="{ flagged: Boolean(sub.flag) }">
            <div class="item-main">
              <div>
                <div class="item-title"><a v-if="sub.url" class="item-link" :href="sub.url" target="_blank" rel="noopener noreferrer">{{ sub.service }}</a><template v-else>{{ sub.service }}</template><span v-if="sub.flag" class="flag-badge">整理対象</span></div>
                <div v-if="sub.purpose" class="alarm-commands">{{ sub.purpose }}</div>
                <div class="alarm-commands">{{ subscriptionCost(sub) }}</div>
                <div v-if="sub.url" class="alarm-commands">{{ sub.url }}</div>
              </div>
            </div>
            <div class="row-actions">
              <button
                type="button"
                class="icon-btn flag-btn"
                :class="{ active: Boolean(sub.flag) }"
                title="整理対象"
                aria-label="整理対象フラグ"
                :aria-pressed="Boolean(sub.flag)"
                @click="toggleFlag(sub)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
              </button>
              <button
                type="button"
                class="icon-btn"
                title="編集"
                aria-label="編集"
                @click="openEdit(sub)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
              </button>
              <button
                type="button"
                class="icon-btn"
                title="削除"
                aria-label="削除"
                @click="remove(sub)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          </div>
        </div>
        </template>
        <p class="meta">{{ listStatus }}</p>
      </section>

      <section v-if="phase === 'ready' && tab === 'form'" class="table-wrap">
        <h2 class="section-title">{{ formTitle }}</h2>
        <div v-if="editingRow === null" class="builder-tabs sheet-tabs" role="tablist" aria-label="シート">
          <button
            v-for="sheet in formSheets"
            :key="sheet.key"
            type="button"
            class="builder-tab"
            :class="{ active: currentSheet === sheet.key }"
            role="tab"
            :aria-selected="currentSheet === sheet.key"
            @click="onFormSheet(sheet.key)"
          >
            {{ sheet.tabLabel }}
          </button>
        </div>
        <p v-else class="meta">{{ sheetLabel(currentSheet) }}{{ isSubForm ? 'を編集中' : 'のアイテムを編集中' }}</p>

        <template v-if="!isSubForm">
          <label class="form-label" for="f-title">商品名</label>
          <input id="f-title" v-model="form.title" type="text" />
          <label class="form-label" for="f-image">画像URL</label>
          <input id="f-image" v-model="form.image" type="url" />
          <label class="form-label" for="f-url">商品URL</label>
          <input id="f-url" v-model="form.url" type="url" />
          <div class="field-row">
            <label>価格 <input v-model="form.price" type="number" min="0" /></label>
            <label>個数 <input v-model="form.unit" type="number" min="1" /></label>
          </div>
          <label class="form-label" for="f-genre">ジャンル</label>
          <select id="f-genre" v-model="form.genre">
            <option v-for="genre in genreOptions" :key="genre" :value="genre">{{ genre }}</option>
          </select>
          <label class="form-label" for="f-comment">コメント</label>
          <textarea id="f-comment" v-model="form.comment" rows="3"></textarea>
        </template>

        <template v-else>
          <label class="form-label" for="f-service">サービス名</label>
          <input id="f-service" v-model="form.service" type="text" />
          <label class="form-label" for="f-purpose">用途</label>
          <input id="f-purpose" v-model="form.purpose" type="text" />
          <label class="form-label">入力方法</label>
          <div class="builder-tabs" role="tablist" aria-label="入力方法">
            <button
              type="button"
              class="builder-tab"
              :class="{ active: form.basis === 'yearly' }"
              role="tab"
              :aria-selected="form.basis === 'yearly'"
              @click="form.basis = 'yearly'"
            >
              年額で入力
            </button>
            <button
              type="button"
              class="builder-tab"
              :class="{ active: form.basis === 'monthly' }"
              role="tab"
              :aria-selected="form.basis === 'monthly'"
              @click="form.basis = 'monthly'"
            >
              月額で入力
            </button>
          </div>
          <label class="form-label" for="f-amount">{{ form.basis === 'monthly' ? '月額' : '年額' }}</label>
          <input id="f-amount" v-model="form.amount" type="number" min="0" />
          <label class="form-label" for="f-sub-url">URL</label>
          <input id="f-sub-url" v-model="form.url" type="url" />
        </template>

        <div class="composer-row">
          <span class="meta">{{ formStatus }}</span>
          <span class="row-actions">
            <button v-if="editingRow !== null" class="theme-toggle" type="button" @click="removeFromForm">
              削除する
            </button>
            <button v-if="editingRow !== null" class="theme-toggle" type="button" @click="cancelEdit">
              編集をやめる
            </button>
            <button class="post-button" type="button" :disabled="saving" @click="submit">
              {{ editingRow === null ? '登録する' : '更新する' }}
            </button>
          </span>
        </div>
      </section>

      <section v-if="phase === 'ready' && tab === 'share' && !isShareSession" class="table-wrap">
        <h2 class="section-title">一時アクセスリンク</h2>
        <p class="meta">
          ログイン不要で1か月間このページを使えるURLを発行します。新しいURLを発行すると、前のURLは無効になります。この画面を閉じると発行したURLは再表示できません。
        </p>
        <p class="error">{{ shareError }}</p>
        <div v-if="!issuedShare">
          <p>
            <button class="theme-toggle" type="button" @click="issue">
              1か月間有効なURLを発行
            </button>
          </p>
        </div>
        <div v-else>
          <p>
            <strong>{{ shareRemaining }}</strong>
            <span class="meta">（{{ shareExpires }} まで有効）</span>
          </p>
          <p>
            <input class="share-url-input" type="text" readonly aria-label="一時アクセスURL" :value="shareUrl" />
            <button class="theme-toggle" type="button" @click="copyShareUrl">URLをコピー</button>
          </p>
          <p>
            <button class="theme-toggle" type="button" @click="issue">新しいURLを発行し直す</button>
            <button class="theme-toggle" type="button" @click="revoke">今すぐ無効化する</button>
          </p>
        </div>
      </section>
    </main>
  </div>
</template>
