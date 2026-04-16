export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Map a browser client point into canvas drawing coordinates (CSS pixel space),
 * assuming the canvas context is scaled via DPR transform.
 */
export function clientPointToCanvasCssPoint(params: {
  clientX: number;
  clientY: number;
  rect: RectLike;
}): { x: number; y: number } {
  return {
    x: params.clientX - params.rect.left,
    y: params.clientY - params.rect.top
  };
}

