// Pathfinding A* algorithm
export interface Point {
	x: number;
	y: number;
}

export interface Node {
	x: number;
	y: number;
	g: number; // Distance from start
	h: number; // Heuristic distance to goal
	f: number; // g + h
	parent: Node | null;
}

export class Pathfinding {
	private gridSize: number;
	private width: number;
	private height: number;
	private obstacles: Point[][];

	constructor(width: number, height: number, gridSize: number = 20) {
		this.width = width;
		this.height = height;
		this.gridSize = gridSize;
		this.obstacles = [];
	}

	addObstacle(points: Point[]) {
		this.obstacles.push(points);
	}

	private isPointInPolygon(point: Point, polygon: Point[]): boolean {
		let inside = false;
		for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
			if (((polygon[i].y > point.y) !== (polygon[j].y > point.y)) &&
				(point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
				inside = !inside;
			}
		}
		return inside;
	}

	private isValidPosition(x: number, y: number): boolean {
		if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
			return false;
		}

		const point = { x, y };
		for (const obstacle of this.obstacles) {
			if (this.isPointInPolygon(point, obstacle)) {
				return false;
			}
		}
		return true;
	}

	private heuristic(a: Point, b: Point): number {
		// Heuristique euclidienne pour des chemins plus directs
		const dx = a.x - b.x;
		const dy = a.y - b.y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	private getNeighbors(node: Node): { point: Point; cost: number }[] {
		const neighbors: { point: Point; cost: number }[] = [];
		const directions = [
			{ x: -1, y: 0, cost: 1 },        // Gauche
			{ x: 1, y: 0, cost: 1 },         // Droite
			{ x: 0, y: -1, cost: 1 },        // Haut
			{ x: 0, y: 1, cost: 1 },         // Bas
			{ x: -1, y: -1, cost: Math.SQRT2 }, // Diagonale haut-gauche
			{ x: 1, y: -1, cost: Math.SQRT2 },  // Diagonale haut-droite
			{ x: -1, y: 1, cost: Math.SQRT2 },  // Diagonale bas-gauche
			{ x: 1, y: 1, cost: Math.SQRT2 }    // Diagonale bas-droite
		];

		for (const dir of directions) {
			const newX = node.x + dir.x * this.gridSize;
			const newY = node.y + dir.y * this.gridSize;
			if (this.isValidPosition(newX, newY)) {
				neighbors.push({ 
					point: { x: newX, y: newY }, 
					cost: dir.cost * this.gridSize 
				});
			}
		}
		return neighbors;
	}

	findPath(start: Point, goal: Point): Point[] {
		const openSet: Node[] = [];
		const closedSet: Set<string> = new Set();

		const startNode: Node = {
			x: Math.round(start.x / this.gridSize) * this.gridSize,
			y: Math.round(start.y / this.gridSize) * this.gridSize,
			g: 0,
			h: this.heuristic(start, goal),
			f: 0,
			parent: null
		};
		startNode.f = startNode.g + startNode.h;

		const goalNode = {
			x: Math.round(goal.x / this.gridSize) * this.gridSize,
			y: Math.round(goal.y / this.gridSize) * this.gridSize
		};

		openSet.push(startNode);

		while (openSet.length > 0) {
			// Find node with lowest f score
			let currentIndex = 0;
			for (let i = 1; i < openSet.length; i++) {
				if (openSet[i].f < openSet[currentIndex].f) {
					currentIndex = i;
				}
			}

			const current = openSet[currentIndex];
			openSet.splice(currentIndex, 1);

			const currentKey = `${current.x},${current.y}`;
			closedSet.add(currentKey);

			// Check if we reached the goal
			if (current.x === goalNode.x && current.y === goalNode.y) {
				const path: Point[] = [];
				let node: Node | null = current;
				while (node) {
					path.unshift({ x: node.x, y: node.y });
					node = node.parent;
				}
				return path;
			}

			// Check neighbors
			const neighbors = this.getNeighbors(current);
			for (const neighborData of neighbors) {
				const neighbor = neighborData.point;
				const moveCost = neighborData.cost;
				
				const neighborKey = `${neighbor.x},${neighbor.y}`;
				if (closedSet.has(neighborKey)) {
					continue;
				}

				const g = current.g + moveCost;
				const h = this.heuristic(neighbor, goalNode);
				const f = g + h;

				const existingNode = openSet.find(n => n.x === neighbor.x && n.y === neighbor.y);
				if (!existingNode) {
					openSet.push({
						x: neighbor.x,
						y: neighbor.y,
						g,
						h,
						f,
						parent: current
					});
				} else if (g < existingNode.g) {
					existingNode.g = g;
					existingNode.f = f;
					existingNode.parent = current;
				}
			}
		}

		// No path found, return direct path
		return [start, goal];
	}
}
