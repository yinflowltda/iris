import { useCallback } from 'react'
import type { Editor, TLShapeId } from 'tldraw'
import type { MandalaState, TreeMapDefinition } from '../../../shared/types/MandalaTypes'
import type { MandalaShape } from '../../shapes/MandalaShapeUtil'
import { getFramework } from '../frameworks/framework-registry'
import {
	type BatchClassificationResult,
	classifyNote,
	classifyNoteBatch,
	type NoteClassification,
	type NoteDescriptor,
} from './note-classifier'
import { usePrisma } from './use-prisma'

// ─── Note extraction ─────────────────────────────────────────────────────────

/** Extract NoteDescriptors from an editor given a MandalaState. */
export function extractNoteDescriptors(editor: Editor, state: MandalaState): NoteDescriptor[] {
	const descriptors: NoteDescriptor[] = []
	for (const cellState of Object.values(state)) {
		for (const shapeId of cellState.contentShapeIds) {
			const fullId = `shape:${shapeId}` as TLShapeId
			const shape = editor.getShape(fullId)
			if (!shape) continue
			const util = editor.getShapeUtil(shape)
			const text = util.getText(shape) ?? ''
			descriptors.push({ shapeId: shapeId as string, text })
		}
	}
	return descriptors
}

/** Resolve a mandala shape's TreeMapDefinition from the framework registry. */
export function getTreeDefFromMandala(
	editor: Editor,
	mandalaId: TLShapeId,
): TreeMapDefinition | null {
	const shape = editor.getShape(mandalaId) as MandalaShape | undefined
	if (!shape) return null
	const framework = getFramework(shape.props.frameworkId)
	return framework.treeDefinition ?? null
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useNoteClassifier() {
	const prisma = usePrisma()

	const classifySingleNote = useCallback(
		async (text: string, treeDef: TreeMapDefinition, topK = 3): Promise<NoteClassification> => {
			return classifyNote(text, treeDef, prisma.embed, topK)
		},
		[prisma.embed],
	)

	const classifyMandala = useCallback(
		async (
			editor: Editor,
			mandalaId: TLShapeId,
			topK = 3,
		): Promise<BatchClassificationResult | null> => {
			const shape = editor.getShape(mandalaId) as MandalaShape | undefined
			if (!shape) return null

			const treeDef = getTreeDefFromMandala(editor, mandalaId)
			if (!treeDef) return null

			const descriptors = extractNoteDescriptors(editor, shape.props.state)
			return classifyNoteBatch(descriptors, shape.props.state, treeDef, prisma.embed, topK)
		},
		[prisma.embed],
	)

	return {
		...prisma,
		classifyNote: classifySingleNote,
		classifyMandala,
	}
}
