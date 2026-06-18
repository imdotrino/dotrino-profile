/**
 * @dotrino/profile
 *
 * Web Component (custom element) `<dotrino-profile>` reutilizable por
 * CUALQUIER app del ecosistema Dotrino (Vue o vanilla). Muestra la tarjeta
 * de PERFIL + REPUTACIÓN de un peer, unificada para todas las apps:
 *   - Identidad: avatar (iniciales + color determinista por pubkey), nombre,
 *     pubkey corta, "conocido desde".
 *   - Mi calificación (modo edit): confianza + afinidad (estrellas) + notas.
 *   - Web of Trust: endosos firmados de mi red (lista + promedio).
 *   - Reputación de la red: `reputationOf` ponderada por mi web-of-trust
 *     (anti-sybil), con confianza/afinidad en %.
 *
 * Filosofía Dotrino: NO carga JS de terceros ni cookies. 100% autohosteado
 * (Shadow DOM). Los DATOS no se acoplan: la app inyecta un `provider` (adapter)
 * — usá `createVaultProfileProvider({ identity, reputation })` para cablearlo en
 * una línea a los paquetes estándar del ecosistema.
 *
 * TEMA: todo el color sale de CSS custom properties `--ccp-*` seteables en el
 * elemento (o heredadas). Defaults = paleta del messenger. Así cada app cambia
 * SOLO los colores; el layout/comportamiento es idéntico.
 *
 * Uso (Vue):
 *   import '@dotrino/profile'
 *   import { createVaultProfileProvider } from '@dotrino/profile'
 *   <dotrino-profile modal :pubkey="pk" :name="nick"
 *     @cc-profile-rate="onRated" @cc-profile-close="close" />
 *   // en mounted: el.provider = createVaultProfileProvider({ identity, reputation })
 *
 * API:
 *   Atributos:
 *     pubkey    JWK string del sujeto (requerido)
 *     name      nombre/nick a mostrar
 *     since     timestamp ms del primer contacto ("conocido desde")
 *     online    booleano: muestra el punto de en-línea
 *     mode      'edit' (default, calificar a un peer) | 'view' (solo lectura)
 *               | 'self' (TU perfil: nombre editable que se guarda en el vault,
 *                 sin calificación; conserva los paneles de reputación)
 *     modal     booleano: envuelve la tarjeta en backdrop + header/footer
 *     heading   título del header (override)
 *     lang      'es' | 'en' | 'auto' (default 'auto')
 *   Propiedad JS:
 *     .provider  adapter de datos (ver createVaultProfileProvider)
 *   Métodos:    el.reload()
 *   Eventos (bubbles, composed):
 *     'cc-profile-rate'    detail { pubkey, indicators, notes }  (tras guardar)
 *     'cc-profile-name'    detail { pubkey, name }  (mode="self", tras guardar tu nombre)
 *     'cc-profile-close'
 *     'cc-profile-refresh' detail { pubkey }  (botón ↻ del web-of-trust)
 */

const I18N = {
  es: {
    headingEdit: 'Calificar contacto',
    headingView: 'Perfil',
    contact: 'Contacto',
    knownSince: 'Conocido desde',
    confianza: 'Confianza',
    confianzaHint: '(¿qué tan confiable/íntegro es?)',
    afinidad: 'Afinidad',
    afinidadHint: '(me interesa / sigo / conozco)',
    of5: '/ 5',
    remove: 'Quitar',
    notes: 'Notas privadas (solo para ti)',
    notesPh: 'ej. Lo conocí jugando ajedrez. Cumple con su palabra.',
    wot: 'Lo que dicen otros (Web of Trust)',
    wotEmpty: 'Sin endosos firmados todavía.',
    endorsements: 'endosos',
    cloud: 'Reputación de la red',
    cloudAsking: 'Consultando…',
    cloudUnavailable: 'Registro no disponible.',
    cloudEmpty: 'Sin reputación en el registro todavía.',
    ofYourNet: 'de tu red',
    withReceipt: 'con recibo',
    weak1: 'reseña(s),',
    weak2: 'ninguna de tu red',
    weak3: '— señal débil.',
    privacy: '⌬ Tu rating se firma con tu clave privada, se comparte con peers de confianza y se publica en el registro de reputación.',
    cancel: 'Cancelar',
    save: 'Guardar calificación',
    saving: 'Guardando…',
    close: 'Cerrar',
    saveError: 'Error al guardar',
    headingSelf: 'Mi perfil',
    editName: 'Tu nombre visible',
    nickPh: 'Tu nombre',
    saveName: 'Guardar',
    nameSaved: '✓ Guardado',
    labels: ['Sin calificar', 'Sospechoso', 'Dudoso', 'Confiable', 'Muy confiable', 'De total confianza'],
  },
  en: {
    headingEdit: 'Rate contact',
    headingView: 'Profile',
    contact: 'Contact',
    knownSince: 'Known since',
    confianza: 'Trust',
    confianzaHint: '(how trustworthy/honest are they?)',
    afinidad: 'Affinity',
    afinidadHint: '(I follow / know / care)',
    of5: '/ 5',
    remove: 'Remove',
    notes: 'Private notes (for you only)',
    notesPh: 'e.g. Met them playing chess. Keeps their word.',
    wot: 'What others say (Web of Trust)',
    wotEmpty: 'No signed endorsements yet.',
    endorsements: 'endorsements',
    cloud: 'Network reputation',
    cloudAsking: 'Querying…',
    cloudUnavailable: 'Registry unavailable.',
    cloudEmpty: 'No reputation in the registry yet.',
    ofYourNet: 'from your network',
    withReceipt: 'with receipt',
    weak1: 'review(s),',
    weak2: 'none from your network',
    weak3: '— weak signal.',
    privacy: '⌬ Your rating is signed with your private key, shared with trusted peers and published to the reputation registry.',
    cancel: 'Cancel',
    save: 'Save rating',
    saving: 'Saving…',
    close: 'Close',
    saveError: 'Save error',
    headingSelf: 'My profile',
    editName: 'Your display name',
    nickPh: 'Your name',
    saveName: 'Save',
    nameSaved: '✓ Saved',
    labels: ['Unrated', 'Suspicious', 'Doubtful', 'Trustworthy', 'Very trustworthy', 'Fully trusted'],
  },
}

