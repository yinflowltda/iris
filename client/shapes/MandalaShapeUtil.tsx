import { type ReactElement, useCallback, useState } from 'react'
import {
	Circle2d,
	type RecordProps,
	resizeBox,
	ShapeUtil,
	type SvgExportContext,
	T,
	type TLBaseShape,
	type TLResizeInfo,
} from 'tldraw'
import type {
	CellId,
	CellStatus,
	MandalaConfig,
	MandalaState,
} from '../../shared/types/MandalaTypes'
import { RING_IDS, SLICE_IDS } from '../../shared/types/MandalaTypes'
import { EMOTIONS_MAP_FRAMEWORK } from '../lib/frameworks/emotions-map'
import { getRingDefinitions, getSliceDefinitions } from '../lib/mandala-geometry'

const DEG_TO_RAD = Math.PI / 180

// ─── Shape type ──────────────────────────────────────────────────────────────

export type MandalaShapeProps = {
	w: number
	h: number
	state: MandalaState
}

declare module 'tldraw' {
	interface TLGlobalShapePropsMap {
		mandala: MandalaShapeProps
	}
}

export type MandalaShape = TLBaseShape<'mandala', MandalaShapeProps>

function makeEmptyState(): MandalaState {
	const state = {} as MandalaState
	for (const slice of SLICE_IDS) {
		for (const ring of RING_IDS) {
			state[`${slice}-${ring}`] = { status: 'empty', contentShapeIds: [] }
		}
	}
	return state
}

// ─── Color palette ───────────────────────────────────────────────────────────

const SLICE_COLORS: Record<string, { fill: string; stroke: string; hover: string }> = {
	past: { fill: '#e8d5f5', stroke: '#9b6db8', hover: '#d9bce8' },
	present: { fill: '#d5e8f5', stroke: '#6d9bb8', hover: '#bcd9e8' },
	future: { fill: '#d5f5e0', stroke: '#6db87a', hover: '#bce8c8' },
}

const STATUS_OPACITY: Record<CellStatus, number> = {
	empty: 0.35,
	active: 0.65,
	filled: 1.0,
}

// ─── SVG path helpers ────────────────────────────────────────────────────────

function describeCellPath(
	cx: number,
	cy: number,
	innerR: number,
	outerR: number,
	startDeg: number,
	endDeg: number,
): string {
	let sweep = endDeg - startDeg
	if (sweep <= 0) sweep += 360

	const largeArc = sweep > 180 ? 1 : 0
	const startRad = startDeg * DEG_TO_RAD
	const endRad = (startDeg + sweep) * DEG_TO_RAD

	const ox1 = cx + outerR * Math.cos(startRad)
	const oy1 = cy - outerR * Math.sin(startRad)
	const ox2 = cx + outerR * Math.cos(endRad)
	const oy2 = cy - outerR * Math.sin(endRad)

	const ix1 = cx + innerR * Math.cos(endRad)
	const iy1 = cy - innerR * Math.sin(endRad)
	const ix2 = cx + innerR * Math.cos(startRad)
	const iy2 = cy - innerR * Math.sin(startRad)

	if (innerR === 0) {
		return [
			`M ${ox1} ${oy1}`,
			`A ${outerR} ${outerR} 0 ${largeArc} 0 ${ox2} ${oy2}`,
			`L ${cx} ${cy}`,
			'Z',
		].join(' ')
	}

	return [
		`M ${ox1} ${oy1}`,
		`A ${outerR} ${outerR} 0 ${largeArc} 0 ${ox2} ${oy2}`,
		`L ${ix1} ${iy1}`,
		`A ${innerR} ${innerR} 0 ${largeArc} 1 ${ix2} ${iy2}`,
		'Z',
	].join(' ')
}

// ─── SVG rendering component ────────────────────────────────────────────────

