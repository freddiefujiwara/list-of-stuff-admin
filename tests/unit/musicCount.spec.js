import { describe, expect, it, vi } from 'vitest'
import {
  MUSIC_COUNT_URL,
  fetchMusicPlayCount,
  formatMusicPlayCount,
} from '../../src/utils/musicCount.js'

describe('fetchMusicPlayCount', () => {
  it('fetches the top-site JSON and returns the count', async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(url).toBe(MUSIC_COUNT_URL)
      return { ok: true, json: async () => ({ count: 85, updated_at: 't' }) }
    })
    await expect(fetchMusicPlayCount(fetchImpl)).resolves.toBe(85)
  })

  it('returns null when the response is not ok', async () => {
    const fetchImpl = async () => ({ ok: false, json: async () => ({}) })
    await expect(fetchMusicPlayCount(fetchImpl)).resolves.toBeNull()
  })

  it('returns null when there is no response at all', async () => {
    const fetchImpl = async () => undefined
    await expect(fetchMusicPlayCount(fetchImpl)).resolves.toBeNull()
  })

  it('returns null when the payload has no count', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => null })
    await expect(fetchMusicPlayCount(fetchImpl)).resolves.toBeNull()
  })

  it('returns null when the count is not a number', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ count: '85' }),
    })
    await expect(fetchMusicPlayCount(fetchImpl)).resolves.toBeNull()
  })

  it('returns null when the count is not finite', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ count: Number.NaN }),
    })
    await expect(fetchMusicPlayCount(fetchImpl)).resolves.toBeNull()
  })

  it('returns null when the count is negative', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ count: -1 }),
    })
    await expect(fetchMusicPlayCount(fetchImpl)).resolves.toBeNull()
  })

  it('returns null when the fetch itself fails', async () => {
    const fetchImpl = async () => {
      throw new Error('offline')
    }
    await expect(fetchMusicPlayCount(fetchImpl)).resolves.toBeNull()
  })

  it('returns null when the body cannot be parsed', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => {
        throw new Error('bad json')
      },
    })
    await expect(fetchMusicPlayCount(fetchImpl)).resolves.toBeNull()
  })
})

describe('formatMusicPlayCount', () => {
  it('formats small counts as-is', () => {
    expect(formatMusicPlayCount(85)).toBe('85回再生')
  })

  it('formats large counts with a thousands separator', () => {
    expect(formatMusicPlayCount(1234)).toBe('1,234回再生')
  })
})
