import { clamp } from '../util';

/**
 * The scene is authored in "world units" with the origin at the bottom centre of the pot
 * (up is negative y). This design box is the pot plus the tallest plant, measured over many seeds.
 */
export const DESIGN = { w: 470, h: 560 } as const;

/** How far the plinth hangs below the pot's base, in world units: part of the vertical budget. */
export const PLINTH_DEPTH = 46;

export interface Layout {
  cssW: number;
  cssH: number;
  dpr: number;
  /** CSS pixels per world unit. */
  s: number;
  /** Screen x of the pot's centre. */
  cx: number;
  /** Screen y of the pot's bottom (where it meets the plinth). */
  floorY: number;
  /** Vertical space kept free at the bottom for the specimen tag and the button (portrait), or just the button (landscape). */
  reserveBottom: number;
  /** Vertical space at the top for the HUD. */
  top: number;
  /** Wide windows put the specimen tag beside the plant instead of under it. */
  landscape: boolean;
  /** Half the width of the plant on screen, in CSS pixels: where a side tag should start. */
  plantHalf: number;
}

export function computeLayout(cssW: number, cssH: number, dpr: number): Layout {
  const landscape = cssW >= cssH * 1.2;
  // portrait: room for the tag (~125 px) above the button (~86 px); landscape: the tag sits beside the plant, so only the button
  const reserveBottom = landscape ? clamp(cssH * 0.15, 88, 120) : clamp(cssH * 0.27, 224, 262);
  const top = clamp(cssH * 0.075, 46, 74);
  const avail = Math.max(120, cssH - reserveBottom - top);
  const s = Math.min((cssW * 0.98) / DESIGN.w, avail / (DESIGN.h + PLINTH_DEPTH));
  // centre pot + plant + plinth in the free area, so the plinth never sinks into the reserved strip
  const used = s * (DESIGN.h + PLINTH_DEPTH);
  const floorY = top + (avail - used) / 2 + s * DESIGN.h;
  return { cssW, cssH, dpr, s, cx: cssW / 2, floorY, reserveBottom, top, landscape, plantHalf: Math.round((DESIGN.w / 2) * s) };
}
