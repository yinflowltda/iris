// ─── SEAL Aggregator ────────────────────────────────────────────────────────
//
// Server-side CKKS homomorphic encryption for the AggregationDO.
// Manages keypair generation, homomorphic addition, and aggregate decryption.
// The server holds the keypair per map — clients encrypt with the public key,
// and the server decrypts only the aggregate (never individual submissions).
//
// WASM Loading Strategy:
// Emscripten (node-seal) tries to load WASM via XMLHttpRequest (browser) or
// fs.readFileSync (Node.js) — neither available in Cloudflare Workers.
// We import the WASM as a Cloudflare module binding and use Emscripten's
// `instantiateWasm` callback to inject it directly, bypassing all I/O.

import { POLY_MODULUS_DEGREE, COEFF_MOD_BIT_SIZES, CKKS_SCALE } from '../../shared/constants/ckks-params'
// @ts-expect-error — Cloudflare Workers .wasm import yields WebAssembly.Module
import sealWasmModule from '../../node_modules/node-seal/dist/seal_throws.wasm'

type MainModule = Awaited<ReturnType<typeof import('node-seal')['default']>>

export interface SealKeyMaterial {
	publicKey: string // base64
	secretKey: string // base64
}

export class SealAggregator {
	private _seal: MainModule | null = null
	private _context: InstanceType<MainModule['SEALContext']> | null = null
	private _evaluator: InstanceType<MainModule['Evaluator']> | null = null
	private _encoder: InstanceType<MainModule['CKKSEncoder']> | null = null
	private _decryptor: InstanceType<MainModule['Decryptor']> | null = null
	private _initPromise: Promise<void> | null = null

	get isInitialized(): boolean {
		return this._seal !== null
	}

	get slotCount(): number {
		return this._encoder?.slotCount() ?? 0
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
		const seal = await initialize({
			// Override Emscripten's WASM loading to work in Cloudflare Workers.
			// The static .wasm import gives us a WebAssembly.Module (already compiled).
			// We instantiate it directly, bypassing XMLHttpRequest/fs.readFileSync.
			instantiateWasm(
				imports: WebAssembly.Imports,
				receiveInstance: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
			) {
				WebAssembly.instantiate(sealWasmModule, imports).then((instance) => {
					receiveInstance(instance, sealWasmModule)
				})
				return {} // async path — Emscripten waits for receiveInstance callback
			},
		})

		const parms = new seal.EncryptionParameters(seal.SchemeType.ckks)
		parms.setPolyModulusDegree(POLY_MODULUS_DEGREE)
		parms.setCoeffModulus(
			seal.CoeffModulus.Create(POLY_MODULUS_DEGREE, Int32Array.from(COEFF_MOD_BIT_SIZES)),
		)

		const context = new seal.SEALContext(parms, true, seal.SecLevelType.tc128)
		const evaluator = new seal.Evaluator(context)
		const encoder = new seal.CKKSEncoder(context)
		parms.delete()

		this._seal = seal
		this._context = context
		this._evaluator = evaluator
		this._encoder = encoder
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
		this._encoder = new seal.CKKSEncoder(context)
		this._initPromise = Promise.resolve()
	}

	// ─── Key Management ─────────────────────────────────────────────────────

	/** Generate a new CKKS keypair. Returns serialized key material for storage. */
	async generateKeys(): Promise<SealKeyMaterial> {
		await this.ensureInitialized()
		const seal = this._seal!
		const context = this._context!

		const keyGen = new seal.KeyGenerator(context)
		const publicKey = keyGen.createPublicKey()
		const secretKey = keyGen.secretKey()

		const material: SealKeyMaterial = {
			publicKey: publicKey.saveToBase64(seal.ComprModeType.zstd),
			secretKey: secretKey.saveToBase64(seal.ComprModeType.zstd),
		}

		keyGen.delete()
		publicKey.delete()
		secretKey.delete()

		return material
	}

	/** Load a secret key for decryption. Call before decryptBlobs(). */
	async loadSecretKey(secretKeyB64: string): Promise<void> {
		await this.ensureInitialized()
		const seal = this._seal!
		const context = this._context!

		const secretKey = new seal.SecretKey()
		secretKey.loadFromBase64(context, secretKeyB64)
		this._decryptor = new seal.Decryptor(context, secretKey)
		secretKey.delete()
	}

	// ─── Homomorphic Addition ───────────────────────────────────────────────

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

	// ─── Decryption ─────────────────────────────────────────────────────────

	/**
	 * Decrypt a list of base64-encoded CKKS ciphertext blobs into plaintext values.
	 * @param blobs        Array of base64-encoded ciphertexts
	 * @param totalParams  Total number of parameter values across all blobs
	 * @returns Float64Array of decrypted values
	 */
	async decryptBlobs(blobs: string[], totalParams: number): Promise<number[]> {
		await this.ensureInitialized()
		if (!this._decryptor) throw new Error('Secret key not loaded — call loadSecretKey first')

		const seal = this._seal!
		const context = this._context!
		const encoder = this._encoder!
		const decryptor = this._decryptor
		const slotCount = encoder.slotCount()

		const allValues: number[] = []

		for (let i = 0; i < blobs.length; i++) {
			const ct = new seal.Ciphertext()
			ct.loadFromBase64(context, blobs[i])

			const plain = new seal.Plaintext()
			decryptor.decrypt(ct, plain)
			ct.delete()

			const decoded = encoder.decodeFloat64(plain) as Float64Array
			plain.delete()

			// Last blob may have fewer values
			const valuesInBlob = i < blobs.length - 1
				? slotCount
				: totalParams - (blobs.length - 1) * slotCount
			for (let j = 0; j < valuesInBlob; j++) {
				allValues.push(decoded[j])
			}
		}

		return allValues
	}
}
