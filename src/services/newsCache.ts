import type { NewsArticle } from './newsApi'

const NEWS_CACHE_KEY = 'news-cache-fr'

export interface NewsCachePayload {
  savedAt: string
  data: NewsArticle[]
}

function isValidPayload(payload: NewsCachePayload | null): payload is NewsCachePayload {
  return Boolean(payload && typeof payload.savedAt === 'string' && Array.isArray(payload.data))
}

export async function loadNewsFileCache(): Promise<NewsCachePayload | null> {
  try {
    const response = await fetch('/news-cache.json', { cache: 'no-store' })
    if (!response.ok) {
      return null
    }

    const parsed = (await response.json()) as NewsCachePayload
    if (!isValidPayload(parsed) || parsed.data.length === 0) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export async function loadNewsFileSavedAt(): Promise<string | null> {
  try {
    const response = await fetch('/news-cache.json', { cache: 'no-store' })
    if (!response.ok) {
      return null
    }

    const parsed = (await response.json()) as Partial<NewsCachePayload>
    if (typeof parsed.savedAt !== 'string' || !parsed.savedAt.trim()) {
      return null
    }

    return parsed.savedAt
  } catch {
    return null
  }
}

export function loadNewsLocalCache(): NewsCachePayload | null {
  try {
    const raw = localStorage.getItem(NEWS_CACHE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as NewsCachePayload
    if (!isValidPayload(parsed) || parsed.data.length === 0) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function saveNewsLocalCache(data: NewsArticle[]) {
  const payload: NewsCachePayload = {
    savedAt: new Date().toISOString(),
    data,
  }

  localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(payload))
}
