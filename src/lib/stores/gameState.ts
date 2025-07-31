import { writable } from 'svelte/store';

// Store pour la santé du joueur
export const playerHealth = writable(100);

// Store pour le type de lapin sélectionné
export type BunnyType = 'green' | 'red' | 'wall' | 'none' | 'test-line';
export const selectedBunnyType = writable<BunnyType>('green');

// Store pour l'état de rotation des murs
export const isRotatingWall = writable(false);
export const wallRotation = writable(0); // Angle en degrés

// Store pour la vitesse du jeu (0 = pause, 1 = normal, 10 = max)
export const gameSpeed = writable(1);

// Fonction pour réduire la santé
export function takeDamage(damage: number = 1) {
	playerHealth.update((health) => Math.max(0, health - damage));
}

// Fonction pour reset la santé
export function resetHealth() {
	playerHealth.set(100);
}

// Fonction pour changer le type de lapin sélectionné
export function setSelectedBunnyType(type: BunnyType) {
	selectedBunnyType.set(type);
}

// Fonction pour activer/désactiver la rotation des murs
export function setWallRotating(rotating: boolean) {
	isRotatingWall.set(rotating);
}

// Fonction pour faire tourner le mur
export function rotateWall() {
	wallRotation.update((angle) => (angle + 45) % 360);
}

// Fonction pour changer la vitesse du jeu
export function setGameSpeed(speed: number) {
	gameSpeed.set(Math.max(0, Math.min(10, speed)));
}
