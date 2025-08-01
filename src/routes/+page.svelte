<script lang="ts">
	import { Application, Assets, Container, Sprite, Graphics, Text } from 'pixi.js';
	import { onMount } from 'svelte';
	import HealthBar from '../lib/components/HealthBar.svelte';
	import BunnySelector from '../lib/components/BunnySelector.svelte';
	import GameSpeedControl from '../lib/components/GameSpeedControl.svelte';
	import {
		takeDamage,
		selectedBunnyType,
		setWallRotating,
		rotateWall,
		wallRotation,
		gameSpeed,
		type BunnyType
	} from '../lib/stores/gameState';
	import { PathfindingManager } from '../lib/simple-pathfinding-manager';
	import type { Point } from '../lib/pathfinding';

	let root: HTMLDivElement;
	let pathfinder: PathfindingManager;
	let previewSprite: Sprite | Graphics | null = null;
	let app: Application;
	let expandedObstacleGraphics: (Graphics | Text)[] = [];
	let expandedObstacleContainer: Container;
	let hoverPathGraphics: (Graphics | Text)[] = [];
	let hoverPathContainer: Container;
	let testLineGraphics: (Graphics | Text)[] = [];
	let mousePosition: Point = { x: 0, y: 0 };
	let centralBunny: Sprite; // Pour obtenir la position du lapin vert
	let enemyCount = 0; // Compteur d'ennemis en vie
	let projectileCount = 0; // Compteur de projectiles à l'écran
	let gameStartTime = 0; // Temps de début de partie (en millisecondes)
	let gameTime = 0; // Temps de jeu ajusté selon la vitesse (en millisecondes)

	// Debug visualization toggle
	let showDebugOverlay = true;

	// Smart firing mode toggle
	let smartFiringMode = false;

	// Enemy spawn rate control (0 = paused, 50 = 500ms default, 100 = 100ms fastest)
	let spawnRateSlider = 50; // Default value (500ms)

	// Calculate actual spawn interval from slider value
	$: actualSpawnInterval = spawnRateSlider === 0 ? Infinity : (110 - spawnRateSlider) * 10; // 0->∞, 50->500ms, 100->100ms

	// Historical data for statistics (30 seconds worth of data)
	const HISTORY_DURATION = 30000; // 30 seconds in milliseconds
	const SAMPLE_INTERVAL = 500; // Sample every 500ms
	let enemyHistory: { time: number; count: number }[] = [];
	let projectileHistory: { time: number; count: number }[] = [];
	let lastSampleTime = 0;

	// Calculate median and trends
	$: enemyMedian = calculateMedian(enemyHistory.map((h) => h.count));
	$: projectileMedian = calculateMedian(projectileHistory.map((h) => h.count));

	function calculateMedian(values: number[]): number {
		if (values.length === 0) return 0;
		const sorted = [...values].sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
	}

	function updateHistoricalData() {
		const currentTime = gameTime;

		// Add new sample if enough time has passed
		if (currentTime - lastSampleTime >= SAMPLE_INTERVAL) {
			enemyHistory.push({ time: currentTime, count: enemyCount });
			projectileHistory.push({ time: currentTime, count: projectileCount });
			lastSampleTime = currentTime;

			// Remove old data (older than 30 seconds)
			const cutoffTime = currentTime - HISTORY_DURATION;
			enemyHistory = enemyHistory.filter((h) => h.time >= cutoffTime);
			projectileHistory = projectileHistory.filter((h) => h.time >= cutoffTime);
		}
	}

	function generateMiniChart(history: { time: number; count: number }[], color: string): string {
		if (history.length < 2) {
			return `<svg width="60" height="20" viewBox="0 0 60 20"><line x1="0" y1="10" x2="60" y2="10" stroke="${color}" stroke-width="1" opacity="0.3"/></svg>`;
		}

		const maxCount = Math.max(...history.map((h) => h.count), 1);
		const minTime = Math.min(...history.map((h) => h.time));
		const maxTime = Math.max(...history.map((h) => h.time));
		const timeRange = maxTime - minTime || 1;

		let pathData = '';

		history.forEach((point, index) => {
			const x = ((point.time - minTime) / timeRange) * 60;
			const y = 20 - (point.count / maxCount) * 18;

			if (index === 0) {
				pathData += `M ${x} ${y}`;
			} else {
				pathData += ` L ${x} ${y}`;
			}
		});

		return `<svg width="60" height="20" viewBox="0 0 60 20">
			<path d="${pathData}" stroke="${color}" stroke-width="1.5" fill="none"/>
			<circle cx="${((history[history.length - 1]?.time - minTime) / timeRange) * 60}" 
					cy="${20 - (history[history.length - 1]?.count / maxCount) * 18}" 
					r="1.5" fill="${color}"/>
		</svg>`;
	}

	// Difficulty scaling configuration
	const difficultyConfig = {
		waveInterval: 30000, // 30 secondes en millisecondes
		baseHealth: 100, // PV de base des ennemis
		healthMultiplier: 1.5, // Multiplicateur exponentiel (1.5x par vague)
		maxWaves: 20 // Limite pour éviter des valeurs trop élevées
	};

	// Calculate current enemy health based on game time
	$: currentEnemyHealth = (() => {
		const waveNumber = Math.floor(gameTime / difficultyConfig.waveInterval);
		const clampedWave = Math.min(waveNumber, difficultyConfig.maxWaves);
		return Math.floor(
			difficultyConfig.baseHealth * Math.pow(difficultyConfig.healthMultiplier, clampedWave)
		);
	})();

	// Format the game time as MM:SS
	$: formattedGameTime = (() => {
		const totalSeconds = Math.floor(gameTime / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	})();

	// Throttle variables for test line optimization
	let testLineThrottleTimer: number | null = null;
	let testLineCleanupTimer: number | null = null;
	let lastOptimalPath: Point[] | null = null;
	let lastMousePosition: Point = { x: 0, y: 0 };

	// Throttle function to limit calculations to 60fps (16ms)
	function throttleTestLine(callback: () => void, delay: number = 16) {
		if (testLineThrottleTimer) {
			return; // Skip if already scheduled
		}
		testLineThrottleTimer = setTimeout(() => {
			callback();
			testLineThrottleTimer = null;
		}, delay);
	}

	// Function to schedule cleanup of test line after mouse stops moving
	function scheduleTestLineCleanup() {
		// Clear any existing cleanup timer
		if (testLineCleanupTimer) {
			clearTimeout(testLineCleanupTimer);
		}

		// Schedule cleanup after 100ms of no mouse movement
		testLineCleanupTimer = setTimeout(() => {
			if ($selectedBunnyType !== 'test-line') {
				clearTestLine();
			}
			testLineCleanupTimer = null;
		}, 100);
	}

	// Variable reactive pour le statut de l'intersection
	$: testLineStatus = (() => {
		if (!pathfinder || !centralBunny || $selectedBunnyType !== 'test-line') {
			return null;
		}

		const targetPos = { x: centralBunny.x, y: centralBunny.y };

		// Check if direct path is clear
		const directResult = pathfinder.testLineIntersections(mousePosition, targetPos);
		const directDistance = Math.sqrt(
			Math.pow(targetPos.x - mousePosition.x, 2) + Math.pow(targetPos.y - mousePosition.y, 2)
		);

		// Use cached optimal path if available and mouse hasn't moved significantly
		const mouseMoved =
			Math.abs(mousePosition.x - lastMousePosition.x) > 5 ||
			Math.abs(mousePosition.y - lastMousePosition.y) > 5;

		let optimalPath = lastOptimalPath;
		if (mouseMoved || !lastOptimalPath) {
			optimalPath = findOptimalPathToGoal(mousePosition);
			lastOptimalPath = optimalPath;
			lastMousePosition = { ...mousePosition };
		}

		if (optimalPath && optimalPath.length > 1) {
			// Calculate total path distance
			let totalDistance = 0;
			for (let i = 0; i < optimalPath.length - 1; i++) {
				const dx = optimalPath[i + 1].x - optimalPath[i].x;
				const dy = optimalPath[i + 1].y - optimalPath[i].y;
				totalDistance += Math.sqrt(dx * dx + dy * dy);
			}

			return {
				hasPath: true,
				isDirect: optimalPath.length === 2,
				pathLength: optimalPath.length,
				totalDistance: Math.round(totalDistance),
				directDistance: Math.round(directDistance),
				viaCorner: optimalPath.length > 2
			};
		}

		return {
			hasPath: false,
			intersects: directResult.intersects,
			intersectionCount: directResult.intersectionPoints.length,
			directDistance: Math.round(directDistance)
		};
	})();

	// Function to draw hover path
	function drawHoverPath(path: Point[]) {
		if (!hoverPathContainer) {
			return;
		}

		clearHoverPath();

		if (path.length < 2) {
			return;
		}

		const pathGraphic = new Graphics();

		pathGraphic.moveTo(path[0].x, path[0].y);
		for (let i = 1; i < path.length; i++) {
			pathGraphic.lineTo(path[i].x, path[i].y);
		}

		// Add segment length labels
		for (let i = 1; i < path.length; i++) {
			const startPoint = path[i - 1];
			const endPoint = path[i];

			// Calculate segment length
			const dx = endPoint.x - startPoint.x;
			const dy = endPoint.y - startPoint.y;
			const segmentLength = Math.sqrt(dx * dx + dy * dy);

			// Calculate midpoint of segment
			const midX = (startPoint.x + endPoint.x) / 2;
			const midY = (startPoint.y + endPoint.y) / 2;

			// Create text for segment length
			const lengthText = new Text(Math.round(segmentLength).toString(), {
				fontFamily: 'Arial',
				fontSize: 10,
				fill: 0xffff00,
				fontWeight: 'bold',
				stroke: { color: 0x000000, width: 2 }
			});
			lengthText.anchor.set(0.5);
			lengthText.x = midX;
			lengthText.y = midY - 10; // Décaler vers le haut

			app.stage.addChild(lengthText);
			hoverPathGraphics.push(lengthText);
		}

		// Add arrow at the end
		if (path.length >= 2) {
			const lastPoint = path[path.length - 1];
			const secondLastPoint = path[path.length - 2];

			const angle = Math.atan2(lastPoint.y - secondLastPoint.y, lastPoint.x - secondLastPoint.x);
			const arrowLength = 15;
			const arrowAngle = Math.PI / 6; // 30 degrees

			// Flèche - dessiner les deux lignes de la flèche
			pathGraphic.moveTo(lastPoint.x, lastPoint.y);
			pathGraphic.lineTo(
				lastPoint.x - arrowLength * Math.cos(angle - arrowAngle),
				lastPoint.y - arrowLength * Math.sin(angle - arrowAngle)
			);
			pathGraphic.moveTo(lastPoint.x, lastPoint.y);
			pathGraphic.lineTo(
				lastPoint.x - arrowLength * Math.cos(angle + arrowAngle),
				lastPoint.y - arrowLength * Math.sin(angle + arrowAngle)
			);
		}

		// Appliquer le style APRÈS avoir dessiné tout le chemin (API PixiJS v8)
		pathGraphic.stroke({ width: 3, color: 0xffff00, alpha: 0.9 });

		// Essayer d'ajouter directement au stage si le container pose problème
		app.stage.addChild(pathGraphic);
		// S'assurer que le chemin est au-dessus de tout le reste
		app.stage.setChildIndex(pathGraphic, app.stage.children.length - 1);
		hoverPathGraphics.push(pathGraphic);
	}

	// Function to clear hover path
	function clearHoverPath() {
		hoverPathGraphics.forEach((graphic) => {
			if (graphic.parent) {
				graphic.parent.removeChild(graphic);
			}
		});
		hoverPathGraphics = [];
	}

	// New function to find optimal path to goal via blue corners
	function findOptimalPathToGoal(startPos: Point): Point[] | null {
		if (!pathfinder) return null;

		const goalPos = { x: centralBunny.x, y: centralBunny.y };

		// Test direct path first
		if (pathfinder.testPathClear(startPos, goalPos)) {
			return [startPos, goalPos];
		}

		// Get all blue corners (expanded obstacle corners)
		const expandedObstacles = pathfinder.getExpandedObstacles();
		const allBlueCorners: Point[] = [];

		for (const obstacle of expandedObstacles) {
			allBlueCorners.push(...obstacle);
		}

		// Find accessible blue corners with their distances to goal
		const accessibleCorners: { corner: Point; distanceToGoal: number; totalDistance: number }[] =
			[];

		for (const corner of allBlueCorners) {
			// Check if corner is accessible from start position
			if (pathfinder.testPathClear(startPos, corner)) {
				const distanceToGoal = pathfinder.getBlueCornerDistance(corner);

				if (distanceToGoal !== null && distanceToGoal !== Infinity) {
					const distanceFromStart = Math.sqrt(
						Math.pow(corner.x - startPos.x, 2) + Math.pow(corner.y - startPos.y, 2)
					);
					const totalDistance = distanceFromStart + distanceToGoal;

					accessibleCorners.push({
						corner,
						distanceToGoal,
						totalDistance
					});
				}
			}
		}

		if (accessibleCorners.length === 0) {
			return null;
		}

		// Sort by total distance and pick the best one
		accessibleCorners.sort((a, b) => a.totalDistance - b.totalDistance);
		const optimalCorner = accessibleCorners[0];

		// Get the precomputed path from the optimal corner to goal
		const cornerToGoalPath = pathfinder.getBlueCornerPath(optimalCorner.corner);

		if (cornerToGoalPath && cornerToGoalPath.length > 0) {
			// Build complete path: start -> optimal corner -> goal path
			const completePath = [startPos, ...cornerToGoalPath];
			return completePath;
		}

		return null;
	}

	// Function to calculate optimal path for enemies (similar to findOptimalPathToGoal)
	function calculateEnemyPath(startPos: Point): Point[] | null {
		if (!pathfinder) return null;

		const goalPos = { x: centralBunny.x, y: centralBunny.y };

		// Test direct path first
		if (pathfinder.testPathClear(startPos, goalPos)) {
			return [startPos, goalPos];
		}

		// Get all blue corners (expanded obstacle corners)
		const expandedObstacles = pathfinder.getExpandedObstacles();
		const allBlueCorners: Point[] = [];

		for (const obstacle of expandedObstacles) {
			allBlueCorners.push(...obstacle);
		}

		// Find accessible blue corners with their distances to goal
		const accessibleCorners: { corner: Point; distanceToGoal: number; totalDistance: number }[] =
			[];

		for (const corner of allBlueCorners) {
			// Check if corner is accessible from start position
			if (pathfinder.testPathClear(startPos, corner)) {
				const distanceToGoal = pathfinder.getBlueCornerDistance(corner);

				if (distanceToGoal !== null && distanceToGoal !== Infinity) {
					const distanceFromStart = Math.sqrt(
						Math.pow(corner.x - startPos.x, 2) + Math.pow(corner.y - startPos.y, 2)
					);
					const totalDistance = distanceFromStart + distanceToGoal;

					accessibleCorners.push({
						corner,
						distanceToGoal,
						totalDistance
					});
				}
			}
		}

		if (accessibleCorners.length === 0) {
			return null;
		}

		// Sort by total distance and pick the best one
		accessibleCorners.sort((a, b) => a.totalDistance - b.totalDistance);
		const optimalCorner = accessibleCorners[0];

		// Get the precomputed path from the optimal corner to goal
		const cornerToGoalPath = pathfinder.getBlueCornerPath(optimalCorner.corner);

		if (cornerToGoalPath && cornerToGoalPath.length > 0) {
			// Build complete path: start -> optimal corner -> goal path
			const completePath = [startPos, ...cornerToGoalPath];
			return completePath;
		}

		return null;
	}

	// Function to draw test line - now uses immediate rendering with cached data
	function drawTestLine(fromPos: Point, toPos: Point) {
		if (!app || !pathfinder || !centralBunny) return;

		// Clear previous test line
		clearTestLine();

		// Use cached optimal path if available, otherwise calculate immediately
		let optimalPath = lastOptimalPath;

		// Check if we need to recalculate (mouse moved significantly)
		const mouseMoved =
			Math.abs(fromPos.x - lastMousePosition.x) > 5 ||
			Math.abs(fromPos.y - lastMousePosition.y) > 5;

		if (mouseMoved || !lastOptimalPath) {
			// Only throttle the expensive calculation, not the display
			throttleTestLine(() => {
				const newOptimalPath = findOptimalPathToGoal(fromPos);
				lastOptimalPath = newOptimalPath;
				lastMousePosition = { ...fromPos };

				// Redraw with the new path
				if (newOptimalPath) {
					drawTestLineGraphics(newOptimalPath);
				}
			}, 16);

			// For immediate display, use direct line if no cached path
			if (!optimalPath) {
				drawDirectLine(fromPos, toPos);
				scheduleTestLineCleanup();
				return;
			}
		}

		// Draw immediately with cached or current optimal path
		if (optimalPath && optimalPath.length > 1) {
			drawTestLineGraphics(optimalPath);
		} else {
			drawDirectLine(fromPos, toPos);
		}

		// Schedule cleanup in case mouse stops moving
		scheduleTestLineCleanup();
	}

	// Helper function to draw the test line graphics
	function drawTestLineGraphics(optimalPath: Point[]) {
		// Clear any existing graphics first
		clearTestLine();

		// Draw the optimal path in green
		const pathGraphic = new Graphics();
		pathGraphic.moveTo(optimalPath[0].x, optimalPath[0].y);

		for (let i = 1; i < optimalPath.length; i++) {
			pathGraphic.lineTo(optimalPath[i].x, optimalPath[i].y);
		}

		pathGraphic.stroke({ width: 4, color: 0x00ff00, alpha: 0.9 }); // Vert pour le chemin optimal
		app.stage.addChild(pathGraphic);
		testLineGraphics.push(pathGraphic);

		// Add distance labels on each segment
		for (let i = 1; i < optimalPath.length; i++) {
			const startPoint = optimalPath[i - 1];
			const endPoint = optimalPath[i];

			// Calculate segment length
			const dx = endPoint.x - startPoint.x;
			const dy = endPoint.y - startPoint.y;
			const segmentLength = Math.sqrt(dx * dx + dy * dy);

			// Calculate midpoint of segment
			const midX = (startPoint.x + endPoint.x) / 2;
			const midY = (startPoint.y + endPoint.y) / 2;

			// Create text for segment length
			const lengthText = new Text(Math.round(segmentLength).toString(), {
				fontFamily: 'Arial',
				fontSize: 11,
				fill: 0x00ff00,
				fontWeight: 'bold',
				stroke: { color: 0x000000, width: 2 }
			});
			lengthText.anchor.set(0.5);
			lengthText.x = midX;
			lengthText.y = midY - 12;

			app.stage.addChild(lengthText);
			testLineGraphics.push(lengthText);
		}

		// Highlight the optimal blue corner if one was used
		if (optimalPath.length === 3) {
			// curseur -> corner -> goal
			const optimalCorner = optimalPath[1];
			const cornerHighlight = new Graphics();
			cornerHighlight.beginFill(0xffff00, 0.8); // Jaune pour mettre en évidence
			cornerHighlight.drawCircle(optimalCorner.x, optimalCorner.y, 12);
			cornerHighlight.endFill();

			app.stage.addChild(cornerHighlight);
			testLineGraphics.push(cornerHighlight);
		}
	}

	// Helper function to draw a direct line (fallback)
	function drawDirectLine(fromPos: Point, toPos: Point) {
		const testResult = pathfinder.testLineIntersections(fromPos, toPos);

		const lineGraphic = new Graphics();
		lineGraphic.moveTo(fromPos.x, fromPos.y);
		lineGraphic.lineTo(toPos.x, toPos.y);

		// Rouge si bloqué, vert si libre
		const lineColor = testResult.intersects ? 0xff0000 : 0x00ff00;
		lineGraphic.stroke({ width: 3, color: lineColor, alpha: 0.8 });

		app.stage.addChild(lineGraphic);
		testLineGraphics.push(lineGraphic);

		// Dessiner les points d'intersection
		testResult.intersectionPoints.forEach((point) => {
			const intersectionPoint = new Graphics();
			intersectionPoint.beginFill(0xff0000, 1.0);
			intersectionPoint.drawCircle(point.x, point.y, 5);
			intersectionPoint.endFill();

			app.stage.addChild(intersectionPoint);
			testLineGraphics.push(intersectionPoint);
		});
	} // Function to clear test line
	function clearTestLine() {
		testLineGraphics.forEach((graphic) => {
			if (graphic.parent) {
				graphic.parent.removeChild(graphic);
			}
		});
		testLineGraphics = [];
	}

	// Function to update expanded obstacle visuals
	function updateExpandedObstacleVisuals() {
		if (!expandedObstacleContainer || !pathfinder) return;

		// Clear existing expanded obstacle graphics
		expandedObstacleGraphics.forEach((graphic) => {
			if (graphic.parent) {
				graphic.parent.removeChild(graphic);
			}
		});
		expandedObstacleGraphics = [];

		const expandedObstacles = pathfinder.getExpandedObstacles();
		const originalObstacles = pathfinder.getObstacles(); // Récupérer les obstacles originaux

		// Draw original obstacles in orange transparent for debugging
		if (showDebugOverlay) {
			originalObstacles.forEach((obstacle) => {
				if (obstacle.length < 3) return;

				const originalObstacleGraphic = new Graphics();
				originalObstacleGraphic.beginFill(0xff8800, 0.4); // Orange transparent
				originalObstacleGraphic.lineStyle(2, 0xff4400, 0.9); // Bordure orange foncé

				// Draw polygon
				originalObstacleGraphic.moveTo(obstacle[0].x, obstacle[0].y);
				for (let i = 1; i < obstacle.length; i++) {
					originalObstacleGraphic.lineTo(obstacle[i].x, obstacle[i].y);
				}
				originalObstacleGraphic.closePath();
				originalObstacleGraphic.endFill();

				expandedObstacleContainer.addChild(originalObstacleGraphic);
				expandedObstacleGraphics.push(originalObstacleGraphic);
			});
		}

		// Draw expanded obstacles with interactive corners
		if (showDebugOverlay) {
			expandedObstacles.forEach((obstacle) => {
				if (obstacle.length < 3) return;

				const obstacleGraphic = new Graphics();
				obstacleGraphic.beginFill(0x0099ff, 0.3); // Bleu translucide
				obstacleGraphic.lineStyle(1, 0x0066cc, 0.8); // Bordure bleu plus foncé

				// Draw polygon
				obstacleGraphic.moveTo(obstacle[0].x, obstacle[0].y);
				for (let i = 1; i < obstacle.length; i++) {
					obstacleGraphic.lineTo(obstacle[i].x, obstacle[i].y);
				}
				obstacleGraphic.closePath();
				obstacleGraphic.endFill();

				expandedObstacleContainer.addChild(obstacleGraphic);
				expandedObstacleGraphics.push(obstacleGraphic);

				// Add interactive corner points
				obstacle.forEach((corner) => {
					const cornerGraphic = new Graphics();
					cornerGraphic.beginFill(0x0066cc, 0.8);
					cornerGraphic.drawCircle(corner.x, corner.y, 8); // Augmenter la taille pour déboguer
					cornerGraphic.endFill();

					// Make corner interactive - configuration plus explicite
					cornerGraphic.eventMode = 'static';
					cornerGraphic.cursor = 'pointer';
					cornerGraphic.interactive = true;

					// Ajouter le texte de distance
					const distance = pathfinder.getBlueCornerDistance(corner);
					if (distance !== null && distance !== Infinity) {
						const distanceText = new Text({
							text: Math.round(distance).toString(),
							style: {
								fontFamily: 'Arial',
								fontSize: 12,
								fill: 0xffffff,
								fontWeight: 'bold'
							}
						});
						distanceText.anchor.set(0.5);
						distanceText.x = corner.x;
						distanceText.y = corner.y - 15; // Décaler vers le haut
						app.stage.addChild(distanceText);
						expandedObstacleGraphics.push(distanceText);
					} else if (distance === null || distance === Infinity) {
						// Afficher un "X" pour indiquer que le goal n'est pas accessible
						const inaccessibleText = new Text({
							text: '✗',
							style: {
								fontFamily: 'Arial',
								fontSize: 14,
								fill: 0xff0000, // Rouge pour l'inaccessibilité
								fontWeight: 'bold'
							}
						});
						inaccessibleText.anchor.set(0.5);
						inaccessibleText.x = corner.x;
						inaccessibleText.y = corner.y - 15; // Décaler vers le haut
						app.stage.addChild(inaccessibleText);
						expandedObstacleGraphics.push(inaccessibleText);
					}

					// Handle hover events
					cornerGraphic.on('pointerover', () => {
						// Debug: tester directement la détection d'intersection
						const goalPos = pathfinder.getGoal();
						const path = pathfinder.getBlueCornerPath(corner);
						if (path && path.length > 1) {
							drawHoverPath(path);
						} else {
							// Debug visuel : afficher la ligne directe en rouge pour voir pourquoi elle est bloquée
							const debugLine = new Graphics();
							debugLine.moveTo(corner.x, corner.y);
							debugLine.lineTo(goalPos.x, goalPos.y);
							debugLine.stroke({ width: 2, color: 0xff0000, alpha: 0.5 }); // Rouge translucide

							app.stage.addChild(debugLine);
							hoverPathGraphics.push(debugLine);

							// Ne pas afficher de chemin si le goal n'est pas accessible
							// clearHoverPath(); // Commenté pour garder la ligne debug
						}
					});

					cornerGraphic.on('pointerout', () => {
						clearHoverPath();
					});

					// Ajouter directement au stage pour éviter les problèmes de hiérarchie
					app.stage.addChild(cornerGraphic);
					expandedObstacleGraphics.push(cornerGraphic);
				});
			});
		}
	}

	function toggleDebugOverlay() {
		showDebugOverlay = !showDebugOverlay;
		updateExpandedObstacleVisuals();
	}

	function toggleSmartFiring() {
		smartFiringMode = !smartFiringMode;
	}

	onMount(() => {
		app = new Application();
		(async function () {
			// Create a new application

			// Initialize the application
			await app.init({ background: '#1099bb', resizeTo: window });

			// Initialize game timer
			gameStartTime = Date.now();
			gameTime = 0;

			// Append the application canvas to the document body
			// eslint-disable-next-line svelte/no-dom-manipulating
			root.appendChild(app.canvas);

			// Load the bunny texture
			const texture = await Assets.load('https://pixijs.com/assets/bunny.png');

			// Create the central bunny (tower) with random position
			centralBunny = new Sprite(texture);
			// Position aléatoire dans la zone centrale de l'écran (évite les bords)
			const margin = 100; // Marge pour éviter que le lapin soit trop près des bords
			centralBunny.x = margin + Math.random() * (app.screen.width - 2 * margin);
			centralBunny.y = margin + Math.random() * (app.screen.height - 2 * margin);
			centralBunny.anchor.set(0.5);
			centralBunny.tint = 0x00ff00; // Vert pour le lapin cible
			app.stage.addChild(centralBunny);

			// Create pathfinding system
			pathfinder = new PathfindingManager();

			// Initialize obstacles array for pathfinder
			const obstaclePoints: Point[][] = [];

			// 10 random blob obstacles
			const obstacles: Graphics[] = [];
			for (let i = 0; i < 10; i++) {
				const obstacle = new Graphics();

				// Generate random blob shape
				const centerX = margin + Math.random() * (app.screen.width - 2 * margin);
				const centerY = margin + Math.random() * (app.screen.height - 2 * margin);
				const baseRadius = 40 + Math.random() * 40; // Rayon entre 40 et 80
				const points: Point[] = [];

				// Generate blob points
				const numPoints = 8;
				for (let j = 0; j < numPoints; j++) {
					const angle = (j / numPoints) * Math.PI * 2;
					const radiusVariation = 0.5 + Math.random() * 0.5; // Variation de 0.5 à 1
					const radius = baseRadius * radiusVariation;
					const x = centerX + Math.cos(angle) * radius;
					const y = centerY + Math.sin(angle) * radius;
					points.push({ x, y });
				}

				// Draw the blob using the correct PixiJS v8 API
				obstacle.beginFill(0x444444); // Gris foncé
				obstacle.lineStyle(2, 0x222222, 1); // Bordure gris très foncé
				obstacle.moveTo(points[0].x, points[0].y);
				for (let j = 1; j < points.length; j++) {
					obstacle.lineTo(points[j].x, points[j].y);
				}
				obstacle.closePath();
				obstacle.endFill();

				app.stage.addChild(obstacle);
				obstacles.push(obstacle);
				obstaclePoints.push(points);
			}

			// Initialize obstacles in the pathfinding manager
			for (const obstaclePointsData of obstaclePoints) {
				pathfinder.addObstacle(obstaclePointsData);
			}

			// Set the goal position to match the central bunny
			pathfinder.setGoal({ x: centralBunny.x, y: centralBunny.y });

			// Create expanded obstacle visualization container
			expandedObstacleContainer = new Container();
			expandedObstacleContainer.eventMode = 'static';
			expandedObstacleContainer.interactiveChildren = true;
			app.stage.addChild(expandedObstacleContainer);

			// Create hover path visualization container
			hoverPathContainer = new Container();
			app.stage.addChild(hoverPathContainer);

			// Update visuals
			updateExpandedObstacleVisuals();

			// Array to store moving enemies with their paths
			let enemies: {
				sprite: Sprite;
				path: Point[] | null;
				currentPathIndex: number;
				maxHealth: number;
				currentHealth: number;
				healthBar: Graphics;
				velocity: { x: number; y: number };
				previousPosition: { x: number; y: number };
			}[] = [];

			// Array to store towers with their properties
			const towers: {
				sprite: Sprite;
				range: number;
				fireRate: number; // Shots per second
				timeSinceLastShot: number; // Accumulator in seconds
				damage: number;
			}[] = [];

			// Array to store projectiles
			const projectiles: {
				sprite: Graphics;
				speed: number;
				damage: number;
				dx: number;
				dy: number;
			}[] = [];

			// Auto-spawn system variables
			let spawnAccumulator = 0; // Accumulateur pour gérer le spawn basé sur les ticks

			// Function to spawn enemy at specific position (for click events)
			function spawnEnemyAt(x: number, y: number) {
				const enemy = new Sprite(texture);
				enemy.anchor.set(0.5);
				enemy.tint = 0xff0000; // Rouge pour les ennemis
				enemy.x = x;
				enemy.y = y;
				app.stage.addChild(enemy);

				// Create health bar
				const healthBar = new Graphics();
				app.stage.addChild(healthBar);

				// Calculate initial path using pathfinding
				const initialPath = calculateEnemyPath({ x, y });

				// Use current enemy health based on game time progression
				const enemyData = {
					sprite: enemy,
					path: initialPath,
					currentPathIndex: 0,
					maxHealth: currentEnemyHealth,
					currentHealth: currentEnemyHealth,
					healthBar: healthBar,
					velocity: { x: 0, y: 0 }, // Add velocity tracking
					previousPosition: { x, y } // Track previous position for velocity calculation
				};

				enemies.push(enemyData);
				updateEnemyHealthBar(enemyData);
				enemyCount = enemies.length; // Mettre à jour le compteur
			}

			// Function to spawn enemy from random edge of the map
			function spawnEnemyFromEdge() {
				const screenWidth = app.screen.width;
				const screenHeight = app.screen.height;
				const margin = 20; // Distance du bord

				// Choisir un côté aléatoire (0: haut, 1: droite, 2: bas, 3: gauche)
				const side = Math.floor(Math.random() * 4);
				let x: number, y: number;

				switch (side) {
					case 0: // Haut
						x = Math.random() * screenWidth;
						y = -margin;
						break;
					case 1: // Droite
						x = screenWidth + margin;
						y = Math.random() * screenHeight;
						break;
					case 2: // Bas
						x = Math.random() * screenWidth;
						y = screenHeight + margin;
						break;
					case 3: // Gauche
						x = -margin;
						y = Math.random() * screenHeight;
						break;
					default:
						x = 0;
						y = 0;
				}

				spawnEnemyAt(x, y);
			}

			// Function to update enemy health bar
			function updateEnemyHealthBar(enemyData: (typeof enemies)[0]) {
				const healthBar = enemyData.healthBar;
				const enemy = enemyData.sprite;

				// Clear previous graphics
				healthBar.clear();

				// Health bar dimensions
				const barWidth = 30;
				const barHeight = 4;
				const barOffsetY = -25; // Distance au-dessus du lapin

				// Calculate health percentage
				const healthPercent = enemyData.currentHealth / enemyData.maxHealth;

				// Position the health bar above the enemy
				const barX = enemy.x - barWidth / 2;
				const barY = enemy.y + barOffsetY;

				// Draw background (red)
				healthBar.beginFill(0x440000);
				healthBar.drawRect(barX, barY, barWidth, barHeight);
				healthBar.endFill();

				// Draw health (green to red gradient based on health)
				let healthColor = 0x00ff00; // Vert
				if (healthPercent < 0.5) {
					healthColor = 0xffff00; // Jaune
				}
				if (healthPercent < 0.25) {
					healthColor = 0xff0000; // Rouge
				}

				healthBar.beginFill(healthColor);
				healthBar.drawRect(barX, barY, barWidth * healthPercent, barHeight);
				healthBar.endFill();

				// Draw border
				healthBar.lineStyle(1, 0x000000, 0.8);
				healthBar.drawRect(barX, barY, barWidth, barHeight);
			}

			// Function to spawn tower at specific position (for right-click events)
			function spawnTowerAt(x: number, y: number) {
				const tower = new Sprite(texture);
				tower.anchor.set(0.5);
				tower.tint = 0xffff00; // Jaune pour les tours
				tower.x = x;
				tower.y = y;
				app.stage.addChild(tower);

				// Add tower to towers array with properties
				towers.push({
					sprite: tower,
					range: 150, // Portée de 150 pixels
					fireRate: 2, // 2 tirs par seconde
					timeSinceLastShot: 0, // Commencer à 0
					damage: 50 // 50 dégâts par projectile
				});
			}

			// Function to recalculate paths for all existing enemies
			function recalculateAllEnemyPaths() {
				for (const enemyData of enemies) {
					const enemy = enemyData.sprite;
					const newPath = calculateEnemyPath({ x: enemy.x, y: enemy.y });

					if (newPath) {
						enemyData.path = newPath;
						enemyData.currentPathIndex = 0; // Reset to start of new path
					}
				}
			}

			// Function to spawn wall at specific position
			function spawnWallAt(x: number, y: number) {
				const wallWidth = 80;
				const wallHeight = 20;
				const halfWidth = wallWidth / 2;
				const halfHeight = wallHeight / 2;

				const wall = new Graphics();

				// Get current rotation from store
				let currentRotation: number = $wallRotation;

				wall.beginFill(0x8b4513); // Couleur marron
				wall.lineStyle(2, 0x5d2f0a, 1); // Bordure marron foncé
				wall.drawRect(-halfWidth, -halfHeight, wallWidth, wallHeight);
				wall.endFill();

				wall.x = x;
				wall.y = y;
				wall.rotation = (currentRotation * Math.PI) / 180; // Convert to radians

				// Calculate the four corners of the rotated rectangle
				const corners: Point[] = [];
				const cos = Math.cos(wall.rotation);
				const sin = Math.sin(wall.rotation);

				// Calculate corners relative to center, then translate to world position
				const cornerOffsets = [
					{ x: -halfWidth, y: -halfHeight },
					{ x: halfWidth, y: -halfHeight },
					{ x: halfWidth, y: halfHeight },
					{ x: -halfWidth, y: halfHeight }
				];

				for (const offset of cornerOffsets) {
					const rotatedX = offset.x * cos - offset.y * sin;
					const rotatedY = offset.x * sin + offset.y * cos;
					corners.push({
						x: x + rotatedX,
						y: y + rotatedY
					});
				}

				app.stage.addChild(wall);
				pathfinder.addObstacle(corners);

				// Update visuals after adding obstacle
				updateExpandedObstacleVisuals();

				// Recalculate paths for all existing enemies
				recalculateAllEnemyPaths();
			}

			// Function to find closest enemy within range of a tower
			function findClosestEnemyInRange(towerX: number, towerY: number, range: number) {
				let closestEnemy = null;
				let closestDistance = Infinity;

				for (const enemyData of enemies) {
					const enemy = enemyData.sprite;
					const distance = Math.sqrt(Math.pow(enemy.x - towerX, 2) + Math.pow(enemy.y - towerY, 2));

					if (distance <= range && distance < closestDistance) {
						closestDistance = distance;
						closestEnemy = enemyData;
					}
				}

				return closestEnemy;
			}

			// Function to calculate predictive firing direction
			function calculatePredictiveDirection(
				towerX: number,
				towerY: number,
				enemy: (typeof enemies)[0],
				projectileSpeed: number
			) {
				const enemySprite = enemy.sprite;
				const enemyVelocity = enemy.velocity || { x: 0, y: 0 };

				// Current position
				const dx = enemySprite.x - towerX;
				const dy = enemySprite.y - towerY;
				const distance = Math.sqrt(dx * dx + dy * dy);

				// If no velocity data or enemy is very close, use direct targeting
				if (!enemyVelocity || distance < 50) {
					return { x: dx / distance, y: dy / distance };
				}

				// Calculate time for projectile to reach current enemy position
				const timeToTarget = distance / projectileSpeed;

				// Predict where enemy will be
				const predictedX = enemySprite.x + enemyVelocity.x * timeToTarget;
				const predictedY = enemySprite.y + enemyVelocity.y * timeToTarget;

				// Calculate direction to predicted position
				const predictedDx = predictedX - towerX;
				const predictedDy = predictedY - towerY;
				const predictedDistance = Math.sqrt(predictedDx * predictedDx + predictedDy * predictedDy);

				return {
					x: predictedDx / predictedDistance,
					y: predictedDy / predictedDistance
				};
			}

			// Function to create a projectile
			function createProjectile(
				fromX: number,
				fromY: number,
				targetEnemy: (typeof enemies)[0],
				damage: number
			) {
				const projectile = new Graphics();
				projectile.beginFill(0xffff00, 1.0); // Jaune brillant
				projectile.drawCircle(0, 0, 3); // Petit cercle de 3px de rayon
				projectile.endFill();
				projectile.x = fromX;
				projectile.y = fromY;
				app.stage.addChild(projectile);

				let direction;
				const projectileSpeed = 200; // 200 pixels par seconde

				if (smartFiringMode) {
					// Use predictive firing
					direction = calculatePredictiveDirection(fromX, fromY, targetEnemy, projectileSpeed);
				} else {
					// Use direct firing (current behavior)
					const dx = targetEnemy.sprite.x - fromX;
					const dy = targetEnemy.sprite.y - fromY;
					const distance = Math.sqrt(dx * dx + dy * dy);
					direction = { x: dx / distance, y: dy / distance };
				}

				projectiles.push({
					sprite: projectile,
					speed: projectileSpeed,
					damage: damage,
					dx: direction.x, // Direction normalisée
					dy: direction.y
				});
				projectileCount = projectiles.length; // Mettre à jour le compteur
			}

			// Variable to track current preview type
			let currentPreviewType = '';

			// Function to update preview sprite based on selected tool
			function updatePreview(selectedType: string, mouseX: number, mouseY: number) {
				// Remove old preview
				if (previewSprite) {
					app.stage.removeChild(previewSprite);
					previewSprite = null;
				}

				// Don't create preview if "none" is selected
				if (selectedType === 'none') {
					currentPreviewType = selectedType;
					return;
				}

				// Create new preview based on selected type
				if (selectedType === 'red') {
					previewSprite = new Sprite(texture);
					previewSprite.anchor.set(0.5);
					previewSprite.tint = 0xff0000; // Rouge
					previewSprite.alpha = 0.6; // Semi-transparent
				} else if (selectedType === 'green') {
					previewSprite = new Sprite(texture);
					previewSprite.anchor.set(0.5);
					previewSprite.tint = 0xffff00; // Jaune
					previewSprite.alpha = 0.6; // Semi-transparent
				} else if (selectedType === 'wall') {
					const wallWidth = 80;
					const wallHeight = 20;
					const halfWidth = wallWidth / 2;
					const halfHeight = wallHeight / 2;

					previewSprite = new Graphics();

					// Get current rotation from store
					let currentRotation: number = $wallRotation;

					previewSprite.beginFill(0x8b4513); // Couleur marron
					previewSprite.lineStyle(2, 0x5d2f0a, 1); // Bordure marron foncé, 2px d'épaisseur
					previewSprite.drawRect(-halfWidth, -halfHeight, wallWidth, wallHeight);
					previewSprite.endFill();
					previewSprite.rotation = (currentRotation * Math.PI) / 180; // Convert to radians
					previewSprite.alpha = 0.6; // Semi-transparent
				}

				if (previewSprite) {
					previewSprite.x = mouseX;
					previewSprite.y = mouseY;
					app.stage.addChild(previewSprite);
				}

				currentPreviewType = selectedType;
			}

			// Add click event listeners
			app.stage.eventMode = 'static';
			app.stage.hitArea = app.screen;
			app.stage.on('pointerdown', (event) => {
				const position = event.global;

				// Utiliser le type de lapin sélectionné dans le store
				// Ne rien faire si "aucun outil" est sélectionné
				if ($selectedBunnyType === 'none') {
					return;
				}

				if ($selectedBunnyType === 'red') {
					spawnEnemyAt(position.x, position.y);
				} else if ($selectedBunnyType === 'green') {
					spawnTowerAt(position.x, position.y);
				} else if ($selectedBunnyType === 'wall') {
					spawnWallAt(position.x, position.y);
				}
			});

			// Add mouse move event listener for preview
			app.stage.on('pointermove', (event) => {
				const position = event.global;

				// Update mouse position for test line
				mousePosition = { x: position.x, y: position.y };

				// Handle test line tool
				if ($selectedBunnyType === 'test-line') {
					if (previewSprite) {
						previewSprite.visible = false;
					}
					currentPreviewType = 'test-line';

					// Draw test line from cursor to central bunny
					if (centralBunny) {
						const targetPos = { x: centralBunny.x, y: centralBunny.y };
						drawTestLine(mousePosition, targetPos);
					}
					return;
				}

				// Clear test line if not using test-line tool
				if (($selectedBunnyType as BunnyType) !== 'test-line') {
					clearTestLine();
					// Also clear any pending cleanup timers
					if (testLineCleanupTimer) {
						clearTimeout(testLineCleanupTimer);
						testLineCleanupTimer = null;
					}
				}

				// Hide preview if "none" is selected
				if ($selectedBunnyType === 'none') {
					if (previewSprite) {
						previewSprite.visible = false;
					}
					currentPreviewType = 'none';
					return;
				}

				// Update preview only if selection changed or preview doesn't exist
				if ($selectedBunnyType !== currentPreviewType || !previewSprite) {
					updatePreview($selectedBunnyType, position.x, position.y);
				} else if (previewSprite) {
					// Make sure preview is visible
					previewSprite.visible = true;

					// Just update position
					previewSprite.x = position.x;
					previewSprite.y = position.y;

					// Update wall rotation if needed
					if ($selectedBunnyType === 'wall') {
						const currentRotation = $wallRotation;
						previewSprite.rotation = (currentRotation * Math.PI) / 180;
					}
				}
			});

			// Game loop
			app.ticker.add((ticker) => {
				// Get current game speed
				const currentGameSpeed = $gameSpeed;
				if (currentGameSpeed === 0) return; // Game is paused

				const adjustedDeltaTime = ticker.deltaTime * currentGameSpeed;

				// Update game timer (affected by game speed)
				const realTimeDelta = ticker.deltaTime / 60.0; // Convert ticks to seconds (at 60fps)
				const gameTimeDelta = realTimeDelta * currentGameSpeed; // Apply game speed multiplier
				gameTime += gameTimeDelta * 1000; // Convert back to milliseconds

				// Update historical data for statistics
				updateHistoricalData();

				// Update enemies - pathfinding-based movement
				for (let i = enemies.length - 1; i >= 0; i--) {
					const enemyData = enemies[i];
					const enemy = enemyData.sprite;

					// Store previous position for velocity calculation
					const previousX = enemyData.previousPosition.x;
					const previousY = enemyData.previousPosition.y;

					// Use pathfinding-based movement
					if (enemyData.path && enemyData.path.length > 0) {
						// Get current target waypoint
						const targetWaypoint = enemyData.path[enemyData.currentPathIndex];

						if (targetWaypoint) {
							// Move towards current waypoint
							const dx = targetWaypoint.x - enemy.x;
							const dy = targetWaypoint.y - enemy.y;
							const distance = Math.sqrt(dx * dx + dy * dy);

							if (distance > 5) {
								// Move towards current waypoint
								const speed = 2;
								const moveDistance = speed * adjustedDeltaTime;
								enemy.x += (dx / distance) * moveDistance;
								enemy.y += (dy / distance) * moveDistance;

								// Update health bar position
								updateEnemyHealthBar(enemyData);
							} else {
								// Reached current waypoint, move to next
								enemyData.currentPathIndex++;

								// Check if we've reached the final destination
								if (enemyData.currentPathIndex >= enemyData.path.length) {
									// Reached goal - damage player and remove enemy
									takeDamage();
									app.stage.removeChild(enemy);
									app.stage.removeChild(enemyData.healthBar);
									enemies.splice(i, 1);
									enemyCount = enemies.length; // Mettre à jour le compteur
									continue;
								}
							}
						}
					} else {
						// Fallback: if no path available, use direct movement
						const goalPos = { x: centralBunny.x, y: centralBunny.y };
						const dx = goalPos.x - enemy.x;
						const dy = goalPos.y - enemy.y;
						const distance = Math.sqrt(dx * dx + dy * dy);

						if (distance > 5) {
							const speed = 2;
							const moveDistance = speed * adjustedDeltaTime;
							enemy.x += (dx / distance) * moveDistance;
							enemy.y += (dy / distance) * moveDistance;

							// Update health bar position
							updateEnemyHealthBar(enemyData);
						} else {
							// Reached goal - damage player and remove enemy
							takeDamage();
							app.stage.removeChild(enemy);
							app.stage.removeChild(enemyData.healthBar);
							enemies.splice(i, 1);
							enemyCount = enemies.length; // Mettre à jour le compteur
							continue;
						}
					}

					// Calculate velocity based on position change (for predictive firing)
					const deltaTime = adjustedDeltaTime / 60.0; // Convert to seconds
					if (deltaTime > 0) {
						enemyData.velocity.x = (enemy.x - previousX) / deltaTime;
						enemyData.velocity.y = (enemy.y - previousY) / deltaTime;
					}

					// Update previous position for next frame
					enemyData.previousPosition.x = enemy.x;
					enemyData.previousPosition.y = enemy.y;
				}

				// Update towers - target and shoot at enemies
				for (const towerData of towers) {
					const tower = towerData.sprite;

					// Accumulate time since last shot (affected by game speed)
					towerData.timeSinceLastShot += adjustedDeltaTime / 60.0; // Convert ticks to seconds

					// Check if enough time has passed since last shot
					const fireInterval = 1.0 / towerData.fireRate; // Seconds between shots

					if (towerData.timeSinceLastShot >= fireInterval) {
						// Find closest enemy in range
						const target = findClosestEnemyInRange(tower.x, tower.y, towerData.range);

						if (target) {
							// Fire projectile
							createProjectile(tower.x, tower.y, target, towerData.damage);
							towerData.timeSinceLastShot = 0; // Reset the timer
						}
					}
				}

				// Update projectiles
				for (let i = projectiles.length - 1; i >= 0; i--) {
					const projectileData = projectiles[i];
					const projectile = projectileData.sprite;

					// Move projectile (convert speed from pixels/second to pixels per frame)
					const pixelsPerSecond = projectileData.speed;
					const pixelsPerFrame = (pixelsPerSecond / 60.0) * adjustedDeltaTime;
					projectile.x += projectileData.dx * pixelsPerFrame;
					projectile.y += projectileData.dy * pixelsPerFrame;

					// Check collision with any enemy
					let hitEnemy = false;
					for (let j = enemies.length - 1; j >= 0; j--) {
						const enemyData = enemies[j];
						const enemy = enemyData.sprite;

						// Check collision distance
						const distanceToEnemy = Math.sqrt(
							Math.pow(projectile.x - enemy.x, 2) + Math.pow(projectile.y - enemy.y, 2)
						);

						if (distanceToEnemy < 15) {
							// Collision radius
							// Hit enemy - apply damage
							enemyData.currentHealth -= projectileData.damage;

							// Remove projectile
							app.stage.removeChild(projectile);
							projectiles.splice(i, 1);
							projectileCount = projectiles.length; // Mettre à jour le compteur

							// Update health bar
							updateEnemyHealthBar(enemyData);

							// Check if enemy is dead
							if (enemyData.currentHealth <= 0) {
								// Remove enemy and its health bar
								app.stage.removeChild(enemy);
								app.stage.removeChild(enemyData.healthBar);
								enemies.splice(j, 1);
								enemyCount = enemies.length; // Mettre à jour le compteur
							}

							hitEnemy = true;
							break; // Exit enemy loop
						}
					}

					// If projectile hit an enemy, skip to next projectile
					if (hitEnemy) {
						continue;
					}

					// Remove projectile if it goes off screen
					if (
						projectile.x < -50 ||
						projectile.x > app.screen.width + 50 ||
						projectile.y < -50 ||
						projectile.y > app.screen.height + 50
					) {
						app.stage.removeChild(projectile);
						projectiles.splice(i, 1);
						projectileCount = projectiles.length; // Mettre à jour le compteur
					}
				}

				// Auto-spawn enemies from edges (balanced with game speed)
				spawnAccumulator += ticker.deltaTime; // Utiliser le deltaTime réel
				// Ajuster le spawn rate en fonction de la vitesse pour maintenir un nombre constant d'ennemis
				// Plus la vitesse est élevée, plus les ennemis doivent apparaître souvent
				const baseTicksForInterval = (actualSpawnInterval / 1000) * 60; // Convert ms to ticks at 60fps
				const spawnThreshold = baseTicksForInterval / Math.max(currentGameSpeed, 0.1); // Plus rapide quand vitesse élevée

				if (spawnAccumulator >= spawnThreshold && actualSpawnInterval !== Infinity) {
					spawnEnemyFromEdge();
					spawnAccumulator = 0; // Reset l'accumulateur
				}
			});

			// Handle rotation with R key
			window.addEventListener('keyup', (event) => {
				if (event.key === 'r' || event.key === 'R') {
					event.preventDefault();
					rotateWall();

					// Update preview immediately if wall tool is selected and preview exists
					if ($selectedBunnyType === 'wall' && previewSprite && mousePosition) {
						updatePreview($selectedBunnyType, mousePosition.x, mousePosition.y);
					}
				}
			});
		})();

		return () => {
			// Cleanup preview sprite
			if (previewSprite) {
				app.stage.removeChild(previewSprite);
				previewSprite = null;
			}

			// Cleanup on component unmount
			// eslint-disable-next-line svelte/no-dom-manipulating
			root.removeChild(app.canvas);
			app.destroy(true, { children: true });
		};
	});
</script>

<HealthBar />
<BunnySelector />
<GameSpeedControl />

<!-- Timer de jeu -->
<div class="game-timer">
	<div class="timer-content">
		<span class="timer-icon">⏱️</span>
		<span class="timer-text">{formattedGameTime}</span>
	</div>
</div>

<!-- Affichage des PV des ennemis -->
<div class="enemy-health-display">
	<div class="health-content">
		<span class="health-icon">❤️</span>
		<span class="health-text">PV Ennemis: {currentEnemyHealth}</span>
	</div>
</div>

<!-- Compteur d'ennemis et projectiles -->
<div class="game-stats">
	<div class="stats-content">
		<div class="stat-row">
			<div class="stat-info">
				<span class="stat-icon">👹</span>
				<div class="stat-details">
					<span class="stat-text">Ennemis: {enemyCount}</span>
					<span class="stat-median">M: {enemyMedian}</span>
				</div>
			</div>
			<div class="stat-chart">
				{@html generateMiniChart(enemyHistory, '#ff6b6b')}
			</div>
		</div>
		<div class="stat-row">
			<div class="stat-info">
				<span class="stat-icon">💥</span>
				<div class="stat-details">
					<span class="stat-text">Projectiles: {projectileCount}</span>
					<span class="stat-median">M: {projectileMedian}</span>
				</div>
			</div>
			<div class="stat-chart">
				{@html generateMiniChart(projectileHistory, '#ffd700')}
			</div>
		</div>
		<div class="debug-controls">
			<button
				class="debug-toggle-btn"
				class:active={showDebugOverlay}
				on:click={toggleDebugOverlay}
			>
				<span class="debug-icon">🔍</span>
				<span class="debug-text">Debug: {showDebugOverlay ? 'ON' : 'OFF'}</span>
			</button>
			<button class="smart-firing-btn" class:active={smartFiringMode} on:click={toggleSmartFiring}>
				<span class="firing-icon">🎯</span>
				<span class="firing-text">Smart: {smartFiringMode ? 'ON' : 'OFF'}</span>
			</button>
		</div>
		<div class="spawn-control">
			<div class="spawn-control-header">
				<span class="spawn-icon">⚡</span>
				<span class="spawn-label">Spawn Rate</span>
				<span class="spawn-value"
					>{actualSpawnInterval === Infinity ? 'PAUSED' : actualSpawnInterval + 'ms'}</span
				>
			</div>
			<input type="range" class="spawn-slider" min="0" max="100" bind:value={spawnRateSlider} />
			<div class="spawn-marks">
				<span class="spawn-mark-left">PAUSE</span>
				<span class="spawn-mark-center">500ms</span>
				<span class="spawn-mark-right">100ms</span>
			</div>
		</div>
	</div>
</div>

{#if $selectedBunnyType === 'test-line'}
	<div class="test-line-info">
		<h4>Chemin Optimal</h4>
		{#if testLineStatus}
			{#if testLineStatus.hasPath}
				<div class="status clear">
					{#if testLineStatus.isDirect}
						✅ Chemin direct
						<small>Distance: {testLineStatus.totalDistance}px</small>
					{:else if testLineStatus.viaCorner}
						🎯 Via angle optimal
						<small>Distance: {testLineStatus.totalDistance}px</small>
						<small class="comparison">Direct: {testLineStatus.directDistance}px</small>
					{/if}
				</div>
			{:else}
				<div class="status blocked">
					❌ Aucun chemin
					{#if testLineStatus.intersects}
						<small>Ligne directe bloquée ({testLineStatus.intersectionCount} obstacles)</small>
					{:else}
						<small>Coins bleus inaccessibles</small>
					{/if}
				</div>
			{/if}
		{:else}
			<div class="status waiting">⏳ En attente...</div>
		{/if}
	</div>
{/if}

<div bind:this={root}></div>

<style>
	.game-timer {
		position: fixed;
		top: 20px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1000;
		background: rgba(0, 0, 0, 0.8);
		border: 2px solid #4caf50;
		border-radius: 8px;
		padding: 8px 16px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	.timer-content {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.timer-icon {
		font-size: 16px;
	}

	.timer-text {
		color: #4caf50;
		font-family: 'Courier New', monospace;
		font-size: 16px;
		font-weight: bold;
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
		min-width: 50px;
		text-align: center;
	}

	.enemy-health-display {
		position: fixed;
		top: 70px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1000;
		background: rgba(0, 0, 0, 0.8);
		border: 2px solid #ff6b6b;
		border-radius: 8px;
		padding: 6px 12px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	.health-content {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.health-icon {
		font-size: 14px;
	}

	.health-text {
		color: #ff6b6b;
		font-family: 'Courier New', monospace;
		font-size: 14px;
		font-weight: bold;
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
	}

	.game-stats {
		position: fixed;
		bottom: 20px;
		right: 20px;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.9);
		border: 2px solid #ff4444;
		border-radius: 8px;
		padding: 10px 12px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		min-width: 200px;
	}

	.stats-content {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.stat-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.stat-info {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
	}

	.stat-details {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.stat-icon {
		font-size: 14px;
		min-width: 18px;
	}

	.stat-text {
		color: #ff4444;
		font-family: Arial, sans-serif;
		font-size: 13px;
		font-weight: bold;
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
		line-height: 1.1;
	}

	.stat-median {
		color: #ffaa44;
		font-family: 'Courier New', monospace;
		font-size: 10px;
		font-weight: normal;
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
		opacity: 0.8;
		line-height: 1.1;
	}

	.stat-chart {
		flex-shrink: 0;
		opacity: 0.9;
		filter: drop-shadow(1px 1px 2px rgba(0, 0, 0, 0.5));
	}

	.debug-controls {
		margin-top: 12px;
		padding-top: 10px;
		border-top: 1px solid rgba(255, 255, 255, 0.2);
		text-align: center;
		display: flex;
		gap: 8px;
		justify-content: center;
	}

	.debug-toggle-btn,
	.smart-firing-btn {
		background: rgba(60, 60, 60, 0.9);
		border: 2px solid #666;
		border-radius: 6px;
		color: #ccc;
		padding: 8px 12px;
		font-size: 11px;
		cursor: pointer;
		transition: all 0.3s ease;
		text-transform: uppercase;
		font-weight: bold;
		letter-spacing: 0.5px;
		flex: 1;
		min-width: 0;
	}

	.debug-toggle-btn:hover,
	.smart-firing-btn:hover {
		background: rgba(80, 80, 80, 0.9);
		border-color: #888;
		color: #fff;
		transform: translateY(-1px);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
	}

	.debug-toggle-btn.active {
		background: rgba(255, 140, 0, 0.9);
		border-color: #ff8c00;
		color: #fff;
		box-shadow: 0 2px 6px rgba(255, 140, 0, 0.4);
	}

	.debug-toggle-btn.active:hover {
		background: rgba(255, 165, 0, 0.9);
		border-color: #ffa500;
		transform: translateY(-1px);
		box-shadow: 0 4px 10px rgba(255, 140, 0, 0.6);
	}

	.smart-firing-btn.active {
		background: rgba(0, 200, 100, 0.9);
		border-color: #00c864;
		color: #fff;
		box-shadow: 0 2px 6px rgba(0, 200, 100, 0.4);
	}

	.smart-firing-btn.active:hover {
		background: rgba(0, 220, 120, 0.9);
		border-color: #00dc78;
		transform: translateY(-1px);
		box-shadow: 0 4px 10px rgba(0, 200, 100, 0.6);
	}

	.spawn-control {
		margin-top: 12px;
		padding-top: 10px;
		border-top: 1px solid rgba(255, 255, 255, 0.2);
	}

	.spawn-control-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
		font-size: 11px;
		font-weight: bold;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.spawn-icon {
		font-size: 14px;
	}

	.spawn-label {
		color: #ccc;
		flex: 1;
		text-align: center;
	}

	.spawn-value {
		color: #ffd700;
		font-size: 10px;
		min-width: 60px;
		text-align: right;
	}

	.spawn-slider {
		width: 100%;
		height: 6px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
		outline: none;
		appearance: none;
		-webkit-appearance: none;
		margin: 4px 0;
	}

	.spawn-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #ffd700;
		cursor: pointer;
		border: 2px solid #fff;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
		transition: all 0.2s ease;
	}

	.spawn-slider::-webkit-slider-thumb:hover {
		transform: scale(1.1);
		box-shadow: 0 3px 6px rgba(0, 0, 0, 0.4);
	}

	.spawn-slider::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #ffd700;
		cursor: pointer;
		border: 2px solid #fff;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
		transition: all 0.2s ease;
	}

	.spawn-marks {
		display: flex;
		justify-content: space-between;
		font-size: 9px;
		color: #888;
		margin-top: 2px;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.spawn-mark-left,
	.spawn-mark-right {
		font-weight: bold;
	}

	.spawn-mark-center {
		color: #aaa;
	}

	.test-line-info {
		position: fixed;
		bottom: 20px;
		right: 180px;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.85);
		border: 2px solid #333;
		border-radius: 8px;
		padding: 12px;
		color: white;
		font-family: Arial, sans-serif;
		min-width: 200px;
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
	}

	.test-line-info h4 {
		margin: 0 0 8px 0;
		font-size: 14px;
		color: #00ffff;
		text-align: center;
	}

	.status {
		padding: 8px;
		border-radius: 4px;
		text-align: center;
		font-weight: bold;
	}

	.status.clear {
		background: rgba(0, 255, 0, 0.2);
		border: 1px solid #00ff00;
		color: #00ff00;
	}

	.status.blocked {
		background: rgba(255, 0, 0, 0.2);
		border: 1px solid #ff0000;
		color: #ff0000;
	}

	.status.waiting {
		background: rgba(255, 255, 0, 0.2);
		border: 1px solid #ffff00;
		color: #ffff00;
	}

	.status small {
		display: block;
		font-size: 10px;
		margin-top: 4px;
		opacity: 0.8;
	}

	.status .comparison {
		font-size: 9px;
		opacity: 0.6;
		color: #ccc;
	}
</style>
