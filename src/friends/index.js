// @dotrino/profile/friends — los AMIGOS, sin DOM (también en Node): la libreta por cuenta sobre la
// de la identidad, la bandeja de solicitudes y el protocolo (pedir, aceptar, escribir a todos sus
// aparatos). Como la tarjeta, no abre conexiones propias: la app le pasa `identity` y `client`
// (`@dotrino/proxy-client`). Las pantallas van en `@dotrino/profile/friends-ui`.
export { createFriends, normalizeCode, codeFromText, CODE_RE, REQUEST, ACCEPT } from './friends.js'
export { createFriendBook, sameKey, sanitizeNickname } from './book.js'
export { createRequestInbox, memoryStorage, REQUEST_TTL_MS } from './inbox.js'
