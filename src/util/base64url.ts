/**
 * URL-safe Base64 (RFC 4648 §5) for binary payloads carried in a query string:
 * the standard `+` `/` `=` alphabet would be percent-escaped (or, for `+`, decoded
 * as a space) inside a URL, so we use `-` `_` and drop the `=` padding. Used to put a
 * compressed project blob into the `?load=` share link (see projectShareLink.ts).
 */

/** Encodes raw bytes as a padding-free URL-safe Base64 string. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  // Build the binary string in chunks — `String.fromCharCode(...bytes)` overflows
  // the call stack for large arrays, so feed it bounded slices.
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Decodes a URL-safe Base64 string (padding optional) back to raw bytes. */
export function base64UrlToBytes(text: string): Uint8Array {
  let b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  // Restore the `=` padding btoa expects (length must be a multiple of 4).
  const pad = b64.length % 4
  if (pad === 2) b64 += '=='
  else if (pad === 3) b64 += '='
  else if (pad === 1) throw new Error('Invalid base64url length')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
