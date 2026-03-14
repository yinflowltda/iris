// ─── CKKS Encryption Web Worker ─────────────────────────────────────────────
//
// Runs Microsoft SEAL (CKKS scheme) via WASM in a Web Worker to avoid blocking
// the UI thread. Handles encrypt, decrypt, and homomorphic add operations.

import type { CkksWorkerRequest, CkksWorkerResponse, CkksBlob, CkksKeyPair } from './ckks-types'
import { POLY_MODULUS_DEGREE, COEFF_MOD_BIT_SIZES, CKKS_SCALE } from '../../../shared/constants/ckks-params'

type MainModule = Awaited<ReturnType<typeof import('node-seal')['default']>>

// ─── SEAL State ─────────────────────────────────────────────────────────────

let seal: MainModule
let context: InstanceType<MainModule['SEALContext']>
let encoder: InstanceType<MainModule['CKKSEncoder']>
let encryptor: InstanceType<MainModule['Encryptor']> | null = null
let decryptor: InstanceType<MainModule['Decryptor']> | null = null
let evaluator: InstanceType<MainModule['Evaluator']>

// CKKS parameters
const SCALE = CKKS_SCALE

// ─── Helpers ────────────────────────────────────────────────────────────────

function post(msg: CkksWorkerResponse) {
	self.postMessage(msg)
}

// ─── Init ───────────────────────────────────────────────────────────────────

async function init() {
	try {
		// Dynamic import so WASM loads inside the worker
		const { default: initialize } = await import('node-seal')
		seal = await initialize({
			// Serve WASM from public/ — Vite's dep optimizer mangles the binary otherwise
			locateFile: (path: string) => (path.endsWith('.wasm') ? '/' + path : path),
		})

		const parms = new seal.EncryptionParameters(seal.SchemeType.ckks)
		parms.setPolyModulusDegree(POLY_MODULUS_DEGREE)
		parms.setCoeffModulus(seal.CoeffModulus.Create(POLY_MODULUS_DEGREE, Int32Array.from(COEFF_MOD_BIT_SIZES)))

		context = new seal.SEALContext(parms, true, seal.SecLevelType.tc128)
		encoder = new seal.CKKSEncoder(context)
		evaluator = new seal.Evaluator(context)

		parms.delete()

		post({ type: 'init:complete', slotCount: encoder.slotCount() })
	} catch (e) {
		post({ type: 'init:error', error: e instanceof Error ? e.message : String(e) })
	}
}

// ─── Key Generation ─────────────────────────────────────────────────────────

function generateKeys() {
	try {
		const keyGen = new seal.KeyGenerator(context)
		const publicKey = keyGen.createPublicKey()
		const secretKey = keyGen.secretKey()

		// Set up encryptor/decryptor
		encryptor = new seal.Encryptor(context, publicKey)
		decryptor = new seal.Decryptor(context, secretKey)

		const keys: CkksKeyPair = {
			publicKey: publicKey.saveToBase64(seal.ComprModeType.zstd),
			secretKey: secretKey.saveToBase64(seal.ComprModeType.zstd),
		}

		post({ type: 'generateKeys:result', keys })

		keyGen.delete()
		publicKey.delete()
		secretKey.delete()
	} catch (e) {
		post({ type: 'generateKeys:error', error: e instanceof Error ? e.message : String(e) })
	}
}

// ─── Load Keys ──────────────────────────────────────────────────────────────

function loadKeys(id: string, keys: CkksKeyPair) {
	try {
		const publicKey = new seal.PublicKey()
		publicKey.loadFromBase64(context, keys.publicKey)

		const secretKey = new seal.SecretKey()
		secretKey.loadFromBase64(context, keys.secretKey)

		encryptor = new seal.Encryptor(context, publicKey)
		decryptor = new seal.Decryptor(context, secretKey)

		publicKey.delete()
		secretKey.delete()

		post({ type: 'loadKeys:result', id })
	} catch (e) {
		post({ type: 'loadKeys:error', id, error: e instanceof Error ? e.message : String(e) })
	}
}

// ─── Encrypt ────────────────────────────────────────────────────────────────

function encrypt(id: string, values: number[]) {
	try {
		if (!encryptor) throw new Error('Keys not generated — call generateKeys first')

		const slotCount = encoder.slotCount()
		const padded = new Float64Array(slotCount)
		padded.set(values.slice(0, slotCount))

		const plaintext = new seal.Plaintext()
		encoder.encode(padded, SCALE, plaintext)

		const ciphertext = new seal.Ciphertext()
		encryptor.encrypt(plaintext, ciphertext)

		const blob: CkksBlob = {
			data: ciphertext.saveToBase64(seal.ComprModeType.zstd),
			valueCount: Math.min(values.length, slotCount),
		}

		plaintext.delete()
		ciphertext.delete()

		post({ type: 'encrypt:result', id, blob })
	} catch (e) {
		post({ type: 'encrypt:error', id, error: e instanceof Error ? e.message : String(e) })
	}
}

// ─── Decrypt ────────────────────────────────────────────────────────────────

function decrypt(id: string, blob: CkksBlob) {
	try {
		if (!decryptor) throw new Error('Keys not loaded — call generateKeys or loadKeys first')

		const ciphertext = new seal.Ciphertext()
		ciphertext.loadFromBase64(context, blob.data)

		const plaintext = new seal.Plaintext()
		decryptor.decrypt(ciphertext, plaintext)

		const decoded = encoder.decodeFloat64(plaintext) as Float64Array
		const values = Array.from(decoded.slice(0, blob.valueCount))

		ciphertext.delete()
		plaintext.delete()

		post({ type: 'decrypt:result', id, values })
	} catch (e) {
		post({ type: 'decrypt:error', id, error: e instanceof Error ? e.message : String(e) })
	}
}

// ─── Homomorphic Add ────────────────────────────────────────────────────────

function add(id: string, blobA: CkksBlob, blobB: CkksBlob) {
	try {
		const ctA = new seal.Ciphertext()
		ctA.loadFromBase64(context, blobA.data)

		const ctB = new seal.Ciphertext()
		ctB.loadFromBase64(context, blobB.data)

		evaluator.addInplace(ctA, ctB)

		const result: CkksBlob = {
			data: ctA.saveToBase64(seal.ComprModeType.zstd),
			valueCount: Math.max(blobA.valueCount, blobB.valueCount),
		}

		ctA.delete()
		ctB.delete()

		post({ type: 'add:result', id, blob: result })
	} catch (e) {
		post({ type: 'add:error', id, error: e instanceof Error ? e.message : String(e) })
	}
}

// ─── Message Handler ────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<CkksWorkerRequest>) => {
	const msg = e.data
	switch (msg.type) {
		case 'init':
			init()
			break
		case 'generateKeys':
			generateKeys()
			break
		case 'loadKeys':
			loadKeys(msg.id, msg.keys)
			break
		case 'encrypt':
			encrypt(msg.id, msg.values)
			break
		case 'decrypt':
			decrypt(msg.id, msg.blob)
			break
		case 'add':
			add(msg.id, msg.blobA, msg.blobB)
			break
	}
}
