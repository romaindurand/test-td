// Simple pathfinding manager with local blue corner calculations
import type { Point } from './pathfinding';
import { Pathfinding } from './pathfinding';
import { ObstacleSystem } from './obstacle-system';

export class PathfindingManager {
	private obstacleSystem: ObstacleSystem;
	private pathfinding: Pathfinding;
	private goalPosition: Point = { x: 400, y: 300 };
	private blueCornerPaths = new Map<string, Point[]>();
	private blueCornerDistances = new Map<string, number>();

	constructor() {
		this.obstacleSystem = new ObstacleSystem(800, 600);
		this.pathfinding = new Pathfinding(800, 600, 20);
	}

	private getCornerKey(corner: Point): string {
		return `${corner.x.toFixed(1)},${corner.y.toFixed(1)}`;
	}

	private calculateDistance(p1: Point, p2: Point): number {
		return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
	}

	private calculatePathDistance(path: Point[]): number {
		if (path.length < 2) return Infinity;

		let totalDistance = 0;
		for (let i = 0; i < path.length - 1; i++) {
			totalDistance += this.calculateDistance(path[i], path[i + 1]);
		}
		return totalDistance;
	}

	setGoal(goal: Point) {
		this.goalPosition = goal;
		this.obstacleSystem.setGoal(goal);

		// Recalculate blue corner paths locally
		this.calculateBlueCornerPaths();
	}

	getGoal(): Point {
		return this.goalPosition;
	}

	addObstacle(points: Point[]) {
		this.obstacleSystem.addObstacle(points);
		this.pathfinding.addObstacle(points);

		// Recalculate blue corner paths locally
		this.calculateBlueCornerPaths();
	}

	private calculateBlueCornerPaths() {
		// Clear existing paths
		this.blueCornerPaths.clear();
		this.blueCornerDistances.clear();

		// Get all blue corners from expanded obstacles
		const expandedObstacles = this.obstacleSystem.getExpandedObstacles();
		const allBlueCorners: Point[] = [];

		for (const obstacle of expandedObstacles) {
			allBlueCorners.push(...obstacle);
		}

		// Add goal as a special node in our graph
		const allNodes = [...allBlueCorners, this.goalPosition];

		// Build connectivity graph between all blue corners and goal
		const graph = this.buildBlueCornerGraph(allNodes);

		// Calculate shortest path from each blue corner to goal using Dijkstra
		for (const corner of allBlueCorners) {
			const cornerKey = this.getCornerKey(corner);
			const shortestPathResult = this.findShortestPathViaBlueCorners(
				corner,
				this.goalPosition,
				graph,
				allNodes
			);

			if (shortestPathResult.path.length > 0 && shortestPathResult.distance < Infinity) {
				this.blueCornerPaths.set(cornerKey, shortestPathResult.path);
				this.blueCornerDistances.set(cornerKey, shortestPathResult.distance);
			} else {
				// No valid path found
				this.blueCornerPaths.set(cornerKey, []);
				this.blueCornerDistances.set(cornerKey, Infinity);
			}
		}

		console.log(
			`🎯 Blue corner paths calculated locally: ${allBlueCorners.length} corners processed`
		);
	}

