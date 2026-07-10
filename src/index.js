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
    profiles: 'Tus perfiles',
    activeProfile: 'activo',
    useProfile: 'Usar',
    newProfile: '+ Crear perfil',
    createOnPage: 'Crear un perfil nuevo',
    unnamedProfile: 'Perfil sin nombre',
    switchHint: 'Puedes tener varios perfiles en este dispositivo, cada uno con su propia bóveda. Cambiar recarga la app.',
    photo: 'Foto', photoHint: '250×250, se recorta al centro', addPhoto: '+ Agregar foto', changePhoto: 'Cambiar foto',
    personal: 'Datos personales', personalHint: 'nombre real y contacto',
    fNombres: 'Nombres', fNombresPh: 'Tus nombres',
    fApellidos: 'Apellidos', fApellidosPh: 'Tus apellidos',
    fEmail: 'Correo electrónico', fEmailPh: 'tucorreo@ejemplo.com',
    fTelefono: 'Teléfono', fTelefonoPh: '+593 …',
    fDireccion: 'Dirección', fDireccionPh: 'Calle, ciudad, país',
    social: 'Redes sociales', socialHint: 'cada una con mostrar/ocultar',
    otherLinks: 'Otros enlaces', otherLinksHint: 'sitios o enlaces sueltos',
    addLink: '+ Agregar enlace', linkPh: 'usuario o URL',
    fields: 'Datos', fieldsHint: 'lo que quieras mostrar', addField: '+ Agregar dato', fieldLabelPh: 'Etiqueta (p. ej. Ciudad)', fieldValuePh: 'Valor',
    shown: 'Visible — clic para ocultar', hidden: 'Oculto — clic para mostrar',
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
    profiles: 'Your profiles',
    activeProfile: 'active',
    useProfile: 'Use',
    newProfile: '+ Create profile',
    createOnPage: 'Create a new profile',
    unnamedProfile: 'Unnamed profile',
    switchHint: 'You can have several profiles on this device, each with its own vault. Switching reloads the app.',
    photo: 'Photo', photoHint: '250×250, center-cropped', addPhoto: '+ Add photo', changePhoto: 'Change photo',
    personal: 'Personal info', personalHint: 'real name and contact',
    fNombres: 'First name', fNombresPh: 'Your first name',
    fApellidos: 'Last name', fApellidosPh: 'Your last name',
    fEmail: 'Email', fEmailPh: 'you@example.com',
    fTelefono: 'Phone', fTelefonoPh: '+1 …',
    fDireccion: 'Address', fDireccionPh: 'Street, city, country',
    social: 'Social networks', socialHint: 'each with show/hide',
    otherLinks: 'Other links', otherLinksHint: 'sites or loose links',
    addLink: '+ Add link', linkPh: 'handle or URL',
    fields: 'Details', fieldsHint: 'anything you want to show', addField: '+ Add detail', fieldLabelPh: 'Label (e.g. City)', fieldValuePh: 'Value',
    shown: 'Shown — click to hide', hidden: 'Hidden — click to show',
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
  /* Switcher de perfiles (mode="self") */
  .section.profiles { gap: 8px; }
  .prof-list { display: flex; flex-direction: column; gap: 6px; }
  .prof-row { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border: 1px solid var(--_border); border-radius: 10px; }
  .prof-row.current { border-color: var(--_accent); background: var(--_bg-3); }
  .prof-av { width: 32px; height: 32px; border-radius: 8px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 13px; }
  .prof-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .prof-badge { flex: 0 0 auto; font-size: 11px; font-weight: 700; color: var(--_accent); border: 1px solid var(--_accent); border-radius: 999px; padding: 2px 8px; }
  .prof-switch { flex: 0 0 auto; padding: 5px 12px; font-size: 13px; }
  .prof-new { align-self: flex-start; padding: 7px 14px; font-size: 13px; }
  /* Editor de perfil (mode="self"): foto / redes / datos */
  .avatar-wrap[data-photo] { cursor: pointer; }
  .avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; }
  .avatar-edit { position: absolute; right: -2px; bottom: -2px; width: 22px; height: 22px; border-radius: 50%; background: var(--_accent); color: var(--_accent-text); font-size: 11px; display: flex; align-items: center; justify-content: center; border: 2px solid var(--_bg); }
  .pe-list { display: flex; flex-direction: column; gap: 8px; }
  .pe-row { display: flex; align-items: center; gap: 6px; }
  .pe-row .pe-type { flex: 0 0 auto; max-width: 38%; }
  .pe-row .pe-val, .pe-row .pe-label { flex: 1 1 auto; min-width: 0; }
  .pe-row select, .pe-row input { font: inherit; padding: 7px 9px; border: 1px solid var(--_border); border-radius: 8px; background: var(--_input-bg); color: var(--_text); }
  .pe-photo { display: flex; align-items: center; gap: 8px; }
  .eye { background: transparent; border: 1px solid var(--_border); border-radius: 8px; width: 34px; height: 34px; flex: 0 0 auto; cursor: pointer; font-size: 14px; line-height: 1; }
  .eye.off { opacity: .5; }
  .pe-del { background: transparent; border: none; color: var(--_muted); cursor: pointer; font-size: 15px; flex: 0 0 auto; width: 26px; }
  .pe-del:hover { color: var(--_accent); }
  .std-field { display: flex; flex-direction: column; gap: 4px; }
  .std-field > label { font-size: 12px; color: var(--_muted); }
  .std-input-row { display: flex; align-items: center; gap: 6px; }
  .std-input-row input { flex: 1 1 auto; min-width: 0; font: inherit; padding: 7px 9px; border: 1px solid var(--_border); border-radius: 8px; background: var(--_input-bg); color: var(--_text); }
  .social-row .social-ico { flex: 0 0 auto; width: 26px; height: 26px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 12px; font-weight: 700; line-height: 1; }
  .eye-spacer { flex: 0 0 auto; width: 34px; }
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

