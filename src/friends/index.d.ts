export interface FriendRequest { pubkey: string; dir: 'in' | 'out'; nickname: string; token: string | null; encryptionPubkey?: string; ts: number; vouched?: boolean }
export interface Who { pubkey: string; contact: any | null; encPub: string; device: string }
export interface Recipient { pubkey: string; encPub?: string }

export interface FriendBook {
  readonly peers: any[]
  refresh (): Promise<void>
  contacts (): any[]
  peer (pubkey: string): any | null
  find (pubkey: string): any | null
  findBySender (pubkey: string): any | null
  cardOf (pubkey: string): any | null
  ownCard (card: any): boolean
  accountFromCard (card: any, devicePubkey: string): string | null
  recipientsOf (pubkey: string): Recipient[]
  isBlocked (pubkey: string): boolean
  isPinned (pubkey: string): boolean
  add (c: { pubkey: string; nickname?: string; token?: string; encryptionPubkey?: string; notes?: string }): Promise<any>
  update (pubkey: string, patch: Record<string, any>): Promise<void>
  remove (pubkey: string): Promise<void>
  moveToAccount (from: string, account: string): Promise<void>
  adoptCard (card: any): Promise<any>
  onChange (f: () => void): () => void
}

export interface RequestInbox {
  readonly all: FriendRequest[]
  readonly incoming: FriendRequest[]
  readonly outgoing: FriendRequest[]
  upsert (r: Partial<FriendRequest> & { pubkey: string }): void
  remove (pubkey: string, dir?: 'in' | 'out'): void
  get (pubkey: string, dir?: 'in' | 'out'): FriendRequest | null
  prune (): void
  reload (): void
  onChange (f: () => void): () => void
}

export interface Friends {
  readonly book: FriendBook
  readonly inbox: RequestInbox
  readonly code: string | null
  readonly incoming: FriendRequest[]
  readonly outgoing: FriendRequest[]
  refreshCode (): Promise<string | null>
  redeemCode (code: string): Promise<{ ok: boolean; instance?: string; publickey?: string; reason?: 'offline' | 'invalid' | 'own' }>
  request (o: { token?: string | null; pubkey: string; alias?: string; card?: any }): Promise<void>
  requestByCode (code: string, alias?: string): Promise<void>
  accept (pubkey: string): Promise<void>
  dismiss (pubkey: string, dir?: 'in' | 'out'): void
  receive (fromToken: string | null, payload: any, meta?: any): Promise<{ who: Who; handled: boolean } | null>
  send (pubkey: string, payload: any, opts?: { quiet?: boolean }): Promise<void>
  routeOf (pubkey: string): Promise<string>
  authenticate (fromToken: string | null, meta: any): Promise<Who | null>
  noteProfile (pubkey: string, payload: any): Promise<void>
  upgradeToAccount (who: Who, payload: any): Promise<any>
  accountOf (who: Who, payload: any): string
  me (): Promise<{ nickname: string; v?: any; card?: any }>
  markOnline (pubkey: string, token: string): void
  markOffline (token: string): void
  isOnline (pubkey: string): boolean
  liveTokenFor (pubkey: string): string | null
  tokenFor (pubkey: string): string | null
  forgetDevice (token: string): void
  onChange (f: () => void): () => void
  close (): void
}

export function createFriends (o: {
  identity: any; client: any; nickname: () => string; version?: any
  book?: FriendBook; inbox?: RequestInbox; inboxKey?: string | (() => string)
  pinned?: { publickey: string; nickname: string }[]
  hooks?: {
    onProfile?: (pubkey: string, payload: any) => any
    onMoved?: (from: string, to: string) => any
    onFriend?: (account: string, o: { token?: string; device?: string | null }) => any
    onRequest?: (r: FriendRequest) => any
    isVouched?: (account: string) => Promise<boolean>
  }
}): Friends
export function createFriendBook (o: { identity: any; pinned?: { publickey: string; nickname: string }[] }): FriendBook
export function createRequestInbox (o: { key: string | (() => string); storage?: { getItem (k: string): string | null; setItem (k: string, v: string): void }; ttlMs?: number; now?: () => number }): RequestInbox
export function memoryStorage (): { getItem (k: string): string | null; setItem (k: string, v: string): void }
export function normalizeCode (raw: string): string
export function codeFromText (text: string): string
export function sameKey (a: string, b: string): boolean
export function sanitizeNickname (s: string): string
export const CODE_RE: RegExp
export const REQUEST: 'CONTACT_REQUEST'
export const ACCEPT: 'CONTACT_ACCEPT'
export const REQUEST_TTL_MS: number
