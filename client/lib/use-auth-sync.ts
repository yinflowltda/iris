import { useSync } from '@tldraw/sync'
import { multiplayerAssetStore } from './multiplayer-asset-store'

/**
 * Wraps tldraw's useSync with auth context.
 * The user's sub (from GET /me at startup) is used as the room ID.
 * The CF_Authorization cookie is sent automatically on same-origin
 * WebSocket upgrade — no explicit token handling needed.
 */
export function useAuthSync(userSub: string) {
	return useSync({
		uri: async () => {
			// useSync parses the URI with new URL(), so it must be absolute.
			// httpToWs inside ClientWebSocketAdapter converts http(s) → ws(s).
			return `${window.location.origin}/sync/${userSub}`
		},
		assets: multiplayerAssetStore,
	})
}