// Redes sociales con FILA FIJA en el editor (mode="self"). Se respaldan en `me.links` por
// `type` (reusa el modelo tipado del vault). `c` = color de marca, `g` = glifo del ícono.
// Los enlaces sin tipo de red conocido caen en "Otros enlaces" (type 'other'/'web' libre).
const SOCIAL_NETWORKS = [
  { id: 'x', label: 'X', c: '#000000', g: 'X', ph: '@usuario o URL' },
  { id: 'instagram', label: 'Instagram', c: '#e1306c', g: 'Ig', ph: '@usuario o URL' },
  { id: 'facebook', label: 'Facebook', c: '#1877f2', g: 'f', ph: 'usuario o URL' },
  { id: 'tiktok', label: 'TikTok', c: '#111111', g: '♪', ph: '@usuario o URL' },
  { id: 'linkedin', label: 'LinkedIn', c: '#0a66c2', g: 'in', ph: 'usuario o URL' },
  { id: 'github', label: 'GitHub', c: '#24292f', g: 'gh', ph: 'usuario o URL' },
  { id: 'youtube', label: 'YouTube', c: '#ff0000', g: '▶', ph: 'canal o URL' },
  { id: 'telegram', label: 'Telegram', c: '#229ed9', g: '✈', ph: '@usuario o URL' },
  { id: 'whatsapp', label: 'WhatsApp', c: '#25d366', g: '✆', ph: 'número o enlace' },
  { id: 'mastodon', label: 'Mastodon', c: '#6364ff', g: 'm', ph: '@usuario@instancia' },
  { id: 'web', label: 'Sitio web', c: '#6b7280', g: '🌐', ph: 'https://…' }
]
// Campos personales estándar (fijos). `sens` = sensible (oculto por defecto al compartir).
const STD_FIELDS = [
  { k: 'nombres', max: 60 }, { k: 'apellidos', max: 60 },
  { k: 'email', max: 120, type: 'email' },
  { k: 'telefono', max: 40, type: 'tel', sens: true },
  { k: 'direccion', max: 200, sens: true }
]

class DotrinoProfile extends HTMLElement {
  static get observedAttributes() {
    return ['pubkey', 'name', 'since', 'online', 'mode', 'modal', 'heading', 'lang', 'indicators', 'manage']
  }

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this._provider = null
    this._profiles = [] // multi-perfil: lista para el switcher (mode="self")
    this._profile = null // mi perfil completo (avatar/links/fields) para el editor (mode="self")
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
  get _manage() { return this.hasAttribute('manage') }

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

