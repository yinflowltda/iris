import { describe, expect, it, beforeAll, vi } from 'vitest'
import { SealAggregator } from '../../../worker/lib/seal-aggregator'

// ─── Shared WASM context ──────────────────────────────────────────────────────
//
// node-seal uses Emscripten global state: calling initialize() twice corrupts
// the first instance's objects. All tests share ONE seal instance, loaded once
// in beforeAll. The aggregator is pre-seeded via _initWith() so it reuses the
// same WASM instance.
//
// node-seal v7 API notes:
//   encode(array, scale, destinationPlaintext)  — in-place, no return
//   encrypt(plaintext, destinationCiphertext)   — in-place, no return
//   decrypt(ciphertext, destinationPlaintext)   — in-place, no return
//   decodeFloat64(plaintext)                    — returns Float64Array

const POLY_MODULUS_DEGREE = 8192
const COEFF_MOD_BIT_SIZES = [60, 40, 40, 60]
const SCALE = Math.pow(2, 40)

type SealModule = Awaited<ReturnType<typeof import('node-seal')['default']>>

let seal: SealModule
let context: InstanceType<SealModule['SEALContext']>
let evaluator: InstanceType<SealModule['Evaluator']>
let encryptor: InstanceType<SealModule['Encryptor']>
let decryptor: InstanceType<SealModule['Decryptor']>
let encoder: InstanceType<SealModule['CKKSEncoder']>

beforeAll(async () => {
	const { default: initialize } = await import('node-seal')
	seal = await initialize()

	const parms = new seal.EncryptionParameters(seal.SchemeType.ckks)
	parms.setPolyModulusDegree(POLY_MODULUS_DEGREE)
	parms.setCoeffModulus(
		seal.CoeffModulus.Create(POLY_MODULUS_DEGREE, Int32Array.from(COEFF_MOD_BIT_SIZES)),
	)

	context = new seal.SEALContext(parms, true, seal.SecLevelType.tc128)
	evaluator = new seal.Evaluator(context)
	const keyGen = new seal.KeyGenerator(context)
	const publicKey = keyGen.createPublicKey()
	const secretKey = keyGen.secretKey()
	encryptor = new seal.Encryptor(context, publicKey)
	decryptor = new seal.Decryptor(context, secretKey)
	encoder = new seal.CKKSEncoder(context)

	parms.delete()
}, 30_000)

/** Encrypt an array of numbers to a base64 ciphertext string. */
function encrypt(values: number[]): string {
	const plain = new seal.Plaintext()
	encoder.encode(Float64Array.from(values), SCALE, plain)
	const cipher = new seal.Ciphertext()
	encryptor.encrypt(plain, cipher)
	plain.delete()
	const b64 = cipher.saveToBase64(seal.ComprModeType.zstd)
	cipher.delete()
	return b64
}

/** Decrypt a base64 ciphertext and return the first `count` decoded values. */
function decrypt(b64: string, count: number): number[] {
	const cipher = new seal.Ciphertext()
	cipher.loadFromBase64(context, b64)
	const plain = new seal.Plaintext()
	decryptor.decrypt(cipher, plain)
	cipher.delete()
	const decoded = encoder.decodeFloat64(plain)
	plain.delete()
	return Array.from(decoded.slice(0, count))
}

/** Create a fresh SealAggregator pre-seeded with the shared WASM context. */
function makeAggregator(): SealAggregator {
	const agg = new SealAggregator()
	agg._initWith(seal, context, evaluator)
	return agg
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SealAggregator', () => {
	// ─── Lazy initialization ───────────────────────────────────────────────────

	it('starts uninitialized', () => {
		const agg = new SealAggregator()
		expect(agg.isInitialized).toBe(false)
	})

	it('initializes when ensureInitialized() is called', async () => {
		const agg = makeAggregator()
		expect(agg.isInitialized).toBe(true)
		await agg.ensureInitialized() // no-op since _initWith already set _seal
		expect(agg.isInitialized).toBe(true)
	}, 30_000)

	it('ensureInitialized() returns the same pending promise on concurrent calls', () => {
		// Spy on _init to return a controlled promise (avoids loading a 2nd WASM instance).
		const agg = new SealAggregator()

		let resolveFn!: () => void
		const deferred = new Promise<void>((res) => {
			resolveFn = res
		})

		vi.spyOn(agg as any, '_init').mockReturnValue(deferred)

		const p1 = agg.ensureInitialized()
		const p2 = agg.ensureInitialized()

		// Both concurrent calls should return the exact same promise object
		expect(p1).toBe(p2)

		// Clean up
		resolveFn()
	})

	// ─── WASM caching ─────────────────────────────────────────────────────────

	it('addCiphertexts() uses the injected WASM context across multiple calls', async () => {
		const agg = makeAggregator()
		expect(agg.isInitialized).toBe(true)

		const b64A = encrypt([1, 2, 3])
		const b64B = encrypt([10, 20, 30])
		const b64C = encrypt([100, 200, 300])
		const b64D = encrypt([1000, 2000, 3000])

		const r1 = await agg.addCiphertexts(b64A, b64B)
		expect(agg.isInitialized).toBe(true)

		const r2 = await agg.addCiphertexts(b64C, b64D)
		expect(agg.isInitialized).toBe(true)

		const sum1 = decrypt(r1, 3)
		const sum2 = decrypt(r2, 3)

		expect(sum1[0]).toBeCloseTo(11, 0)
		expect(sum1[1]).toBeCloseTo(22, 0)
		expect(sum1[2]).toBeCloseTo(33, 0)

		expect(sum2[0]).toBeCloseTo(1100, 0)
		expect(sum2[1]).toBeCloseTo(2200, 0)
		expect(sum2[2]).toBeCloseTo(3300, 0)
	}, 30_000)

	// ─── Homomorphic addition ─────────────────────────────────────────────────

	it('addCiphertexts() correctly sums [1..10] + [10,20..100]', async () => {
		const agg = makeAggregator()

		const valuesA = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
		const valuesB = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
		const expected = valuesA.map((a, i) => a + valuesB[i])

		const b64A = encrypt(valuesA)
		const b64B = encrypt(valuesB)

		const resultB64 = await agg.addCiphertexts(b64A, b64B)
		const result = decrypt(resultB64, 10)

		for (let i = 0; i < 10; i++) {
			expect(result[i]).toBeCloseTo(expected[i], 0)
		}
	}, 30_000)

	// ─── Sequential addition of 3 ciphertexts ─────────────────────────────────

	it('sequential addition of 3 ciphertexts sums to 6', async () => {
		const agg = makeAggregator()

		// Encrypt [1], [2], [3] — each as a single-slot ciphertext
		const b64_1 = encrypt([1])
		const b64_2 = encrypt([2])
		const b64_3 = encrypt([3])

		// Add [1] + [2] = [3], then [3] + [3] = [6]
		const intermediate = await agg.addCiphertexts(b64_1, b64_2)
		const finalB64 = await agg.addCiphertexts(intermediate, b64_3)

		const result = decrypt(finalB64, 1)
		expect(result[0]).toBeCloseTo(6, 0)
	}, 30_000)
})
