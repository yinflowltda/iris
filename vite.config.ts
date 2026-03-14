import { fileURLToPath } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react-swc'
import { defineConfig, type Plugin } from 'vite'
import { zodLocalePlugin } from './scripts/vite-zod-locale-plugin.js'

/**
 * Removes tldraw SDK license enforcement for non-commercial / educational use.
 * Targets three mechanisms: production editor gating, watermark badge, and analytics tracking.
 */
function tldrawLicensePlugin(): Plugin {
	return {
		name: 'remove-tldraw-license-enforcement',
		enforce: 'pre',
		transform(code, id) {
			if (!id.includes('@tldraw/editor') || id.endsWith('.map')) return undefined

			if (id.endsWith('LicenseProvider.mjs')) {
				return code.replace(
					'return licenseState === "expired" || licenseState === "unlicensed-production";',
					'return false;',
				)
			}

			if (id.endsWith('Watermark.mjs')) {
				return code.replace(
					'if (!["licensed-with-watermark", "unlicensed"].includes(licenseManagerState)) return null;',
					'return null;',
				)
			}

			if (id.endsWith('LicenseManager.mjs')) {
				return code.replace('this.maybeTrack(result, licenseState);', '')
			}

			return undefined
		},
	}
}

/**
 * Forces node-seal's Emscripten code to use the browser/worker path instead of
 * Node.js. Without this, Cloudflare Workers' `nodejs_compat` flag makes
 * `ENVIRONMENT_IS_NODE` true, causing an unconditional `require("fs")` that
 * fails inside Workers. Our `instantiateWasm` callback handles WASM loading,
 * so the Node.js fs-based readBinary/readAsync paths aren't needed.
 */
function nodeSealWorkerPlugin(): Plugin {
	return {
		name: 'node-seal-worker-compat',
		enforce: 'pre',
		transform(code, id) {
			if (!id.includes('node-seal') && !id.includes('seal_throws')) return undefined
			if (!code.includes('var ENVIRONMENT_IS_NODE=globalThis.process')) return undefined
			return code.replace(
				'var ENVIRONMENT_IS_NODE=globalThis.process?.versions?.node&&globalThis.process?.type!="renderer"',
				'var ENVIRONMENT_IS_NODE=false',
			)
		},
	}
}

// https://vitejs.dev/config/
export default defineConfig(() => {
	return {
		plugins: [
			tldrawLicensePlugin(),
			nodeSealWorkerPlugin(),
			zodLocalePlugin(fileURLToPath(new URL('./scripts/zod-locales-shim.js', import.meta.url))),
			cloudflare(),
			react(),
		],
		worker: {
			format: 'es' as const,
		},
		optimizeDeps: {
			exclude: ['@huggingface/transformers', 'node-seal'],
		},
		environments: {
			iris: {
				optimizeDeps: {
					exclude: ['node-seal'],
				},
			},
		},
		server: {
			proxy: {
				'/openai-proxy': {
					target: 'http://127.0.0.1:3456',
					changeOrigin: true,
					rewrite: (path: string) => path.replace(/^\/openai-proxy/, ''),
				},
			},
		},
	}
})
