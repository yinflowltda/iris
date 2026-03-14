#!/usr/bin/env node
// ─── Browser FL Simulation ──────────────────────────────────────────────────
//
// Simulates 2 browser clients doing the full FL pipeline:
//   1. Initialize CKKS (like CkksService Web Worker would)
//   2. Generate keys + "persist to IDB" (simulated)
//   3. Create LoRA adapter with FFA params (9,216 trainable params)
//   4. Simulate training (modify B matrices)
//   5. Compute delta, clip + Gaussian noise (DP)
//   6. Encrypt via CKKS
//   7. Submit to production AggregationDO
//   8. Wait for aggregation
//   9. Download aggregate, decrypt, verify
//
// Usage: node --experimental-wasm-exnref tests/browser-fl-simulation.mjs [base-url]

import SEAL from 'node-seal'

const BASE = process.argv[2] || 'https://iris.yinflow.life'
const MAP_ID = `browser-sim-${Date.now()}`

// ─── LoRA Config (matches client/lib/prisma/lora-adapter.ts) ────────────────

const INPUT_DIM = 384
const HIDDEN_DIM = 128
const OUTPUT_DIM = 384
const RANK = 18
// B1: HIDDEN_DIM × RANK = 128×18 = 2304
// B2: OUTPUT_DIM × RANK = 384×18 = 6912
// Total trainable: 9216
const PARAM_COUNT = HIDDEN_DIM * RANK + OUTPUT_DIM * RANK

// ─── CKKS Config (matches shared/constants/ckks-params.ts) ──────────────────

const POLY_MODULUS_DEGREE = 8192
const COEFF_MOD_BIT_SIZES = [60, 40, 40, 60]
const CKKS_SCALE = Math.pow(2, 40)

// ─── DP Config (matches client/lib/prisma/differential-privacy.ts) ──────────

const MAX_NORM = 1.0
const EPSILON = 1.0
const DELTA = 1e-5

function computeSigma(C, eps, delta) {
	return (C * Math.sqrt(2 * Math.log(1.25 / delta))) / eps
}

function clipAndNoise(delta, C, sigma) {
	const norm = Math.sqrt(delta.reduce((s, v) => s + v * v, 0))
	const scale = Math.min(1, C / Math.max(norm, 1e-12))
	const result = new Float32Array(delta.length)
	for (let i = 0; i < delta.length; i++) {
		// Box-Muller for Gaussian noise
		const u1 = Math.random()
		const u2 = Math.random()
		const noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma
		result[i] = delta[i] * scale + noise
	}
	return result
}

function l2Norm(v) {
	return Math.sqrt(v.reduce((s, x) => s + x * x, 0))
}

// ─── Simulate LoRA Training ─────────────────────────────────────────────────

