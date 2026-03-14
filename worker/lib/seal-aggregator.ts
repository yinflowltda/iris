// ─── SEAL Aggregator ────────────────────────────────────────────────────────
//
// Server-side CKKS homomorphic addition for the AggregationDO.
// Creates only SEALContext + Evaluator — never touches plaintext or secret keys.
// Uses lazy initialization so WASM loads only when aggregation is needed.
//
// Requires `nodejs_compat` in wrangler.toml for node-seal's Emscripten module.

import { POLY_MODULUS_DEGREE, COEFF_MOD_BIT_SIZES } from '../../shared/constants/ckks-params'

type MainModule = Awaited<ReturnType<typeof import('node-seal')['default']>>

export class SealAggregator {
	private _seal: MainModule | null = null
	private _context: InstanceType<MainModule['SEALContext']> | null = null
	private _evaluator: InstanceType<MainModule['Evaluator']> | null = null
	private _initPromise: Promise<void> | null = null

	get isInitialized(): boolean {
		return this._seal !== null
	}

	/** Lazily initialize node-seal WASM. Cached on instance for reuse. */
	ensureInitialized(): Promise<void> {
		if (this._seal) return Promise.resolve()
		if (this._initPromise) return this._initPromise

		this._initPromise = this._init()
		return this._initPromise
	}

	private async _init(): Promise<void> {
		const { default: initialize } = await import('node-seal')
		const seal = await initialize()

		const parms = new seal.EncryptionParameters(seal.SchemeType.ckks)
		parms.setPolyModulusDegree(POLY_MODULUS_DEGREE)
		parms.setCoeffModulus(
			seal.CoeffModulus.Create(POLY_MODULUS_DEGREE, Int32Array.from(COEFF_MOD_BIT_SIZES)),
		)

		const context = new seal.SEALContext(parms, true, seal.SecLevelType.tc128)
		const evaluator = new seal.Evaluator(context)
		parms.delete()

		this._seal = seal
		this._context = context
		this._evaluator = evaluator
	}

	/**
	 * Inject a pre-initialized seal instance (test-only).
	 * Allows tests to share a single WASM instance across the aggregator and test helpers,
	 * since node-seal's Emscripten module uses global state and multiple instances conflict.
	 */
	_initWith(
		seal: MainModule,
		context: InstanceType<MainModule['SEALContext']>,
		evaluator: InstanceType<MainModule['Evaluator']>,
	): void {
		this._seal = seal
		this._context = context
		this._evaluator = evaluator
		this._initPromise = Promise.resolve()
	}

	/**
	 * Add two base64-encoded CKKS ciphertexts using evaluator.addInplace().
	 * Returns the sum as a base64 string. The input ciphertext objects are deleted
	 * after use to conserve memory.
	 */
	async addCiphertexts(b64A: string, b64B: string): Promise<string> {
		await this.ensureInitialized()
		const seal = this._seal!
		const context = this._context!
		const evaluator = this._evaluator!

		const ctA = new seal.Ciphertext()
		ctA.loadFromBase64(context, b64A)

		const ctB = new seal.Ciphertext()
		ctB.loadFromBase64(context, b64B)

		evaluator.addInplace(ctA, ctB)
		ctB.delete()

		const result = ctA.saveToBase64(seal.ComprModeType.zstd)
		ctA.delete()

		return result
	}
}
