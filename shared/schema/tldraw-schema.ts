import { T } from '@tldraw/editor'
import { createTLSchema, defaultShapeSchemas } from '@tldraw/tlschema'

/**
 * Mandala shape schema for server-side validation.
 * Must stay in sync with MandalaShapeUtil.props on the client.
 */
const mandalaShapeSchema = {
	props: {
		frameworkId: T.string,
		w: T.number,
		h: T.number,
		state: T.jsonValue as any,
		arrows: T.jsonValue as any,
		arrowsVisible: T.boolean,
		zoomedNodeId: T.jsonValue as any,
		zoomMode: T.string,
		cover: T.jsonValue as any,
	},
}

/**
 * TLSchema that includes both default shapes and custom shapes (mandala).
 * Used by the server-side TLSocketRoom for record validation.
 */
export const irisSchema = createTLSchema({
	shapes: {
		...defaultShapeSchemas,
		mandala: mandalaShapeSchema,
	},
})
