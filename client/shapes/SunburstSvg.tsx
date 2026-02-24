import { arc as d3Arc } from 'd3-shape'
import type { ReactElement } from 'react'
import { useMemo } from 'react'
import type { MandalaState } from '../../shared/types/MandalaTypes'
import { getFramework } from '../lib/frameworks/framework-registry'
import type { SunburstArc } from '../lib/sunburst-layout'
import { computeSunburstLayout } from '../lib/sunburst-layout'

// ─── Props ───────────────────────────────────────────────────────────────────

interface SunburstSvgProps {
	w: number
	h: number
	frameworkId: string
	mandalaState: MandalaState
	hoveredCell?: string | null
	zoomedNodeId?: string | null
	animatingArcs?: Map<string, { x0: number; x1: number; y0: number; y1: number }>
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SunburstSvg({
	w,
	h,
	frameworkId,
	mandalaState: _mandalaState,
	hoveredCell,
	zoomedNodeId: _zoomedNodeId,
	animatingArcs,
}: SunburstSvgProps) {
	const framework = getFramework(frameworkId)
	const treeDef = framework.treeDefinition
	const { colors, labelFont } = framework.visual

	const arcs = useMemo(() => {
		if (!treeDef) return []
		return computeSunburstLayout(treeDef)
	}, [treeDef])

	if (!treeDef || arcs.length === 0) return null

	const size = Math.min(w, h)
	const labelPadding = Math.max(20, size * 0.05)
	const outerRadius = (size - labelPadding * 2) / 2
	const cx = w / 2
	const cy = h / 2

	// Configure d3 arc generator
	const arcGen = d3Arc<SunburstArc>()
		.startAngle((d) => d.x0)
		.endAngle((d) => d.x1)
		.innerRadius((d) => d.y0 * outerRadius)
		.outerRadius((d) => d.y1 * outerRadius)

	// Find root node
	const rootArc = arcs.find((a) => a.depth === 0)

	const cellPaths: ReactElement[] = []
	const arcDefs: ReactElement[] = []
	const cellLabels: ReactElement[] = []

	for (const arc of arcs) {
		// Skip root (rendered as center circle) and transparent nodes
		if (arc.transparent || (rootArc && arc.id === rootArc.id)) continue

		// Use animating values if provided, otherwise use computed layout
		const effectiveArc = animatingArcs?.has(arc.id)
			? { ...arc, ...animatingArcs.get(arc.id)! }
			: arc

		const isHovered = hoveredCell === arc.id
		const pathD = arcGen(effectiveArc)
		if (!pathD) continue

		// ── Cell path ────────────────────────────────────────────────
		cellPaths.push(
			<path
				key={arc.id}
				d={pathD}
				fill={isHovered ? colors.cellHoverFill : colors.cellFill}
				stroke={colors.stroke}
				strokeWidth={1}
				style={{ transition: 'fill 0.15s ease' }}
			/>,
		)

		// ── Label arc + text ─────────────────────────────────────────
		const sweep = effectiveArc.x1 - effectiveArc.x0
		if (sweep < 0.15) continue // Too small for a label

		const innerR = effectiveArc.y0 * outerRadius
		const outerR = effectiveArc.y1 * outerRadius
		const offset = Math.max(4.8, (outerR - innerR) * 0.15)
		const labelR = outerR - offset

		const midAngle = (effectiveArc.x0 + effectiveArc.x1) / 2
		// Flip if arc is in the left half (between PI/2 and 3*PI/2)
		const shouldFlip = midAngle > Math.PI / 2 && midAngle < (3 * Math.PI) / 2

		const pathId = `sb-arc-${arc.id}`
		const textArcD = describeTextArcRadians(
			cx,
			cy,
			labelR,
			effectiveArc.x0,
			effectiveArc.x1,
			shouldFlip,
		)

		arcDefs.push(<path key={pathId} id={pathId} d={textArcD} fill="none" stroke="none" />)

		const fontSize = Math.max(4.93, Math.min(8.45, (outerR - innerR) * 0.155))
		cellLabels.push(
			<text
				key={`label-${arc.id}`}
				fontSize={fontSize}
				fill={colors.text}
				pointerEvents="none"
				style={{ userSelect: 'none', fontFamily: labelFont }}
			>
				<textPath
					href={`#${pathId}`}
					startOffset="50%"
					textAnchor="middle"
					dominantBaseline="central"
				>
					{arc.label}
				</textPath>
			</text>,
		)
	}

	// ── Center circle ────────────────────────────────────────────────────
	const isCenterHovered = rootArc && hoveredCell === rootArc.id
	const centerRadius = rootArc ? rootArc.y1 * outerRadius : outerRadius * 0.15
	const centerLabel = rootArc?.label ?? treeDef.root.label
	const centerFontSize = Math.max(10, Math.min(16, outerRadius * 0.045))

	const centerCircle = (
		<g key="center">
			<circle
				cx={cx}
				cy={cy}
				r={centerRadius}
				fill={isCenterHovered ? colors.cellHoverFill : 'white'}
				stroke={colors.stroke}
				strokeWidth={1.5}
				style={{ transition: 'fill 0.15s ease' }}
			/>
			<text
				x={cx}
				y={cy}
				textAnchor="middle"
				dominantBaseline="central"
				fontSize={centerFontSize}
				fontWeight="bold"
				fill="#808080"
				fillOpacity={0.7}
				pointerEvents="none"
				style={{
					userSelect: 'none',
					fontFamily: labelFont,
					textTransform: 'uppercase',
				}}
			>
				{centerLabel.toUpperCase()}
			</text>
		</g>
	)

	return (
		<svg
			width={w}
			height={h}
			viewBox={`0 0 ${w} ${h}`}
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label={`${treeDef.name} Mandala`}
		>
			<defs>{arcDefs}</defs>
			<g transform={`translate(${cx},${cy})`}>{cellPaths}</g>
			{centerCircle}
			<g>{cellLabels}</g>
		</svg>
	)
}

// ─── Text arc helper (radians, SVG coordinate space) ─────────────────────────
//
// d3 sunburst uses radians with 0 at 12-o'clock going clockwise.
// SVG arcs use standard math angles. We convert here.
//
// In d3 partition layout, angles are measured from 12-o'clock (top) going
// clockwise. In SVG, we need to convert: SVG angle = d3 angle - PI/2
// (rotate -90 degrees to align 0 at top).

function describeTextArcRadians(
	cx: number,
	cy: number,
	r: number,
	startAngle: number,
	endAngle: number,
	flip: boolean,
): string {
	// Convert from d3 convention (0=top, clockwise) to SVG convention
	// In SVG, we compute x = cx + r*sin(angle), y = cy - r*cos(angle)
	// for the d3 convention where 0 is at top going clockwise.

	const x1 = cx + r * Math.sin(startAngle)
	const y1 = cy - r * Math.cos(startAngle)
	const x2 = cx + r * Math.sin(endAngle)
	const y2 = cy - r * Math.cos(endAngle)

	const sweep = endAngle - startAngle
	const largeArc = sweep > Math.PI ? 1 : 0

	if (flip) {
		// Draw arc in reverse direction so text reads correctly
		return `M ${x2} ${y2} A ${r} ${r} 0 ${largeArc} 0 ${x1} ${y1}`
	}

	// Normal clockwise arc
	return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
}
