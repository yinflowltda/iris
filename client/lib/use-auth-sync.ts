import { useCallback } from 'react'
import { useSync } from '@tldraw/sync'
import type { TLAnyShapeUtilConstructor } from 'tldraw'
import { multiplayerAssetStore } from './multiplayer-asset-store'

/**
 * Wraps tldraw's useSync with auth context.
 * The roomId (typically the room owner's sub) identifies which sync room to join.
 * The CF_Authorization cookie is sent automatically on same-origin
 * WebSocket upgrade — no explicit token handling needed.
 *
 * While roomId is empty (not yet resolved), the uri callback returns a
 * never-resolving promise so useSync won't attempt a WebSocket connection.
 */
export function useAuthSync(
	roomId: string,
	shapeUtils: readonly TLAnyShapeUtilConstructor[],
) {
	// Memoize the uri callback so useSync doesn't see a new reference each render
	const getUri = useCallback(async () => {
		if (!roomId) {
			return new Promise<string>(() => {})
		}
		return `${window.location.origin}/sync/${roomId}`
	}, [roomId])

	return useSync({
		uri: getUri,
		assets: multiplayerAssetStore,
		shapeUtils,
	})
}