// Paleta determinista para el avatar (independiente del tema).
const AVATAR_PALETTE = [
  '#9c7a8c', '#c89738', '#5a8a3a', '#a37a45',
  '#6b8a9c', '#c0392b', '#7a6b5d', '#b8773d',
]

const STYLE = `
  :host {
    /* ----- Tema -----
     * API pública = --ccp-* (la app las setea por :root, selector o inline).
     * Tokens internos = --_* (los usa el componente). Cada uno resuelve:
     *   override --ccp-*  →  var de tema del messenger  →  literal.
     * NO declaramos --ccp-* acá (eso ganaría por especificidad al override de la
     * app); así un simple selector de la app (o en :root) funciona. */
    --_bg:        var(--ccp-bg, var(--bg-1, #faf3e7));
    --_bg-2:      var(--ccp-bg-2, var(--bg-2, #f5ede0));
    --_bg-3:      var(--ccp-bg-3, var(--bg-3, #ede2cf));
    --_bg-4:      var(--ccp-bg-4, var(--bg-4, #e0d3ba));
    --_border:    var(--ccp-border, var(--border, #d4c4a8));
    --_text:      var(--ccp-text, var(--text, #2b211a));
    --_muted:     var(--ccp-muted, var(--muted, #8a7a66));
    --_accent:    var(--ccp-accent, var(--accent, #c0392b));
    --_accent-2:  var(--ccp-accent-2, var(--accent-2, #a93226));
    /* Texto sobre el acento (botón primario). Default blanco; las apps con un
       acento claro (p. ej. lima) lo ponen oscuro vía --ccp-accent-text. */
    --_accent-text: var(--ccp-accent-text, #fff);
    --_gold:      var(--ccp-gold, var(--gold, #d4a72c));
    --_derived:   var(--ccp-derived, var(--derived, #a37a45));
    --_online:    var(--ccp-online, var(--online, #5a8a3a));
    --_affinity:  var(--ccp-affinity, var(--affinity, #2dd4bf));
    --_input-bg:  var(--ccp-input-bg, var(--input-bg, #fff));
    --_radius:    var(--ccp-radius, 16px);
    --_font:      var(--ccp-font, var(--font-body, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif));
    --_font-headline: var(--ccp-font-headline, var(--font-headline, var(--_font)));
    --_font-mono: var(--ccp-font-mono, var(--font-mono, ui-monospace, Menlo, Consolas, monospace));

    font-family: var(--_font);
    color: var(--_text);
  }
  * { box-sizing: border-box; }

  /* ----- Modal chrome (atributo "modal") ----- */
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
    z-index: 2147483000;
  }
  .modal {
    background: var(--_bg);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    width: 100%; max-width: 460px;
    max-height: 92vh;
    display: flex; flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
  }
  .head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 24px;
    border-bottom: 1px solid var(--_border);
  }
  .head h2 {
    margin: 0; font-family: var(--_font-headline);
    font-size: 18px; font-weight: 600; color: var(--_text);
  }
  .x {
    background: transparent; border: 0;
    font-size: 24px; cursor: pointer; color: var(--_muted);
    width: 32px; height: 32px; border-radius: 8px; line-height: 1;
  }
  .x:hover { background: var(--_bg-3); color: var(--_text); }

  .body { padding: 20px 24px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; }
  :host([modal]) .body { max-height: 70vh; }

  /* ----- Identity ----- */
  .identity {
    display: flex; gap: 14px; align-items: center;
    background: var(--_bg-2);
    border: 1px solid var(--_border);
    border-radius: 12px; padding: 14px;
  }
  .avatar-wrap { position: relative; flex-shrink: 0; }
  .avatar {
    width: 56px; height: 56px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-family: var(--_font-headline);
    font-weight: 600; font-size: 18px;
  }
  .online-dot {
    position: absolute; right: 0; bottom: 0;
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--_online); border: 2px solid var(--_bg-2);
  }
  .identity-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .name { font-family: var(--_font-headline); font-weight: 600; font-size: 17px; color: var(--_text); }
  /* ----- Editor de tu propio nombre (mode="self") ----- */
  .nick-edit { display: flex; flex-direction: column; gap: 6px; }
  .nick-label { font-size: 12px; color: var(--_muted); }
  .nick-row { display: flex; gap: 8px; align-items: center; }
  .nick-input {
    flex: 1; min-width: 0; font: inherit; font-size: 15px; color: var(--_text);
    background: var(--ccp-input-bg, #fff); border: 1px solid var(--_border); border-radius: 8px;
    padding: 8px 10px;
  }
  .nick-input:focus { outline: none; border-color: var(--_accent); }
  .nick-save { white-space: nowrap; }
  .nick-saved { font-size: 12px; color: var(--_online); }
  .pubkey {
    background: var(--_bg-3); padding: 2px 8px; border-radius: 6px;
    font-family: var(--_font-mono); font-size: 11.5px; color: var(--_muted);
    width: fit-content;
  }
  .since { font-size: 12px; color: var(--_muted); }
  .ind-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .ind-badge { font-size: 12px; font-weight: 700; color: var(--_accent); border: 1px solid var(--_accent); border-radius: 8px; padding: 2px 8px; white-space: nowrap; }

  /* ----- Sections ----- */
  .section { display: flex; flex-direction: column; gap: 6px; position: relative; }
  .section-label { font-size: 13px; font-weight: 500; color: var(--_muted); }
  .section-label small { font-weight: 400; }
  .stars-row { display: flex; gap: 6px; align-items: center; }
  .star-btn {
    background: transparent; border: 0; font-size: 36px;
    color: var(--_bg-4); cursor: pointer; padding: 0; line-height: 1;
    transition: color 100ms ease-out, transform 100ms ease-out;
  }
  .star-btn[disabled] { cursor: default; }
  .star-btn:not([disabled]):hover { transform: scale(1.1); }
  .star-btn.filled { color: var(--_gold); text-shadow: 0 1px 2px rgba(212, 167, 44, 0.35); }
  .star-btn.afin.filled { color: var(--_affinity); text-shadow: none; }

  .rating-meta { display: flex; gap: 8px; align-items: center; font-size: 14px; color: var(--_text); margin-top: 4px; }
  .rating-num { font-weight: 600; }
  .rating-label { color: var(--_muted); }
  .clear {
    background: transparent; border: 0; color: var(--_muted); cursor: pointer;
    font-size: 12px; margin-left: auto; text-decoration: underline;
  }
  .clear:hover { color: var(--_accent); }

  textarea {
    width: 100%; resize: vertical; font: inherit; color: var(--_text);
    background: var(--ccp-input-bg, #fff); border: 1px solid var(--_border); border-radius: 8px;
    padding: 8px 10px;
  }
  textarea:focus { outline: none; border-color: var(--_accent); }
  .counter { position: absolute; right: 8px; bottom: 8px; font-size: 11px; color: var(--_muted); background: var(--ccp-input-bg, #fff); padding: 0 4px; }

  /* ----- Web of Trust + Cloud ----- */
  .panel { background: var(--_bg-3); border-radius: 12px; padding: 14px; }
  .panel + .panel { margin-top: 12px; }
  .panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .panel-title { font-size: 12px; font-weight: 600; color: var(--_text); text-transform: uppercase; letter-spacing: 0.05em; }
  .refresh { background: transparent; border: 0; color: var(--_muted); cursor: pointer; font-size: 16px; width: 24px; height: 24px; border-radius: 6px; }
  .refresh:hover { background: var(--_bg-4); color: var(--_text); }
  .empty { font-size: 13px; color: var(--_muted); font-style: italic; }
  .weak { font-size: 13px; color: var(--_muted); }
  .summary { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .summary:last-child { margin-bottom: 0; }
  .stars { font-size: 16px; letter-spacing: 1px; }
  .stars.derived { color: var(--_derived); }
  .stars.afin { color: var(--_affinity); }
  .num { font-family: var(--_font-headline); font-weight: 600; font-size: 14px; color: var(--_text); }
  .count { font-size: 12px; color: var(--_muted); }
  .ind { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--_muted); min-width: 64px; }

  .endorsements { list-style: none; padding: 0; margin: 0; max-height: 130px; overflow-y: auto; }
  .endorsements li {
    display: flex; gap: 8px; align-items: center; font-size: 12.5px;
    padding: 6px 0; border-bottom: 1px solid var(--_border);
  }
  .endorsements li:last-child { border-bottom: 0; }
  .endorsements .key { background: var(--_bg-2); padding: 1px 6px; border-radius: 4px; font-family: var(--_font-mono); font-size: 11px; color: var(--_muted); }
  .endorsements .r { color: var(--_derived); }
  .endorsements .when { color: var(--_muted); margin-left: auto; font-size: 11px; }

  .privacy { margin: 0; font-size: 12px; color: var(--_muted); text-align: center; line-height: 1.5; }
  .error { margin: 0; font-size: 13px; color: var(--_accent); font-weight: 500; }

  /* ----- Footer ----- */
  .foot { display: flex; gap: 10px; justify-content: flex-end; padding: 14px 24px; background: var(--_bg-2); border-top: 1px solid var(--_border); }
  .btn { font: inherit; font-weight: 600; padding: 9px 16px; border-radius: 10px; border: 1px solid transparent; cursor: pointer; }
  .btn.primary { background: var(--_accent); color: var(--_accent-text); }
  .btn.primary:hover:not(:disabled) { background: var(--_accent-2); }
  .btn.primary:disabled { opacity: 0.6; cursor: default; }
  .btn.secondary { background: transparent; color: var(--_text); border-color: var(--_border); }
  .btn.secondary:hover { background: var(--_bg-3); }
`

