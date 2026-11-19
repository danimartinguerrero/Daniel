export interface FlatCopy {
  svg: SVGSVGElement;
  colour: string;
  x(): number;
  opacity(): number;
  lean(): number;
}

// The upright silhouettes share one transparent surface on mobile. Keep their paths in viewBox
// coordinates so scrolling the row only moves each path's transform.
export function createCopyLayer(stage: HTMLElement, copies: FlatCopy[], view: number) {
  const canvas = document.createElement('canvas');
  canvas.className = 'lu__copy-layer';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  stage.prepend(canvas);
  const paths = new Map(copies.map(({ svg }) => [svg, new Path2D(svg.querySelector('path')!.getAttribute('d')!)]));
  let ratio = 1;
  let width = 0, height = 0;
  return {
    resize(w: number, h: number) {
      width = w;
      height = h;
      ratio = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.ceil(w * ratio);
      canvas.height = Math.ceil(h * ratio);
    },
    outline(svg: SVGSVGElement, points: Float32Array) {
      const path = new Path2D();
      path.moveTo(points[0]!, points[1]!);
      for (let i = 2; i < points.length; i += 2) path.lineTo(points[i]!, points[i + 1]!);
      path.closePath();
      paths.set(svg, path);
    },
    paint(y: number, size: number, foot: number) {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      for (const copy of copies) {
        const alpha = copy.opacity();
        if (!alpha) continue;
        const x = copy.x();
        if (x < -size * .32 || x > width + size * .32) continue;
        ctx.save();
        ctx.translate(x, y - size / 2 + foot);
        ctx.rotate(copy.lean() * Math.PI / 180);
        ctx.translate(-size / 2, -foot);
        ctx.scale(size / view, size / view);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = copy.colour;
        ctx.fill(paths.get(copy.svg)!, 'evenodd');
        ctx.restore();
      }
    },
    dispose() { canvas.remove(); },
  };
}
