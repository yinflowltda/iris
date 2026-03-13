import { describe, expect, it } from 'vitest'
import { PrivacyAccountant } from '../../../client/lib/prisma/privacy-accountant'

describe('PrivacyAccountant', () => {
	// ─── Initial State ────────────────────────────────────────────────────────

	it('starts with zero rounds and zero epsilon', () => {
		const acc = new PrivacyAccountant({ noiseMultiplier: 1.0 })
		expect(acc.state.rounds).toBe(0)
		expect(acc.state.epsilon).toBe(0)
		expect(acc.state.exhausted).toBe(false)
		expect(acc.state.remaining).toBe(1)
	})

	// ─── Accumulation ─────────────────────────────────────────────────────────

	it('epsilon increases after each step', () => {
		const acc = new PrivacyAccountant({ noiseMultiplier: 1.0 })

		const s1 = acc.step()
		expect(s1.rounds).toBe(1)
		expect(s1.epsilon).toBeGreaterThan(0)

		const s2 = acc.step()
		expect(s2.rounds).toBe(2)
		expect(s2.epsilon).toBeGreaterThan(s1.epsilon)
	})

	it('epsilon grows roughly linearly with rounds (composition)', () => {
		const acc = new PrivacyAccountant({ noiseMultiplier: 1.0 })

		for (let i = 0; i < 10; i++) acc.step()
		const eps10 = acc.state.epsilon

		for (let i = 0; i < 10; i++) acc.step()
		const eps20 = acc.state.epsilon

		// eps20 should be roughly 2x eps10 (linear composition under RDP)
		expect(eps20 / eps10).toBeCloseTo(2, 0)
	})

	// ─── Noise Multiplier Effect ──────────────────────────────────────────────

	it('higher noise multiplier → slower budget consumption', () => {
		const accLow = new PrivacyAccountant({ noiseMultiplier: 0.5 })
		const accHigh = new PrivacyAccountant({ noiseMultiplier: 2.0 })

		for (let i = 0; i < 10; i++) {
			accLow.step()
			accHigh.step()
		}

		expect(accHigh.state.epsilon).toBeLessThan(accLow.state.epsilon)
	})

	// ─── Budget Exhaustion ────────────────────────────────────────────────────

	it('marks exhausted when epsilon reaches maxEpsilon', () => {
		const acc = new PrivacyAccountant({
			noiseMultiplier: 0.5,
			maxEpsilon: 2.0,
		})

		let state = acc.state
		while (!state.exhausted) {
			state = acc.step()
		}

		expect(state.exhausted).toBe(true)
		expect(state.epsilon).toBeGreaterThanOrEqual(2.0)
		expect(state.remaining).toBe(0)
	})

	it('remaining decreases toward 0', () => {
		const acc = new PrivacyAccountant({ noiseMultiplier: 1.0, maxEpsilon: 10 })

		const initial = acc.state.remaining
		acc.step()
		const after1 = acc.state.remaining

		expect(after1).toBeLessThan(initial)
		expect(after1).toBeGreaterThan(0)
	})

	// ─── Subsampling ──────────────────────────────────────────────────────────

	it('subsampling reduces privacy cost', () => {
		const accFull = new PrivacyAccountant({ noiseMultiplier: 1.0, samplingRate: 1.0 })
		const accSub = new PrivacyAccountant({ noiseMultiplier: 1.0, samplingRate: 0.1 })

		for (let i = 0; i < 10; i++) {
			accFull.step()
			accSub.step()
		}

		expect(accSub.state.epsilon).toBeLessThan(accFull.state.epsilon)
	})

	// ─── Reset ────────────────────────────────────────────────────────────────

	it('reset clears rounds and epsilon', () => {
		const acc = new PrivacyAccountant({ noiseMultiplier: 1.0 })

		for (let i = 0; i < 5; i++) acc.step()
		expect(acc.state.rounds).toBe(5)
		expect(acc.state.epsilon).toBeGreaterThan(0)

		acc.reset()
		expect(acc.state.rounds).toBe(0)
		expect(acc.state.epsilon).toBe(0)
		expect(acc.state.exhausted).toBe(false)
	})

	// ─── Rounds Getter ────────────────────────────────────────────────────────

	it('rounds getter matches state', () => {
		const acc = new PrivacyAccountant({ noiseMultiplier: 1.0 })
		acc.step()
		acc.step()
		expect(acc.rounds).toBe(2)
		expect(acc.rounds).toBe(acc.state.rounds)
	})

	// ─── Known Values ─────────────────────────────────────────────────────────

	it('produces correct epsilon for known parameters', () => {
		// With σ=1.0, full participation, δ=1e-5, after 1 step:
		// RDP at order α: ε_α = α/(2σ²) = α/2
		// (ε,δ)-DP: ε = min_α [α/2 + ln(1/δ)/(α-1)]
		// = min_α [α/2 + ln(100000)/(α-1)]
		// Analytical minimum around α ≈ 6-7 gives ε ≈ 5.5-6.0
		const acc = new PrivacyAccountant({
			noiseMultiplier: 1.0,
			delta: 1e-5,
		})
		const state = acc.step()

		// Verify it's in the expected ballpark
		expect(state.epsilon).toBeGreaterThan(4)
		expect(state.epsilon).toBeLessThan(7)
	})

	// ─── Default Config ───────────────────────────────────────────────────────

	it('uses sensible defaults', () => {
		const acc = new PrivacyAccountant({ noiseMultiplier: 1.0 })
		expect(acc.state.delta).toBe(1e-5)
	})
})
