# @dotrino/profile

> **Parte del ecosistema [Dotrino](https://dotrino.com).** Dotrino es un ecosistema de aplicaciones centradas en la privacidad de los datos: tu información es tuya, y las decisiones sobre ella también — qué compartes, con quién, cuándo y por qué. Sin anuncios, sin cookies, sin rastreo de datos, sin vender tu identidad a nadie.

Web Component (`<dotrino-profile>`) compartido del ecosistema **Dotrino**:
la tarjeta de **perfil + reputación** de un peer, idéntica en todas las
apps (messenger, eco, trueque, …). Autohosteado, Shadow DOM, **sin JS de
terceros ni cookies**. Bilingüe es/en. Temable solo por CSS custom properties.

Muestra:

- **Identidad** — avatar (iniciales + color determinista por pubkey), nombre,
  pubkey corta, "conocido desde".
- **Mi calificación** (modo `edit`) — confianza + afinidad (estrellas) + notas
  privadas.
- **Web of Trust** — endosos firmados de mi red (lista + promedio).
- **Reputación de la red** — `reputationOf` ponderada por mi web-of-trust
  (anti-sybil), confianza/afinidad en %.

## Filosofía / decisiones

- **UI compartida = Web Component** (el ecosistema es mixto Vue/vanilla), no un
  componente Vue. Mismo patrón que `@dotrino/support`.
- **Sin acoplar datos**: el componente no depende de identity ni reputation. La
  app inyecta un `provider` (adapter). Para los paquetes estándar hay un helper
  de 1 línea: `createVaultProfileProvider({ identity, reputation })`.
- **Tema por CSS vars `--ccp-*`** (defaults = paleta del messenger). Cada app
  cambia solo los colores; el layout/comportamiento es idéntico.

## Uso (Vue)

```js
import '@dotrino/profile'
import { createVaultProfileProvider } from '@dotrino/profile'
```

```html
<dotrino-profile
  modal
  :pubkey="pk"
  :name="nick"
  :since="firstSeen"
  :online="isOnline"
  @cc-profile-rate="onRated"
  @cc-profile-close="close"
  @cc-profile-refresh="askPeers" />
```

```js
// tras montar, setear la propiedad JS `provider` (objeto, no atributo):
el.provider = createVaultProfileProvider({ identity, reputation })
```

> En Vue 3, configurá `isCustomElement: (tag) => tag.startsWith('dotrino-')`
> en `compilerOptions` del plugin de Vue.

## Uso (vanilla)

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@dotrino/profile@0.1/src/index.js"></script>
<dotrino-profile pubkey="..." name="Ada"></dotrino-profile>
<script type="module">
  const el = document.querySelector('dotrino-profile')
  el.provider = createVaultProfileProvider({ identity, reputation })
</script>
```

## API

### Atributos

| Atributo  | Descripción |
|-----------|-------------|
| `pubkey`  | JWK string del sujeto (requerido) |
| `name`    | nombre/nick a mostrar |
| `since`   | timestamp ms del primer contacto ("conocido desde") |
| `online`  | booleano: muestra el punto de en-línea |
| `mode`    | `edit` (default) \| `view` (solo lectura, sin editor ni footer) |
| `modal`   | booleano: envuelve en backdrop + header/footer |
| `heading` | título del header (override) |
| `lang`    | `es` \| `en` \| `auto` (default `auto`) |

### Propiedad JS

- `.provider: ProfileProvider` — adapter de datos. Métodos (todos opcionales):
  `getMyRating`, `getEndorsements`, `getCloudReputation`, `rate`.

### Métodos

- `el.reload()` — recarga los datos del provider.

### Eventos (bubbles, composed)

- `cc-profile-rate` — `detail { pubkey, indicators, notes }` (tras guardar OK).
- `cc-profile-close`.
- `cc-profile-refresh` — `detail { pubkey }` (botón ↻ del Web of Trust; la app
  puede difundir un `RATING_QUERY` a sus contactos).

## Amigos (0.21.0+)

Añadir amigos desde **cualquier app**, y que aparezcan en todas: la libreta es la de
`@dotrino/identity`. Salió del messenger (dueño, 2026-10-23: *«que los amigos no sean exclusivos
de messenger»*). Como la tarjeta, no abre conexiones propias: la app le pasa la identidad y el
cliente del transporte (`@dotrino/proxy-client` ≥ 0.44.0, con `requireSealed`).

```js
import { createFriends } from '@dotrino/profile/friends'   // sin DOM: también en Node
import '@dotrino/profile/friends-ui'                        // <dotrino-add-friend>, <dotrino-friend-requests>

const friends = createFriends({ identity, client, nickname: () => miApodo, inboxKey: 'mi-app:requests' })
// Lo que llega por el transporte pasa primero por aquí: autentica, descarta bloqueados y
// atiende las solicitudes. Lo que no es del protocolo vuelve con quién lo mandó.
client.on('message', async (from, payload, meta) => {
  const r = await friends.receive(from, payload, meta)
  if (r && !r.handled && r.who.contact) miApp(r.who, payload)
})

addEl.friends = friends          // tu código y su QR; teclear, pegar o escanear el del otro
inboxEl.friends = friends        // las que llegan (aceptar / descartar) y las que mandaste
await friends.send(pubkey, { type: 'HOLA' })   // a TODOS los aparatos de su cuenta
```

| Pieza | Qué hace |
|---|---|
| libreta (`friends.book`) | por cuenta: qué tarjeta de perfil vale (`ownCard`, `cardOf`), de qué cuenta es un aparato (`accountFromCard`), a qué aparatos se escribe (`recipientsOf`), bloqueados, fijos |
| bandeja (`friends.inbox`) | solicitudes en los dos sentidos, 24 h, por la clave que le des (una por cuenta) |
| protocolo | `CONTACT_REQUEST` / `CONTACT_ACCEPT`, sellados; quién escribió lo dice la llave que selló el sobre. Aceptar es de los dos; sin incidente si llegan varias |
| tu código | `friends.code` (6 caracteres del proxio, se renueva solo y tras usarse), `requestByCode(code)` |
| `hooks` | lo que es de tu app: `onRequest` (avisar), `onFriend` (ya sois amigos), `onMoved` (un amigo pasó de aparato a cuenta), `onProfile` (su versión), `isVouched` |

La versión nativa (Kotlin y Swift, con «Cerca» por Bluetooth y red local) vive en `dotrino-native`.

## Tema (CSS custom properties)

Todas con fallback a las vars del messenger (`--bg-1`, `--accent`, …) y luego a
un default. Override seteándolas en el elemento o un ancestro:

```css
dotrino-profile {
  --ccp-bg: #fff;
  --ccp-accent: #6c5ce7;
  --ccp-gold: #f1c40f;
  --ccp-affinity: #00b894;
  --ccp-radius: 12px;
}
```

`--ccp-bg`, `--ccp-bg-2..4`, `--ccp-border`, `--ccp-text`, `--ccp-muted`,
`--ccp-accent`, `--ccp-accent-2`, `--ccp-gold`, `--ccp-derived`, `--ccp-online`,
`--ccp-affinity`, `--ccp-radius`, `--ccp-font`, `--ccp-font-headline`,
`--ccp-font-mono`.

## Licencia

MIT
