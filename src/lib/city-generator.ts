// Génération d'un plan de ville procédural en TypeScript
// Basé sur : bruit de densité simple + diagramme de Voronoi

import { Delaunay } from 'd3-delaunay';

interface Point {
  x: number;
  y: number;
}

interface Polygon {
  center: Point;
  vertices: Point[];
  density: number;
}

// Simple noise function to replace Perlin noise
function simpleNoise(x: number, y: number): number {
  // Simple pseudo-random noise based on coordinates
  const a = 12.9898;
  const b = 78.233;
  const c = 43758.5453;
  const dt = (x * a + y * b) % Math.PI;
  return (Math.sin(dt) * c) % 1.0;
}

// Check if a point is inside a polygon using ray casting algorithm
function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  const x = point.x;
  const y = point.y;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

export function generatePoints(count: number, width: number = 1000, height: number = 1000): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      x: Math.random() * width,
      y: Math.random() * height,
    });
  }
  return points;
}

export function computeDensity(point: Point): number {
  const scale = 0.005;
  return simpleNoise(point.x * scale, point.y * scale);
}

export function generateVoronoiPolygons(points: Point[], width: number = 1000, height: number = 1000): Polygon[] {
  const delaunay = Delaunay.from(points.map(p => [p.x, p.y]));
  const voronoi = delaunay.voronoi([0, 0, width, height]);

  const polygons: Polygon[] = [];

  for (let i = 0; i < points.length; i++) {
    const cell = voronoi.cellPolygon(i);
    if (!cell) continue;

    const polygon: Polygon = {
      center: points[i],
      vertices: cell.map(([x, y]) => ({ x, y })),
      density: computeDensity(points[i]),
    };

    polygons.push(polygon);
  }

  return polygons;
}

// Filter out polygons that contain a specific point (like the green bunny)
export function filterPolygonsAwayFromPoint(polygons: Polygon[], excludePoint: Point): Polygon[] {
  return polygons.filter(polygon => {
    return !isPointInPolygon(excludePoint, polygon.vertices);
  });
}

// Shrink polygon vertices towards the center to create streets
export function shrinkPolygon(polygon: Polygon, shrinkFactor: number = 0.85): Polygon {
  const center = polygon.center;
  
  // Shrink each vertex towards the center
  const shrunkVertices = polygon.vertices.map(vertex => ({
    x: center.x + (vertex.x - center.x) * shrinkFactor,
    y: center.y + (vertex.y - center.y) * shrinkFactor
  }));
  
  return {
    ...polygon,
    vertices: shrunkVertices
  };
}

// Shrink all polygons in a list
export function shrinkPolygons(polygons: Polygon[], shrinkFactor: number = 0.85): Polygon[] {
  return polygons.map(polygon => shrinkPolygon(polygon, shrinkFactor));
}

// Exemple d'utilisation
// const seedPoints = generatePoints(NUM_POINTS);
// const cityPolygons = generateVoronoiPolygons(seedPoints);

// Filtrer les polygones selon leur densité pour ne garder que les zones "construites"
// const threshold = 0.1;
// const buildings = cityPolygons.filter(p => p.density > threshold);

// console.log(buildings);
