import { SPECIES, SPECIES_BY_ID, TIERS, FORM_LABEL, type SpeciesId } from './config';
import { buildPlantSync, drawPlant } from './plants/plant';
import { POT, drawPot } from './scene/pot';
import { get2d, rgba } from './util';

/** Dev page: every species x every form, fully grown. Doubles as the art-review sheet. */

const params = new URLSearchParams(location.search);
const seed = (Number(params.get('seed') ?? 7) || 7) >>> 0;
const only = params.get('species') as SpeciesId | null;
const species = only && SPECIES_BY_ID[only] ? [SPECIES_BY_ID[only]] : SPECIES;

const CELL_W = 560;
const CELL_H = 640;
const SCALE = 1.0; // px per unit
const K = 2.2; // sprite pixels per unit

const canvas = document.getElementById('sheet') as HTMLCanvasElement;
canvas.width = CELL_W * TIERS.length;
canvas.height = CELL_H * species.length;
const ctx = get2d(canvas);

species.forEach((sp, row) => {
  TIERS.forEach((tier, col) => {
    const x0 = col * CELL_W;
    const y0 = row * CELL_H;

    const bg = ctx.createLinearGradient(0, y0, 0, y0 + CELL_H);
    bg.addColorStop(0, '#0f2a23');
    bg.addColorStop(1, '#1b4638');
    ctx.fillStyle = bg;
    ctx.fillRect(x0, y0, CELL_W, CELL_H);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, CELL_W - 1, CELL_H - 1);

    const plant = buildPlantSync({ species: sp.id, tier: tier.id, form: tier.form, seed: seed + row * 101 + col * 13 }, K, 1.5);

    ctx.save();
    ctx.translate(x0 + CELL_W / 2, y0 + CELL_H - 96);
    ctx.scale(SCALE, SCALE);
    // contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 120, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    drawPot(ctx);
    ctx.translate(0, POT.soilY);
    drawPlant(ctx, plant, 99, 0, 0);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#eaf2e4';
    ctx.font = 'italic 21px Georgia, serif';
    ctx.fillText(sp.latin, x0 + CELL_W / 2, y0 + CELL_H - 52);
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(234,242,228,0.7)';
    ctx.fillText(FORM_LABEL[tier.form], x0 + CELL_W / 2, y0 + CELL_H - 30);
    ctx.fillStyle = rgba(tier.color, 1);
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(`${tier.label.toUpperCase()}  ${'●'.repeat(tier.pips)}${'○'.repeat(4 - tier.pips)}`, x0 + CELL_W / 2, y0 + CELL_H - 10);
    plant.dispose();
  });
});

document.title = 'SPECIMEN — plant gallery (ready)';
