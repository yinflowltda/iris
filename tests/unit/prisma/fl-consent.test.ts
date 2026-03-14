import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
	FLConsentManager,
	detectEULocale,
	_resetFLConsent,
	getFLConsent,
} from '../../../client/lib/prisma/fl-consent'

// ─── Mock localStorage ──────────────────────────────────────────────────────

const storageMap = new Map<string, string>()

const mockStorage = {
	getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
	setItem: vi.fn((key: string, value: string) => storageMap.set(key, value)),
	removeItem: vi.fn((key: string) => storageMap.delete(key)),
	clear: vi.fn(() => storageMap.clear()),
	get length() {
		return storageMap.size
	},
	key: vi.fn(() => null),
}

vi.stubGlobal('localStorage', mockStorage)

describe('FLConsentManager', () => {
	beforeEach(() => {
		storageMap.clear()
		_resetFLConsent()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	// ─── Initial State ──────────────────────────────────────────────────

	it('should initialize with undecided status', () => {
		const mgr = new FLConsentManager()
		expect(mgr.state.status).toBe('undecided')
		expect(mgr.isOptedIn).toBe(false)
		expect(mgr.isOptedOut).toBe(false)
		expect(mgr.isUndecided).toBe(true)
	})

	it('should detect prompted state', () => {
		const mgr = new FLConsentManager()
		expect(mgr.needsPrompt).toBe(true)
		mgr.markPrompted()
		expect(mgr.needsPrompt).toBe(false)
	})

	// ─── Opt In / Out ───────────────────────────────────────────────────

	it('should opt in', () => {
		const mgr = new FLConsentManager()
		mgr.optIn()
		expect(mgr.isOptedIn).toBe(true)
		expect(mgr.state.status).toBe('opted_in')
		expect(mgr.state.prompted).toBe(true)
	})

	it('should opt out', () => {
		const mgr = new FLConsentManager()
		mgr.optOut()
		expect(mgr.isOptedOut).toBe(true)
		expect(mgr.state.status).toBe('opted_out')
		expect(mgr.state.prompted).toBe(true)
	})

	it('should toggle between opt in and opt out', () => {
		const mgr = new FLConsentManager()
		mgr.optIn()
		expect(mgr.isOptedIn).toBe(true)
		mgr.optOut()
		expect(mgr.isOptedOut).toBe(true)
		mgr.optIn()
		expect(mgr.isOptedIn).toBe(true)
	})

	// ─── Persistence ────────────────────────────────────────────────────

	it('should persist consent state across sessions', () => {
		const mgr1 = new FLConsentManager()
		mgr1.optIn()

		// Create a new manager — should restore from localStorage
		const mgr2 = new FLConsentManager()
		expect(mgr2.isOptedIn).toBe(true)
		expect(mgr2.state.status).toBe('opted_in')
	})

	it('should persist opt-out across sessions', () => {
		const mgr1 = new FLConsentManager()
		mgr1.optOut()

		const mgr2 = new FLConsentManager()
		expect(mgr2.isOptedOut).toBe(true)
	})

	it('should handle corrupted localStorage gracefully', () => {
		storageMap.set('iris-fl-consent', '{invalid json!!!')
		const mgr = new FLConsentManager()
		expect(mgr.state.status).toBe('undecided')
	})

	// ─── Listeners ──────────────────────────────────────────────────────

	it('should notify listeners on state change', () => {
		const mgr = new FLConsentManager()
		const listener = vi.fn()
		mgr.onChange(listener)

		mgr.optIn()
		expect(listener).toHaveBeenCalledOnce()
		expect(listener.mock.calls[0][0].status).toBe('opted_in')
	})

	it('should unsubscribe listener', () => {
		const mgr = new FLConsentManager()
		const listener = vi.fn()
		const unsub = mgr.onChange(listener)

		mgr.optIn()
		expect(listener).toHaveBeenCalledOnce()

		unsub()
		mgr.optOut()
		expect(listener).toHaveBeenCalledOnce() // Not called again
	})

	// ─── Reset ──────────────────────────────────────────────────────────

	it('should reset to undecided', () => {
		const mgr = new FLConsentManager()
		mgr.optIn()
		expect(mgr.isOptedIn).toBe(true)

		mgr.reset()
		expect(mgr.isUndecided).toBe(true)
		expect(mgr.needsPrompt).toBe(true)
	})

	// ─── Singleton ──────────────────────────────────────────────────────

	it('should return same instance from getFLConsent', () => {
		const a = getFLConsent()
		const b = getFLConsent()
		expect(a).toBe(b)
	})

	it('should return new instance after _resetFLConsent', () => {
		const a = getFLConsent()
		_resetFLConsent()
		const b = getFLConsent()
		expect(a).not.toBe(b)
	})

	// ─── EU Detection ───────────────────────────────────────────────────

	it('should require explicit consent for EU users', () => {
		// Simulate EU locale
		vi.stubGlobal('navigator', { language: 'de-DE' })
		_resetFLConsent()
		const mgr = new FLConsentManager()
		expect(mgr.requiresExplicitConsent).toBe(true)
		expect(mgr.state.isEU).toBe(true)
	})

	it('should not require explicit consent for non-EU users', () => {
		vi.stubGlobal('navigator', { language: 'en-US' })
		// Mock Intl to return non-European timezone
		vi.stubGlobal('Intl', {
			DateTimeFormat: () => ({
				resolvedOptions: () => ({ timeZone: 'America/New_York' }),
			}),
		})
		_resetFLConsent()
		const mgr = new FLConsentManager()
		expect(mgr.requiresExplicitConsent).toBe(false)
		expect(mgr.state.isEU).toBe(false)
	})
})

describe('detectEULocale', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('should detect EU from navigator.language', () => {
		vi.stubGlobal('navigator', { language: 'fr-FR' })
		expect(detectEULocale()).toBe(true)
	})

	it('should detect EU from European timezone', () => {
		vi.stubGlobal('navigator', { language: 'en' }) // no country suffix
		vi.stubGlobal('Intl', {
			DateTimeFormat: () => ({
				resolvedOptions: () => ({ timeZone: 'Europe/Berlin' }),
			}),
		})
		expect(detectEULocale()).toBe(true)
	})

	it('should return false for US locale', () => {
		vi.stubGlobal('navigator', { language: 'en-US' })
		vi.stubGlobal('Intl', {
			DateTimeFormat: () => ({
				resolvedOptions: () => ({ timeZone: 'America/Chicago' }),
			}),
		})
		expect(detectEULocale()).toBe(false)
	})

	it('should detect UK as EU-equivalent (GDPR)', () => {
		vi.stubGlobal('navigator', { language: 'en-GB' })
		expect(detectEULocale()).toBe(true)
	})
})
