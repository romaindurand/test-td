<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let showWaypoints = true;

	const dispatch = createEventDispatcher();

	function toggleWaypoints() {
		showWaypoints = !showWaypoints;
		dispatch('toggle', showWaypoints);
	}
</script>

<div class="waypoint-control">
	<button on:click={toggleWaypoints} class="waypoint-button" class:active={showWaypoints}>
		{showWaypoints ? '🗺️ Masquer waypoints' : '🗺️ Afficher waypoints'}
	</button>
</div>

<style>
	.waypoint-control {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 100;
	}

	.waypoint-button {
		padding: 10px 15px;
		background: rgba(0, 0, 0, 0.7);
		color: white;
		border: 2px solid #333;
		border-radius: 8px;
		cursor: pointer;
		font-size: 14px;
		transition: all 0.2s ease;
	}

	.waypoint-button:hover {
		background: rgba(0, 0, 0, 0.9);
		border-color: #555;
	}

	.waypoint-button.active {
		background: rgba(0, 100, 200, 0.7);
		border-color: #0066cc;
	}

	.waypoint-button.active:hover {
		background: rgba(0, 100, 200, 0.9);
	}
</style>
