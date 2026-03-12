import { type FeatureExtractionPipeline, pipeline } from '@huggingface/transformers'
import type { PrismaWorkerRequest, PrismaWorkerResponse } from './types'

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'

let extractor: FeatureExtractionPipeline | null = null

function post(msg: PrismaWorkerResponse, transfer?: Transferable[]) {
	self.postMessage(msg, { transfer: transfer ?? [] })
}

async function init() {
	try {
		const task = 'feature-extraction'
		// biome-ignore lint/complexity/noBannedTypes: pipeline() has 50+ overloads that exceed TS union limit
		extractor = (await (pipeline as Function)(task, MODEL_ID, {
			dtype: 'q8',
			device: 'wasm',
			progress_callback: (progress: any) => {
				if (progress.status === 'progress') {
					post({
						type: 'init:progress',
						progress: {
							status: progress.status,
							file: progress.file ?? '',
							progress: progress.progress ?? 0,
							loaded: progress.loaded ?? 0,
							total: progress.total ?? 0,
						},
					})
				}
			},
		})) as FeatureExtractionPipeline
		post({ type: 'init:complete' })
	} catch (err) {
		post({ type: 'init:error', error: String(err) })
	}
}

async function embed(id: string, text: string) {
	if (!extractor) {
		post({ type: 'embed:error', id, error: 'Model not initialized' })
		return
	}
	try {
		const output = await extractor(text, { pooling: 'mean', normalize: true })
		const data = new Float32Array(output.data as Float64Array)
		post({ type: 'embed:result', id, embedding: data }, [data.buffer])
	} catch (err) {
		post({ type: 'embed:error', id, error: String(err) })
	}
}

self.onmessage = (e: MessageEvent<PrismaWorkerRequest>) => {
	const msg = e.data
	switch (msg.type) {
		case 'init':
			init()
			break
		case 'embed':
			embed(msg.id, msg.text)
			break
	}
}
