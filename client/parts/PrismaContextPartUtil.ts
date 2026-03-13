import type { PrismaContextPart } from '../../shared/schema/PromptPartDefinitions'
import type { AgentRequest } from '../../shared/types/AgentRequest'
import { getActiveMandala } from '../lib/frameworks/active-framework'
import { getFramework } from '../lib/frameworks/framework-registry'
import { collectAnchorCells } from '../lib/prisma/cell-anchors'
import { PrismaEmbeddingService } from '../lib/prisma/embedding-service'
import { classifyNoteBatch } from '../lib/prisma/note-classifier'
import { extractNoteDescriptors } from '../lib/prisma/use-note-classifier'
import type { MandalaShape } from '../shapes/MandalaShapeUtil'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

export const PrismaContextPartUtil = registerPromptPartUtil(
	class PrismaContextPartUtil extends PromptPartUtil<PrismaContextPart> {
		static override type = 'prismaContext' as const

		override async getPart(_request: AgentRequest): Promise<PrismaContextPart> {
			const mandala = getActiveMandala(this.editor) as MandalaShape | undefined
			if (!mandala) return null as unknown as PrismaContextPart

			const framework = getFramework(mandala.props.frameworkId)
			const treeDef = framework.treeDefinition
			if (!treeDef) return null as unknown as PrismaContextPart

			const service = PrismaEmbeddingService.getInstance()
			if (service.status === 'idle') {
				// Kick off init for next request, skip this one
				service.init().catch(() => {})
				return null as unknown as PrismaContextPart
			}
			if (service.status !== 'ready') return null as unknown as PrismaContextPart

			const state = mandala.props.state
			const descriptors = extractNoteDescriptors(this.editor, state)
			if (descriptors.length === 0) return null as unknown as PrismaContextPart

			try {
				const embedFn = (text: string) => service.embed(text)
				const result = await classifyNoteBatch(descriptors, state, treeDef, embedFn)

				// Build label map for cell names
				const allCells = collectAnchorCells(treeDef.root)
				const labelMap = new Map<string, string>()
				for (const cell of allCells) {
					labelMap.set(cell.id, cell.label)
				}

				// Build note classifications
				const noteClassifications: PrismaContextPart['noteClassifications'] = result.entries.map(
					(entry) => ({
						textSnippet: entry.text.slice(0, 80),
						currentCellId: entry.currentCellId,
						currentCellLabel: entry.currentCellId
							? (labelMap.get(entry.currentCellId) ?? entry.currentCellId)
							: null,
						bestMatchCellId: entry.matches[0]?.cellId ?? null,
						bestMatchCellLabel: entry.matches[0]?.label ?? null,
						similarity: entry.matches[0]?.similarity ?? 0,
						isMisplaced:
							entry.currentCellId !== null &&
							entry.matches.length > 0 &&
							entry.currentCellId !== entry.matches[0].cellId,
					}),
				)

				// Build cell coverage
				const allCellIds = allCells.map((c) => c.id)
				const filledCellIds = new Set<string>()
				for (const [cellId, cellState] of Object.entries(state)) {
					if (cellState.contentShapeIds.length > 0) {
						filledCellIds.add(cellId)
					}
				}

				const emptyCells = allCellIds
					.filter((id) => !filledCellIds.has(id))
					.map((id) => ({
						cellId: id,
						cellLabel: labelMap.get(id) ?? id,
					}))

				return {
					type: 'prismaContext',
					noteClassifications,
					emptyCells,
					totalNotes: descriptors.length,
					totalCells: allCellIds.length,
					filledCellCount: filledCellIds.size,
				}
			} catch {
				// Prisma context is non-critical — fail silently
				return null as unknown as PrismaContextPart
			}
		}
	},
)
