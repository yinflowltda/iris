#!/usr/bin/env node
// ─── FL E2E Test with Real CKKS Encryption ────────────────────────────────────
//
// Tests the full pipeline: generate keys → encrypt vectors → submit to DO →
// aggregate (homomorphic addition) → download aggregate → decrypt → verify sum.
//
// Usage: node --experimental-wasm-exnref tests/e2e-fl-ckks.mjs [base-url]

import SEAL from 'node-seal'

const BASE = process.argv[2] || 'http://localhost:5175'
const MAP_ID = `ckks-e2e-${Date.now()}`

// ─── CKKS Setup (matching shared/constants/ckks-params.ts) ──────────────────

const POLY_MODULUS_DEGREE = 8192
const COEFF_MOD_BIT_SIZES = [60, 40, 40, 60]
const CKKS_SCALE = Math.pow(2, 40)

async function createCkksContext(seal) {
	const parms = new seal.EncryptionParameters(seal.SchemeType.ckks)
	parms.setPolyModulusDegree(POLY_MODULUS_DEGREE)
	parms.setCoeffModulus(
		seal.CoeffModulus.Create(POLY_MODULUS_DEGREE, Int32Array.from(COEFF_MOD_BIT_SIZES)),
	)
	const context = new seal.SEALContext(parms, true, seal.SecLevelType.tc128)
	return { context, parms }
}

// ─── Test ───────────────────────────────────────────────────────────────────

