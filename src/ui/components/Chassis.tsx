import { copy } from "../copy";
import "./Chassis.css";

/**
 * Chassis details of Figma_Main (node 0:1), one named block per part. Measurements are in
 * docs/figma-source-map.md ("Chassis details (Figma_Main)"). Static, Tokens only.
 */

/** Rotation of each corner screw in degrees (Figma 182:296, 182:299, 182:302, 182:305). */
export const CORNER_SCREWS = [
  { corner: "tl", rotate: 12, nodeId: "182:296" },
  { corner: "tr", rotate: 41, nodeId: "182:299" },
  { corner: "bl", rotate: 67, nodeId: "182:302" },
  { corner: "br", rotate: 24, nodeId: "182:305" },
] as const;

/** Screw diameter in px, on the chassis and on every Sheet. */
export const SCREW_SIZE = 13;

/** Bottom grille: 18 slots, 5 x 8 px, 9 px apart (Prototype_Reference drawPCB, checked on the Figma_Main render). */
export const BOTTOM_GRILLE_SLOTS = 18;

/** Grille ticks on the selected channel key: 7 ticks, 4 px apart. */
export const GRILLE_TICK_COUNT = 7;

/** One slotted screw, 13 px, rotated. The face, slot and shadow come from Tokens. */
export function Screw({
  rotate,
  class: cls,
}: {
  rotate: number;
  class?: string;
}) {
  return (
    <span
      class={cls ? `chassis-screw ${cls}` : "chassis-screw"}
      style={{ "--screw-rot": `${rotate}deg` }}
      aria-hidden="true"
    />
  );
}

/** CornerScrews: the four faceplate corner screws. */
export function CornerScrews() {
  return (
    <div class="chassis-layer chassis-corner-screws" aria-hidden="true">
      {CORNER_SCREWS.map((s) => (
        <Screw
          key={s.corner}
          rotate={s.rotate}
          class={`chassis-corner chassis-corner-${s.corner}`}
        />
      ))}
    </div>
  );
}

/** PowerLabel: the silkscreen caption under the rocker. The text is uppercase through CSS, as in Figma. */
export function PowerLabel() {
  return (
    <p class="power-label" aria-hidden="true">
      {copy.rocker.silk}
    </p>
  );
}

/** SideRail: the dimple and the slot on the right edge of the chassis. */
export function SideRail() {
  return (
    <div class="chassis-side-rail" aria-hidden="true">
      <span class="chassis-rail-dimple" />
      <span class="chassis-rail-slot" />
    </div>
  );
}

/** BottomGrille: the row of slots along the bottom edge of the chassis. */
export function BottomGrille() {
  return (
    <div class="chassis-bottom-grille" aria-hidden="true">
      {Array.from({ length: BOTTOM_GRILLE_SLOTS }, (_, i) => (
        <i key={i} class="chassis-grille-slot" />
      ))}
    </div>
  );
}

/** GrilleTicks: the short ticks on the selected channel key. */
export function GrilleTicks() {
  return (
    <span class="grille-ticks" aria-hidden="true">
      {Array.from({ length: GRILLE_TICK_COUNT }, (_, i) => (
        <i key={i} class="grille-tick" style={{ left: `${i * 4}px` }} />
      ))}
    </span>
  );
}
