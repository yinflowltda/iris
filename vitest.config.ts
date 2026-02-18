import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
		exclude: ['node_modules', 'dist', 'tests/e2e/**'],
		coverage: {
			provider: 'v8',
			include: ['client/lib/**', 'shared/**'],
		},
	},
})
