// ─── FL Consent Manager ─────────────────────────────────────────────────────
//
// Manages user opt-in/out for federated learning participation.
// GDPR: EU users must give explicit consent (not pre-checked).
// Non-EU users see a nudged opt-in with clear explanation.
//
// Persists to localStorage so consent survives page reloads.

const STORAGE_KEY = 'iris-fl-consent'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ConsentStatus = 'undecided' | 'opted_in' | 'opted_out'

export interface FLConsentState {
	status: ConsentStatus
	/** ISO timestamp when consent was last changed */
	updatedAt: string
	/** Whether the user is in an EU locale */
	isEU: boolean
	/** Whether the user has seen the consent prompt */
	prompted: boolean
}

// ISO 3166-1 alpha-2 codes for EU/EEA countries
const EU_COUNTRY_CODES = new Set([
	'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
	'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
	'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
	// EEA
	'IS', 'LI', 'NO',
	// UK (still applies GDPR-equivalent)
	'GB',
])

// ─── EU Detection ───────────────────────────────────────────────────────────

/**
 * Detect if the user is likely in the EU based on browser locale.
 * Uses navigator.language (e.g., "de-DE" → "DE") or Intl timezone heuristics.
 */
export function detectEULocale(): boolean {
	try {
		// First: check navigator.language for country code
		const lang = navigator.language || ''
		const parts = lang.split('-')
		if (parts.length >= 2) {
			const country = parts[parts.length - 1].toUpperCase()
			if (EU_COUNTRY_CODES.has(country)) return true
		}

		// Fallback: check timezone (European timezones)
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
		if (tz.startsWith('Europe/')) return true
	} catch {
		// If detection fails, default to safer option (EU = true → explicit consent)
	}
	return false
}

// ─── Consent Manager ────────────────────────────────────────────────────────

export class FLConsentManager {
	private _state: FLConsentState
	private _listeners = new Set<(state: FLConsentState) => void>()

	constructor() {
		this._state = this._load()
	}

	get state(): FLConsentState {
		return { ...this._state }
	}

	get isOptedIn(): boolean {
		return this._state.status === 'opted_in'
	}

	get isOptedOut(): boolean {
		return this._state.status === 'opted_out'
	}

	get isUndecided(): boolean {
		return this._state.status === 'undecided'
	}

	get needsPrompt(): boolean {
		return !this._state.prompted
	}

	/** Whether this user requires explicit opt-in (EU/GDPR). */
	get requiresExplicitConsent(): boolean {
		return this._state.isEU
	}

	/** Opt in to FL participation. */
	optIn(): void {
		this._update({ status: 'opted_in', prompted: true })
	}

	/** Opt out of FL participation. */
	optOut(): void {
		this._update({ status: 'opted_out', prompted: true })
	}

	/** Mark the consent prompt as shown (without changing consent status). */
	markPrompted(): void {
		this._update({ prompted: true })
	}

	/** Subscribe to state changes. Returns unsubscribe function. */
	onChange(callback: (state: FLConsentState) => void): () => void {
		this._listeners.add(callback)
		return () => this._listeners.delete(callback)
	}

	/** Reset state (for testing or new consent period). */
	reset(): void {
		this._state = {
			status: 'undecided',
			updatedAt: new Date().toISOString(),
			isEU: detectEULocale(),
			prompted: false,
		}
		this._save()
		this._notify()
	}

	private _update(partial: Partial<FLConsentState>): void {
		this._state = {
			...this._state,
			...partial,
			updatedAt: new Date().toISOString(),
		}
		this._save()
		this._notify()
	}

	private _save(): void {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state))
		} catch {
			// localStorage may be unavailable (private browsing, quota exceeded)
		}
	}

	private _load(): FLConsentState {
		try {
			const stored = localStorage.getItem(STORAGE_KEY)
			if (stored) {
				const parsed = JSON.parse(stored) as FLConsentState
				// Validate shape
				if (parsed.status && parsed.updatedAt) {
					return parsed
				}
			}
		} catch {
			// Corrupted or unavailable
		}
		// Default state
		return {
			status: 'undecided',
			updatedAt: new Date().toISOString(),
			isEU: detectEULocale(),
			prompted: false,
		}
	}

	private _notify(): void {
		const state = this.state
		for (const cb of this._listeners) cb(state)
	}
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance: FLConsentManager | null = null

export function getFLConsent(): FLConsentManager {
	if (!_instance) {
		_instance = new FLConsentManager()
	}
	return _instance
}

/** Reset singleton — only for tests. */
export function _resetFLConsent(): void {
	_instance = null
}