    // Multi-perfil (mode="self"): lista de perfiles para el switcher GLOBAL (acción disponible
    // en CUALQUIER app que muestre <dotrino-profile mode="self">, no solo en profile.dotrino.com).
    if (this._self && typeof p.listProfiles === 'function') {
      Promise.resolve(p.listProfiles()).then(list => { this._profiles = Array.isArray(list) ? list : []; this._render() }).catch(() => {})
    }
    if (this._self && typeof p.getMyProfile === 'function') {
      Promise.resolve(p.getMyProfile()).then(m => { this._profile = m || {}; this._render() }).catch(() => {})
    }

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

  // Cambiar/crear perfil = acción global; recarga la app para tomar el nuevo perfil activo
  // (no reactivo, por diseño). Emite 'cc-profile-switch' por si la app quiere reaccionar primero.
  _afterProfileChange() {
    try { this.dispatchEvent(new CustomEvent('cc-profile-switch', { bubbles: true, composed: true })) } catch (_) {}
    try { if (typeof location !== 'undefined' && location.reload) location.reload() } catch (_) {}
  }

  _genId () { try { return crypto.randomUUID().slice(0, 8) } catch (_) { return 'id' + Date.now().toString(36) } }

  // Botón de visibilidad (ojo) para un ítem del perfil: avatar / link[i] / field[i].
  _eyeBtn (kind, visible, i = '') {
    const t = this._t
    return `<button type="button" class="eye${visible ? '' : ' off'}" data-eye="${kind}" data-eyei="${i}" title="${this._esc(visible ? t.shown : t.hidden)}">${visible ? '👁' : '🔒'}</button>`
  }