function MandalaSvg({
	w,
	h,
	mandalaState,
	isExport,
}: {
	w: number
	h: number
	mandalaState: MandalaState
	isExport?: boolean
}) {
	const radius = Math.min(w, h) / 2
	const cx = w / 2
	const cy = h / 2

	const config: MandalaConfig = {
		center: { x: cx, y: cy },
		radius,
		slices: SLICE_IDS,
		rings: RING_IDS,
		startAngle: EMOTIONS_MAP_FRAMEWORK.startAngle,
	}

	const sliceDefs = getSliceDefinitions(config)
	const ringDefs = getRingDefinitions(config)

	const [hoveredCell, setHoveredCell] = useState<CellId | null>(null)

	const handleCellEnter = useCallback(
		(cellId: CellId) => {
			if (!isExport) setHoveredCell(cellId)
		},
		[isExport],
	)

	const handleCellLeave = useCallback(() => {
		if (!isExport) setHoveredCell(null)
	}, [isExport])

	const cells: ReactElement[] = []
	const labels: ReactElement[] = []

	for (const slice of sliceDefs) {
		for (const ring of ringDefs) {
			const cellId: CellId = `${slice.sliceId}-${ring.ringId}`
			const cellState = mandalaState[cellId]
			const colors = SLICE_COLORS[slice.sliceId]
			const isHovered = hoveredCell === cellId
			const opacity = STATUS_OPACITY[cellState?.status ?? 'empty']

			const path = describeCellPath(
				cx,
				cy,
				ring.innerRadius,
				ring.outerRadius,
				slice.startAngle,
				slice.endAngle,
			)

			cells.push(
				<path
					key={cellId}
					d={path}
					fill={isHovered ? colors.hover : colors.fill}
					fillOpacity={opacity}
					stroke={colors.stroke}
					strokeWidth={1.5}
					onPointerEnter={() => handleCellEnter(cellId)}
					onPointerLeave={handleCellLeave}
					style={{ cursor: 'pointer', transition: 'fill 0.15s ease' }}
				/>,
			)

			const cellDef = EMOTIONS_MAP_FRAMEWORK.cells[cellId]
			if (cellDef && ring.outerRadius - ring.innerRadius > 30) {
				let sweep = slice.endAngle - slice.startAngle
				if (sweep <= 0) sweep += 360
				const midAngle = (slice.startAngle + sweep / 2) * DEG_TO_RAD
				const midR = (ring.innerRadius + ring.outerRadius) / 2
				const lx = cx + midR * Math.cos(midAngle)
				const ly = cy - midR * Math.sin(midAngle)
				const fontSize = Math.max(8, Math.min(12, radius / 50))

				labels.push(
					<text
						key={`label-${cellId}`}
						x={lx}
						y={ly}
						textAnchor="middle"
						dominantBaseline="central"
						fontSize={fontSize}
						fill="#333"
						pointerEvents="none"
						style={{ userSelect: 'none' }}
					>
						{cellDef.label}
					</text>,
				)
			}
		}
	}

	const sliceLabels: ReactElement[] = sliceDefs.map((slice) => {
		let sweep = slice.endAngle - slice.startAngle
		if (sweep <= 0) sweep += 360
		const midAngle = (slice.startAngle + sweep / 2) * DEG_TO_RAD
		const labelR = radius + 20
		const lx = cx + labelR * Math.cos(midAngle)
		const ly = cy - labelR * Math.sin(midAngle)
		const fontSize = Math.max(12, Math.min(16, radius / 30))

		return (
			<text
				key={`slice-label-${slice.sliceId}`}
				x={lx}
				y={ly}
				textAnchor="middle"
				dominantBaseline="central"
				fontSize={fontSize}
				fontWeight="bold"
				fill={SLICE_COLORS[slice.sliceId].stroke}
				pointerEvents="none"
				style={{ userSelect: 'none', textTransform: 'uppercase' }}
			>
				{slice.sliceId}
			</text>
		)
	})

	const ringLines: ReactElement[] = ringDefs.map((ring) => (
		<circle
			key={`ring-${ring.ringId}`}
			cx={cx}
			cy={cy}
			r={ring.outerRadius}
			fill="none"
			stroke="#999"
			strokeWidth={0.5}
			strokeDasharray="4 2"
			pointerEvents="none"
		/>
	))

	const sliceLines: ReactElement[] = sliceDefs.map((slice) => {
		const rad = slice.startAngle * DEG_TO_RAD
		const x2 = cx + radius * Math.cos(rad)
		const y2 = cy - radius * Math.sin(rad)
		return (
			<line
				key={`slice-line-${slice.sliceId}`}
				x1={cx}
				y1={cy}
				x2={x2}
				y2={y2}
				stroke="#999"
				strokeWidth={1}
				pointerEvents="none"
			/>
		)
	})

	return (
		<svg
			width={w}
			height={h}
			viewBox={`0 0 ${w} ${h}`}
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label="Emotions Map Mandala"
		>
			<g>{cells}</g>
			<g>{ringLines}</g>
			<g>{sliceLines}</g>
			<g>{labels}</g>
			<g>{sliceLabels}</g>
		</svg>
	)
}

// ─── ShapeUtil ───────────────────────────────────────────────────────────────

export class MandalaShapeUtil extends ShapeUtil<MandalaShape> {
	static override type = 'mandala' as const
	static override props: RecordProps<MandalaShape> = {
		w: T.number,
		h: T.number,
		state: T.jsonValue as any,
	}

	getDefaultProps(): MandalaShapeProps {
		return {
			w: 800,
			h: 800,
			state: makeEmptyState(),
		}
	}

	getGeometry(shape: MandalaShape) {
		const r = Math.min(shape.props.w, shape.props.h) / 2
		return new Circle2d({
			x: shape.props.w / 2 - r,
			y: shape.props.h / 2 - r,
			radius: r,
			isFilled: true,
		})
	}

	component(shape: MandalaShape) {
		return <MandalaSvg w={shape.props.w} h={shape.props.h} mandalaState={shape.props.state} />
	}

	indicator(shape: MandalaShape) {
		const r = Math.min(shape.props.w, shape.props.h) / 2
		return <circle cx={shape.props.w / 2} cy={shape.props.h / 2} r={r} fill="none" />
	}

	override onResize(shape: MandalaShape, info: TLResizeInfo<MandalaShape>) {
		return resizeBox(shape, info)
	}

	override toSvg(shape: MandalaShape, _ctx: SvgExportContext) {
		return (
			<MandalaSvg
				w={shape.props.w}
				h={shape.props.h}
				mandalaState={shape.props.state}
				isExport={true}
			/>
		)
	}

	override canResize() {
		return true
	}

	override isAspectRatioLocked() {
		return true
	}
}
