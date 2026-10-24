// LA LIBRETA DE AMIGOS, por CUENTA y no por aparato. Los contactos viven en la libreta de
// `@dotrino/identity` (`listPeers` / `addContact`), la misma que leen todas las apps: lo que
// aquí se añade aparece en el messenger, en el chat y en cualquier otra. Esta pieza solo
// sabe leerla bien: quién es una persona (su tarjeta de perfil), a qué aparatos se le
// escribe, y quién escribió de verdad.
import { samePubkey } from '@dotrino/proxy-client'

/** La misma llave puede llegar escrita con otro orden de campos: se compara por la llave. */
export const sameKey = (a, b) => {
  try { return !!a && !!b && (a === b || samePubkey(a, b)) } catch (_) { return false }
}

/** Lo que se escribe como apodo: sin lo que podría colarse en HTML. */
export const sanitizeNickname = (s) => String(s || '').trim().replace(/[<>"'`]/g, '').slice(0, 40)

/**
 * @param {object} o
 * @param {any} o.identity        el cliente de `@dotrino/identity` (iframe o Node)
 * @param {{publickey: string, nickname: string}[]} [o.pinned]  contactos fijos: no se quitan
 *   ni se bloquean, y vuelven si faltan (el messenger fija la cuenta de Dotrino)
 */
export function createFriendBook ({ identity, pinned = [] }) {
  let peers = []
  const listeners = new Set()
  const changed = () => { for (const f of listeners) { try { f() } catch (_) {} } }

  const isPinned = (pubkey) => pinned.some((p) => sameKey(p.publickey, pubkey))

  const refresh = async () => {
    peers = await identity.listPeers()
    await ensurePinned()
    changed()
  }

  /** Un fijo que falta vuelve, con la llave que traiga su tarjeta si ya llegó (mismo registro). */
  const ensurePinned = async () => {
    let added = false
    for (const p of pinned) {
      if (peers.some((x) => x.isContact && sameKey(x.publickey, p.publickey))) continue
      const key = peers.find((x) => x.card && sameKey(x.card.profileId, p.publickey))?.card.profileId || p.publickey
      await identity.addContact({ publickey: key, nickname: p.nickname })
      added = true
    }
    if (added) peers = await identity.listPeers()
  }

  const contacts = () => peers.filter((p) => p.isContact).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
  const peer = (pubkey) => peers.find((p) => p.publickey === pubkey) || peers.find((p) => sameKey(p.publickey, pubkey)) || null
  const find = (pubkey) => { const all = contacts(); return all.find((c) => c.publickey === pubkey) || all.find((c) => sameKey(c.publickey, pubkey)) || null }

  /**
   * Una tarjeta firmada por la llave del propio perfil. Solo esa prueba que el `profileId` es
   * de quien la firmó: cualquiera puede escribir un `profileId` ajeno en una tarjeta suya.
   */
  const ownCard = (card) => !!card && sameKey(card.sealedBy, card.profileId)

  /**
   * La tarjeta de perfil de un contacto (sus aparatos): solo la de un contacto guardado por su
   * CUENTA, y solo si la firmó la llave de ese perfil. Buscar cualquier tarjeta que liste la
   * llave era un agujero: cualquiera firma una tarjeta de SU perfil que liste la llave de otro.
   */
  const cardOf = (pubkey) => {
    if (!pubkey) return null
    const card = peer(pubkey)?.card || peers.find((p) => p.card && sameKey(p.card.profileId, pubkey))?.card || null
    return ownCard(card) && sameKey(card.profileId, pubkey) ? card : null
  }

  /** El contacto que escribe, aunque lo haga desde OTRO de sus aparatos (lo dice su tarjeta). */
  const findBySender = (pubkey) => {
    const all = contacts()
    return all.find((c) => sameKey(c.publickey, pubkey)) ||
      all.find((c) => cardOf(c.publickey)?.keys?.some((k) => sameKey(k.pub, pubkey))) || null
  }

  /**
   * La cuenta del aparato que mandó `card`. Hacen falta las dos puntas: la tarjeta la firmó su
   * perfil Y la entregó el propio aparato. Se lee la tarjeta GUARDADA (identity ya decidió si
   * adoptaba la que llegó).
   */
  const accountFromCard = (card, devicePubkey) => {
    if (!ownCard(card)) return null
    const kept = cardOf(card.profileId)
    return kept?.keys?.some((k) => sameKey(k.pub, devicePubkey)) ? kept.profileId : null
  }

  /**
   * A qué aparatos se le escribe: los de su tarjeta, o la llave con la que se añadió si aún no
   * mandó ninguna. Un fijo sin tarjeta no tiene ninguno: no hay llave de aparato a la que mandar.
   * @returns {{pubkey: string, encPub?: string}[]}
   */
  const recipientsOf = (pubkey) => {
    const card = cardOf(pubkey)
    if (card?.keys?.length) return card.keys.filter((k) => k.pub && k.encPub).map((k) => ({ pubkey: k.pub, encPub: k.encPub }))
    if (isPinned(pubkey)) return []
    const c = find(pubkey)
    return [{ pubkey: c?.publickey || pubkey, encPub: c?.encryptionPubkey || undefined }]
  }

  /** Bloqueado por mí (privado, en la libreta). A un fijo no se le bloquea. */
  const isBlocked = (pubkey) => !isPinned(pubkey) && peer(pubkey)?.blocked === true

  const add = async ({ pubkey, nickname, token, encryptionPubkey, notes }) => {
    if (!pubkey) throw Object.assign(new Error('friends: a contact needs its pubkey'), { code: 'no-pubkey' })
    await identity.addContact({
      publickey: pubkey,
      nickname: nickname ? sanitizeNickname(nickname) : undefined,
      encryptionPubkey: encryptionPubkey || undefined,
      lastToken: token || undefined,
      notes
    })
    await refresh()
    return find(pubkey)
  }

  const update = async (pubkey, patch) => {
    const allowed = {}
    for (const k of ['nickname', 'lastToken', 'encryptionPubkey', 'contactNotes']) if (k in patch) allowed[k] = patch[k]
    if (!Object.keys(allowed).length) return
    await identity.updateContact(pubkey, allowed)
    await refresh()
  }

  const remove = async (pubkey) => {
    if (isPinned(pubkey)) throw Object.assign(new Error('friends: a pinned contact cannot be removed'), { code: 'pinned-contact' })
    await identity.removeContact(pubkey)
    await refresh()
  }

  /**
   * Pasa un contacto guardado por la llave de un aparato a su CUENTA, con apodo, notas y tu
   * calificación. Lo que la app guarde por esa llave (un hilo) lo mueve la app.
   */
  const moveToAccount = async (from, account) => {
    const old = peer(from)
    await identity.addContact({
      publickey: account,
      nickname: old?.nickname || undefined,
      encryptionPubkey: old?.encryptionPubkey || undefined,
      lastToken: old?.lastToken || undefined,
      notes: old?.contactNotes
    })
    const r = old?.myRating
    if (typeof r?.rating === 'number' && !peer(account)?.myRating) await identity.setRating(account, r.rating, r.notes || '')
    await identity.removeContact(from)
    await refresh()
  }

  /** Adopta una tarjeta de perfil (identity la verifica y no acepta retrocesos ni cambios de master). */
  const adoptCard = async (card) => {
    const r = await identity.adoptPeerCard(JSON.parse(JSON.stringify(card)))
    await refresh()
    return r
  }

  return {
    refresh, contacts, peer, find, findBySender, cardOf, ownCard, accountFromCard, recipientsOf,
    isBlocked, isPinned, add, update, remove, moveToAccount, adoptCard,
    get peers () { return peers },
    onChange (f) { listeners.add(f); return () => listeners.delete(f) },
  }
}
