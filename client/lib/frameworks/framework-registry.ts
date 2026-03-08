import type { Editor, TLShapeId } from 'tldraw'
import type { CoverContent, MapDefinition, TreeMapDefinition } from '../../../shared/types/MandalaTypes'
import type { MandalaShape } from '../../shapes/MandalaShapeUtil'

export interface FrameworkVisualConfig {
	colors: {
		stroke: string
		text: string
		cellFill: string
		cellHoverFill: string
	}
	labelFont: string
	defaultSize: number
}

export interface FrameworkTemplateConfig {
	icon: string
	description: string
	active: boolean
	/** Curated longer description for the chooser modal */
	longDescription?: string
	/** Use-case pill labels */
	useCases?: string[]
	/** Key guiding questions shown in the chooser */
	keyQuestions?: string[]
}

export interface FrameworkEntry {
	definition: MapDefinition
	treeDefinition?: TreeMapDefinition
	visual: FrameworkVisualConfig
	template: FrameworkTemplateConfig
	initialCover?: CoverContent
}

const registry = new Map<string, FrameworkEntry>()

export function registerFramework(entry: FrameworkEntry): void {
	registry.set(entry.definition.id, entry)
}

export function getFramework(id: string): FrameworkEntry {
	const entry = registry.get(id)
	if (!entry) throw new Error(`Unknown framework: ${id}`)
	return entry
}

export function getAllFrameworks(): FrameworkEntry[] {
	return [...registry.values()]
}

export function getFrameworkForMandala(editor: Editor, mandalaId: string): FrameworkEntry {
	const shape = editor.getShape(`shape:${mandalaId}` as TLShapeId) as MandalaShape | undefined
	if (!shape) throw new Error(`Mandala shape not found: ${mandalaId}`)
	return getFramework(shape.props.frameworkId)
}
