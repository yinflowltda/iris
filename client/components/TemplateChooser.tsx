import type { PointerEvent } from 'react'
import { useCallback, useEffect, useMemo } from 'react'
import { getAllFrameworks } from '../lib/frameworks/framework-registry'
import { MiniSunburst } from './MiniSunburst'
import './TemplateChooser.css'

// ─── Component ───────────────────────────────────────────────────────────────

export function TemplateChooser({
	visible,
	onSelectTemplate,
	onRequestClose,
}: {
	visible: boolean
	onSelectTemplate: (frameworkId: string) => void
	onRequestClose: () => void
}) {
	const frameworks = useMemo(() => getAllFrameworks(), [])

	const handleStart = useCallback(
		(id: string) => (e: React.MouseEvent) => {
			e.stopPropagation()
			onSelectTemplate(id)
		},
		[onSelectTemplate],
	)

	const handleOverlayPointerDown = useCallback(
		(e: PointerEvent<HTMLDivElement>) => {
			if (!visible) return
			const target = e.target as HTMLElement | null
			if (!target) return
			if (target.closest('.tc-card')) return
			onRequestClose()
		},
		[onRequestClose, visible],
	)

	useEffect(() => {
		if (!visible) return
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onRequestClose()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [onRequestClose, visible])

	return (
		<div
			className="tc-overlay"
			data-visible={visible}
			onPointerDown={handleOverlayPointerDown}
		>
			<div className="tc-modal">
				<header className="tc-header">
					<h1 className="tc-title">Choose Your Map</h1>
					<p className="tc-subtitle">Each map is a different lens for self-exploration.</p>
				</header>

				<div className="tc-grid">
					{frameworks.map((entry) => {
						const t = entry.template
						const def = entry.definition
						const isActive = t.active

						return (
							<div
								key={def.id}
								className={`tc-card ${isActive ? 'tc-card--active' : 'tc-card--disabled'}`}
							>
								{!isActive && (
									<span className="tc-badge tc-badge--soon">Coming Soon</span>
								)}

								{/* Preview */}
								<div className="tc-preview">
									<MiniSunburst framework={entry} size={180} />
								</div>

								{/* Body */}
								<div className="tc-body">
									<h2 className="tc-name">{def.name}</h2>
									<p className="tc-description">
										{t.longDescription || t.description}
									</p>

									{/* Use-case pills */}
									{t.useCases && t.useCases.length > 0 && (
										<div className="tc-pills">
											{t.useCases.map((uc) => (
												<span key={uc} className="tc-pill">{uc}</span>
											))}
										</div>
									)}

									{/* Key questions */}
									{t.keyQuestions && t.keyQuestions.length > 0 && (
										<div className="tc-questions">
											{t.keyQuestions.map((q) => (
												<p key={q} className="tc-question">{q}</p>
											))}
										</div>
									)}

									{/* CTA */}
									{isActive && (
										<button
											type="button"
											className="tc-start"
											onClick={handleStart(def.id)}
										>
											Start Session
										</button>
									)}
								</div>
							</div>
						)
					})}
				</div>
			</div>
		</div>
	)
}
