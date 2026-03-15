// ─── CKKS Homomorphic Encryption Types ──────────────────────────────────────

/** Status of the CKKS encryption service */
export type CkksStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Serialized ciphertext blob (base64-encoded SEAL ciphertext) */
export interface CkksBlob {
	/** Base64-encoded SEAL Ciphertext */
	data: string
	/** Number of actual values packed (may be less than slot count) */
	valueCount: number
}

/** CKKS key pair — public key is shareable, secret key stays local */
export interface CkksKeyPair {
	publicKey: string // base64
	secretKey: string // base64
}

// ─── Worker Message Protocol ────────────────────────────────────────────────

export type CkksWorkerRequest =
	| { type: 'init' }
	| { type: 'generateKeys' }
	| { type: 'encrypt'; id: string; values: number[] }
	| { type: 'decrypt'; id: string; blob: CkksBlob }
	| { type: 'add'; id: string; blobA: CkksBlob; blobB: CkksBlob }
	| { type: 'loadKeys'; id: string; keys: CkksKeyPair }
	| { type: 'loadPublicKey'; id: string; publicKey: string }

export type CkksWorkerResponse =
	| { type: 'init:complete'; slotCount: number }
	| { type: 'init:error'; error: string }
	| { type: 'generateKeys:result'; keys: CkksKeyPair }
	| { type: 'generateKeys:error'; error: string }
	| { type: 'encrypt:result'; id: string; blob: CkksBlob }
	| { type: 'encrypt:error'; id: string; error: string }
	| { type: 'decrypt:result'; id: string; values: number[] }
	| { type: 'decrypt:error'; id: string; error: string }
	| { type: 'add:result'; id: string; blob: CkksBlob }
	| { type: 'add:error'; id: string; error: string }
	| { type: 'loadKeys:result'; id: string }
	| { type: 'loadKeys:error'; id: string; error: string }
	| { type: 'loadPublicKey:result'; id: string }
	| { type: 'loadPublicKey:error'; id: string; error: string }
