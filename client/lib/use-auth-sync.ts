import { useCallback } from 'react'
import { useSync } from '@tldraw/sync'
import type { TLAnyShapeUtilConstructor } from 'tldraw'
import { multiplayerAssetStore } from './multiplayer-asset-store'

/**
 * Wraps tldraw's useSync with auth context.
 * The user's sub (from GET /me at startup) is used as the room ID.
 * The CF_Authorization cookie is sent automatically on same-origin
 * WebSocket upgrade — no explicit token handling needed.
 *
 * While userSub is empty (user not loaded), the uri callback returns a
 * never-resolving promise so useSync won't attempt a WebSocket connection.
 */
export function useAuthSync(
	userSub: string,
	shapeUtils: readonly TLAnyShapeUtilConstructor[],
) {
	// Memoize the uri callback so useSync doesn't see a new reference each render
	const getUri = useCallback(async () => {
		if (!userSub) {
			return new Promise<string>(() => {})
		}
		return `${window.location.origin}/sync/${userSub}`
	}, [userSub])

	return useSync({
		uri: getUri,
		assets: multiplayerAssetStore,
		shapeUtils,
	})
}
