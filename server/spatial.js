import * as THREE from 'three';

// Grid-based spatial partitioning for efficient collision detection
// Reduces O(n*m) complexity to O(n + m) for nearby entities
export class SpatialGrid {
  constructor(cellSize = 32) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  // Convert world position to cell key
  getCellKey(x, z) {
    const cellX = Math.floor(x / this.cellSize);
    const cellZ = Math.floor(z / this.cellSize);
    return `${cellX},${cellZ}`;
  }

  // Get all entities in the same cell and neighboring cells
  getNearbyEntities(x, z, radius = 0) {
    const cellX = Math.floor(x / this.cellSize);
    const cellZ = Math.floor(z / this.cellSize);
    const cellRadius = Math.ceil(radius / this.cellSize);
    
    const nearby = [];
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const key = `${cellX + dx},${cellZ + dz}`;
        const cell = this.cells.get(key);
        if (cell) {
          nearby.push(...cell);
        }
      }
    }
    return nearby;
  }

  // Insert an entity into the grid
  insert(entity) {
    const key = this.getCellKey(entity.pos.x, entity.pos.z);
    if (!this.cells.has(key)) {
      this.cells.set(key, []);
    }
    this.cells.get(key).push(entity);
    entity._spatialKey = key;
  }

  // Remove an entity from the grid
  remove(entity) {
    if (entity._spatialKey) {
      const cell = this.cells.get(entity._spatialKey);
      if (cell) {
        const index = cell.indexOf(entity);
        if (index !== -1) {
          cell.splice(index, 1);
        }
        if (cell.length === 0) {
          this.cells.delete(entity._spatialKey);
        }
      }
      delete entity._spatialKey;
    }
  }

  // Update an entity's position in the grid
  update(entity) {
    if (entity._spatialKey) {
      const newKey = this.getCellKey(entity.pos.x, entity.pos.z);
      if (newKey !== entity._spatialKey) {
        this.remove(entity);
        this.insert(entity);
      }
    }
  }

  // Clear all entities
  clear() {
    this.cells.clear();
  }

  // Get total entity count
  get size() {
    let total = 0;
    for (const cell of this.cells.values()) {
      total += cell.length;
    }
    return total;
  }
}