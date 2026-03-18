// ─── Tldraw Sync Durable Object ─────────────────────────────────────────────
//
// Manages real-time tldraw canvas synchronization via WebSocket using
// @tldraw/sync-core's TLSocketRoom. Each DO instance represents one
// collaborative document (space). Document state is persisted in the DO's
// built-in SQLite storage via DurableObjectSqliteSyncWrapper.

import { DurableObject } from 'cloudflare:workers'
import {
	TLSocketRoom,
	DurableObjectSqliteSyncWrapper,
	SQLiteSyncStorage,
} from '@tldraw/sync-core'
import type { Environment } from '../environment'

export class TldrawSyncDO extends DurableObject<Environment> {
	private room: TLSocketRoom | null = null

	private getRoom(): TLSocketRoom {
		if (!this.room || this.room.isClosed()) {
			const sqlWrapper = new DurableObjectSqliteSyncWrapper(this.ctx.storage)
			const storage = new SQLiteSyncStorage({ sql: sqlWrapper })
			this.room = new TLSocketRoom({
				storage,
				log: { error: console.error, warn: console.warn },
			})
		}
		return this.room
	}

	override async fetch(request: Request): Promise<Response> {
		const upgradeHeader = request.headers.get('Upgrade')
		if (upgradeHeader !== 'websocket') {
			return new Response('Expected WebSocket upgrade', { status: 426 })
		}

		const room = this.getRoom()
		const pair = new WebSocketPair()
		const [client, server] = Object.values(pair)
		server.accept()

		const sessionId = crypto.randomUUID()
		room.handleSocketConnect({
			sessionId,
			socket: server as any,
		})

		return new Response(null, { status: 101, webSocket: client })
	}
}