  // Reescala/recorta (cover, centrado) una imagen a size×size y devuelve un data-URI JPEG.
  _resizeImage (file, size = 250) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = size; c.height = size
          const ctx = c.getContext('2d')
          const sc = Math.max(size / img.width, size / img.height)
          const w = img.width * sc; const h = img.height * sc
          ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
          resolve(c.toDataURL('image/jpeg', 0.85))
        } catch (e) { reject(e) } finally { URL.revokeObjectURL(url) }
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen inválida')) }
      img.src = url
    })
  }

  // Persiste un patch del perfil (no toca `this._profile`, que es la fuente local del editor).
  async _saveProfile (patch) {
    const p = this._provider
    if (!p || typeof p.setMyProfile !== 'function') return
    try { await p.setMyProfile(patch) } catch (_) { /* best-effort */ }
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

    // Avatar: foto subida (self = mi perfil; otros = atributo `avatar`) o, si no hay, el círculo con iniciales.
    const avatarUrl = this._self ? (this._profile && this._profile.avatar) : this.getAttribute('avatar')
    const confLabel = t.labels[this._hover || this._my.confianza] || t.labels[0]

    // ----- Identidad -----
    let body = `
      <div class="identity">
        <div class="avatar-wrap"${this._self ? ` data-photo title="${this._esc(t.changePhoto)}"` : ''}>
          ${avatarUrl
            ? `<img class="avatar avatar-img" src="${this._esc(avatarUrl)}" alt="" />`
            : `<div class="avatar" style="background:${this._avatarBg(pk)}">${this._esc(this._initials(name))}</div>`}
          ${this._self ? '<span class="avatar-edit">✎</span>' : ''}
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

    // ----- Editor de perfil (mode="self"): foto, redes/enlaces, datos — cada ítem mostrar/ocultar -----
    if (this._self) {
      const prof = this._profile || {}
      const links = Array.isArray(prof.links) ? prof.links : []
      const fields = Array.isArray(prof.fields) ? prof.fields : []
      // Datos importados/legados pueden traer links sin id o con ids repetidos: aseguramos ids únicos
      // (las filas y handlers se referencian por id; sin esto, dos links colisionarían).
      const seenIds = new Set()
      for (const l of links) { if (!l.id || seenIds.has(l.id)) l.id = this._genId(); seenIds.add(l.id) }
      // Cada red social "engancha" el PRIMER link de su tipo; los demás (duplicados o tipos legados
      // como múltiples 'web') caen en "Otros enlaces" para que SIGAN siendo editables/borrables.
      const boundIds = new Set()
      for (const n of SOCIAL_NETWORKS) { const l = links.find((x) => x.type === n.id); if (l) boundIds.add(l.id) }
      body += `
      <input type="file" accept="image/*" data-photoinput style="display:none" />
      ${prof.avatar ? `
      <div class="section profile-editor">
        <span class="section-label">${this._esc(t.photo)} <small>${this._esc(t.photoHint)}</small></span>
        <div class="pe-photo">${this._eyeBtn('avatar', prof.avatarVisible !== false)}
          <button type="button" class="btn secondary" data-photoclear>${this._esc(t.remove)}</button></div>
      </div>` : ''}
      <div class="section profile-editor">
        <span class="section-label">${this._esc(t.personal)} <small>${this._esc(t.personalHint)}</small></span>
        <div class="pe-list">
          ${STD_FIELDS.map((f) => {
            const shown = f.sens ? (prof[f.k + 'Visible'] === true) : (prof[f.k + 'Visible'] !== false)
            return `
          <div class="std-field">
            <label>${this._esc(t['f' + f.k.charAt(0).toUpperCase() + f.k.slice(1)])}</label>
            <div class="std-input-row">
              <input class="pe-val" data-std="${f.k}" type="${f.type || 'text'}" value="${this._esc(prof[f.k] || '')}" placeholder="${this._esc(t['f' + f.k.charAt(0).toUpperCase() + f.k.slice(1) + 'Ph'])}" maxlength="${f.max}" />
              ${this._eyeBtn('std', shown, f.k)}
            </div>
          </div>`
          }).join('')}
        </div>
      </div>
      <div class="section profile-editor">
        <span class="section-label">${this._esc(t.social)} <small>${this._esc(t.socialHint)}</small></span>
        <div class="pe-list">
          ${SOCIAL_NETWORKS.map((n) => {
            const l = links.find((x) => x.type === n.id)
            const val = l ? l.value : ''
            return `
          <div class="pe-row social-row">
            <span class="social-ico" style="background:${n.c}" title="${this._esc(n.label)}">${this._esc(n.g)}</span>
            <input class="pe-val" data-social="${n.id}" value="${this._esc(val)}" placeholder="${this._esc(n.ph)}" maxlength="200" />
            ${val ? this._eyeBtn('social', !l || l.visible !== false, n.id) : '<span class="eye-spacer"></span>'}
          </div>`
          }).join('')}
        </div>
      </div>
      <div class="section profile-editor">
        <span class="section-label">${this._esc(t.otherLinks)} <small>${this._esc(t.otherLinksHint)}</small></span>
        <div class="pe-list">
          ${links.filter((l) => !boundIds.has(l.id)).map((l) => `
          <div class="pe-row">
            <input class="pe-val" data-lival="${this._esc(l.id)}" value="${this._esc(l.value || '')}" placeholder="${this._esc(t.linkPh)}" maxlength="200" />
            ${this._eyeBtn('link', l.visible !== false, l.id)}
            <button type="button" class="pe-del" data-lidel="${this._esc(l.id)}" title="${this._esc(t.remove)}">✕</button>
          </div>`).join('')}
        </div>
        <button type="button" class="btn secondary" data-addlink>${this._esc(t.addLink)}</button>
      </div>
      <div class="section profile-editor">
        <span class="section-label">${this._esc(t.fields)} <small>${this._esc(t.fieldsHint)}</small></span>
        <div class="pe-list">
          ${fields.map((f, i) => `
          <div class="pe-row">
            <input class="pe-label" data-flabel="${i}" value="${this._esc(f.label || '')}" placeholder="${this._esc(t.fieldLabelPh)}" maxlength="40" />
            <input class="pe-val" data-fval="${i}" value="${this._esc(f.value || '')}" placeholder="${this._esc(t.fieldValuePh)}" maxlength="280" />
            ${this._eyeBtn('field', f.visible !== false, i)}
            <button type="button" class="pe-del" data-fdel="${i}" title="${this._esc(t.remove)}">✕</button>
          </div>`).join('')}
        </div>
        <button type="button" class="btn secondary" data-addfield>${this._esc(t.addField)}</button>
      </div>`
    }

    // ----- Switcher de perfiles (mode="self") — acción GLOBAL (cualquier app) -----
    if (this._self && Array.isArray(this._profiles) && this._profiles.length) {
      body += `
      <div class="section profiles">
        <span class="section-label">${this._esc(t.profiles)} <small>${this._esc(t.switchHint)}</small></span>
        <div class="prof-list">
          ${this._profiles.map(pr => `
          <div class="prof-row${pr.current ? ' current' : ''}">
            <div class="prof-av" style="background:${this._avatarBg(pr.pubkey || pr.id)}">${this._esc(this._initials(pr.name || ''))}</div>
            <span class="prof-name">${this._esc(pr.name || t.unnamedProfile)}</span>
            ${pr.current ? `<span class="prof-badge">${this._esc(t.activeProfile)}</span>` : `<button type="button" class="btn secondary prof-switch" data-switch="${this._esc(pr.id)}">${this._esc(t.useProfile)}</button>`}
          </div>`).join('')}
        </div>
        ${this._manage
          ? `<button type="button" class="btn secondary prof-new" data-newprofile>${this._esc(t.newProfile)}</button>`
          : `<a class="btn secondary prof-new" href="https://profile.dotrino.com/" target="_blank" rel="noopener">${this._esc(t.createOnPage)}</a>`}
      </div>`
    }

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
      // Switcher de perfiles (global): cambiar a otro perfil o crear uno nuevo.
      qa('[data-switch]').forEach(b => b.addEventListener('click', async () => {
        b.disabled = true
        try { await this._provider.switchProfile(b.getAttribute('data-switch')); this._afterProfileChange() } catch (_) { b.disabled = false }
      }))
      const newp = q('[data-newprofile]')
      if (newp) newp.addEventListener('click', async () => {
        newp.disabled = true
        // Crea un perfil (sin nombre) y queda activo; tras recargar, el editor de nombre está acá mismo.
        try { await this._provider.createProfile(''); this._afterProfileChange() } catch (_) { newp.disabled = false }
      })

      // ----- Editor de perfil: foto / redes / datos (this._profile = fuente local) -----
      const ensure = () => { const p = (this._profile = this._profile || {}); if (!Array.isArray(p.links)) p.links = []; if (!Array.isArray(p.fields)) p.fields = []; return p }
      const photoInput = q('[data-photoinput]')
      qa('[data-photo]').forEach(el => el.addEventListener('click', () => photoInput && photoInput.click()))
      if (photoInput) photoInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0]; if (!file) return
        try { const avatar = await this._resizeImage(file, 250); ensure().avatar = avatar; await this._saveProfile({ avatar }); this._render() } catch (_) { /* imagen inválida */ }
      })
      const pc = q('[data-photoclear]'); if (pc) pc.addEventListener('click', async () => { delete ensure().avatar; await this._saveProfile({ avatar: null }); this._render() })

      // Toggle de visibilidad (ojo): avatar / link(id) / social(type) / field[i] / std(campo).
      qa('[data-eye]').forEach(b => b.addEventListener('click', async () => {
        const kind = b.getAttribute('data-eye'); const key = b.getAttribute('data-eyei'); const p = ensure()
        if (kind === 'avatar') { p.avatarVisible = !(p.avatarVisible !== false); await this._saveProfile({ avatarVisible: p.avatarVisible }) }
        else if (kind === 'link') { const l = p.links.find(x => x.id === key); if (l) { l.visible = !(l.visible !== false); await this._saveProfile({ links: p.links }) } }
        else if (kind === 'social') { const l = p.links.find(x => x.type === key); if (l) { l.visible = !(l.visible !== false); await this._saveProfile({ links: p.links }) } }
        else if (kind === 'field') { const l = p.fields[+key]; if (l) { l.visible = !(l.visible !== false); await this._saveProfile({ fields: p.fields }) } }
        else if (kind === 'std') { const f = STD_FIELDS.find(x => x.k === key); const vk = key + 'Visible'; const cur = f && f.sens ? (p[vk] === true) : (p[vk] !== false); p[vk] = !cur; await this._saveProfile({ [vk]: p[vk] }) }
        this._render()
      }))

      // Datos personales (escalares fijos): nombres / apellidos / correo / teléfono / dirección.
      qa('[data-std]').forEach(inp => {
        inp.addEventListener('input', () => { ensure()[inp.getAttribute('data-std')] = inp.value })
        inp.addEventListener('change', () => this._saveProfile({ [inp.getAttribute('data-std')]: inp.value }))
      })

      // Redes sociales (filas fijas, respaldadas en `links` por `type`). `input` actualiza el modelo
      // local (sobrevive a un re-render asíncrono) y `change` persiste. upsert/quitar por tipo.
      const upsertSocial = (type, raw) => {
        const links = ensure().links; const val = raw.trim()
        const i = links.findIndex(x => x.type === type)
        if (val) { if (i >= 0) links[i].value = val; else links.push({ id: this._genId(), type, value: val, visible: true }) }
        else if (i >= 0) links.splice(i, 1)
        return links
      }
      qa('[data-social]').forEach(inp => {
        inp.addEventListener('input', () => upsertSocial(inp.getAttribute('data-social'), inp.value))
        inp.addEventListener('change', async () => { await this._saveProfile({ links: upsertSocial(inp.getAttribute('data-social'), inp.value) }); this._render() })
      })

      // Otros enlaces: agregar / valor / quitar (por id; solo enlaces sin red conocida).
      const al = q('[data-addlink]'); if (al) al.addEventListener('click', () => { ensure().links.push({ id: this._genId(), type: 'other', value: '', visible: true }); this._render() })
      qa('[data-lival]').forEach(inp => {
        inp.addEventListener('input', () => { const l = ensure().links.find(x => x.id === inp.getAttribute('data-lival')); if (l) l.value = inp.value })
        inp.addEventListener('change', () => this._saveProfile({ links: ensure().links }))
      })
      qa('[data-lidel]').forEach(b => b.addEventListener('click', async () => { const id = b.getAttribute('data-lidel'); this._profile.links = ensure().links.filter(x => x.id !== id); await this._saveProfile({ links: this._profile.links }); this._render() }))

      // Datos: agregar / etiqueta / valor / quitar.
      const af = q('[data-addfield]'); if (af) af.addEventListener('click', () => { ensure().fields.push({ id: this._genId(), label: '', value: '', visible: true }); this._render() })
      qa('[data-flabel]').forEach(inp => {
        inp.addEventListener('input', () => { const f = ensure().fields[+inp.getAttribute('data-flabel')]; if (f) f.label = inp.value })
        inp.addEventListener('change', () => this._saveProfile({ fields: ensure().fields }))
      })
      qa('[data-fval]').forEach(inp => {
        inp.addEventListener('input', () => { const f = ensure().fields[+inp.getAttribute('data-fval')]; if (f) f.value = inp.value })
        inp.addEventListener('change', () => this._saveProfile({ fields: ensure().fields }))
      })
      qa('[data-fdel]').forEach(b => b.addEventListener('click', async () => { ensure().fields.splice(+b.getAttribute('data-fdel'), 1); await this._saveProfile({ fields: this._profile.fields }); this._render() }))
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

    // --- Perfil completo (foto/redes/datos, cada ítem con visible) para mode="self" ---
    async getMyProfile() { return (identity && identity.getMe) ? identity.getMe() : null },
    async setMyProfile(patch) {
      if (!identity || typeof identity.updateMe !== 'function') throw new Error('dotrino-profile: identity.updateMe no disponible')
      const r = await identity.updateMe(patch)
      return (r && r.me) || null
    },

    // --- Multi-perfil (acción GLOBAL: cualquier app que muestre <dotrino-profile mode="self">
    //     permite ver/crear/cambiar de perfil; no es exclusivo de profile.dotrino.com). ---
    profilesSupported() { return !!(identity && typeof identity.listProfiles === 'function') },
    async listProfiles() { return (identity && identity.listProfiles) ? identity.listProfiles() : [] },
    async currentProfile() { return (identity && identity.currentProfile) ? identity.currentProfile() : null },
    async createProfile(name) { return identity.createProfile(name) },
    async switchProfile(id) { return identity.switchProfile(id) },
    async renameProfile(id, name) { return identity.renameProfile(id, name) },
    async deleteProfile(id) { return identity.deleteProfile(id) },
  }
}

export default DotrinoProfile
