function isExplicitlyDisabled(value: string | undefined): boolean {
	if (!value) return false
	const normalized = value.trim().toLowerCase()
	return normalized === '0' || normalized === 'false' || normalized === 'off'
}

/**
 * Gate for allowing end-users to change the LLM model.
 *
 * - Always disabled in production builds
 * - Enabled by default in dev, can be disabled via env
 */
export const MODEL_SELECTION_ENABLED =
	import.meta.env.DEV && !isExplicitlyDisabled(import.meta.env.VITE_MODEL_SELECTION_ENABLED)
