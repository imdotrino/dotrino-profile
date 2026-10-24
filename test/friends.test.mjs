// El protocolo de amigos entre dos personas de verdad (cada una con su libreta y su cliente),
// unidas por una red de mentira que entrega lo sellado como lo haría el pilar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFriends, createRequestInbox, memoryStorage, normalizeCode, codeFromText, CODE_RE } from '../src/friends/index.js'

function fakeIdentity () {
  const peers = new Map()
  return {
    peers,
    async listPeers () { return [...peers.values()].map((p) => ({ ...p })) },
    async addContact ({ publickey, nickname, encryptionPubkey, lastToken }) {
      const p = peers.get(publickey) || { publickey }
      peers.set(publickey, { ...p, isContact: true, nickname: nickname ?? p.nickname, encryptionPubkey: encryptionPubkey ?? p.encryptionPubkey, lastToken: lastToken ?? p.lastToken })
    },
    async updateContact (pk, patch) { peers.set(pk, { ...peers.get(pk), ...patch }) },
    async removeContact (pk) { peers.delete(pk) },
    async setRating () {},
    async adoptPeerCard () { return { adopted: false } },
    async profileCard () { return null },
  }
}

/** Una red: cada persona tiene token, pubkey y llave de cifrado; lo enviado se entrega sellado. */
function network () {
  const people = new Map()   // pubkey → { token, encPub, friends }
  let codes = 0
  const byToken = (t) => [...people.values()].find((p) => p.token === t)
  const deliver = (from, to, payload, viaToken) => setImmediate(() => {
    to.friends.receive(viaToken ? from.token : null, JSON.parse(JSON.stringify(payload)), { sealed: true, fromPubkey: viaToken ? undefined : from.pubkey, senderEncPub: from.encPub })
  })
  const join = (name) => {
    const me = { pubkey: 'PK-' + name, token: 'TOK-' + name, encPub: 'ENC-' + name, code: null, sent: [] }
    const client = {
      isConnected: true,
      async requestPairingCode () { me.code = ['K7M2Q9', 'A1C3E5', 'H7J9KM', 'N2P4QR'][codes++ % 4]; return { code: me.code, expiresAt: Date.now() + 60000 } },
      async redeemPairingCode (c) { const p = [...people.values()].find((x) => x.code === c); return p ? { ok: true, instance: p.token } : { ok: false } },
      pubkeyOfToken: (t) => byToken(t)?.pubkey || null,
      async whoIs (t) { return byToken(t)?.pubkey || null },
      async encPubOf (pk) { return people.get(pk)?.encPub || null },
      helloTo () {},
      async routeTo () { return 'proxy' },
      async sendSealed (pk, payload) { me.sent.push(payload.type); const to = people.get(pk); if (!to) throw Object.assign(new Error('x'), { code: 'no-encpub' }); deliver(me, to, payload, false) },
      async sendSealedTo (tok, payload) { me.sent.push(payload.type); const to = byToken(tok); if (!to) throw new Error('gone'); deliver(me, to, payload, true) },
    }
    me.identity = fakeIdentity()
    me.requests = []
    me.friends = createFriends({
      identity: me.identity, client, nickname: () => name,
      inbox: createRequestInbox({ key: 'r', storage: memoryStorage() }),
      hooks: { onRequest: (r) => me.requests.push(r) },
    })
    people.set(me.pubkey, me)
    return me
  }
  return { join }
}

const settle = () => new Promise((r) => setTimeout(r, 30))

test('por código: Ana pide, Beto acepta, y los dos quedan amigos en su libreta', async () => {
  const net = network()
  const ana = net.join('Ana'); const beto = net.join('Beto')
  await beto.friends.refreshCode()
  await ana.friends.requestByCode(beto.code.toLowerCase(), 'Beto del trabajo')
  await settle()
  assert.equal(beto.friends.incoming.length, 1)
  assert.equal(beto.friends.incoming[0].pubkey, 'PK-Ana')
  assert.equal(beto.friends.incoming[0].nickname, 'Ana')
  assert.equal(beto.requests.length, 1, 'avisó a la app')
  assert.equal(ana.friends.outgoing.length, 1)
  assert.equal(beto.identity.peers.size, 0, 'un desconocido no entra en la libreta hasta aceptar')
  assert.notEqual(beto.friends.code, 'K7M2Q9', 'el código usado se renueva')

  await beto.friends.accept('PK-Ana')
  await settle()
  assert.ok(beto.friends.book.find('PK-Ana'))
  assert.equal(beto.friends.book.find('PK-Ana').encryptionPubkey, 'ENC-Ana')
  assert.ok(ana.friends.book.find('PK-Beto'), 'el aceptar llegó')
  assert.equal(ana.friends.book.find('PK-Beto').nickname, 'Beto del trabajo', 'con el apodo que ella puso')
  assert.equal(ana.friends.outgoing.length, 0)
  assert.equal(beto.friends.incoming.length, 0)
})

