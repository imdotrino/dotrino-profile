// LA BANDEJA DE SOLICITUDES, en los dos sentidos: las que te llegan (`dir: 'in'`) y las que
// mandaste (`dir: 'out'`, esperando a que acepten). Son mensajes de CONTROL entre las dos
// puntas: nunca llevan texto y nunca entran a un chat. Nadie es amigo de nadie hasta que el
// otro acepta.
//
// EFÍMERA y local a este aparato: 24 h (calza con la cola offline del proxio) y se purga
// sola. Los desconocidos no entran en la libreta hasta que aceptas.
import { sameKey } from './book.js'

export const REQUEST_TTL_MS = 24 * 60 * 60 * 1000

/** Lo que se guarda en memoria cuando no hay almacén (Node, pruebas). */
export function memoryStorage () {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)) } }
}

/**
 * @param {object} o
 * @param {string | (() => string)} o.key  la clave del almacén. Por CUENTA: una solicitud es para
 *   una identidad, y sin separar por cuenta las de una aparecían al entrar con otra
 * @param {{getItem: Function, setItem: Function}} [o.storage]  `localStorage` por defecto
 */
export function createRequestInbox ({ key, storage = globalThis.localStorage || memoryStorage(), ttlMs = REQUEST_TTL_MS, now = () => Date.now() }) {
  const k = () => (typeof key === 'function' ? key() : key)
  const listeners = new Set()
  const changed = () => { for (const f of listeners) { try { f() } catch (_) {} } }

  const load = () => {
    try {
      const arr = JSON.parse(storage.getItem(k()) || '[]')
      return Array.isArray(arr) ? arr.filter((r) => r && now() - (r.ts || 0) < ttlMs) : []
    } catch (_) { return [] }
  }
  let list = load()
  const persist = () => { try { storage.setItem(k(), JSON.stringify(list)) } catch (_) {} }
  const prune = () => {
    const before = list.length
    list = list.filter((r) => now() - (r.ts || 0) < ttlMs)
    if (list.length !== before) { persist(); changed() }
  }
  const dirOf = (r) => r.dir || 'in'

  /** Inserta o actualiza (conserva el `ts` original para el TTL). */
  const upsert = (entry) => {
    prune()
    const dir = dirOf(entry)
    const i = list.findIndex((r) => sameKey(r.pubkey, entry.pubkey) && dirOf(r) === dir)
    if (i >= 0) list[i] = { ...list[i], ...entry, dir, ts: list[i].ts }
    else list = [{ ...entry, dir, ts: entry.ts || now() }, ...list]
    persist(); changed()
  }

  /** Quita las de esa persona: las de un sentido, o las dos si no se dice. */
  const remove = (pubkey, dir) => {
    const before = list.length
    list = list.filter((r) => !(sameKey(r.pubkey, pubkey) && (!dir || dirOf(r) === dir)))
    if (list.length !== before) { persist(); changed() }
  }

  const get = (pubkey, dir = 'in') => { prune(); return list.find((r) => sameKey(r.pubkey, pubkey) && dirOf(r) === dir) || null }

  return {
    upsert, remove, get, prune,
    /** Vuelve a leer el almacén (cambió la cuenta). */
    reload () { list = load(); changed() },
    get all () { prune(); return [...list] },
    get incoming () { prune(); return list.filter((r) => dirOf(r) === 'in') },
    get outgoing () { prune(); return list.filter((r) => dirOf(r) === 'out') },
    onChange (f) { listeners.add(f); return () => listeners.delete(f) },
  }
}
