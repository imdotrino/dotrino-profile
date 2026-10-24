// EL PROTOCOLO DE AMIGOS: pedir, aceptar y escribirle a un amigo en todos sus aparatos. Salió del
// messenger (dueño, 2026-10-23: «que los amigos no sean exclusivos de messenger») para que
// cualquier app añada amigos y los reciba. Todo va SELLADO por el pilar (`requireSealed`,
// CONVENCIONES §4.1): el proxio no ve ni el tipo ni el contenido.
//
//   CONTACT_REQUEST { nickname, v, card? }   «quiero añadirte»: va a la bandeja del otro, NUNCA
//                                            a un chat
//   CONTACT_ACCEPT  { nickname, v, card? }   «aceptado»: solo cuenta si yo lo pedí
//
// QUIÉN ESCRIBIÓ lo dice la llave que selló el sobre (`meta.senderEncPub`): se compara con las
// llaves que ya conozco de ese amigo, o con la llave de cifrado que esa identidad anunció
// FIRMADA (`encPubOf`). El token no dice nada y el saludo del transporte no autentica.
import { createFriendBook, sameKey, sanitizeNickname } from './book.js'
import { createRequestInbox } from './inbox.js'

// Del mejor camino al peor (la escalera del transporte), para decir por dónde va un amigo con
// varios aparatos. Lo que no esté en la lista cuenta como el peor.
const ROUTE_ORDER = ['socket', 'direct', 'bluetooth', 'turn', 'webrtc', 'proxy', 'offline']
const rank = (r) => { const i = ROUTE_ORDER.indexOf(r); return i < 0 ? ROUTE_ORDER.length : i }

export const REQUEST = 'CONTACT_REQUEST'
export const ACCEPT = 'CONTACT_ACCEPT'

/** El alfabeto de los códigos del proxio, sin lo que se confunde al leer o al dictar. */
export const CODE_RE = /^[1-9ACDEFHJKMNOPQRTUVWXY]{6}$/
const CONFUSABLES = { I: '1', L: '1', S: '5', Z: '2', B: '8', G: '6', 0: 'O' }

/** Normaliza lo tecleado: mayúsculas, sin separadores, y lo que nunca se emite traducido. */
export const normalizeCode = (raw) => [...String(raw || '').toUpperCase()]
  .filter((c) => c !== ' ' && c !== '-' && c !== '_')
  .map((c) => CONFUSABLES[c] ?? c)
  .join('')

