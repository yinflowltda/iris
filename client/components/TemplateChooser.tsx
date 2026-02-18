import { useCallback } from 'react'
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
		id: 'life-wheel',
		name: 'Life Wheel',
		description: 'Assess balance across key areas of your life.',
		icon: '◐',
		active: false,
	},
	{
		id: 'goal-setting',
		name: 'Goal Setting',
		description: 'Define and track meaningful personal goals.',
		icon: '◇',
		active: false,
	},
]

export function TemplateChooser({
	visible,
	onSelectTemplate,
}: {
	visible: boolean
	onSelectTemplate: (frameworkId: string) => void
}) {
	const handleStart = useCallback(
		(id: string) => () => {
			onSelectTemplate(id)
		},
		[onSelectTemplate],
	)

	return (
		<div className="template-chooser-overlay" data-visible={visible}>
			<div className="template-chooser">
				<header className="template-chooser-header">
					<h1 className="template-chooser-title">Choose a Framework</h1>
					<p className="template-chooser-subtitle">
						Select a visual framework to begin your session.
					</p>
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
