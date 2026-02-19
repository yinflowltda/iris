import './ProgressIndicator.css'

export function ProgressIndicator({
	filledCells,
	totalCells,
}: {
	filledCells: number
	totalCells: number
}) {
	const pct = totalCells > 0 ? (filledCells / totalCells) * 100 : 0
	const isComplete = filledCells >= totalCells && totalCells > 0

	return (
		<div className="progress-indicator" data-testid="progress-indicator" data-visible="true">
			<div className="progress-bar-track">
				<div
					className="progress-bar-fill"
					data-complete={isComplete}
					style={{ width: `${pct}%` }}
				/>
			</div>

			{isComplete ? (
				<span className="progress-complete-label" data-testid="progress-complete">
					Complete! ✨
				</span>
			) : (
				<span className="progress-label" data-testid="progress-label">
					{filledCells} / {totalCells}
				</span>
			)}
		</div>
	)
}
