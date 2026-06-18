export interface Endorsement {
  ratedBy?: string
  rating?: number
  issuedAt?: number
}

export interface CloudIndicator {
  score: number | null
  confidence: number
  trustedCount: number
}

export interface CloudReputation {
  score: number | null
  confidence: number
  trustedCount: number
  rawCount: number
  txBoundCount: number
  indicators?: Record<string, CloudIndicator>
  samples?: unknown[]
}

export interface MyRating {
  confianza: number
  afinidad: number
  notes: string
}

/** Adapter de datos que la app inyecta en `<dotrino-profile>.provider`. */
export interface ProfileProvider {
  getMyRating?(pubkey: string): Promise<MyRating>
  getEndorsements?(pubkey: string): Promise<{ endorsements: Endorsement[]; derived: number | null }>
  getCloudReputation?(pubkey: string): Promise<CloudReputation | null>
  rate?(pubkey: string, indicators: Record<string, number>, notes: string): Promise<unknown>
}

export class DotrinoProfile extends HTMLElement {
  provider: ProfileProvider | null
  reload(): Promise<void>
}

/** Cablea un provider a los paquetes estándar del ecosistema (1 línea). */
export function createVaultProfileProvider(cfg: {
  identity: any
  reputation: any
}): ProfileProvider

export default DotrinoProfile

declare global {
  interface HTMLElementTagNameMap {
    'dotrino-profile': DotrinoProfile
  }
}