	private buildBlueCornerGraph(
		nodes: Point[]
	): Map<number, { point: Point; connections: { to: number; distance: number }[] }> {
		const graph = new Map<
			number,
			{ point: Point; connections: { to: number; distance: number }[] }
		>();

		// Initialize all nodes in the graph
		for (let i = 0; i < nodes.length; i++) {
			graph.set(i, { point: nodes[i], connections: [] });
		}

		// Build connections between nodes that have clear paths
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				const nodeA = nodes[i];
				const nodeB = nodes[j];

				// Check if there's a clear path between the two nodes
				if (this.obstacleSystem.testPathClear(nodeA, nodeB)) {
					const distance = this.calculateDistance(nodeA, nodeB);

					// Add bidirectional connection
					graph.get(i)!.connections.push({ to: j, distance });
					graph.get(j)!.connections.push({ to: i, distance });
				}
			}
		}

		return graph;
	}

	private findShortestPathViaBlueCorners(
		start: Point,
		goal: Point,
		graph: Map<number, { point: Point; connections: { to: number; distance: number }[] }>,
		nodes: Point[]
	): { path: Point[]; distance: number } {
		// Find indices of start and goal in nodes array
		const startIndex = nodes.findIndex(
			(node) => Math.abs(node.x - start.x) < 0.1 && Math.abs(node.y - start.y) < 0.1
		);
		const goalIndex = nodes.findIndex(
			(node) => Math.abs(node.x - goal.x) < 0.1 && Math.abs(node.y - goal.y) < 0.1
		);

		if (startIndex === -1 || goalIndex === -1) {
			return { path: [], distance: Infinity };
		}

		// Dijkstra's algorithm
		const distances = new Map<number, number>();
		const previous = new Map<number, number>();
		const unvisited = new Set<number>();

		// Initialize distances
		for (const [index] of graph) {
			distances.set(index, index === startIndex ? 0 : Infinity);
			unvisited.add(index);
		}

		while (unvisited.size > 0) {
			// Find unvisited node with minimum distance
			let currentIndex = -1;
			let minDistance = Infinity;

			for (const index of unvisited) {
				const distance = distances.get(index)!;
				if (distance < minDistance) {
					minDistance = distance;
					currentIndex = index;
				}
			}

			if (currentIndex === -1 || minDistance === Infinity) break;

			unvisited.delete(currentIndex);

			// If we reached the goal, stop
			if (currentIndex === goalIndex) break;

			const currentNode = graph.get(currentIndex)!;
			const currentDistance = distances.get(currentIndex)!;

			// Update distances to neighbors
			for (const connection of currentNode.connections) {
				if (!unvisited.has(connection.to)) continue;

				const newDistance = currentDistance + connection.distance;
				const existingDistance = distances.get(connection.to)!;

				if (newDistance < existingDistance) {
					distances.set(connection.to, newDistance);
					previous.set(connection.to, currentIndex);
				}
			}
		}

		// Reconstruct path
		const path: Point[] = [];
		let current = goalIndex;

		while (current !== undefined) {
			const node = graph.get(current);
			if (node) {
				path.unshift(node.point);
			}
			current = previous.get(current)!;
		}

		// Only return path if it starts from the correct corner
		if (
			path.length > 0 &&
			Math.abs(path[0].x - start.x) < 0.1 &&
			Math.abs(path[0].y - start.y) < 0.1
		) {
			return { path, distance: distances.get(goalIndex) || Infinity };
		}

		return { path: [], distance: Infinity };
	}

	// Simple straight-line pathfinding for enemies
	findPath(start: Point): Point[] {
		return [start, this.goalPosition];
	}

	getExpandedObstacles(): Point[][] {
		return this.obstacleSystem.getExpandedObstacles();
	}

	getObstacles(): Point[][] {
		return this.obstacleSystem.getObstacles();
	}

	getBlueCornerPath(corner: Point): Point[] | null {
		const cornerKey = this.getCornerKey(corner);
		const path = this.blueCornerPaths.get(cornerKey);
		return path && path.length > 0 ? path : null;
	}

	getBlueCornerDistance(corner: Point): number | null {
		const cornerKey = this.getCornerKey(corner);
		const distance = this.blueCornerDistances.get(cornerKey);
		return distance !== undefined && distance !== Infinity ? distance : null;
	}

	// Test if a direct path between two points is clear
	testPathClear(from: Point, to: Point): boolean {
		return this.obstacleSystem.testPathClear(from, to);
	}

	// Test line intersections with detailed intersection points
	testLineIntersections(
		from: Point,
		to: Point
	): { intersects: boolean; intersectionPoints: Point[] } {
		return this.obstacleSystem.testLineIntersections(from, to);
	}

	// Cleanup method
	destroy() {
		// Nothing to clean up in local version
	}
}
