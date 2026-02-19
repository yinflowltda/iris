import type { PointerEvent } from 'react'
import { useCallback, useEffect } from 'react'
import './TemplateChooser.css'

interface Template {
	id: string
	name: string
	description: string
	icon: string
	active: boolean
}

const templates: Template[] = [
	{
		id: 'emotions-map',
		name: 'Emotions Map',
		description: 'Explore and map your emotions through a guided mandala-based framework.',
		icon: '◎',
		active: true,
	},
	{
		id: 'life-map',
		name: 'Life Map',
		description: 'See how different areas of your life are doing at a glance.',
		icon: '◐',
		active: false,
	},
]

export function TemplateChooser({
	visible,
	onSelectTemplate,
	onRequestClose,
}: {
	visible: boolean
	onSelectTemplate: (frameworkId: string) => void
	onRequestClose: () => void
}) {
	const handleStart = useCallback(
		(id: string) => () => {
			onSelectTemplate(id)
		},
		[onSelectTemplate],
	)

	const handleOverlayPointerDown = useCallback(
		(e: PointerEvent<HTMLDivElement>) => {
			if (!visible) return
			const target = e.target as HTMLElement | null
			if (!target) return
			if (target.closest('.template-card')) return
			onRequestClose()
		},
		[onRequestClose, visible],
	)

	useEffect(() => {
		if (!visible) return

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return
			onRequestClose()
		}

		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [onRequestClose, visible])

	return (
		<div
			className="template-chooser-overlay"
			data-visible={visible}
			onPointerDown={handleOverlayPointerDown}
		>
			<div className="template-chooser">
				<header className="template-chooser-header">
					<h1 className="template-chooser-title">Choose a Map</h1>
					<p className="template-chooser-subtitle">Select a map to begin your session.</p>
				</header>

				<div className="template-chooser-grid">
					{templates.map((t) => (
						<div
							key={t.id}
							className={`template-card ${t.active ? 'template-card--active' : 'template-card--disabled'}`}
						>
							{!t.active && (
								<span className="template-card-badge template-card-badge--soon">Soon</span>
							)}
							<div className="template-card-icon">{t.icon}</div>
							<div className="template-card-body">
								<h2 className="template-card-name">{t.name}</h2>
								<p className="template-card-description">{t.description}</p>
							</div>
							{t.active && (
								<button type="button" className="template-card-start" onClick={handleStart(t.id)}>
									Start
								</button>
							)}
						</div>
					))}
				</div>
			</div>
		</div>
	)
}
