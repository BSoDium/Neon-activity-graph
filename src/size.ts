/**
 * While a box is being resized, the picture last drawn (`shown`, in CSS pixels) is fitted into the new box (`box`): scaled alike both ways and centred, so it follows the box as it is dragged and the new picture, drawn at the
 * end for the same box, replaces it without a jump. `null` when there is no picture yet. Pure.
 */
export function heldPicture(shown: { width: number; height: number }, box: { width: number; height: number }): { width: number; height: number; left: number; top: number; scale: number } | null {
  if (!(shown.width > 0 && shown.height > 0 && box.width > 0 && box.height > 0)) return null;
  const scale = Math.min(box.width / shown.width, box.height / shown.height);
  const width = shown.width * scale;
  const height = shown.height * scale;
  return { width, height, left: (box.width - width) / 2, top: (box.height - height) / 2, scale };
}

/**
 * The size of the render, in device pixels: the container's size times the pixel ratio (up to `maxPixelRatio`, 1 on a `lite` device), scaled down if the picture would have more than `maxPixels` pixels or a side longer than
 * `maxSize` (what the graphics card can make a texture of). Pure.
 */
export function renderSize(input: { cssWidth: number; cssHeight: number; devicePixelRatio: number; lite: boolean; maxPixelRatio?: number; maxPixels?: number; maxSize?: number }): { width: number; height: number; ratio: number } {
  const { cssWidth, cssHeight, lite, maxPixelRatio = 2, maxPixels = 8_000_000, maxSize = 8192 } = input;
  let ratio = lite ? 1 : Math.min(input.devicePixelRatio || 1, maxPixelRatio);
  const area = Math.max(1, cssWidth) * Math.max(1, cssHeight);
  ratio = Math.min(ratio, Math.sqrt(maxPixels / area), maxSize / Math.max(1, cssWidth, cssHeight));
  return { width: Math.max(1, Math.round(cssWidth * ratio)), height: Math.max(1, Math.round(cssHeight * ratio)), ratio };
}
