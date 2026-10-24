// <dotrino-add-friend>: AÑADIR UN AMIGO desde cualquier app. Dos pestañas: «Por código» (teclear,
// pegar o escanear el QR del otro) y «Mi código» (el tuyo, con su QR). Con `.peer` (un enlace
// `#to=`) ya se sabe a quién y solo queda el apodo. La solicitud la manda `.friends`
// (`createFriends`); el componente no guarda nada. Shadow DOM, tokens del tema (`--dt-*`), es/en.
//
//   <dotrino-add-friend lang="es"></dotrino-add-friend>
//   el.friends = friends                    // createFriends({ identity, client, nickname })
//   el.addEventListener('dotrino-friend-requested', (e) => cerrar())   // detail: { pubkey }
//   el.addEventListener('dotrino-friend-cancel', () => cerrar())
//
// Atributos: `lang`, `tab` ('add' | 'mine'), `code` (un código que llegó con `#add=`),
// `link-base` (la página a la que lleva el QR; por defecto, esta).
import '@dotrino/qr'
import { TEXTS, langOf, escapeHtml } from './i18n.js'
import { CODE_RE, normalizeCode, codeFromText } from './friends.js'

const STYLE = `
:host { display: block; font-family: var(--dt-font, inherit); color: var(--dt-text, inherit); }
* { box-sizing: border-box; }
.tabs { display: flex; gap: 4px; background: var(--dt-surface-2, rgba(0,0,0,.05)); padding: 4px; border-radius: 999px; margin-bottom: 18px; }
.tab { flex: 1; background: transparent; border: 0; padding: 9px 14px; font: inherit; font-size: 13.5px; font-weight: 500; color: var(--dt-muted, #666); cursor: pointer; border-radius: 999px; }
.tab[aria-selected="true"] { background: var(--dt-surface, #fff); color: var(--dt-text, inherit); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.pane { display: flex; flex-direction: column; gap: 14px; }
.info { margin: 0; font-size: 13px; line-height: 1.5; color: var(--dt-muted, #666); background: var(--dt-surface-2, rgba(0,0,0,.04)); border: 1px solid var(--dt-border, rgba(0,0,0,.1)); border-radius: var(--dt-radius, 12px); padding: 12px 14px; }
label { display: block; font-size: 13px; font-weight: 500; color: var(--dt-muted, #666); }
label span { display: block; margin-bottom: 6px; }
input { width: 100%; font: inherit; font-size: 15px; padding: 10px 12px; border-radius: var(--dt-radius-sm, 10px); border: 1px solid var(--dt-border, rgba(0,0,0,.2)); background: var(--dt-surface, #fff); color: var(--dt-text, inherit); }
.code { font-family: ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; }
.row { display: flex; gap: 8px; }
.row input { flex: 1; }
button.btn { font: inherit; font-size: 14px; font-weight: 600; padding: 10px 16px; border-radius: 999px; border: 0; cursor: pointer; background: var(--dt-accent, #00658c); color: var(--dt-on-accent, #fff); }
button.btn.secondary { background: var(--dt-surface-2, rgba(0,0,0,.06)); color: var(--dt-text, inherit); border: 1px solid var(--dt-border, rgba(0,0,0,.12)); }
button.btn:disabled { opacity: .55; cursor: default; }
.mine { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.mine code { font-size: 26px; font-weight: 700; letter-spacing: .18em; }
.qr { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.hint { margin: 0; font-size: 12.5px; color: var(--dt-muted, #666); }
.error { margin: 0; font-size: 13px; color: var(--dt-danger, #b3261e); }
.foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
`

