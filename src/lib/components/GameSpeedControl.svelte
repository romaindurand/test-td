<script lang="ts">
	import { gameSpeed, setGameSpeed } from '../stores/gameState';

	function handleSpeedChange(event: Event) {
		const target = event.target as HTMLInputElement;
		setGameSpeed(parseFloat(target.value));
	}

	$: speedLabel = $gameSpeed === 0 ? 'PAUSE' : `x${$gameSpeed.toFixed(1)}`;
	$: speedColor = $gameSpeed === 0 ? '#ff4444' : $gameSpeed <= 1 ? '#4ade80' : '#fbbf24';
</script>

<div class="speed-control">
	<h3>Vitesse du jeu</h3>
	<div class="speed-slider-container">
		<input
			type="range"
			min="0"
			max="10"
			step="0.5"
			value={$gameSpeed}
			on:input={handleSpeedChange}
			class="speed-slider"
		/>
		<div class="speed-display" style="color: {speedColor}">
			{speedLabel}
		</div>
	</div>
	<div class="speed-markers">
		<span class="marker">0</span>
		<span class="marker">1</span>
		<span class="marker">5</span>
		<span class="marker">10</span>
	</div>
</div>

<style>
	.speed-control {
		position: fixed;
		bottom: 20px;
		left: 20px;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.8);
		padding: 15px;
		border-radius: 10px;
		font-family: 'Arial', sans-serif;
		color: white;
		min-width: 200px;
	}

	h3 {
		margin: 0 0 10px 0;
		font-size: 16px;
		text-align: center;
		color: #fff;
	}

	.speed-slider-container {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 8px;
	}

	.speed-slider {
		flex: 1;
		height: 8px;
		border-radius: 4px;
		background: #333;
		outline: none;
		appearance: none;
		cursor: pointer;
	}

	.speed-slider::-webkit-slider-thumb {
		appearance: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #4ade80;
		cursor: pointer;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
		transition: all 0.2s ease;
	}

	.speed-slider::-webkit-slider-thumb:hover {
		background: #22c55e;
		transform: scale(1.1);
	}

	.speed-slider::-moz-range-thumb {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #4ade80;
		cursor: pointer;
		border: none;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
	}

	.speed-display {
		font-weight: bold;
		font-size: 16px;
		min-width: 60px;
		text-align: center;
		padding: 4px 8px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		transition: color 0.3s ease;
	}

	.speed-markers {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		color: #ccc;
		margin-top: 2px;
		/* Align with slider width by accounting for the display element */
		margin-right: 70px; /* Width of speed-display + gap */
		padding-left: 10px; /* Account for slider thumb radius */
		padding-right: 10px; /* Account for slider thumb radius */
	}

	.marker {
		font-size: 10px;
		opacity: 0.7;
	}

	/* Animation pour quand le jeu est en pause */
	.speed-control:has(.speed-slider[value='0']) .speed-display {
		animation: pulse-pause 1s ease-in-out infinite;
	}

	@keyframes pulse-pause {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.6;
		}
	}
</style>