async function main() {
	console.log(`\n🔐 FL E2E Test with Real CKKS Encryption`)
	console.log(`   Base URL: ${BASE}`)
	console.log(`   Map ID:   ${MAP_ID}\n`)

	// 1. Initialize SEAL
	console.log('Step 1: Initializing node-seal WASM...')
	const seal = await SEAL()
	const { context } = await createCkksContext(seal)

	const keyGen = new seal.KeyGenerator(context)
	const publicKey = keyGen.createPublicKey()
	const secretKey = keyGen.secretKey()

	const encoder = new seal.CKKSEncoder(context)
	const encryptor = new seal.Encryptor(context, publicKey)
	const decryptor = new seal.Decryptor(context, secretKey)
	const evaluator = new seal.Evaluator(context)
	const slotCount = encoder.slotCount()

	console.log(`   ✅ SEAL initialized (${slotCount} slots per ciphertext)\n`)

	// 2. Create test vectors for 2 clients
	console.log('Step 2: Creating test vectors...')
	const client1Values = new Float64Array(slotCount)
	const client2Values = new Float64Array(slotCount)
	for (let i = 0; i < slotCount; i++) {
		client1Values[i] = (i + 1) * 0.001 // [0.001, 0.002, ...]
		client2Values[i] = (i + 1) * 0.002 // [0.002, 0.004, ...]
	}
	const expectedSum = new Float64Array(slotCount)
	for (let i = 0; i < slotCount; i++) {
		expectedSum[i] = client1Values[i] + client2Values[i]
	}
	console.log(`   Client 1 first 5: [${Array.from(client1Values.slice(0, 5)).map(v => v.toFixed(4))}]`)
	console.log(`   Client 2 first 5: [${Array.from(client2Values.slice(0, 5)).map(v => v.toFixed(4))}]`)
	console.log(`   Expected sum:     [${Array.from(expectedSum.slice(0, 5)).map(v => v.toFixed(4))}]\n`)

	// 3. Encrypt
	console.log('Step 3: Encrypting vectors...')
	const plain1 = new seal.Plaintext()
	encoder.encode(client1Values, CKKS_SCALE, plain1)
	const ct1 = new seal.Ciphertext()
	encryptor.encrypt(plain1, ct1)
	const blob1 = ct1.saveToBase64(seal.ComprModeType.zstd)

	const plain2 = new seal.Plaintext()
	encoder.encode(client2Values, CKKS_SCALE, plain2)
	const ct2 = new seal.Ciphertext()
	encryptor.encrypt(plain2, ct2)
	const blob2 = ct2.saveToBase64(seal.ComprModeType.zstd)

	console.log(`   Client 1 blob: ${blob1.length} chars (base64)`)
	console.log(`   Client 2 blob: ${blob2.length} chars (base64)\n`)

	// 4. Open round
	console.log('Step 4: Opening FL round...')
	const openResp = await fetch(`${BASE}/fl/rounds/open?mapId=${MAP_ID}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ minSubmissions: 2 }),
	})
	const openData = await openResp.json()
	console.log(`   ✅ Round opened: ${openData.roundId}`)
	console.log(`   Expires: ${openData.expiresAt}\n`)

	// 5. Submit client 1
	console.log('Step 5: Submitting client-1 encrypted delta...')
	const submit1 = await fetch(`${BASE}/fl/rounds/submit?mapId=${MAP_ID}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			clientId: 'ckks-client-1',
			roundId: openData.roundId,
			blobs: [blob1],
			numExamples: 10,
			reportedNorm: 0.5,
		}),
	})
	const sub1Data = await submit1.json()
	console.log(`   ✅ Accepted: count=${sub1Data.submissionCount}, status=${sub1Data.roundStatus}\n`)

	// 6. Submit client 2
	console.log('Step 6: Submitting client-2 encrypted delta...')
	const submit2 = await fetch(`${BASE}/fl/rounds/submit?mapId=${MAP_ID}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			clientId: 'ckks-client-2',
			roundId: openData.roundId,
			blobs: [blob2],
			numExamples: 8,
			reportedNorm: 0.3,
		}),
	})
	const sub2Data = await submit2.json()
	console.log(`   ✅ Accepted: count=${sub2Data.submissionCount}, status=${sub2Data.roundStatus}\n`)

	// 7. Trigger aggregation manually (in case auto didn't complete yet)
	console.log('Step 7: Triggering aggregation...')
	const aggResp = await fetch(`${BASE}/fl/rounds/aggregate-now?mapId=${MAP_ID}`, {
		method: 'POST',
	})
	const aggData = await aggResp.json()
	console.log(`   Response: ${JSON.stringify(aggData)}\n`)

	// 8. Wait and check status
	console.log('Step 8: Checking round status...')
	await new Promise(r => setTimeout(r, 3000))
	const statusResp = await fetch(`${BASE}/fl/rounds/status?mapId=${MAP_ID}`)
	const statusData = await statusResp.json()
	console.log(`   Status: ${statusData.status}`)
	console.log(`   Has aggregate: ${statusData.hasAggregate}\n`)

	if (statusData.status !== 'published') {
		console.log('   ⚠️  Round not published yet. Aggregation may still be running.')
		console.log('   Waiting 5 more seconds...')
		await new Promise(r => setTimeout(r, 5000))
		const retry = await fetch(`${BASE}/fl/rounds/status?mapId=${MAP_ID}`)
		const retryData = await retry.json()
		console.log(`   Status after retry: ${retryData.status}\n`)
		if (retryData.status !== 'published') {
			console.log('   ❌ Round still not published. Check worker logs.')
			process.exit(1)
		}
	}

	// 9. Download aggregate
	console.log('Step 9: Downloading aggregate...')
	const getAggResp = await fetch(`${BASE}/fl/rounds/aggregate?mapId=${MAP_ID}`)
	const getAggData = await getAggResp.json()
	console.log(`   Aggregate blobs: ${getAggData.blobs?.length ?? 0}`)
	const aggBlob = getAggData.blobs?.[0]
	if (!aggBlob) {
		console.log('   ❌ No aggregate blob returned')
		process.exit(1)
	}
	console.log(`   Aggregate blob: ${aggBlob.length} chars (base64)\n`)

	// 10. Decrypt aggregate and verify
	console.log('Step 10: Decrypting aggregate and verifying sum...')
	const aggCt = new seal.Ciphertext()
	aggCt.load(context, aggBlob)
	const decryptedPlain = decryptor.decrypt(aggCt)
	const decryptedValues = Float64Array.from(encoder.decode(decryptedPlain))

	const first5 = Array.from(decryptedValues.slice(0, 5))
	console.log(`   Decrypted first 5: [${first5.map(v => v.toFixed(4))}]`)
	console.log(`   Expected first 5:  [${Array.from(expectedSum.slice(0, 5)).map(v => v.toFixed(4))}]`)

	// Verify within CKKS approximation tolerance
	let maxError = 0
	for (let i = 0; i < slotCount; i++) {
		const err = Math.abs(decryptedValues[i] - expectedSum[i])
		if (err > maxError) maxError = err
	}
	console.log(`   Max error: ${maxError.toExponential(3)}`)

	if (maxError < 1e-6) {
		console.log(`\n   ✅ CKKS homomorphic addition verified! Sum matches within tolerance.\n`)
	} else if (maxError < 1e-3) {
		console.log(`\n   ⚠️  Sum approximately correct (max error ${maxError.toExponential(3)})\n`)
	} else {
		console.log(`\n   ❌ Sum does not match! Max error: ${maxError}\n`)
		process.exit(1)
	}

	// 11. Metrics
	console.log('Step 11: Final metrics...')
	const metricsResp = await fetch(`${BASE}/fl/rounds/metrics?mapId=${MAP_ID}`)
	const metricsData = await metricsResp.json()
	console.log(`   Completed rounds: ${metricsData.totalRoundsCompleted}`)
	console.log(`   Current status: ${metricsData.currentRound?.status}\n`)

	console.log('🎉 Full E2E CKKS FL pipeline test PASSED!\n')

	// Cleanup SEAL objects
	plain1.delete(); plain2.delete()
	ct1.delete(); ct2.delete()
	aggCt.delete(); decryptedPlain.delete()
	encoder.delete(); encryptor.delete(); decryptor.delete()
	evaluator.delete(); keyGen.delete()
	publicKey.delete(); secretKey.delete()
}

main().catch(err => {
	console.error('❌ E2E test failed:', err.message)
	process.exit(1)
})
