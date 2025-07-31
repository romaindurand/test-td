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
	private obstacleVersion: number; // Version number to track obstacle changes

	constructor(width: number, height: number, gridSize: number = 20) {
		this.width = width;
		this.height = height;
		this.gridSize = gridSize;
		this.obstacles = [];
		this.obstacleVersion = 0;
	}

	addObstacle(points: Point[]) {
		this.obstacles.push(points);
		this.obstacleVersion++; // Increment version when obstacles change
	}

	getObstacleVersion(): number {
		return this.obstacleVersion;
	}

	// Public method to check if a position is valid (maintains distance from obstacles)
	isPositionValid(x: number, y: number): boolean {
		return this.isValidPosition(x, y);
	}

	// Check if a movement from one point to another intersects with any obstacle
	isMovementValid(from: Point, to: Point): boolean {
		// Check if the line segment from->to intersects with any obstacle
		for (const obstacle of this.obstacles) {
			if (this.lineIntersectsPolygon(from, to, obstacle)) {
				return false;
			}
		}
		return true;
	}

	// Check if a line segment intersects with a polygon
	private lineIntersectsPolygon(start: Point, end: Point, polygon: Point[]): boolean {
		// Check if line intersects any edge of the polygon
		for (let i = 0; i < polygon.length; i++) {
			const j = (i + 1) % polygon.length;
			if (this.lineSegmentsIntersect(start, end, polygon[i], polygon[j])) {
				return true;
			}
		}
		
		// Also check if start or end point is inside the polygon
		if (this.isPointInPolygon(start, polygon) || this.isPointInPolygon(end, polygon)) {
			return true;
		}
		
		return false;
	}

	// Check if two line segments intersect
	private lineSegmentsIntersect(p1: Point, q1: Point, p2: Point, q2: Point): boolean {
		const orientation = (p: Point, q: Point, r: Point): number => {
			const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
			if (val === 0) return 0;  // collinear
			return (val > 0) ? 1 : 2; // clockwise or counterclockwise
		};

		const onSegment = (p: Point, q: Point, r: Point): boolean => {
			return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
				   q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
		};

		const o1 = orientation(p1, q1, p2);
		const o2 = orientation(p1, q1, q2);
		const o3 = orientation(p2, q2, p1);
		const o4 = orientation(p2, q2, q1);

		// General case
		if (o1 !== o2 && o3 !== o4) {
			return true;
		}

		// Special cases for collinear points
		if (o1 === 0 && onSegment(p1, p2, q1)) return true;
		if (o2 === 0 && onSegment(p1, q2, q1)) return true;
		if (o3 === 0 && onSegment(p2, p1, q2)) return true;
		if (o4 === 0 && onSegment(p2, q1, q2)) return true;

		return false;
	}

	// Special validation for positions that can be outside screen bounds (for spawning)
	isPositionValidForMovement(x: number, y: number, allowOffScreen: boolean = false): boolean {
		if (!allowOffScreen && (x < 0 || x >= this.width || y < 0 || y >= this.height)) {
			return false;
		}

		const point = { x, y };
		const minDistance = 2; // Distance minimale de 2 pixels des obstacles

		for (const obstacle of this.obstacles) {
			// Check if point is inside polygon
			if (this.isPointInPolygon(point, obstacle)) {
				return false;
			}

			// Check distance to polygon edges
			const distanceToObstacle = this.getDistanceToPolygon(point, obstacle);
			if (distanceToObstacle < minDistance) {
				return false;
			}
		}
		return true;
	}

	// Find the nearest obstacle and return repulsion vector
	getRepulsionVector(x: number, y: number): { x: number; y: number } | null {
		const point = { x, y };
		let nearestObstacle: Point[] | null = null;
		let minDistance = Infinity;

		// Find the closest obstacle
		for (const obstacle of this.obstacles) {
			const distance = this.getDistanceToPolygon(point, obstacle);
			if (distance < minDistance) {
				minDistance = distance;
				nearestObstacle = obstacle;
			}
		}

		if (!nearestObstacle || minDistance > 5) {
			return null; // No obstacle close enough to cause repulsion
		}

		// Find the closest point on the obstacle
		let closestPoint: Point | null = null;
		let closestDistance = Infinity;

		for (let i = 0; i < nearestObstacle.length; i++) {
			const j = (i + 1) % nearestObstacle.length;
			const distance = this.getDistanceToLineSegment(point, nearestObstacle[i], nearestObstacle[j]);
			
			if (distance < closestDistance) {
				closestDistance = distance;
				// Calculate the actual closest point on the line segment
				closestPoint = this.getClosestPointOnLineSegment(point, nearestObstacle[i], nearestObstacle[j]);
			}
		}

		if (!closestPoint) {
			return null;
		}

		// Calculate repulsion direction (away from obstacle)
		const dx = x - closestPoint.x;
		const dy = y - closestPoint.y;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance === 0) {
			// If exactly on the obstacle, push in a random direction
			const angle = Math.random() * Math.PI * 2;
			return { x: Math.cos(angle), y: Math.sin(angle) };
		}

		// Normalize and scale to push to 5px distance
		const targetDistance = 10;
		const scale = targetDistance / distance;
		
		return {
			x: dx * scale,
			y: dy * scale
		};
	}

	private getClosestPointOnLineSegment(point: Point, lineStart: Point, lineEnd: Point): Point {
		const A = point.x - lineStart.x;
		const B = point.y - lineStart.y;
		const C = lineEnd.x - lineStart.x;
		const D = lineEnd.y - lineStart.y;

		const dot = A * C + B * D;
		const lenSq = C * C + D * D;
		
		if (lenSq === 0) {
			// Line segment is actually a point
			return lineStart;
		}

		const param = Math.max(0, Math.min(1, dot / lenSq));
		
		return {
			x: lineStart.x + param * C,
			y: lineStart.y + param * D
		};
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

	private isValidPosition(x: number, y: number, margin: number = 2): boolean {
		if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
			return false;
		}

		const point = { x, y };

		for (const obstacle of this.obstacles) {
			// Check if point is inside polygon
			if (this.isPointInPolygon(point, obstacle)) {
				return false;
			}

			// Check distance to polygon edges
			const distanceToObstacle = this.getDistanceToPolygon(point, obstacle);
			if (distanceToObstacle < margin) {
				return false;
			}
		}
		return true;
	}

	// Special method for pathfinding with larger margin
	private isValidPositionForPathfinding(x: number, y: number): boolean {
		return this.isValidPosition(x, y, 30); // 30px margin for pathfinding
	}

	private getDistanceToPolygon(point: Point, polygon: Point[]): number {
		let minDistance = Infinity;

		for (let i = 0; i < polygon.length; i++) {
			const j = (i + 1) % polygon.length;
			const distance = this.getDistanceToLineSegment(point, polygon[i], polygon[j]);
			minDistance = Math.min(minDistance, distance);
		}

		return minDistance;
	}

	private getDistanceToLineSegment(point: Point, lineStart: Point, lineEnd: Point): number {
		const A = point.x - lineStart.x;
		const B = point.y - lineStart.y;
		const C = lineEnd.x - lineStart.x;
		const D = lineEnd.y - lineStart.y;

		const dot = A * C + B * D;
		const lenSq = C * C + D * D;
		
		if (lenSq === 0) {
			// Line segment is actually a point
			return Math.sqrt(A * A + B * B);
		}

		const param = dot / lenSq;

		let xx: number, yy: number;

		if (param < 0) {
			xx = lineStart.x;
			yy = lineStart.y;
		} else if (param > 1) {
			xx = lineEnd.x;
			yy = lineEnd.y;
		} else {
			xx = lineStart.x + param * C;
			yy = lineStart.y + param * D;
		}

		const dx = point.x - xx;
		const dy = point.y - yy;
		return Math.sqrt(dx * dx + dy * dy);
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
			if (this.isValidPositionForPathfinding(newX, newY)) {
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

		// No path found, try to find closest accessible point to goal
		let closestNode: Node | null = null;
		let closestDistance = Infinity;
		
		// Find the node in closedSet that's closest to the goal
		for (const nodeKey of closedSet) {
			const [x, y] = nodeKey.split(',').map(Number);
			const distance = this.heuristic({ x, y }, goalNode);
			if (distance < closestDistance) {
				closestDistance = distance;
				// Find the actual node with this position
				closestNode = {
					x, y, g: 0, h: 0, f: 0, parent: null
				};
			}
		}
		
		// If we found a closer point than the start, try to create a path to it
		if (closestNode && closestDistance < this.heuristic(start, goalNode)) {
			// This is a simplified approach - in a real implementation you'd want to 
			// reconstruct the path properly, but for now return a direct path
			return [start, { x: closestNode.x, y: closestNode.y }, goal];
		}

		// Absolute fallback: return empty array (no valid path found)
		return [];
	}
}
