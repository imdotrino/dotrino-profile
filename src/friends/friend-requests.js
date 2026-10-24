// <dotrino-friend-requests>: LA BANDEJA de solicitudes de amistad. Las que te llegan (las
// avaladas por tu red arriba, luego los desconocidos) con aceptar y descartar, y las que mandaste,
// esperando, con cancelar. Lee y actúa sobre `.friends` (`createFriends`). Shadow DOM, es/en.
//
//   <dotrino-friend-requests lang="es"></dotrino-friend-requests>
//   el.friends = friends
//
// Atributo `hide-empty`: sin solicitudes no pinta nada (para una barra lateral).
import { TEXTS, langOf, escapeHtml } from './i18n.js'

const STYLE = `
:host { display: block; font-family: var(--dt-font, inherit); color: var(--dt-text, inherit); }
.head { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--dt-muted, #666); padding: 10px 12px 6px; display: flex; align-items: center; gap: 6px; }
.count { background: var(--dt-accent, #00658c); color: var(--dt-on-accent, #fff); border-radius: 999px; padding: 0 7px; font-size: 11px; }
.empty { font-size: 12.5px; color: var(--dt-muted, #666); padding: 4px 12px 12px; margin: 0; }
ul { list-style: none; margin: 0; padding: 0; }
li { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--dt-border, rgba(0,0,0,.1)); }
li.vouched { background: var(--dt-accent-soft, rgba(0,101,140,.08)); }
.info { flex: 1; min-width: 0; }
.name { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tag { font-size: 10px; text-transform: uppercase; border-radius: 999px; padding: 1px 6px; }
.tag.v { font-weight: 700; color: var(--dt-on-accent, #fff); background: var(--dt-accent, #00658c); }
.tag.s { color: var(--dt-muted, #666); border: 1px solid var(--dt-border, rgba(0,0,0,.15)); }
.msg { font-size: 13px; color: var(--dt-muted, #666); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.actions { display: flex; gap: 6px; }
button { width: 30px; height: 30px; border-radius: 999px; border: 1px solid var(--dt-border, rgba(0,0,0,.2)); background: var(--dt-surface, #fff); color: var(--dt-text, inherit); cursor: pointer; font-size: 15px; }
button.ok { background: var(--dt-accent, #00658c); color: var(--dt-on-accent, #fff); border-color: transparent; }
`

const short = (pk) => String(pk || '').slice(0, 8) + '…'

export class DotrinoFriendRequests extends HTMLElement {
  static get observedAttributes () { return ['lang', 'hide-empty'] }

  constructor () {
    super()
    this.attachShadow({ mode: 'open' })
    this._friends = null
    this._off = null
  }

  set friends (f) {
    this._off?.()
    this._friends = f
    this._off = f?.onChange?.(() => this._render()) || null
    this._render()
  }
  get friends () { return this._friends }

  connectedCallback () { this._render() }
  disconnectedCallback () { this._off?.(); this._off = null }
  attributeChangedCallback () { if (this.isConnected) this._render() }

  _render () {
    const t = TEXTS[langOf(this)]
    const f = this._friends
    const incoming = f ? [...f.incoming].sort((a, b) => (Number(!!b.vouched) - Number(!!a.vouched)) || (b.ts - a.ts)) : []
    const outgoing = f ? [...f.outgoing].sort((a, b) => b.ts - a.ts) : []
    if (this.hasAttribute('hide-empty') && !incoming.length && !outgoing.length) { this.shadowRoot.innerHTML = ''; return }
    const inRows = incoming.map((r, i) => `
      <li class="${r.vouched ? 'vouched' : ''}">
        <div class="info">
          <div class="name">${escapeHtml(r.nickname || short(r.pubkey))}
            ${r.vouched ? `<span class="tag v" title="${t.vouchedTitle}">${t.vouched}</span>` : `<span class="tag s" title="${t.strangerTitle}">${t.stranger}</span>`}
          </div>
          <div class="msg">${t.wants}</div>
        </div>
        <div class="actions">
          <button class="ok" data-testid="accept-request" data-in="${i}" data-act="accept" title="${t.accept}" aria-label="${t.accept}">✓</button>
          <button data-testid="dismiss-request" data-in="${i}" data-act="dismiss" title="${t.dismiss}" aria-label="${t.dismiss}">✕</button>
        </div>
      </li>`).join('')
    const outRows = outgoing.map((r, i) => `
      <li data-testid="sent-request">
        <div class="info"><div class="name">${escapeHtml(r.nickname || short(r.pubkey))}</div><div class="msg">${t.waiting}</div></div>
        <div class="actions"><button data-testid="cancel-request" data-out="${i}" title="${t.cancelReq}" aria-label="${t.cancelReq}">✕</button></div>
      </li>`).join('')
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <div class="head">${t.reqTitle} ${incoming.length ? `<span class="count">${incoming.length}</span>` : ''}</div>
      ${incoming.length ? `<ul>${inRows}</ul>` : `<p class="empty">${t.reqEmpty}</p>`}
      ${outgoing.length ? `<ul>${outRows}</ul>` : ''}`
    this.shadowRoot.querySelectorAll('button[data-in]').forEach((b) => b.addEventListener('click', () => {
      const r = incoming[Number(b.dataset.in)]
      if (!r) return
      if (b.dataset.act === 'accept') f.accept(r.pubkey).catch((e) => console.warn('[dotrino-friend-requests] accept failed', e?.code || '', e?.message))
      else f.dismiss(r.pubkey, 'in')
    }))
    this.shadowRoot.querySelectorAll('button[data-out]').forEach((b) => b.addEventListener('click', () => {
      const r = outgoing[Number(b.dataset.out)]
      if (r) f.dismiss(r.pubkey, 'out')
    }))
  }
}

if (!customElements.get('dotrino-friend-requests')) customElements.define('dotrino-friend-requests', DotrinoFriendRequests)