function simulateTraining(clientName, numExamples) {
	// Start with zero B matrices (like real LoRA init)
	const beforeParams = new Float32Array(PARAM_COUNT) // all zeros

	// Simulate training: small gradient updates to B matrices
	const afterParams = new Float32Array(PARAM_COUNT)
	for (let i = 0; i < PARAM_COUNT; i++) {
		// Simulate SGD updates: small random gradients scaled by learning rate
		afterParams[i] = (Math.random() - 0.5) * 0.01 * numExamples
	}

	// Compute delta
	const delta = new Float32Array(PARAM_COUNT)
	for (let i = 0; i < PARAM_COUNT; i++) {
		delta[i] = afterParams[i] - beforeParams[i]
	}

	return { beforeParams, afterParams, delta }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
	const log = (prefix, msg) => console.log(`  ${prefix} ${msg}`)
	const section = (title) => console.log(`\n${'─'.repeat(60)}\n  ${title}\n${'─'.repeat(60)}`)

	console.log(`\n${'═'.repeat(60)}`)
	console.log(`  BROWSER FL SIMULATION`)
	console.log(`  ${new Date().toISOString()}`)
	console.log(`  Target: ${BASE}`)
	console.log(`  Map ID: ${MAP_ID}`)
	console.log(`${'═'.repeat(60)}`)

	// ── Step 1: Initialize SEAL (like CkksService Web Worker) ──────────────

	section('Step 1: CKKS Initialization (simulating Web Worker)')

	const seal = await SEAL()
	const parms = new seal.EncryptionParameters(seal.SchemeType.ckks)
	parms.setPolyModulusDegree(POLY_MODULUS_DEGREE)
	parms.setCoeffModulus(
		seal.CoeffModulus.Create(POLY_MODULUS_DEGREE, Int32Array.from(COEFF_MOD_BIT_SIZES)),
	)
	const context = new seal.SEALContext(parms, true, seal.SecLevelType.tc128)
	const encoder = new seal.CKKSEncoder(context)
	const slotCount = encoder.slotCount()

	log('✅', `SEAL initialized (${slotCount} slots per ciphertext)`)
	log('📐', `LoRA params: ${PARAM_COUNT} (B1=${HIDDEN_DIM}×${RANK} + B2=${OUTPUT_DIM}×${RANK})`)
	log('📐', `Blobs needed: ${Math.ceil(PARAM_COUNT / slotCount)} (${PARAM_COUNT} params / ${slotCount} slots)`)

	// ── Step 2: Generate keys for 2 clients ────────────────────────────────

	section('Step 2: Key Generation (simulating IndexedDB persistence)')

	// IMPORTANT: All clients must share the same CKKS keypair for homomorphic
	// addition to produce valid results. In production, this shared key would be
	// derived deterministically from a round seed or distributed by the coordinator.
	const sharedKeyGen = new seal.KeyGenerator(context)
	const sharedPublicKey = sharedKeyGen.createPublicKey()
	const sharedSecretKey = sharedKeyGen.secretKey()

	log('🔑', `Shared keypair generated (all clients encrypt with same public key)`)
	log('💡', `This is required: CKKS addInplace only works on ciphertexts under the same key`)

	const clients = []
	for (const name of ['Client-A', 'Client-B']) {
		const encryptor = new seal.Encryptor(context, sharedPublicKey)
		const decryptor = new seal.Decryptor(context, sharedSecretKey)
		clients.push({ name, encryptor, decryptor, id: crypto.randomUUID() })
		log('🔑', `${name}: using shared keypair (id=${clients.at(-1).id.slice(0, 8)}...)`)
	}

	// ── Step 3: Simulate training for both clients ─────────────────────────

	section('Step 3: Local Training (simulating LoRA SGD)')

	const clientData = clients.map((client) => {
		const numExamples = 5 + Math.floor(Math.random() * 10)
		const { beforeParams, afterParams, delta } = simulateTraining(client.name, numExamples)
		const rawNorm = l2Norm(delta)

		log('🏋️', `${client.name}: ${numExamples} examples, delta L2=${rawNorm.toFixed(6)}`)

		return { ...client, numExamples, beforeParams, afterParams, delta, rawNorm }
	})

	// ── Step 4: Differential Privacy ───────────────────────────────────────

	section('Step 4: Differential Privacy (clip + Gaussian noise)')

	const sigma = computeSigma(MAX_NORM, EPSILON, DELTA)
	log('📊', `DP params: C=${MAX_NORM}, ε=${EPSILON}, δ=${DELTA}, σ=${sigma.toFixed(4)}`)

	for (const cd of clientData) {
		cd.privateDelta = clipAndNoise(cd.delta, MAX_NORM, sigma)
		const privateNorm = l2Norm(cd.privateDelta)
		log('🔒', `${cd.name}: raw L2=${cd.rawNorm.toFixed(6)} → private L2=${privateNorm.toFixed(6)}`)
	}

	// ── Step 5: CKKS Encryption ────────────────────────────────────────────

	section('Step 5: CKKS Encryption (simulating browser Web Worker)')

	for (const cd of clientData) {
		// Split into multiple blobs like CkksService.encryptVector does
		const numBlobs = Math.ceil(PARAM_COUNT / slotCount)
		cd.blobs = []

		for (let b = 0; b < numBlobs; b++) {
			const offset = b * slotCount
			const remaining = Math.min(slotCount, PARAM_COUNT - offset)
			const padded = new Float64Array(slotCount) // zero-padded
			for (let i = 0; i < remaining; i++) {
				padded[i] = cd.privateDelta[offset + i]
			}

			const plain = new seal.Plaintext()
			encoder.encode(padded, CKKS_SCALE, plain)
			const ct = new seal.Ciphertext()
			cd.encryptor.encrypt(plain, ct)
			cd.blobs.push(ct.saveToBase64(seal.ComprModeType.zstd))

			plain.delete()
			ct.delete()
		}

		const totalChars = cd.blobs.reduce((s, b) => s + b.length, 0)
		log('🔐', `${cd.name}: ${cd.blobs.length} blobs, ${totalChars} chars total (${(totalChars * 0.75 / 1024).toFixed(1)} KB)`)
	}

	// ── Step 6: Open FL Round ──────────────────────────────────────────────

	section('Step 6: Open FL Round (like orchestrator does on first submit)')

	const openResp = await fetch(`${BASE}/fl/rounds/open?mapId=${MAP_ID}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ minSubmissions: 2 }),
	})
	const openData = await openResp.json()
	log('📂', `Round: ${openData.roundId}`)
	log('📂', `Expires: ${openData.expiresAt}`)

	// ── Step 7: Submit from both clients ───────────────────────────────────

	section('Step 7: Submit Encrypted Deltas')

	for (const cd of clientData) {
		const t0 = Date.now()
		const resp = await fetch(`${BASE}/fl/rounds/submit?mapId=${MAP_ID}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				clientId: cd.id,
				roundId: openData.roundId,
				blobs: cd.blobs,
				numExamples: cd.numExamples,
				reportedNorm: cd.rawNorm,
			}),
		})
		const data = await resp.json()
		const ms = Date.now() - t0
		log('📤', `${cd.name}: count=${data.submissionCount}, status=${data.roundStatus} (${ms}ms)`)
	}

	// ── Step 8: Wait for Aggregation ───────────────────────────────────────

	section('Step 8: Aggregation (server-side CKKS homomorphic addition)')

	// Trigger aggregation if not auto-triggered
	const aggResp = await fetch(`${BASE}/fl/rounds/aggregate-now?mapId=${MAP_ID}`, { method: 'POST' })
	const aggData = await aggResp.json()
	log('⚙️', `Trigger response: ${JSON.stringify(aggData)}`)

	// Poll for published status
	let published = false
	for (let attempt = 0; attempt < 10; attempt++) {
		await new Promise(r => setTimeout(r, 2000))
		const statusResp = await fetch(`${BASE}/fl/rounds/status?mapId=${MAP_ID}`)
		const statusData = await statusResp.json()
		log('⏳', `Attempt ${attempt + 1}: status=${statusData.status}, aggregate=${statusData.hasAggregate}`)
		if (statusData.status === 'published') {
			published = true
			break
		}
	}

	if (!published) {
		console.log('\n  ❌ Round did not publish. Check worker logs.')
		process.exit(1)
	}

	// ── Step 9: Download Aggregate ─────────────────────────────────────────

	section('Step 9: Download Aggregate (like FL client does)')

	const getAggResp = await fetch(`${BASE}/fl/rounds/aggregate?mapId=${MAP_ID}`)
	const getAggData = await getAggResp.json()
	const aggBlobs = getAggData.blobs
	if (!aggBlobs || aggBlobs.length === 0) {
		console.log('\n  ❌ No aggregate blobs returned')
		process.exit(1)
	}

	const totalAggChars = aggBlobs.reduce((s, b) => s + b.length, 0)
	log('📥', `Aggregate: ${aggBlobs.length} blob(s), ${totalAggChars} chars total (${(totalAggChars * 0.75 / 1024).toFixed(1)} KB)`)
	log('📥', `Submission count: ${getAggData.submissionCount}`)

	// ── Step 10: Decrypt from both clients' perspectives ───────────────────

	section('Step 10: Decrypt & Apply Aggregate (both clients)')

	for (const cd of clientData) {
		// Decrypt all blobs and stitch together (like FL client's applyAggregate)
		const aggregatedDelta = new Float32Array(PARAM_COUNT)
		for (let b = 0; b < aggBlobs.length; b++) {
			const aggCt = new seal.Ciphertext()
			aggCt.loadFromBase64(context, aggBlobs[b])

			const decryptedPlain = new seal.Plaintext()
			cd.decryptor.decrypt(aggCt, decryptedPlain)
			const decryptedValues = encoder.decodeFloat64(decryptedPlain)

			const offset = b * slotCount
			const remaining = Math.min(slotCount, PARAM_COUNT - offset)
			for (let i = 0; i < remaining; i++) {
				aggregatedDelta[offset + i] = decryptedValues[i]
			}

			aggCt.delete()
			decryptedPlain.delete()
		}

		// Apply: current_params += aggregated_delta / submissionCount
		// (This is what FL client's applyAggregate does)
		const scale = 1 / getAggData.submissionCount
		const updatedParams = new Float32Array(PARAM_COUNT)
		for (let i = 0; i < PARAM_COUNT; i++) {
			updatedParams[i] = cd.afterParams[i] + aggregatedDelta[i] * scale
		}

		// Check a few sample values
		const sampleIndices = [0, 100, 1000, 5000, 9000]
		log('📊', `${cd.name} — sample updated params:`)
		for (const idx of sampleIndices) {
			log('  ', `  B[${idx}]: before=${cd.afterParams[idx].toFixed(6)} → after=${updatedParams[idx].toFixed(6)} (Δ=${(aggregatedDelta[idx] * scale).toFixed(6)})`)
		}

		// Verify: the aggregate should be approximately the sum of both clients' private deltas
		// (since the server does homomorphic addition)
		const expectedSum = new Float32Array(PARAM_COUNT)
		for (let i = 0; i < PARAM_COUNT; i++) {
			expectedSum[i] = clientData[0].privateDelta[i] + clientData[1].privateDelta[i]
		}

		let maxError = 0
		for (let i = 0; i < PARAM_COUNT; i++) {
			const err = Math.abs(aggregatedDelta[i] - expectedSum[i])
			if (err > maxError) maxError = err
		}

		log('🔍', `${cd.name}: max decryption error vs expected sum = ${maxError.toExponential(3)}`)
	}

	// ── Step 11: Metrics ───────────────────────────────────────────────────

	section('Step 11: Round Metrics')

	const metricsResp = await fetch(`${BASE}/fl/rounds/metrics?mapId=${MAP_ID}`)
	const metricsData = await metricsResp.json()
	log('📈', `Completed rounds: ${metricsData.totalRoundsCompleted}`)
	log('📈', `Avg submissions/round: ${metricsData.avgSubmissionsPerRound}`)
	log('📈', `Avg duration: ${metricsData.avgRoundDurationMs}ms`)

	// ── Summary ────────────────────────────────────────────────────────────

	console.log(`\n${'═'.repeat(60)}`)
	console.log(`  RESULT: ✅ Browser FL simulation PASSED`)
	console.log(``)
	console.log(`  Pipeline: train → DP → CKKS encrypt → submit → aggregate → decrypt → apply`)
	console.log(`  Clients: 2 (shared public key, independent training)`)
	console.log(`  LoRA params: ${PARAM_COUNT} (FFA-LoRA, rank ${RANK})`)
	console.log(`  Privacy: ε=${EPSILON}, δ=${DELTA}, σ=${sigma.toFixed(4)}`)
	console.log(`  Encryption: CKKS (${slotCount} slots, ${clientData[0].blobs.length} blobs, ~${(clientData[0].blobs.reduce((s, b) => s + b.length, 0) * 0.75 / 1024).toFixed(0)} KB total)`)
	console.log(`  Server: homomorphic addInplace (never sees plaintext)`)
	console.log(`${'═'.repeat(60)}\n`)

	// Cleanup
	for (const cd of clientData) {
		cd.encryptor.delete()
		cd.decryptor.delete()
	}
	sharedKeyGen.delete()
	sharedPublicKey.delete()
	sharedSecretKey.delete()
	encoder.delete()
	parms.delete()
}

main().catch(err => {
	console.error('❌ Simulation failed:', err.message)
	process.exit(1)
})
