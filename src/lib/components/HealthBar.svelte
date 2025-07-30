<script lang="ts">
	import { playerHealth } from '../stores/gameState';

	$: healthPercentage = ($playerHealth / 100) * 100;
	$: healthColor = $playerHealth > 50 ? '#4ade80' : $playerHealth > 25 ? '#fbbf24' : '#ef4444';
</script>

<div class="health-bar-container">
	<div class="health-bar-label">
		Vie: {$playerHealth}/100
	</div>
	<div class="health-bar-background">
		<div
			class="health-bar-fill"
			style="width: {healthPercentage}%; background-color: {healthColor};"
		></div>
	</div>
</div>

<style>
	.health-bar-container {
		position: fixed;
		top: 20px;
		left: 20px;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.7);
		padding: 10px 15px;
		border-radius: 8px;
		font-family: 'Arial', sans-serif;
	}

	.health-bar-label {
		color: white;
		font-size: 14px;
		font-weight: bold;
		margin-bottom: 5px;
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
	}

	.health-bar-background {
		width: 200px;
		height: 20px;
		background-color: #333;
		border-radius: 10px;
		overflow: hidden;
		border: 2px solid #555;
	}

	.health-bar-fill {
		height: 100%;
		border-radius: 8px;
		transition:
			width 0.3s ease,
			background-color 0.3s ease;
		box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.2);
	}
</style>