test('si los dos se lo piden, no hace falta aceptar', async () => {
  const net = network()
  const ana = net.join('Ana'); const beto = net.join('Beto')
  await ana.friends.request({ pubkey: 'PK-Beto' })
  await settle()
  await beto.friends.request({ pubkey: 'PK-Ana' })   // ya tenía la de Ana: es aceptar
  await settle()
  assert.ok(ana.friends.book.find('PK-Beto'))
  assert.ok(beto.friends.book.find('PK-Ana'))
})

test('un aceptar que nadie pidió no añade a nadie', async () => {
  const net = network()
  const ana = net.join('Ana'); const eva = net.join('Eva')
  await ana.friends.receive(null, { type: 'CONTACT_ACCEPT', nickname: 'Eva' }, { sealed: true, fromPubkey: 'PK-Eva', senderEncPub: 'ENC-Eva' })
  assert.equal(ana.friends.book.find('PK-Eva'), null)
  void eva
})

test('lo no sellado, o sellado con una llave que no es del remitente, no se mira', async () => {
  const net = network()
  const ana = net.join('Ana'); net.join('Eva')
  assert.equal(await ana.friends.receive(null, { type: 'CONTACT_REQUEST' }, { sealed: false, fromPubkey: 'PK-Eva', senderEncPub: 'ENC-Eva' }), null)
  assert.equal(await ana.friends.receive(null, { type: 'CONTACT_REQUEST' }, { sealed: true, fromPubkey: 'PK-Eva', senderEncPub: 'ENC-FALSA' }), null)
  assert.equal(ana.friends.incoming.length, 0)
})

test('lo de un bloqueado no llega', async () => {
  const net = network()
  const ana = net.join('Ana'); net.join('Eva')
  ana.identity.peers.set('PK-Eva', { publickey: 'PK-Eva', blocked: true })
  await ana.friends.book.refresh()
  assert.equal(await ana.friends.receive(null, { type: 'CONTACT_REQUEST', nickname: 'Eva' }, { sealed: true, fromPubkey: 'PK-Eva', senderEncPub: 'ENC-Eva' }), null)
  assert.equal(ana.friends.incoming.length, 0)
})

test('lo que no es del protocolo vuelve a la app con quién lo mandó', async () => {
  const net = network()
  const ana = net.join('Ana'); const beto = net.join('Beto')
  await ana.friends.request({ pubkey: 'PK-Beto' }); await settle()
  await beto.friends.accept('PK-Ana'); await settle()
  const r = await ana.friends.receive(null, { type: 'DM', text: 'hola' }, { sealed: true, fromPubkey: 'PK-Beto', senderEncPub: 'ENC-Beto' })
  assert.equal(r.handled, false)
  assert.equal(r.who.pubkey, 'PK-Beto')
  assert.ok(r.who.contact)
})

test('send le escribe al amigo y falla con not-contact a un desconocido', async () => {
  const net = network()
  const ana = net.join('Ana'); const beto = net.join('Beto')
  await ana.friends.request({ pubkey: 'PK-Beto' }); await settle()
  await beto.friends.accept('PK-Ana'); await settle()
  await ana.friends.send('PK-Beto', { type: 'DM', text: 'hola' })
  assert.equal(ana.sent.at(-1), 'DM')
  await assert.rejects(ana.friends.send('PK-Nadie', { type: 'DM' }), { code: 'not-contact' })
})

test('el código: normaliza lo que se confunde y saca el código de un enlace', async () => {
  assert.equal(normalizeCode('k7m-2q9'), 'K7M2Q9')
  assert.equal(normalizeCode('a1c3e5'), 'A1C3E5')
  assert.equal(normalizeCode('S0'), '5O')
  assert.equal(codeFromText('https://messenger.dotrino.com/#add=k7m2q9'), 'K7M2Q9')
  assert.ok(CODE_RE.test('K7M2Q9'))
  const net = network()
  const ana = net.join('Ana')
  await ana.friends.refreshCode()
  assert.deepEqual(await ana.friends.redeemCode(ana.friends.code), { ok: false, reason: 'own' })
  assert.deepEqual(await ana.friends.redeemCode('xx'), { ok: false, reason: 'invalid' })
  await assert.rejects(ana.friends.requestByCode('N2P4QR'), { code: 'invalid' })
  ana.friends.close()
})

test('la bandeja caduca a las 24 h', () => {
  let t = 1000
  const inbox = createRequestInbox({ key: 'x', storage: memoryStorage(), now: () => t })
  inbox.upsert({ pubkey: 'A', dir: 'in', nickname: 'a' })
  assert.equal(inbox.incoming.length, 1)
  t += 24 * 60 * 60 * 1000
  assert.equal(inbox.incoming.length, 0)
})
