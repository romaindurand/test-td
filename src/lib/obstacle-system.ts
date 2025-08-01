// Simple obstacle system with blue polygon visualization
import type { Point } from './pathfinding';

export class ObstacleSystem {
	private obstacles: Point[][] = [];
	private expandedObstacles: Point[][] = []; // Obstacles with 30px margin
	private goalPosition: Point;

	constructor(width: number, height: number) {
		this.goalPosition = { x: width / 2, y: height / 2 }; // Default center
	}

	setGoal(goal: Point) {
		this.goalPosition = goal;
	}

	addObstacle(points: Point[]) {
		// Simply add the new obstacle without any merging
		this.obstacles.push(points);
		this.updateExpandedObstacles();
	}

	private updateExpandedObstacles() {
		this.expandedObstacles = [];

		for (const obstacle of this.obstacles) {
			const expandedObstacle = this.expandPolygon(obstacle, 5);
			this.expandedObstacles.push(expandedObstacle);
		}
	}

	private expandPolygon(polygon: Point[], margin: number): Point[] {
		if (polygon.length < 3) return polygon;

		// Use uniform margin expansion by offsetting each edge outward
		return this.offsetPolygonUniform(polygon, margin);
	}

	private offsetPolygonUniform(polygon: Point[], offset: number): Point[] {
		if (polygon.length < 3) return polygon;

		// Try both directions and choose the one that creates a larger polygon
		const expandedOutward = this.offsetPolygonInDirection(polygon, offset, false);
		const expandedInward = this.offsetPolygonInDirection(polygon, offset, true);

		// Calculate areas to determine which is the outward expansion
		const outwardArea = this.getPolygonArea(expandedOutward);
		const inwardArea = this.getPolygonArea(expandedInward);

		// Return the expansion that creates a larger area (outward expansion)
		return Math.abs(outwardArea) > Math.abs(inwardArea) ? expandedOutward : expandedInward;
	}

	private offsetPolygonInDirection(polygon: Point[], offset: number, flipDirection: boolean): Point[] {
		// Calculate offset lines for each edge
		const offsetLines: { start: Point; end: Point }[] = [];

		for (let i = 0; i < polygon.length; i++) {
			const current = polygon[i];
			const next = polygon[(i + 1) % polygon.length];

			// Calculate edge direction
			const edgeDx = next.x - current.x;
			const edgeDy = next.y - current.y;
			const edgeLength = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);

			if (edgeLength === 0) continue;

			// Calculate perpendicular vector (normal)
			let normalX = -edgeDy / edgeLength;
			let normalY = edgeDx / edgeLength;

			// Flip direction if requested
			if (flipDirection) {
				normalX = -normalX;
				normalY = -normalY;
			}

			// Create offset line by moving the edge
			const offsetStart = {
				x: current.x + normalX * offset,
				y: current.y + normalY * offset
			};
			const offsetEnd = {
				x: next.x + normalX * offset,
				y: next.y + normalY * offset
			};

			offsetLines.push({ start: offsetStart, end: offsetEnd });
		}

		// Find intersections between consecutive offset lines to get vertices
		const expandedVertices: Point[] = [];

		for (let i = 0; i < offsetLines.length; i++) {
			const currentLine = offsetLines[i];
			const nextLine = offsetLines[(i + 1) % offsetLines.length];

			// Find intersection between current and next offset lines
			const intersection = this.getLineIntersection(
				currentLine.start,
				currentLine.end,
				nextLine.start,
				nextLine.end
			);

			if (intersection) {
				expandedVertices.push(intersection);
			} else {
				// Fallback: use the end point of current line
				expandedVertices.push(currentLine.end);
			}
		}

