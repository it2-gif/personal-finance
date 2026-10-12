import { isVaultPath, vaultRequest } from './security/vaultApi'

export function apiUrl(path) {
  return `/api${path}`
}

export async function apiRequest(path, options = {}) {
  if (isVaultPath(path)) return vaultRequest(path, options)
  const { headers, skipAuthEvent = false, ...requestOptions } = options

  const response = await fetch(apiUrl(path), {
    ...requestOptions,
    credentials: 'include',
    headers: {
      ...(requestOptions.body
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...headers,
    },
  })

  if (response.status === 204) {
    return null
  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof data?.detail === 'string'
        ? data.detail
        : `Request failed (${response.status})`

    const error = new Error(message)
    error.status = response.status
    if (response.status === 401 && !skipAuthEvent) {
      window.dispatchEvent(new CustomEvent('finance:session-expired'))
    }
    throw error
  }

  return data
}