class DotrinoProfile extends HTMLElement {
  static get observedAttributes() {
    return ['pubkey', 'name', 'since', 'online', 'mode', 'modal', 'heading', 'lang', 'indicators']
  }

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this._provider = null
    this._my = { confianza: 0, afinidad: 0, notes: '' }
    this._endorsements = []
    this._derived = null
    this._indicators = [] // indicadores derivados a mostrar (p. ej. ELO por juego)
    this._cloud = null
    this._cloudLoading = true
    this._hover = 0
    this._hoverAfin = 0
    this._saving = false
    this._error = ''
    this._savingName = false
    this._nameSaved = false
    this._nameErr = ''
    this._loadToken = 0
    this._onKeydown = this._onKeydown.bind(this)
  }

  set provider(p) { this._provider = p; if (this.isConnected) this.reload() }
  get provider() { return this._provider }

  connectedCallback() {
    document.addEventListener('keydown', this._onKeydown)
    this._render()
    this.reload()
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._onKeydown)
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV) return
    if (name === 'pubkey') { this._resetState(); this.reload(); return }
    if (name === 'indicators') { this._indicators = []; this.reload(); return }
    if (this.shadowRoot.childElementCount) this._render()
  }

  // Indicadores derivados a mostrar (atributo `indicators`), p. ej.
  // "elo:cuarenta" o "elo:chess,elo:cuarenta". Formato: nombre[:scope], coma.
  get _indicatorSpecs() {
    return (this.getAttribute('indicators') || '').split(',').map(s => s.trim()).filter(Boolean)
      .map(s => { const [iName, scope] = s.split(':'); return { name: iName, scope: scope || undefined } })
  }

  _onKeydown(e) {
    if (e.key === 'Escape' && this.hasAttribute('modal')) this._close()
  }

  /* ---- idioma ---- */
  get _lang() {
    const attr = (this.getAttribute('lang') || 'auto').toLowerCase()
    if (attr === 'es' || attr === 'en') return attr
    const doc = (document.documentElement.lang || '').toLowerCase()
    const nav = (navigator.language || '').toLowerCase()
    return (doc || nav).startsWith('en') ? 'en' : 'es'
  }
  get _t() { return I18N[this._lang] }
  get _pubkey() { return this.getAttribute('pubkey') || '' }
  get _mode() { return (this.getAttribute('mode') || 'edit').toLowerCase() }
  // Editor de calificación (confianza/afinidad/notas): solo en 'edit'.
  get _editable() { return this._mode === 'edit' }
  // 'self' = tu propio perfil: nombre editable (se escribe al vault), sin
  // calificación (no te calificas a ti mismo).
  get _self() { return this._mode === 'self' }

  _resetState() {
    this._my = { confianza: 0, afinidad: 0, notes: '' }
    this._endorsements = []
    this._derived = null
    this._indicators = []
    this._cloud = null
    this._cloudLoading = true
    this._hover = 0
    this._hoverAfin = 0
    this._error = ''
    this._nameSaved = false
    this._nameErr = ''
  }

  /* ---- carga de datos vía provider ---- */
  async reload() {
    const pk = this._pubkey
    const p = this._provider
    if (!pk || !p) { this._render(); return }
    const token = ++this._loadToken
    this._cloudLoading = true
    this._render()

    // Mi calificación + endosos locales (rápido) en paralelo con la nube (lento).
    try {
      if (typeof p.getMyRating === 'function') {
        const my = await p.getMyRating(pk)
        if (token !== this._loadToken) return
        if (my) this._my = { confianza: my.confianza || 0, afinidad: my.afinidad || 0, notes: my.notes || '' }
      }
    } catch (_) { /* best-effort */ }
    try {
      if (typeof p.getEndorsements === 'function') {
        const e = await p.getEndorsements(pk)
        if (token !== this._loadToken) return
        this._endorsements = (e && e.endorsements) || []
        this._derived = e ? e.derived : null
      }
    } catch (_) { /* best-effort */ }
    // Indicadores derivados (p. ej. ELO por juego), vía provider.getDerived.
    try {
      const specs = this._indicatorSpecs
      if (specs.length && typeof p.getDerived === 'function') {
        const vals = await Promise.all(specs.map(async s => {
          try { const d = await p.getDerived(pk, s.name, s.scope); return d ? { ...s, value: (d.value != null ? d.value : d.elo), count: (d.count != null ? d.count : d.games) } : null } catch (_) { return null }
        }))
        if (token !== this._loadToken) return
        this._indicators = vals.filter(v => v && v.value != null)
      }
    } catch (_) { /* best-effort */ }
    if (token === this._loadToken) this._render()

    try {
      const cloud = typeof p.getCloudReputation === 'function' ? await p.getCloudReputation(pk) : null
      if (token !== this._loadToken) return
      this._cloud = cloud
    } catch (_) { this._cloud = null } finally {
      if (token === this._loadToken) { this._cloudLoading = false; this._render() }
    }
  }

  async _save() {
    if (!this._editable || this._saving) return
    const p = this._provider
    const pk = this._pubkey
    if (!p || typeof p.rate !== 'function' || !pk) return
    this._error = ''
    this._saving = true
    this._render()
    const indicators = { confianza: this._my.confianza }
    if (this._my.afinidad > 0) indicators.afinidad = this._my.afinidad
    try {
      await p.rate(pk, indicators, this._my.notes)
      this._saving = false
      this._emit('cc-profile-rate', { pubkey: pk, indicators, notes: this._my.notes })
      if (this.hasAttribute('modal')) this._close()
      else this._render()
    } catch (e) {
      this._saving = false
      this._error = (e && e.message) || this._t.saveError
      this._render()
    }
  }

  // Guarda tu nombre visible (mode="self") en el vault vía provider.setMyName.
  async _saveName() {
    if (this._savingName) return
    const p = this._provider
    const input = this.shadowRoot.querySelector('.nick-input')
    if (!input || !p || typeof p.setMyName !== 'function') return
    const name = (input.value || '').trim()
    if (!name) return
    if (name === (this.getAttribute('name') || '')) { this._nameSaved = true; this._render(); return }
    this._savingName = true
    this._nameErr = ''
    this._render()
    try {
      await p.setMyName(name)
      this._savingName = false
      this._nameSaved = true
      this._emit('cc-profile-name', { pubkey: this._pubkey, name })
      this.setAttribute('name', name) // refleja el nombre nuevo (re-render por attributeChangedCallback)
      this._render()
    } catch (e) {
      this._savingName = false
      this._nameErr = (e && e.message) || this._t.saveError
      this._render()
    }
  }

  _close() { this._emit('cc-profile-close', { pubkey: this._pubkey }) }
  _refresh() { this._emit('cc-profile-refresh', { pubkey: this._pubkey }); this.reload() }
  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true })) }

  /* ---- helpers de presentación ---- */
  _initials(s) {
    return (s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?'
  }
  _avatarBg(key) {
    const s = key || ''
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
    return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
  }
  _stars(n) {
    const v = Math.max(0, Math.min(5, Math.round(n || 0)))
    return '★'.repeat(v) + '☆'.repeat(5 - v)
  }
  _fmtDate(ts) {
    if (!ts) return ''
    try { return new Date(Number(ts)).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return '' }
  }
  _shortKey(k) {
    k = k || ''
    return k.length > 20 ? k.slice(0, 12) + '…' + k.slice(-4) : k
  }
  _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ))
  }

  _starsRow(kind, filled, hover) {
    const active = hover || filled
    const cls = kind === 'afin' ? 'star-btn afin' : 'star-btn'
    const dis = this._editable ? '' : 'disabled'
    let out = `<div class="stars-row" data-row="${kind}">`
    for (let n = 1; n <= 5; n++) {
      out += `<button type="button" class="${cls}${n <= active ? ' filled' : ''}" data-star="${kind}" data-n="${n}" ${dis}>★</button>`
    }
    return out + '</div>'
  }

  _render() {
    const t = this._t
    const sr = this.shadowRoot
    const isModal = this.hasAttribute('modal')
    const editable = this._editable
    const pk = this._pubkey
    const name = this.getAttribute('name') || t.contact
    const since = this.getAttribute('since')
    const online = this.hasAttribute('online') && this.getAttribute('online') !== 'false'
    const heading = this.getAttribute('heading') || (this._self ? t.headingSelf : editable ? t.headingEdit : t.headingView)

    const confLabel = t.labels[this._hover || this._my.confianza] || t.labels[0]

    // ----- Identidad -----
    let body = `
      <div class="identity">
        <div class="avatar-wrap">
          <div class="avatar" style="background:${this._avatarBg(pk)}">${this._esc(this._initials(name))}</div>
          ${online ? '<span class="online-dot"></span>' : ''}
        </div>
        <div class="identity-text">
          ${this._self ? `
          <label class="nick-edit">
            <span class="nick-label">${this._esc(t.editName)}</span>
            <div class="nick-row">
              <input class="nick-input" type="text" maxlength="40" value="${this._esc(name === t.contact ? '' : name)}" placeholder="${this._esc(t.nickPh)}" />
              <button type="button" class="btn primary nick-save" data-savename ${this._savingName ? 'disabled' : ''}>${this._esc(this._savingName ? t.saving : t.saveName)}</button>
            </div>
            ${this._nameSaved ? `<span class="nick-saved">${this._esc(t.nameSaved)}</span>` : ''}
            ${this._nameErr ? `<span class="error">${this._esc(this._nameErr)}</span>` : ''}
          </label>` : `<div class="name">${this._esc(name)}</div>`}
          <code class="pubkey">${this._esc(this._shortKey(pk))}</code>
          ${since ? `<div class="since">${this._esc(t.knownSince)} ${this._esc(this._fmtDate(since))}</div>` : ''}
          ${this._indicators.length ? `<div class="ind-badges">${this._indicators.map(i => {
            const label = this._esc((i.name || '').toUpperCase())
            const tip = label + (i.scope ? ' · ' + this._esc(i.scope) : '') + (i.count != null ? ' · ' + i.count : '')
            return `<span class="ind-badge" title="${tip}">${label} ${this._esc(String(i.value))}</span>`
          }).join('')}</div>` : ''}
        </div>
      </div>`

    // ----- Editor (confianza / afinidad / notas) -----
    if (editable) {
      body += `
      <div class="section">
        <span class="section-label">${this._esc(t.confianza)} <small>${this._esc(t.confianzaHint)}</small></span>
        ${this._starsRow('conf', this._my.confianza, this._hover)}
        <div class="rating-meta">
          <span class="rating-num">${this._hover || this._my.confianza || 0} ${t.of5}</span>
          <span class="rating-label">— ${this._esc(confLabel)}</span>
          ${this._my.confianza > 0 ? `<button class="clear" data-clear="conf">${this._esc(t.remove)}</button>` : ''}
        </div>
      </div>
      <div class="section">
        <span class="section-label">${this._esc(t.afinidad)} <small>${this._esc(t.afinidadHint)}</small></span>
        ${this._starsRow('afin', this._my.afinidad, this._hoverAfin)}
        <div class="rating-meta">
          <span class="rating-num">${this._hoverAfin || this._my.afinidad || 0} ${t.of5}</span>
          ${this._my.afinidad > 0 ? `<button class="clear" data-clear="afin">${this._esc(t.remove)}</button>` : ''}
        </div>
      </div>
      <label class="section">
        <span class="section-label">${this._esc(t.notes)}</span>
        <textarea rows="3" maxlength="500" placeholder="${this._esc(t.notesPh)}">${this._esc(this._my.notes)}</textarea>
        <span class="counter">${(this._my.notes || '').length} / 500</span>
      </label>`
    }

    // ----- Web of Trust (endosos locales) -----
    let wot = ''
    if (this._endorsements.length === 0) {
      wot = `<div class="empty">${this._esc(t.wotEmpty)}</div>`
    } else {
      const rows = this._endorsements.slice(0, 5).map(e => `
        <li>
          <code class="key">${this._esc((e.ratedBy || '').slice(0, 12))}…</code>
          <span class="r">${this._stars(e.rating)}</span>
          <span class="when">${this._esc(this._fmtDate(e.issuedAt))}</span>
        </li>`).join('')
      wot = `
        <div class="summary">
          <span class="stars derived">${this._stars(this._derived)}</span>
          <span class="num">${this._derived != null ? this._derived.toFixed(1) : '—'}</span>
          <span class="count">(${this._endorsements.length} ${this._esc(t.endorsements)})</span>
        </div>
        <ul class="endorsements">${rows}</ul>`
    }
    body += `
      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">${this._esc(t.wot)}</span>
          <button class="refresh" data-refresh title="↻">↻</button>
        </div>
        ${wot}
      </div>`

    // ----- Reputación de la red -----
    let cloud
    if (this._cloudLoading) {
      cloud = `<div class="empty">${this._esc(t.cloudAsking)}</div>`
    } else if (this._cloud) {
      const c = this._cloud
      const afin = c.indicators && c.indicators.afinidad
      let parts = ''
      if (c.score != null) {
        const pct = Math.round(c.score * 100)
        const receipt = c.txBoundCount ? ` · ${c.txBoundCount} ${this._esc(t.withReceipt)}` : ''
        parts += `
          <div class="summary">
            <span class="ind">${this._esc(t.confianza)}</span>
            <span class="stars derived">${this._stars(c.score * 5)}</span>
            <span class="num">${pct}%</span>
            <span class="count">${c.trustedCount} ${this._esc(t.ofYourNet)}${receipt}</span>
          </div>`
      }
      if (afin && afin.score != null) {
        parts += `
          <div class="summary">
            <span class="ind">${this._esc(t.afinidad)}</span>
            <span class="stars afin">${this._stars(afin.score * 5)}</span>
            <span class="num">${Math.round(afin.score * 100)}%</span>
            <span class="count">${afin.trustedCount} ${this._esc(t.ofYourNet)}</span>
          </div>`
      }
      if (c.score == null && c.rawCount > 0) {
        parts = `<div class="weak">${c.rawCount} ${this._esc(t.weak1)} <strong>${this._esc(t.weak2)}</strong> ${this._esc(t.weak3)}</div>`
      } else if (c.score == null && (!c.rawCount)) {
        parts = `<div class="empty">${this._esc(t.cloudEmpty)}</div>`
      }
      cloud = parts
    } else {
      cloud = `<div class="empty">${this._esc(t.cloudUnavailable)}</div>`
    }
    body += `
      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">${this._esc(t.cloud)}</span>
          <button class="refresh" data-reload title="↻">↻</button>
        </div>
        ${cloud}
      </div>`

    if (editable) body += `<p class="privacy">${this._esc(t.privacy)}</p>`
    if (this._error) body += `<p class="error">${this._esc(this._error)}</p>`

    // ----- Ensamblado (modal o inline) -----
    const footer = editable ? `
      <footer class="foot">
        ${isModal ? `<button class="btn secondary" data-cancel>${this._esc(t.cancel)}</button>` : ''}
        <button class="btn primary" data-save ${this._saving ? 'disabled' : ''}>${this._esc(this._saving ? t.saving : t.save)}</button>
      </footer>` : ''

    let html = `<style>${STYLE}</style>`
    if (isModal) {
      html += `
        <div class="backdrop" data-backdrop>
          <div class="modal" role="dialog" aria-modal="true">
            <header class="head">
              <h2>${this._esc(heading)}</h2>
              <button class="x" data-cancel aria-label="${this._esc(t.close)}">×</button>
            </header>
            <div class="body">${body}</div>
            ${footer}
          </div>
        </div>`
    } else {
      html += `<div class="body">${body}</div>${footer}`
    }
    sr.innerHTML = html
    this._wire()
  }

  _wire() {
    const sr = this.shadowRoot
    const q = (s) => sr.querySelector(s)
    const qa = (s) => sr.querySelectorAll(s)

    const backdrop = q('[data-backdrop]')
    if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) this._close() })
    qa('[data-cancel]').forEach(b => b.addEventListener('click', () => this._close()))
    const save = q('[data-save]'); if (save) save.addEventListener('click', () => this._save())
    const refresh = q('[data-refresh]'); if (refresh) refresh.addEventListener('click', () => this._refresh())
    const reload = q('[data-reload]'); if (reload) reload.addEventListener('click', () => this.reload())

    if (this._self) {
      const savename = q('[data-savename]'); if (savename) savename.addEventListener('click', () => this._saveName())
      const nickInput = q('.nick-input')
      if (nickInput) {
        nickInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this._saveName() } })
        nickInput.addEventListener('input', () => { this._nameSaved = false; this._nameErr = '' })
      }
    }

    if (this._editable) {
      qa('[data-star]').forEach(btn => {
        const kind = btn.getAttribute('data-star')
        const n = Number(btn.getAttribute('data-n'))
        btn.addEventListener('click', () => {
          if (kind === 'conf') this._my.confianza = n; else this._my.afinidad = n
          this._render()
        })
        btn.addEventListener('mouseenter', () => {
          if (kind === 'conf') this._hover = n; else this._hoverAfin = n
          this._render()
        })
      })
      qa('[data-row]').forEach(row => {
        const kind = row.getAttribute('data-row')
        row.addEventListener('mouseleave', () => {
          if (kind === 'conf') this._hover = 0; else this._hoverAfin = 0
          this._render()
        })
      })
      qa('[data-clear]').forEach(btn => {
        const kind = btn.getAttribute('data-clear')
        btn.addEventListener('click', () => {
          if (kind === 'conf') this._my.confianza = 0; else this._my.afinidad = 0
          this._render()
        })
      })
      const ta = q('textarea')
      if (ta) {
        // Mantener foco/cursor entre re-renders: actualizamos estado sin re-render.
        ta.addEventListener('input', (e) => {
          this._my.notes = e.target.value
          const counter = q('.counter')
          if (counter) counter.textContent = `${this._my.notes.length} / 500`
        })
      }
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('dotrino-profile')) {
  customElements.define('dotrino-profile', DotrinoProfile)
}

