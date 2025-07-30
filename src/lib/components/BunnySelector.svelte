<script lang="ts">
	import {
		selectedBunnyType,
		setSelectedBunnyType,
		type BunnyType,
		isRotatingWall,
		wallRotation
	} from '../stores/gameState';

	function selectBunny(type: BunnyType) {
		setSelectedBunnyType(type);
	}
</script>

<div class="bunny-selector">
	<h3>Sélectionner un élément</h3>
	<div class="bunny-buttons">
		<button
			class="bunny-button red {$selectedBunnyType === 'red' ? 'active' : ''}"
			on:click={() => selectBunny('red')}
		>
			<div class="bunny-icon red-bunny">🐰</div>
			<span>Lapin Rouge</span>
			<small>Ennemi</small>
		</button>

		<button
			class="bunny-button yellow {$selectedBunnyType === 'yellow' ? 'active' : ''}"
			on:click={() => selectBunny('yellow')}
		>
			<div class="bunny-icon yellow-bunny">🐰</div>
			<span>Lapin Jaune</span>
			<small>Tour de défense</small>
		</button>

		<button
			class="bunny-button wall {$selectedBunnyType === 'wall' ? 'active' : ''}"
			on:click={() => selectBunny('wall')}
		>
			<div class="wall-icon" style="transform: rotate({$wallRotation}deg)">🧱</div>
			<span>Mur</span>
			<small>Obstacle</small>
		</button>
	</div>

	{#if $selectedBunnyType === 'wall'}
		<div class="rotation-info">
			<small>Maintenez R pour faire tourner</small>
			<div class="rotation-indicator">
				Angle: {$wallRotation}°
			</div>
		</div>
	{/if}
</div>

<style>
	.bunny-selector {
		position: fixed;
		top: 20px;
		right: 20px;
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

	.bunny-buttons {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.bunny-button {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid transparent;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s ease;
		color: white;
		font-size: 14px;
	}

	.bunny-button:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: translateY(-1px);
	}

	.bunny-button.active {
		border-color: #4ade80;
		background: rgba(74, 222, 128, 0.2);
		box-shadow: 0 0 10px rgba(74, 222, 128, 0.3);
	}

	.bunny-icon {
		font-size: 24px;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		filter: drop-shadow(1px 1px 2px rgba(0, 0, 0, 0.5));
	}

	.red-bunny {
		background: radial-gradient(circle, #ff4444, #cc0000);
	}

	.yellow-bunny {
		background: radial-gradient(circle, #ffff44, #cccc00);
	}

	.wall-icon {
		font-size: 24px;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		background: radial-gradient(circle, #8b4513, #654321);
		filter: drop-shadow(1px 1px 2px rgba(0, 0, 0, 0.5));
		transition: transform 0.2s ease;
	}

	.bunny-button span {
		font-weight: bold;
		flex: 1;
	}

	.bunny-button small {
		font-size: 11px;
		opacity: 0.8;
		text-align: right;
		line-height: 1.2;
	}

	.bunny-button.red.active .bunny-icon {
		animation: pulse-red 1.5s ease-in-out infinite;
	}

	.bunny-button.yellow.active .bunny-icon {
		animation: pulse-yellow 1.5s ease-in-out infinite;
	}

	.bunny-button.wall.active .wall-icon {
		animation: pulse-wall 1.5s ease-in-out infinite;
	}

	.rotation-info {
		margin-top: 10px;
		padding: 8px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 6px;
		text-align: center;
	}

	.rotation-info small {
		display: block;
		margin-bottom: 4px;
		color: #ccc;
		font-size: 10px;
	}

	.rotation-indicator {
		font-size: 12px;
		font-weight: bold;
		color: #fff;
	}

	@keyframes pulse-red {
		0%,
		100% {
			box-shadow: 0 0 5px rgba(255, 68, 68, 0.5);
		}
		50% {
			box-shadow: 0 0 15px rgba(255, 68, 68, 0.8);
		}
	}

	@keyframes pulse-yellow {
		0%,
		100% {
			box-shadow: 0 0 5px rgba(255, 255, 68, 0.5);
		}
		50% {
			box-shadow: 0 0 15px rgba(255, 255, 68, 0.8);
		}
	}

	@keyframes pulse-wall {
		0%,
		100% {
			box-shadow: 0 0 5px rgba(139, 69, 19, 0.5);
		}
		50% {
			box-shadow: 0 0 15px rgba(139, 69, 19, 0.8);
		}
	}
</style>