/** El código de lo que devolvió un escáner: un enlace con `#add=` o el código pelado. */
export const codeFromText = (text) => {
  const raw = String(text || '').trim()
  const m = raw.match(/[#&?]add=([^&\s]+)/i)
  return normalizeCode(m ? m[1] : raw).slice(0, 6)
}

/**
 * @param {object} o
 * @param {any} o.identity    `@dotrino/identity`
 * @param {any} o.client      `@dotrino/proxy-client` (WebSocketProxyClient), ya con `requireSealed`
 * @param {() => string} o.nickname          tu apodo, tal cual lo enseña la app
 * @param {any} [o.version]                   lo que tu app anuncia de sí (`@dotrino/compat`, §14)
 * @param {any} [o.book]                      una libreta ya hecha (`createFriendBook`)
 * @param {any} [o.inbox]                     una bandeja ya hecha (`createRequestInbox`)
 * @param {string | (() => string)} [o.inboxKey]  la clave de la bandeja, si no se pasa `inbox`
 * @param {object} [o.hooks]
 * @param {(pubkey: string, payload: any) => any} [o.hooks.onProfile]  llegó su versión/tarjeta
 * @param {(from: string, to: string) => any} [o.hooks.onMoved]  un amigo pasó de aparato a cuenta
 * @param {(account: string, o: {token?: string, device?: string}) => any} [o.hooks.onFriend]  ya sois amigos
 * @param {(request: any) => any} [o.hooks.onRequest]  llegó una solicitud a la bandeja
 * @param {(account: string) => Promise<boolean>} [o.hooks.isVouched]  ¿alguien de tu red lo avala?
 */
export function createFriends ({ identity, client, nickname, version = null, book = null, inbox = null, inboxKey = 'dotrino-friends:requests', hooks = {}, pinned = [] }) {
  book = book || createFriendBook({ identity, pinned })
  inbox = inbox || createRequestInbox({ key: inboxKey })

  // Presencia de ESTA sesión: qué token tiene cada amigo ahora, y qué token tiene cada aparato.
  const online = new Map()          // cuenta → token
  const deviceTokens = new Map()    // pubkey de aparato → token
  const greeted = new Set()         // tokens a los que ya saludó el transporte
  const listeners = new Set()
  const changed = () => { for (const f of listeners) { try { f() } catch (_) {} } }
  inbox.onChange(changed)
  book.onChange(changed)

  // ---------- tu código para que te añadan ----------

  let code = null
  let codeTimer = null
  /**
   * Pide al proxio un código de 6 caracteres (una CITA: caduca en minutos y resuelve a esta
   * conexión, en el proxio que sea) y lo renueva antes de que caduque. Un código es de UN uso:
   * cuando alguien lo canjea, se pide otro solo.
   */
  const refreshCode = async () => {
    if (codeTimer) { clearTimeout(codeTimer); codeTimer = null }
    try {
      const res = await client.requestPairingCode()
      code = res?.code || null
      const left = (res?.expiresAt || 0) - Date.now()
      // `unref`: en Node, renovar el código no mantiene vivo el proceso.
      if (left > 10000) { codeTimer = setTimeout(refreshCode, left - 5000); codeTimer.unref?.() }
    } catch (_) { code = null }
    changed()
    return code
  }

  const waitConnected = async (ms = 8000) => {
    const t0 = Date.now()
    while (!client.isConnected && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 150))
    return client.isConnected
  }

  /**
   * Canjea el código de otra persona. `reason` distingue «no hay red» de «ese código no vale»:
   * se arreglan distinto, y decir lo segundo cuando pasa lo primero manda a buscar un problema
   * que no existe. Se mira `e.code`, nunca el texto.
   * @returns {Promise<{ok: boolean, instance?: string, publickey?: string, reason?: 'offline'|'invalid'|'own'}>}
   */
  const redeemCode = async (raw) => {
    const c = normalizeCode(raw)
    if (!CODE_RE.test(c)) return { ok: false, reason: 'invalid' }
    if (c === code) return { ok: false, reason: 'own' }
    if (!(await waitConnected())) return { ok: false, reason: 'offline' }
    try {
      const res = await client.redeemPairingCode(c)
      if (res?.ok && res.instance) return res
      return { ok: false, reason: 'invalid' }
    } catch (e) {
      const offline = e?.code === 'NOT_CONNECTED' || e?.code === 'REQUEST_TIMEOUT'
      return { ok: false, reason: offline ? 'offline' : 'invalid' }
    }
  }

  // ---------- quién soy, quién escribe ----------

  /** Lo que mando de mí: apodo, versión y mi tarjeta de perfil (para que me escriban a TODOS mis aparatos). */
  const me = async () => {
    const card = await identity.profileCard?.().catch(() => null)
    return { nickname: nickname?.() || '', ...(version ? { v: version } : {}), ...(card ? { card } : {}) }
  }

  /** Todas las llaves de cifrado que conozco de un amigo: la guardada y las de su tarjeta. */
  const knownEncPubs = (c) => {
    const out = []
    if (c?.encryptionPubkey) out.push(c.encryptionPubkey)
    for (const k of (book.cardOf(c?.publickey)?.keys || [])) if (k.encPub) out.push(k.encPub)
    return out
  }

  /**
   * QUIÉN MANDÓ ESTO, de verdad. Su identidad la dice el proxio (`fromPubkey`, por pubkey) o el
   * saludo (por token); vale solo si la llave que selló el sobre es de esa identidad.
   * @returns {Promise<{pubkey: string, contact: any, encPub: string, device: string} | null>}
   */
  const authenticate = async (fromToken, meta) => {
    let claimed = meta.fromPubkey || client.pubkeyOfToken?.(fromToken) || null
    if (!claimed && fromToken) claimed = await client.whoIs(fromToken).catch(() => null)
    const senderEncPub = meta.senderEncPub
    if (!claimed || !senderEncPub) return null
    const contact = book.findBySender(claimed)
    if (contact && knownEncPubs(contact).some((k) => sameKey(k, senderEncPub))) {
      return { pubkey: contact.publickey, contact, encPub: senderEncPub, device: claimed }
    }
    let announced = null
    try { announced = await client.encPubOf(claimed) } catch (e) {
      console.warn('[friends] could not verify the sender key:', e?.code || '', e?.message)
      return null
    }
    if (!sameKey(announced, senderEncPub)) {
      console.warn("[friends] message sealed with a key that is not the sender's: dropped")
      return null
    }
    return { pubkey: contact?.publickey || claimed, contact: contact || null, encPub: senderEncPub, device: claimed }
  }

  /** Su versión y su tarjeta, venga en el mensaje que venga. */
  const noteProfile = async (pubkey, payload) => {
    try { await hooks.onProfile?.(pubkey, payload) } catch (_) {}
    if (!payload?.card) return
    try {
      const r = await book.adoptCard(payload.card)
      if (r && !r.adopted && r.reason === 'master-changed') {
        console.warn('[friends] the card of %s is signed by another device: not adopted silently', String(pubkey).slice(0, 24))
      }
    } catch (e) { console.warn('[friends] adoptPeerCard:', e?.message || e) }
  }

  /** La CUENTA de quien escribe: la de su tarjeta si la firmó su perfil y la trajo el propio aparato. */
  const accountOf = (who, payload) => who.contact?.publickey || book.accountFromCard(payload?.card, who.device) || who.pubkey

  /** Un amigo guardado por la llave de un aparato pasa a su cuenta cuando ese aparato trae la tarjeta. */
  const upgradeToAccount = async (who, payload) => {
    const c = who.contact
    if (!c || !sameKey(c.publickey, who.device)) return c
    const account = book.accountFromCard(payload?.card, who.device)
    if (!account || sameKey(account, c.publickey)) return c
    try {
      await book.moveToAccount(c.publickey, account)
      const token = online.get(c.publickey)
      if (token) { online.delete(c.publickey); online.set(account, token) }
      await hooks.onMoved?.(c.publickey, account)
    } catch (e) {
      console.warn('[friends] could not move the contact to its account:', e?.code || '', e?.message)
      return c
    }
    return book.find(account) || c
  }

  // ---------- presencia ----------

  const markOnline = (pubkey, token) => {
    if (!token) return
    online.set(pubkey, token)
    if (book.find(pubkey)) book.update(pubkey, { lastToken: token }).catch(() => {})
    changed()
  }
  const markOffline = (token) => {
    let any = false
    for (const [pk, tk] of online) if (tk === token) { online.delete(pk); any = true }
    for (const [pk, tk] of deviceTokens) if (tk === token) deviceTokens.delete(pk)
    greeted.delete(token)
    if (any) changed()
  }

  // ---------- escribirle a un amigo ----------

  /**
   * Sella `payload` a un amigo: a TODOS los aparatos de su cuenta, cada uno por su camino más
   * directo — por token si está en línea en esta sesión (el único camino que sube a WebRTC),
   * por pubkey si no (la cola offline de 24 h). Falla solo si no llegó a ninguno; el mismo
   * mensaje dos veces lo descarta el otro lado por su id. `quiet`: sin timbrar su teléfono.
   */
  const send = async (pubkey, payload, { quiet = false } = {}) => {
    const c = book.find(pubkey)
    if (!c) throw Object.assign(new Error('friends: not a contact'), { code: 'not-contact' })
    const recipients = book.recipientsOf(c.publickey)
    if (!recipients.length) throw Object.assign(new Error('friends: no device of this account is known yet'), { code: 'no-devices' })
    let sent = 0
    let last = null
    for (const r of recipients) {
      const token = deviceTokens.get(r.pubkey) || (recipients.length === 1 ? online.get(c.publickey) : null)
      try {
        if (token) {
          if (!greeted.has(token)) { try { client.helloTo(token) } catch (_) {} greeted.add(token) }
          await client.sendSealedTo(token, payload, { peerPubkey: r.pubkey, peerEncPub: r.encPub })
        } else await client.sendSealed(r.pubkey, payload, { peerEncPub: r.encPub, quiet })
        sent++
      } catch (e) { last = e }
    }
    if (!sent) throw last
  }

  /**
   * POR DÓNDE VA un amigo ahora: el mejor camino entre sus aparatos conectados, u `offline` si no
   * hay ninguno (lo suyo espera en el proxio).
   */
  const routeOf = async (pubkey) => {
    const c = book.find(pubkey)
    if (!c || !online.has(c.publickey)) return 'offline'
    const tokens = new Set()
    for (const r of book.recipientsOf(c.publickey)) if (deviceTokens.get(r.pubkey)) tokens.add(deviceTokens.get(r.pubkey))
    if (online.get(c.publickey)) tokens.add(online.get(c.publickey))
    let best = 'offline'
    for (const t of tokens) {
      const r = await client.routeTo(t)
      if (rank(r) < rank(best)) best = r
    }
    return best
  }

  // ---------- solicitudes ----------

  const becomeFriends = async (pubkey, { nickname: nick, token, encryptionPubkey, device = null }) => {
    const existing = book.find(pubkey)
    await book.add({
      pubkey: existing?.publickey || pubkey,
      nickname: existing?.nickname || nick || String(pubkey).slice(0, 8),
      token: token || undefined,
      encryptionPubkey: encryptionPubkey || existing?.encryptionPubkey,
    })
    inbox.remove(pubkey)
    if (device && device !== pubkey) inbox.remove(device)
    try { await hooks.onFriend?.(existing?.publickey || pubkey, { token, device }) } catch (_) {}
  }

  const replyAccept = async (pubkey) => send(pubkey, { type: ACCEPT, ...(await me()) })

  /**
   * Pide ser amigos. Le llega a su BANDEJA; nadie es amigo de nadie hasta que acepte. `token` +
   * `pubkey` salen de canjear su código; con su `card` (un enlace `#to=`) se le escribe a todos
   * sus aparatos con las llaves de cifrado que ella misma lista.
   */
  const request = async ({ token = null, pubkey, alias = '', card = null }) => {
    if (!pubkey) throw Object.assign(new Error('friends: the code did not say whose it is'), { code: 'no-peer-identity' })
    // Si ya me lo pidió, esto es aceptar: los dos lo quieren.
    if (inbox.get(pubkey, 'in')) { await accept(pubkey); return }
    const payload = { type: REQUEST, ...(await me()) }
    let account = null
    if (card) {
      try { await book.adoptCard(card); account = book.accountFromCard(card, pubkey) } catch (e) {
        console.warn('[friends] the card in the link could not be adopted:', e?.message || e)
      }
    }
    if (account) {
      let sent = 0
      let last = null
      for (const r of book.recipientsOf(account)) {
        try { await client.sendSealed(r.pubkey, payload, { peerEncPub: r.encPub }); sent++ } catch (e) { last = e }
      }
      if (!sent) throw last || Object.assign(new Error('friends: no device of this account is known'), { code: 'no-devices' })
      inbox.upsert({ pubkey: account, dir: 'out', nickname: sanitizeNickname(alias), token: null, ts: Date.now() })
      return
    }
    if (token) await client.sendSealedTo(token, payload, { peerPubkey: pubkey })
    else await client.sendSealed(pubkey, payload)
    inbox.upsert({ pubkey, dir: 'out', nickname: sanitizeNickname(alias), token: token || null, ts: Date.now() })
  }

  /** Canjea un código y pide ser amigos. Lanza con `code`: `invalid`, `own`, `offline`, `no-peer-identity`. */
  const requestByCode = async (raw, alias = '') => {
    const res = await redeemCode(raw)
    if (!res.ok) throw Object.assign(new Error(`friends: the code was not redeemed (${res.reason})`), { code: res.reason })
    const pubkey = res.publickey || await client.whoIs(res.instance).catch(() => null)
    if (!pubkey) throw Object.assign(new Error('friends: nobody answered for that code'), { code: 'offline' })
    await request({ token: res.instance, pubkey, alias })
  }

  /** Acepta una solicitud: amigos en los dos lados. Nada entra a ningún chat. */
  const accept = async (pubkey) => {
    const r = inbox.get(pubkey, 'in')
    if (!r) return
    await becomeFriends(pubkey, { nickname: r.nickname, token: r.token, encryptionPubkey: r.encryptionPubkey })
    if (r.token) markOnline(pubkey, r.token)
    await replyAccept(pubkey)
  }

  /** Descarta una que llegó, o cancela una que mandé. Al otro no se le dice. */
  const dismiss = (pubkey, dir = 'in') => inbox.remove(pubkey, dir)

  const onRequest = async (fromToken, who, payload) => {
    const nick = sanitizeNickname(payload.nickname)
    await noteProfile(who.pubkey, payload)
    const contact = await upgradeToAccount(who, payload)
    const account = contact?.publickey || accountOf(who, payload)
    if (book.isBlocked(account)) return
    const known = contact || book.find(account)
    // Alguien canjeó tu código: es de UN uso, así que el de la pantalla ya no vale.
    refreshCode().catch(() => {})
    markOnline(account, fromToken)
    // Ya es amigo (reinstaló, nos perdió…) o yo también se lo pedí: los dos lo quieren.
    if (known || inbox.get(who.device, 'out') || inbox.get(account, 'out')) {
      await becomeFriends(account, { nickname: nick, token: fromToken, encryptionPubkey: who.encPub, device: who.device })
      await replyAccept(account)
      return
    }
    const vouched = !!(await hooks.isVouched?.(account).catch(() => false))
    const entry = { pubkey: account, dir: 'in', nickname: nick, token: fromToken, encryptionPubkey: who.encPub, ts: Date.now(), vouched }
    inbox.upsert(entry)
    try { await hooks.onRequest?.(entry) } catch (_) {}
  }

  const onAccept = async (fromToken, who, payload) => {
    await noteProfile(who.pubkey, payload)
    const contact = await upgradeToAccount(who, payload)
    const account = contact?.publickey || accountOf(who, payload)
    // Solo cuenta si lo pedí (a ese aparato o a su cuenta), o si ya es amigo. Nadie se añade solo.
    const mine = inbox.get(who.device, 'out') || inbox.get(account, 'out')
    if (!mine && !contact && !book.find(account)) return
    await becomeFriends(account, { nickname: mine?.nickname || sanitizeNickname(payload.nickname), token: fromToken, encryptionPubkey: who.encPub, device: who.device })
    markOnline(account, fromToken)
  }

  /**
   * LO QUE LLEGA. Autentica, descarta lo de quien bloqueaste y atiende las solicitudes. Devuelve
   * `null` si no hay que mirarlo más (sin sellar, sin autenticar, bloqueado), o `{ who, handled }`:
   * `handled` si era del protocolo de amigos; si no, la app sigue con `who` (que trae `contact`
   * solo si es amigo: lo de un desconocido no va a ningún sitio).
   */
  const receive = async (fromToken, payload, meta = {}) => {
    if (!payload || typeof payload !== 'object' || typeof payload.type !== 'string') return null
    if (!meta.sealed) return null
    const who = await authenticate(fromToken, meta)
    if (!who) return null
    if (fromToken) deviceTokens.set(who.device, fromToken)
    if (book.isBlocked(who.pubkey) || (meta.fromPubkey && book.isBlocked(meta.fromPubkey))) return null
    if (payload.type === REQUEST) { await onRequest(fromToken, who, payload); return { who, handled: true } }
    if (payload.type === ACCEPT) { await onAccept(fromToken, who, payload); return { who, handled: true } }
    return { who, handled: false }
  }

  return {
    book, inbox,
    // tu código
    get code () { return code }, refreshCode, redeemCode,
    // solicitudes
    request, requestByCode, accept, dismiss,
    get incoming () { return inbox.incoming }, get outgoing () { return inbox.outgoing },
    // llegar y escribir
    receive, send, routeOf, authenticate, noteProfile, upgradeToAccount, accountOf, me,
    // presencia
    markOnline, markOffline,
    isOnline: (pubkey) => online.has(pubkey),
    liveTokenFor: (pubkey) => online.get(pubkey) || null,
    tokenFor: (pubkey) => online.get(pubkey) || book.find(pubkey)?.lastToken || null,
    forgetDevice: (token) => { for (const [pk, tk] of deviceTokens) if (tk === token) deviceTokens.delete(pk); greeted.delete(token) },
    onChange (f) { listeners.add(f); return () => listeners.delete(f) },
    close () { if (codeTimer) clearTimeout(codeTimer); codeTimer = null },
  }
}