/**
 * Cablea un `provider` para `<dotrino-profile>` a los paquetes estándar del
 * ecosistema (duck-typing, sin dependencia dura). Integración de 1 línea.
 *
 * @param {object} cfg
 * @param {object} cfg.identity    instancia conectada de dotrino-identity
 *                                 (usa `me.publickey`, `getRatingsForSubject(pk)`).
 * @param {object} cfg.reputation  instancia de createVaultReputation(identity)
 *                                 (usa `getRatings`, `reputationOf`, `rate`).
 * @returns {object} provider
 */
export function createVaultProfileProvider({ identity, reputation } = {}) {
  if (!reputation) throw new Error('dotrino-profile: se requiere `reputation` (createVaultReputation)')
  const myPubkey = () => (identity && identity.me && identity.me.publickey) || null

  return {
    async getMyRating(pubkey) {
      let confianza = 0; let afinidad = 0; let notes = ''
      try {
        if (identity && typeof identity.getRatingsForSubject === 'function') {
          const r = await identity.getRatingsForSubject(pubkey)
          if (r && r.mine) {
            if (typeof r.mine.rating === 'number') confianza = r.mine.rating
            if (r.mine.notes) notes = r.mine.notes
          }
        }
      } catch (_) { /* best-effort */ }
      try {
        if (typeof reputation.getRatings === 'function') {
          const { attestations } = await reputation.getRatings(pubkey)
          const me = myPubkey()
          const mine = (attestations || []).find(a => a && a.issuer === me)
          if (mine && mine.indicators && typeof mine.indicators.afinidad === 'number') afinidad = mine.indicators.afinidad
        }
      } catch (_) { /* best-effort */ }
      return { confianza, afinidad, notes }
    },

    async getEndorsements(pubkey) {
      try {
        if (identity && typeof identity.getRatingsForSubject === 'function') {
          const r = await identity.getRatingsForSubject(pubkey)
          const endorsements = (r && r.endorsements) || []
          const vals = endorsements.map(e => e && e.rating).filter(n => typeof n === 'number')
          const derived = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
          return { endorsements, derived }
        }
      } catch (_) { /* best-effort */ }
      return { endorsements: [], derived: null }
    },

    async getCloudReputation(pubkey) {
      try { return await reputation.reputationOf(pubkey) } catch (_) { return null }
    },

    // Indicador derivado (p. ej. ELO por juego) para el atributo `indicators`.
    // Devuelve { value, count } o null. Usa eloOf si el indicador es 'elo'.
    async getDerived(pubkey, name, scope) {
      try {
        if (name === 'elo' && typeof reputation.eloOf === 'function') {
          const e = await reputation.eloOf(pubkey, scope)
          return e ? { value: e.elo, count: e.games } : null
        }
        if (reputation.client && typeof reputation.client.getDerived === 'function') {
          return await reputation.client.getDerived(pubkey, name, scope)
        }
      } catch (_) {}
      return null
    },

    async rate(pubkey, indicators, notes) {
      return reputation.rate(pubkey, indicators, { notes })
    },

    // --- Tu propia identidad (para mode="self") ---
    myPubkey,
    getMyName() { return (identity && identity.me && identity.me.nickname) || null },
    async setMyName(name) {
      if (!identity || typeof identity.setMyNickname !== 'function') {
        throw new Error('dotrino-profile: identity.setMyNickname no disponible')
      }
      return identity.setMyNickname(name)
    },
  }
}

export default DotrinoProfile
