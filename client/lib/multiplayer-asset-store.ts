import type { TLAssetStore } from 'tldraw'

/**
 * tldraw asset store backed by R2 via /sync/assets routes.
 * Handles upload (when user pastes/drops images) and
 * resolve (when rendering assets from the sync store).
 */
export const multiplayerAssetStore: TLAssetStore = {
	async upload(_asset, file) {
		const assetId = crypto.randomUUID()

		const response = await fetch(`/sync/assets/${assetId}`, {
			method: 'POST',
			body: file,
			headers: { 'Content-Type': file.type },
			credentials: 'include',
		})

		if (!response.ok) {
			throw new Error(`Asset upload failed: ${response.status}`)
		}

		return { src: `/sync/assets/${assetId}` }
	},

	resolve(asset) {
		return asset.props.src ?? null
	},
}
