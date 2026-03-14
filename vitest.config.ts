import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
		exclude: ['node_modules', 'dist', 'tests/e2e/**'],
		// node-seal WASM requires --experimental-wasm-exnref on Node.js ≥ 24
		execArgv: ['--experimental-wasm-exnref'],
		coverage: {
			provider: 'v8',
			include: ['client/lib/**', 'shared/**'],
		},
	},
})
