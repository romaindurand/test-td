<script lang="ts">
	import { Application, Assets, Container, Sprite, Graphics } from 'pixi.js';
	import { onMount } from 'svelte';
	import HealthBar from '../lib/components/HealthBar.svelte';
	import BunnySelector from '../lib/components/BunnySelector.svelte';
	import {
		takeDamage,
		selectedBunnyType,
		setWallRotating,
		rotateWall,
		wallRotation
	} from '../lib/stores/gameState';
	import { Pathfinding, type Point } from '../lib/pathfinding';
	import { get } from 'svelte/store';

	let root: HTMLDivElement;

	onMount(() => {
		const app = new Application();
		(async function () {
			// Create a new application

			// Initialize the application
			await app.init({ background: '#1099bb', resizeTo: window });

			// Append the application canvas to the document body
			root.appendChild(app.canvas);

			// Load the bunny texture
			const texture = await Assets.load('https://pixijs.com/assets/bunny.png');

			// Create the central bunny (tower) with random position
			const centralBunny = new Sprite(texture);
			// Position aléatoire dans la zone centrale de l'écran (évite les bords)
			const margin = 100; // Marge pour éviter que le lapin soit trop près des bords
			centralBunny.x = margin + Math.random() * (app.screen.width - 2 * margin);
			centralBunny.y = margin + Math.random() * (app.screen.height - 2 * margin);
			centralBunny.anchor.set(0.5);
			centralBunny.tint = 0x00ff00; // Vert pour le distinguer
			app.stage.addChild(centralBunny);

			// Create pathfinding system
			const pathfinder = new Pathfinding(app.screen.width, app.screen.height, 20);

			// Create 5 random blob obstacles
			const obstacles: Graphics[] = [];
			for (let i = 0; i < 5; i++) {
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
				obstacle.moveTo(points[0].x, points[0].y);
				for (let j = 1; j < points.length; j++) {
					obstacle.lineTo(points[j].x, points[j].y);
				}
				obstacle.closePath();
				obstacle.endFill();

				app.stage.addChild(obstacle);
				obstacles.push(obstacle);
				pathfinder.addObstacle(points);
			}

			// Array to store moving enemies with their paths
			const enemies: {
				sprite: Sprite;
				path: Point[];
				currentPathIndex: number;
				vx: number;
				vy: number;
			}[] = [];

			// Array to store defensive towers (yellow bunnies)
			const towers: {
				sprite: Sprite;
				lastShotTime: number;
				shootCooldown: number;
			}[] = [];

			// Array to store projectiles
			const projectiles: {
				sprite: Graphics;
				vx: number;
				vy: number;
				speed: number;
			}[] = [];

			let lastSpawnTime = 0;
			const spawnInterval = 1000; // 1 seconde entre chaque spawn

			// Function to spawn enemy
			function spawnEnemy() {
				const enemy = new Sprite(texture);
				enemy.anchor.set(0.5);
				enemy.tint = 0xff0000; // Rouge pour les ennemis

				// Position aléatoire sur les bords de l'écran
				const side = Math.floor(Math.random() * 4);
				let startX: number, startY: number;
				switch (side) {
					case 0: // Haut
						startX = Math.random() * app.screen.width;
						startY = -20;
						break;
					case 1: // Droite
						startX = app.screen.width + 20;
						startY = Math.random() * app.screen.height;
						break;
					case 2: // Bas
						startX = Math.random() * app.screen.width;
						startY = app.screen.height + 20;
						break;
					case 3: // Gauche
						startX = -20;
						startY = Math.random() * app.screen.height;
						break;
					default:
						startX = 0;
						startY = 0;
				}

				enemy.x = startX;
				enemy.y = startY;

				// Calculate path to central bunny using pathfinding
				const start = { x: startX, y: startY };
				const goal = { x: centralBunny.x, y: centralBunny.y };
				const path = pathfinder.findPath(start, goal);

				app.stage.addChild(enemy);
				enemies.push({
					sprite: enemy,
					path: path,
					currentPathIndex: 0,
					vx: 0,
					vy: 0
				});
			}

			// Function to spawn enemy at specific position (for click events)
			function spawnEnemyAt(x: number, y: number) {
				const enemy = new Sprite(texture);
				enemy.anchor.set(0.5);
				enemy.tint = 0xff0000; // Rouge pour les ennemis
				enemy.x = x;
				enemy.y = y;

				// Calculate path to central bunny using pathfinding
				const start = { x, y };
				const goal = { x: centralBunny.x, y: centralBunny.y };
				const path = pathfinder.findPath(start, goal);

				app.stage.addChild(enemy);
				enemies.push({
					sprite: enemy,
					path: path,
					currentPathIndex: 0,
					vx: 0,
					vy: 0
				});
			}

			// Function to spawn tower at specific position (for right-click events)
			function spawnTowerAt(x: number, y: number) {
				const tower = new Sprite(texture);
				tower.anchor.set(0.5);
				tower.tint = 0xffff00; // Jaune pour les tours
				tower.x = x;
				tower.y = y;

				app.stage.addChild(tower);
				towers.push({
					sprite: tower,
					lastShotTime: 0,
					shootCooldown: 500 // Tire toutes les 500ms
				});
			}

			// Function to spawn wall at specific position
			function spawnWallAt(x: number, y: number) {
				const wall = new Graphics();

				// Get current rotation from store
				let currentRotation: number;
				wallRotation.subscribe((value) => {
					currentRotation = value;
				})();

				const wallWidth = 80;
				const wallHeight = 20;
				const halfWidth = wallWidth / 2;
				const halfHeight = wallHeight / 2;

				// Create wall rectangle
				wall.beginFill(0x8b4513); // Couleur marron
				wall.drawRect(-halfWidth, -halfHeight, wallWidth, wallHeight);
				wall.endFill();

				// Apply position and rotation
				wall.x = x;
				wall.y = y;
				wall.rotation = (currentRotation * Math.PI) / 180; // Convert to radians

				// Calculate wall corners for pathfinding (taking rotation into account)
				const corners = [];
				const cos = Math.cos(wall.rotation);
				const sin = Math.sin(wall.rotation);

				// Calculate rotated corners
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
			}

			// Function to find nearest enemy to a tower
			function findNearestEnemy(
				towerX: number,
				towerY: number
			): { sprite: Sprite; distance: number } | null {
				let nearest = null;
				let minDistance = Infinity;

				for (const enemyData of enemies) {
					const enemy = enemyData.sprite;
					const dx = enemy.x - towerX;
					const dy = enemy.y - towerY;
					const distance = Math.sqrt(dx * dx + dy * dy);

					if (distance < minDistance && distance < 200) {
						// Portée de 200 pixels
						minDistance = distance;
						nearest = { sprite: enemy, distance };
					}
				}

				return nearest;
			}

			// Function to create a projectile
			function createProjectile(fromX: number, fromY: number, toX: number, toY: number) {
				const projectile = new Graphics();
				projectile.fill(0xffffff); // Blanc
				projectile.circle(0, 0, 3); // Petit cercle de rayon 3
				projectile.fill();
				projectile.x = fromX;
				projectile.y = fromY;

				const dx = toX - fromX;
				const dy = toY - fromY;
				const distance = Math.sqrt(dx * dx + dy * dy);
				const speed = 5; // Vitesse du projectile

				app.stage.addChild(projectile);
				projectiles.push({
					sprite: projectile,
					vx: (dx / distance) * speed,
					vy: (dy / distance) * speed,
					speed: speed
				});
			}

			// Add click event listeners
			app.stage.eventMode = 'static';
			app.stage.hitArea = app.screen;
			app.stage.on('pointerdown', (event) => {
				const position = event.global;

				// Utiliser le type de lapin sélectionné dans le store
				const currentSelectedType = get(selectedBunnyType);

				if (currentSelectedType === 'red') {
					spawnEnemyAt(position.x, position.y);
				} else if (currentSelectedType === 'yellow') {
					spawnTowerAt(position.x, position.y);
				} else if (currentSelectedType === 'wall') {
					spawnWallAt(position.x, position.y);
				}
			});

			// Add keyboard event listeners for wall rotation
			let isRPressed = false;

			window.addEventListener('keydown', (event) => {
				if (event.key.toLowerCase() === 'r' && !isRPressed) {
					isRPressed = true;
					setWallRotating(true);

					// Rotate wall every 200ms while R is held
					const rotateInterval = setInterval(() => {
						if (isRPressed) {
							rotateWall();
						} else {
							clearInterval(rotateInterval);
						}
					}, 200);
				}
			});

			window.addEventListener('keyup', (event) => {
				if (event.key.toLowerCase() === 'r') {
					isRPressed = false;
					setWallRotating(false);
				}
			}); // Listen for animate update
			app.ticker.add((time) => {
				const currentTime = Date.now();

				// Spawn new enemies
				if (currentTime - lastSpawnTime > spawnInterval) {
					spawnEnemy();
					lastSpawnTime = currentTime;
				}

				// Update towers (shooting logic)
				for (const towerData of towers) {
					if (currentTime - towerData.lastShotTime > towerData.shootCooldown) {
						const nearestEnemy = findNearestEnemy(towerData.sprite.x, towerData.sprite.y);
						if (nearestEnemy) {
							createProjectile(
								towerData.sprite.x,
								towerData.sprite.y,
								nearestEnemy.sprite.x,
								nearestEnemy.sprite.y
							);
							towerData.lastShotTime = currentTime;
						}
					}
				}

				// Update projectiles
				for (let i = projectiles.length - 1; i >= 0; i--) {
					const projectileData = projectiles[i];
					const projectile = projectileData.sprite;

					// Move projectile
					projectile.x += projectileData.vx * time.deltaTime;
					projectile.y += projectileData.vy * time.deltaTime;

					// Remove projectile if it goes off screen
					if (
						projectile.x < -50 ||
						projectile.x > app.screen.width + 50 ||
						projectile.y < -50 ||
						projectile.y > app.screen.height + 50
					) {
						app.stage.removeChild(projectile);
						projectiles.splice(i, 1);
						continue;
					}

					// Check collision with enemies
					for (let j = enemies.length - 1; j >= 0; j--) {
						const enemyData = enemies[j];
						const enemy = enemyData.sprite;

						const dx = projectile.x - enemy.x;
						const dy = projectile.y - enemy.y;
						const distance = Math.sqrt(dx * dx + dy * dy);

						if (distance < 15) {
							// Collision detectée
							// Remove enemy
							app.stage.removeChild(enemy);
							enemies.splice(j, 1);

							// Remove projectile
							app.stage.removeChild(projectile);
							projectiles.splice(i, 1);
							break;
						}
					}
				}

				// Update enemies
				for (let i = enemies.length - 1; i >= 0; i--) {
					const enemyData = enemies[i];
					const enemy = enemyData.sprite;

					// Check if enemy collides with the central bunny
					const dx = centralBunny.x - enemy.x;
					const dy = centralBunny.y - enemy.y;
					const distance = Math.sqrt(dx * dx + dy * dy);

					const bunnyRadius = 20; // Rayon approximatif du sprite bunny
					if (distance < bunnyRadius) {
						// Infliger des dégâts au joueur
						takeDamage(1);

						// Remove enemy
						app.stage.removeChild(enemy);
						enemies.splice(i, 1);
						continue;
					}

					// Follow path using pathfinding
					if (enemyData.path.length > 1 && enemyData.currentPathIndex < enemyData.path.length - 1) {
						const currentTarget = enemyData.path[enemyData.currentPathIndex + 1];
						const targetDx = currentTarget.x - enemy.x;
						const targetDy = currentTarget.y - enemy.y;
						const targetDistance = Math.sqrt(targetDx * targetDx + targetDy * targetDy);

						// Check if reached current waypoint
						if (targetDistance < 10) {
							enemyData.currentPathIndex++;
						} else {
							// Move towards current waypoint
							const speed = 2;
							enemyData.vx = (targetDx / targetDistance) * speed;
							enemyData.vy = (targetDy / targetDistance) * speed;

							enemy.x += enemyData.vx * time.deltaTime;
							enemy.y += enemyData.vy * time.deltaTime;
						}
					} else {
						// Fallback: move directly towards central bunny
						const speed = 2;
						enemyData.vx = (dx / distance) * speed;
						enemyData.vy = (dy / distance) * speed;

						enemy.x += enemyData.vx * time.deltaTime;
						enemy.y += enemyData.vy * time.deltaTime;
					}
				}
			});
		})();

		return () => {
			// Cleanup on component unmount
			app.destroy(true, { children: true });
			root.removeChild(app.canvas);
		};
	});
</script>

<!-- <HealthBar /> -->
<HealthBar />
<BunnySelector />
<div bind:this={root}></div>