export class DotrinoAddFriend extends HTMLElement {
  static get observedAttributes () { return ['lang', 'tab', 'code'] }

  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._friends = null
    this._peer = null
    this._tab = 'add'
    this._code = ''
    this._alias = ''
    this._error = ''
    this._sending = false
    this._scan = false
    this._off = null
  }

  set friends (f) {
    this._off?.()
    this._friends = f
    this._off = f?.onChange?.(() => this._renderMine()) || null
    if (f && !f.code) f.refreshCode?.()
    this._render()
  }
  get friends () { return this._friends }

  /** `{ pubkey, nickname?, card? }`: a quién (un enlace `#to=`). */
  set peer (p) { this._peer = p || null; if (p?.nickname && !this._alias) this._alias = p.nickname; this._render() }
  get peer () { return this._peer }

  connectedCallback () {
    this._tab = this.getAttribute('tab') === 'mine' ? 'mine' : 'add'
    if (this.getAttribute('code')) this._code = this.getAttribute('code')
    this._render()
  }
  disconnectedCallback () { this._off?.(); this._off = null }
  attributeChangedCallback (name, _o, v) {
    if (name === 'tab') this._tab = v === 'mine' ? 'mine' : 'add'
    if (name === 'code' && v) this._code = v
    if (this.isConnected) this._render()
  }

  get _t () { return TEXTS[langOf(this)] }

  _link () {
    const c = this._friends?.code
    if (!c) return ''
    try { return new URL('#add=' + c, this.getAttribute('link-base') || location.href).toString() } catch (_) { return '' }
  }

  _render () {
    const t = this._t
    const tabs = this._peer ? '' : `
      <div class="tabs" role="tablist">
        <button class="tab" role="tab" data-tab="add" aria-selected="${this._tab === 'add'}">${t.tabAdd}</button>
        <button class="tab" role="tab" data-tab="mine" data-testid="share-my-token-tab" aria-selected="${this._tab === 'mine'}">${t.tabMine}</button>
      </div>`
    let pane
    if (this._peer) {
      const nick = escapeHtml(this._peer.nickname || t.toNoNick)
      pane = `
        <p class="info" data-testid="to-info">${t.toInfo.replace('{nick}', nick)}</p>
        <label><span>${t.fieldAlias}</span><input id="alias" maxlength="40" placeholder="${escapeHtml(t.phAlias)}" value="${escapeHtml(this._alias)}"></label>`
    } else if (this._tab === 'add') {
      pane = `
        <p class="info">${t.info}</p>
        <label><span>${t.fieldCode}</span>
          <div class="row">
            <input id="code" class="code" data-testid="code-input" maxlength="8" autocomplete="off" placeholder="${escapeHtml(t.phCode)}" value="${escapeHtml(this._code)}">
            <button class="btn secondary" id="paste" title="${t.paste}">${t.paste}</button>
          </div>
        </label>
        <button class="btn secondary" id="scan" data-testid="scan-qr">${t.scan}</button>
        <label><span>${t.fieldAlias}</span><input id="alias" maxlength="40" placeholder="${escapeHtml(t.phAlias)}" value="${escapeHtml(this._alias)}"></label>`
    } else {
      pane = `
        <p class="info">${t.mineInfo}</p>
        <div class="mine"><code data-testid="my-pairing-code" id="mycode"></code><button class="btn secondary" id="copy">${t.copy}</button></div>
        <div class="qr" id="qr"></div>`
    }
    const adding = this._peer || this._tab === 'add'
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      ${tabs}
      <div class="pane">${pane}
        ${this._error && adding ? `<p class="error" role="alert">${escapeHtml(this._error)}</p>` : ''}
        ${adding ? `<p class="hint">${t.hint}</p>` : ''}
      </div>
      <div class="foot">
        <button class="btn secondary" id="cancel">${t.cancel}</button>
        ${adding
          ? `<button class="btn" id="send" data-testid="send-hello" ${this._sending ? 'disabled' : ''}>${this._sending ? t.sending : t.send}</button>`
          : `<button class="btn" id="done">${t.done}</button>`}
      </div>
      <dotrino-qr-scan lang="${langOf(this)}"></dotrino-qr-scan>`
    this._wire()
    this._renderMine()
  }

  /** El código propio y su QR, que cambian solos (se renueva) sin rehacer la pestaña. */
  _renderMine () {
    const box = this.shadowRoot.getElementById('mycode')
    if (!box) return
    box.textContent = this._friends?.code || '…'
    this.shadowRoot.getElementById('copy').disabled = !this._friends?.code
    const qr = this.shadowRoot.getElementById('qr')
    const link = this._link()
    if (!link) { qr.innerHTML = ''; return }
    let el = qr.querySelector('dotrino-qr')
    if (!el) {
      qr.innerHTML = `<dotrino-qr size="190" data-testid="my-qr"></dotrino-qr><p class="hint">${this._t.qrHint}</p>`
      el = qr.querySelector('dotrino-qr')
    }
    el.value = link
  }

  _wire () {
    const $ = (id) => this.shadowRoot.getElementById(id)
    this.shadowRoot.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
      this._tab = b.dataset.tab; this._error = ''; this._render()
    }))
    $('code')?.addEventListener('input', (e) => { this._code = e.target.value })
    $('code')?.addEventListener('keyup', (e) => { if (e.key === 'Enter') this._submit() })
    $('alias')?.addEventListener('input', (e) => { this._alias = e.target.value })
    $('paste')?.addEventListener('click', async () => {
      try { const v = await navigator.clipboard.readText(); if (v) { this._code = v; this._render() } } catch (_) {}
    })
    $('copy')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(this._friends?.code || '') } catch (_) {}
    })
    $('cancel').addEventListener('click', () => this.dispatchEvent(new CustomEvent('dotrino-friend-cancel', { bubbles: true, composed: true })))
    $('done')?.addEventListener('click', () => this.dispatchEvent(new CustomEvent('dotrino-friend-cancel', { bubbles: true, composed: true })))
    $('send')?.addEventListener('click', () => this._submit())
    const scanner = this.shadowRoot.querySelector('dotrino-qr-scan')
    $('scan')?.addEventListener('click', () => { scanner.open = true })
    scanner.addEventListener('dotrino-qr-cancelled', () => { scanner.open = false })
    scanner.addEventListener('dotrino-qr-scanned', (e) => {
      scanner.open = false
      const c = codeFromText(e.detail?.text)
      if (!CODE_RE.test(c)) { this._error = this._t.errNoCode; this._render(); return }
      this._code = c
      this._submit()
    })
  }

  async _submit () {
    const f = this._friends
    if (!f || this._sending) return
    const t = this._t
    this._error = ''
    const alias = (this._alias || '').trim()
    if (!this._peer && !CODE_RE.test(normalizeCode(this._code))) { this._error = t.errInvalid; this._render(); return }
    this._sending = true
    this._render()
    let pubkey = null
    try {
      if (this._peer) { pubkey = this._peer.pubkey; await f.request({ pubkey, alias, card: this._peer.card || null }) } else {
        await f.requestByCode(this._code, alias)
      }
      this._sending = false
      this._render()
      this.dispatchEvent(new CustomEvent('dotrino-friend-requested', { bubbles: true, composed: true, detail: { pubkey } }))
    } catch (e) {
      console.warn('[dotrino-add-friend] request failed', e?.code || '', e?.message)
      this._error = { invalid: t.errInvalid, own: t.errOwn, offline: t.errOffline }[e?.code] || t.errSend
      this._sending = false
      this._render()
    }
  }
}

if (!customElements.get('dotrino-add-friend')) customElements.define('dotrino-add-friend', DotrinoAddFriend)
