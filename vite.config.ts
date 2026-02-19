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

// https://vitejs.dev/config/
export default defineConfig(() => {
	return {
		plugins: [
			tldrawLicensePlugin(),
			zodLocalePlugin(fileURLToPath(new URL('./scripts/zod-locales-shim.js', import.meta.url))),
			cloudflare(),
			react(),
		],
	}
})
