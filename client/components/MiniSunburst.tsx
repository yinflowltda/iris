import { arc as d3Arc } from 'd3-shape'
import { useMemo } from 'react'
import type { FrameworkEntry } from '../lib/frameworks/framework-registry'
import { computeSunburstLayout } from '../lib/sunburst-layout'

interface MiniSunburstProps {
	framework: FrameworkEntry
	size?: number
}

/**
 * A small, non-interactive sunburst preview for the template chooser.
 * Renders the framework's tree structure with its visual colors.
 */
export function MiniSunburst({ framework, size = 160 }: MiniSunburstProps) {
	const treeDef = framework.treeDefinition
	const { colors } = framework.visual

	const arcs = useMemo(() => {
		if (!treeDef) return []
		return computeSunburstLayout(treeDef)
	}, [treeDef])

	if (!treeDef || arcs.length === 0) return null

	const outerRadius = size / 2 - 4
	const cx = size / 2
	const cy = size / 2

	const arcGen = d3Arc<{ x0: number; x1: number; y0: number; y1: number }>()
		.startAngle((d) => d.x0)
		.endAngle((d) => d.x1)
		.innerRadius((d) => d.y0 * outerRadius)
		.outerRadius((d) => d.y1 * outerRadius)

	const rootArc = arcs.find((a) => a.depth === 0)

	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			xmlns="http://www.w3.org/2000/svg"
			style={{ display: 'block' }}
		>
			{arcs.map((arc) => {
				if (rootArc && arc.id === rootArc.id) return null
				if (arc.transparent) return null

				const pathD = arcGen(arc)
				if (!pathD) return null

				return (
					<path
						key={arc.id}
						d={pathD}
						fill={colors.cellFill}
						stroke={colors.stroke}
						strokeWidth={0.5}
						transform={`translate(${cx},${cy})`}
						opacity={0.85}
					/>
				)
			})}
			{rootArc && (
				<circle
					cx={cx}
					cy={cy}
					r={rootArc.y1 * outerRadius}
					fill={colors.cellFill}
					stroke={colors.stroke}
					strokeWidth={0.75}
					opacity={0.85}
				/>
			)}
		</svg>
	)
}
