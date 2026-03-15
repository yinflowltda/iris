// ─── Privacy Accountant: Rényi DP Budget Tracking ───────────────────────────
//
// Tracks cumulative privacy loss across FL rounds using Rényi Differential
// Privacy (RDP). Converts to (ε, δ)-DP for human-readable budgets.
//
// Each FL round where a client participates consumes some privacy budget.
// The accountant warns when the budget approaches the threshold.
//
// Pure TypeScript, no external dependencies.

export interface PrivacyBudgetConfig {
	/** Maximum total (ε, δ)-DP epsilon before warning. Default: 8.0 */
	maxEpsilon: number
	/** Target delta for (ε, δ)-DP conversion. Default: 1e-5 */
	delta: number
	/** Noise multiplier σ/C used in the Gaussian mechanism. */
	noiseMultiplier: number
	/** Sampling rate q = (batch_size / dataset_size). Default: 1.0 (full participation) */
	samplingRate: number
}

export interface PrivacyState {
	/** Number of rounds participated in */
	rounds: number
	/** Current cumulative (ε, δ)-DP epsilon */
	epsilon: number
	/** Configured delta */
	delta: number
	/** Whether budget is exhausted (epsilon ≥ maxEpsilon) */
	exhausted: boolean
	/** Remaining budget as fraction [0, 1] */
	remaining: number
}

const DEFAULT_CONFIG: PrivacyBudgetConfig = {
	maxEpsilon: 8.0,
	delta: 1e-5,
	noiseMultiplier: 1.0,
	samplingRate: 1.0,
}

// Rényi divergence orders to evaluate. Higher orders give tighter bounds
// for composition but looser for single steps; we take the minimum over all.
const RDP_ORDERS = [
	1.5, 1.75, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 11, 12,
	13, 14, 15, 16, 17, 18, 19, 20, 25, 30, 40, 50, 75, 100,
]

export class PrivacyAccountant {
	private config: PrivacyBudgetConfig
	private _rounds = 0
	// Accumulated RDP epsilon at each order
	private rdpEpsilons: Float64Array

	constructor(config?: Partial<PrivacyBudgetConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.rdpEpsilons = new Float64Array(RDP_ORDERS.length)
	}

	/** Record one FL round of participation. Returns the new privacy state. */
	step(): PrivacyState {
		this._rounds++

		// Accumulate RDP epsilons (composition: just add)
		for (let i = 0; i < RDP_ORDERS.length; i++) {
			this.rdpEpsilons[i] += computeRdpGaussian(
				RDP_ORDERS[i],
				this.config.noiseMultiplier,
				this.config.samplingRate,
			)
		}

		return this.state
	}

	/** Get current privacy state without stepping. */
	get state(): PrivacyState {
		const epsilon = this.computeEpsilon()
		return {
			rounds: this._rounds,
			epsilon,
			delta: this.config.delta,
			exhausted: epsilon >= this.config.maxEpsilon,
			remaining: Math.max(0, 1 - epsilon / this.config.maxEpsilon),
		}
	}

	get rounds(): number {
		return this._rounds
	}

	/** Convert accumulated RDP to (ε, δ)-DP, taking the tightest bound. */
	private computeEpsilon(): number {
		if (this._rounds === 0) return 0

		let minEpsilon = Infinity
		for (let i = 0; i < RDP_ORDERS.length; i++) {
			const alpha = RDP_ORDERS[i]
			const rdpEps = this.rdpEpsilons[i]
			// RDP → (ε, δ)-DP conversion: ε = rdp_ε - log(δ) / (α - 1)
			const eps = rdpEps + Math.log(1 / this.config.delta) / (alpha - 1)
			if (eps < minEpsilon) {
				minEpsilon = eps
			}
		}
		return minEpsilon
	}

	/** Reset the accountant (e.g., at the start of a new consent period). */
	reset(): void {
		this._rounds = 0
		this.rdpEpsilons.fill(0)
	}
}

// ─── RDP for Gaussian Mechanism ─────────────────────────────────────────────

/**
 * Compute the RDP epsilon for a single step of the Gaussian mechanism
 * at Rényi order α, with noise multiplier σ/C and subsampling rate q.
 *
 * For the full-participation case (q = 1):
 *   ε_α = α / (2σ²)
 *
 * For the subsampled case (q < 1), we use the analytic bound:
 *   ε_α ≤ (1/(α-1)) · log(1 - q + q · exp((α-1) · ε_α_full))
 *
 * where ε_α_full = α / (2σ²) is the full-participation RDP.
 */
function computeRdpGaussian(alpha: number, noiseMultiplier: number, samplingRate: number): number {
	const sigma2 = noiseMultiplier * noiseMultiplier
	const fullRdp = alpha / (2 * sigma2)

	if (samplingRate >= 1.0) {
		return fullRdp
	}

	// Subsampled Gaussian RDP (analytic bound)
	const q = samplingRate
	const logTerm = Math.log(1 - q + q * Math.exp((alpha - 1) * fullRdp))
	return logTerm / (alpha - 1)
}
