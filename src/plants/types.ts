import type { Pt } from '../util';

export type { Pt };

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Geometry of one leaf in leaf units, origin at the leaf's anchor point, pointing up (-y). */
export interface LeafGeom {
  /** Closed polygon. */
  outline: Pt[];
  bounds: Bounds;
  /** Polyline running past both ends of the leaf; splits it in two for the half-moon variegation. */
  divider: Pt[];
  /** Characteristic size in units: scales flecks, blobs and gradients. */
  size: number;
  center: Pt;
}

export interface Palette {
  base: string;
  light: string;
  dark: string;
  /** Light vein colour, drawn over green lamina. */
  vein: string;
  /** Soft green vein colour, drawn over pale (variegated) areas. */
  veinSoft: string;
}

/** A pre-rendered leaf. `k` canvas pixels per unit; (ax, ay) is the anchor inside the canvas. */
export interface Sprite {
  canvas: HTMLCanvasElement;
  ax: number;
  ay: number;
  k: number;
  w: number;
  h: number;
}

/** How a leaf comes in while the plant grows. */
export type GrowStyle = 'unfurl' | 'shoot' | 'pop';

export interface LeafSpec {
  sprite: Sprite;
  /** Where the stem starts (plant space: origin at the soil centre, y up is negative). */
  base: Pt;
  /** Where the stem ends and the leaf anchors. Equal to `base` for stemless leaves. */
  tip: Pt;
  /** Horizontal offset of the petiole's control point; shapes its arch. */
  bend: number;
  stemWidth: number;
  stemColor: string;
  /** Rest rotation of the leaf in radians (0 = pointing up, positive = clockwise). */
  angle: number;
  style: GrowStyle;
  /** Growth timing, seconds from the start of the sprout. */
  delay: number;
  dur: number;
  swayAmp: number;
  swaySpeed: number;
  swayPhase: number;
  z: number;
}

export interface Plant {
  leaves: LeafSpec[];
  growSeconds: number;
  /** Visual extents above the soil, for placing effects. */
  height: number;
  halfWidth: number;
  /** Lowest-first dispose: frees sprite canvases. */
  dispose(): void;
}