		return expandedVertices;
	}

	private getPolygonArea(polygon: Point[]): number {
		if (polygon.length < 3) return 0;

		let area = 0;
		for (let i = 0; i < polygon.length; i++) {
			const current = polygon[i];
			const next = polygon[(i + 1) % polygon.length];
			area += (next.x - current.x) * (next.y + current.y);
		}

		return area / 2;
	}

	private getPolygonCentroid(polygon: Point[]): Point {
		let centerX = 0;
		let centerY = 0;

		for (const point of polygon) {
			centerX += point.x;
			centerY += point.y;
		}

		return {
			x: centerX / polygon.length,
			y: centerY / polygon.length
		};
	}

	private isPolygonClockwise(polygon: Point[]): boolean {
		// Calculate the signed area of the polygon
		// If the area is positive, the polygon is counter-clockwise
		// If the area is negative, the polygon is clockwise
		let signedArea = 0;

		for (let i = 0; i < polygon.length; i++) {
			const curr = polygon[i];
			const next = polygon[(i + 1) % polygon.length];
			signedArea += (next.x - curr.x) * (next.y + curr.y);
		}

		return signedArea < 0; // Negative area means clockwise in screen coordinates
	}

	private getLineIntersection(p1: Point, q1: Point, p2: Point, q2: Point): Point | null {
		const x1 = p1.x,
			y1 = p1.y;
		const x2 = q1.x,
			y2 = q1.y;
		const x3 = p2.x,
			y3 = p2.y;
		const x4 = q2.x,
			y4 = q2.y;

		const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
		if (Math.abs(denom) < 1e-10) {
			return null; // Lines are parallel
		}

		const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

		// Return intersection point (no need to check if within segments for line extension)
		return {
			x: x1 + t * (x2 - x1),
			y: y1 + t * (y2 - y1)
		};
	}

	private lineIntersectsPolygon(from: Point, to: Point, polygon: Point[]): boolean {
		for (let i = 0; i < polygon.length; i++) {
			const p1 = polygon[i];
			const p2 = polygon[(i + 1) % polygon.length];

			if (this.doLineSegmentsIntersect(from, to, p1, p2)) {
				return true;
			}
		}
		return false;
	}

	private doLineSegmentsIntersect(p1: Point, q1: Point, p2: Point, q2: Point): boolean {
		function orientation(p: Point, q: Point, r: Point): number {
			const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
			if (Math.abs(val) < 1e-10) return 0; // Collinear
			return val > 0 ? 1 : 2; // Clockwise or counterclockwise
		}

		function onSegment(p: Point, q: Point, r: Point): boolean {
			return (
				q.x <= Math.max(p.x, r.x) &&
				q.x >= Math.min(p.x, r.x) &&
				q.y <= Math.max(p.y, r.y) &&
				q.y >= Math.min(p.y, r.y)
			);
		}

		const o1 = orientation(p1, q1, p2);
		const o2 = orientation(p1, q1, q2);
		const o3 = orientation(p2, q2, p1);
		const o4 = orientation(p2, q2, q1);

		// General case
		if (o1 !== o2 && o3 !== o4) return true;

		// Special cases
		if (o1 === 0 && onSegment(p1, p2, q1)) return true;
		if (o2 === 0 && onSegment(p1, q2, q1)) return true;
		if (o3 === 0 && onSegment(p2, p1, q2)) return true;
		if (o4 === 0 && onSegment(p2, q1, q2)) return true;

		return false;
	}

	getExpandedObstacles(): Point[][] {
		return this.expandedObstacles;
	}

	getObstacles(): Point[][] {
		return this.obstacles;
	}

	getGoal(): Point {
		return this.goalPosition;
	}

	testPathClear(from: Point, to: Point): boolean {
		for (const obstacle of this.obstacles) {
			if (this.lineIntersectsPolygon(from, to, obstacle)) {
				return false;
			}
		}
		return true;
	}

	testLineIntersections(
		from: Point,
		to: Point
	): { intersects: boolean; intersectionPoints: Point[] } {
		let intersects = false;
		const intersectionPoints: Point[] = [];

		for (const obstacle of this.obstacles) {
			for (let i = 0; i < obstacle.length; i++) {
				const p1 = obstacle[i];
				const p2 = obstacle[(i + 1) % obstacle.length];

				const intersection = this.getLineSegmentIntersection(from, to, p1, p2);
				if (intersection) {
					intersects = true;
					intersectionPoints.push(intersection);
				}
			}
		}

		return { intersects, intersectionPoints };
	}

	private getLineSegmentIntersection(p1: Point, q1: Point, p2: Point, q2: Point): Point | null {
		const x1 = p1.x,
			y1 = p1.y;
		const x2 = q1.x,
			y2 = q1.y;
		const x3 = p2.x,
			y3 = p2.y;
		const x4 = q2.x,
			y4 = q2.y;

		const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
		if (Math.abs(denom) < 1e-10) {
			return null; // Lines are parallel
		}

		const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
		const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

		// Check if intersection is within both line segments
		if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
			return {
				x: x1 + t * (x2 - x1),
				y: y1 + t * (y2 - y1)
			};
		}

		return null;
	}
}
