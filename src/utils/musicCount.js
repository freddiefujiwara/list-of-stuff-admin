// Fetches the cumulative 川口の歌 play count shown in the shared
// site nav. The count lives in a tiny JSON file on the top site
// (https://freddiefujiwara.com/music-count.json), which the top
// site's static generation refreshes from ga-gas's public tally —
// so the nav never calls GAS on each page view. Any failure (the
// file does not exist yet, a network error, a malformed payload)
// resolves to null, and the nav simply shows no count.
export const MUSIC_COUNT_URL = 'https://freddiefujiwara.com/music-count.json'

export async function fetchMusicPlayCount(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(MUSIC_COUNT_URL)
    if (!res?.ok) {
      return null
    }
    const data = await res.json()
    const count = data?.count
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
      return null
    }
    return count
  } catch {
    return null
  }
}

export function formatMusicPlayCount(count) {
  return `${count.toLocaleString('ja-JP')}回再生`
}
