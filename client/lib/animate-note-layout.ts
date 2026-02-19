import { EASINGS, type Editor, type TLShapeId } from 'tldraw'

export type NoteLayoutTarget = {
	id: TLShapeId
	x: number
	y: number
	scale: number
}

export type NoteLayoutAnimationOptions = {
	durationMs?: number
	ease?: (t: number) => number
}

let activeToken = 0

function clamp01(t: number) {
	return Math.max(0, Math.min(1, t))
}

function lerp(a: number, b: number, t: number) {
	return a + (b - a) * t
}

function nowMs() {
	return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function raf(cb: (t: number) => void) {
	if (typeof requestAnimationFrame !== 'undefined') return requestAnimationFrame(cb)
	return setTimeout(() => cb(nowMs()), 16) as unknown as number
}

export function animateNotesToLayout(
	editor: Editor,
	targets: NoteLayoutTarget[],
	opts: NoteLayoutAnimationOptions = {},
) {
	const durationMs = opts.durationMs ?? 300
	const ease = opts.ease ?? EASINGS.easeOutCubic

	const startStates = targets
		.map((t) => {
			const shape = editor.getShape(t.id) as any
			if (!shape || shape.type !== 'note') return null
			return {
				id: t.id,
				startX: shape.x as number,
				startY: shape.y as number,
				startScale: (shape.props?.scale as number) ?? 1,
				endX: t.x,
				endY: t.y,
				endScale: t.scale,
			}
		})
		.filter(Boolean) as Array<{
		id: TLShapeId
		startX: number
		startY: number
		startScale: number
		endX: number
		endY: number
		endScale: number
	}>

	if (startStates.length === 0) return

	if (durationMs <= 0) {
		editor.updateShapes(
			startStates.map((s) => ({
				id: s.id,
				type: 'note',
				x: s.endX,
				y: s.endY,
				props: { scale: s.endScale },
			})),
		)
		return
	}

	const token = ++activeToken
	const start = nowMs()

	const tick = () => {
		if (token !== activeToken) return

		const t = clamp01((nowMs() - start) / durationMs)
		const k = ease(t)

		editor.updateShapes(
			startStates.map((s) => ({
				id: s.id,
				type: 'note',
				x: lerp(s.startX, s.endX, k),
				y: lerp(s.startY, s.endY, k),
				props: { scale: lerp(s.startScale, s.endScale, k) },
			})),
		)

		if (t < 1) raf(tick)
	}

	raf(tick)
}
