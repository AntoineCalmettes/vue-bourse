import type { EtfTimeSeries } from './alphaVantage'

const CACHE_KEY = 'alpha-vantage-etf-all'

export interface CachePayload {
  savedAt: string
  data: EtfTimeSeries[]
}

function isValidPayload(payload: CachePayload | null): payload is CachePayload {
  return Boolean(payload && Array.isArray(payload.data) && typeof payload.savedAt === 'string')
}

export async function loadEtfFileCache(): Promise<CachePayload | null> {
  try {
    const response = await fetch('/etf-cache.json', { cache: 'no-store' })

    if (!response.ok) {
      return null
    }

    const parsed = (await response.json()) as CachePayload
    if (!isValidPayload(parsed) || parsed.data.length === 0) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export async function loadEtfFileSavedAt(): Promise<string | null> {
  try {
    const response = await fetch('/etf-cache.json', { cache: 'no-store' })
    if (!response.ok) {
      return null
    }

    const parsed = (await response.json()) as Partial<CachePayload>
    if (typeof parsed.savedAt !== 'string' || !parsed.savedAt.trim()) {
      return null
    }

    return parsed.savedAt
  } catch {
    return null
  }
}

export function loadEtfCache(): CachePayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as CachePayload

    if (!isValidPayload(parsed) || parsed.data.length === 0) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function saveEtfCache(data: EtfTimeSeries[]) {
  const payload: CachePayload = {
    savedAt: new Date().toISOString(),
    data,
  }

  localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
}
