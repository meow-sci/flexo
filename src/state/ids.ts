/**
 * Generates a unique id for editor-only entities (measurements, containers).
 *
 * Prefers `crypto.randomUUID()`, but falls back when it isn't available:
 * `crypto.randomUUID` only exists in a SECURE CONTEXT (HTTPS or localhost).
 * Opening the app over a plain-HTTP LAN URL — e.g. a phone hitting
 * `http://<dev-host>:5173/flexo/` — is NOT a secure context, so `randomUUID` is
 * `undefined` and calling it throws, which would silently break "add" actions.
 * `crypto.getRandomValues` IS available in insecure contexts; `Math.random` is
 * the last resort. These ids aren't security-sensitive, so that's fine.
 */
export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  // Set the RFC 4122 version (4) and variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
