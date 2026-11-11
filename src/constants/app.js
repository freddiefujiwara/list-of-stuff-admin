export const API_URL = import.meta.env.VITE_ITEMS_API || '<API>'
export const GOOGLE_CLIENT_ID =
  '728154182351-5ribj1diqcp8jpfo3rnqk9rei1aka98t.apps.googleusercontent.com'
export const FALLBACK_IMAGE_URL = 'https://tshop.r10s.jp/rukusu/cabinet/images/junbi.jpg'

// The sheets the admin manages. The room sheet is rewritten by the
// Rakuten ROOM sync, so its tab is read-only (kind 'room'): entries
// there can only be flagged as tidy-up targets, never edited. The
// subscriptions sheet has a different column shape, marked by its
// kind. Labels are the names the owner uses for each sheet; the tab
// labels are short forms so all five tabs fit on one row.
export const SHEETS = [
  { key: 'workman', label: 'ワークマン', tabLabel: 'ワークマン', kind: 'items' },
  { key: 'variety', label: 'ダイソー・100均', tabLabel: 'ダイソー', kind: 'items' },
  { key: 'others', label: 'その他', tabLabel: 'その他', kind: 'items' },
  { key: 'room', label: '楽天ROOM', tabLabel: 'ROOM', kind: 'room' },
  { key: 'subscriptions', label: 'サブスクリプション', tabLabel: 'サブスク', kind: 'subscriptions' },
]

// The kind ('items' | 'room' | 'subscriptions') of a sheet key.
export function sheetKind(key) {
  return SHEETS.find((sheet) => sheet.key === key)?.kind ?? 'items'
}
