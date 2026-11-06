// =============================================================================
// Annotation Screenshots
// =============================================================================
//
// A picture of what an annotation points at, taken when the element, text or
// area is picked, so an agent receives the picture along with the selector,
// text and note. The page is rendered from its DOM (modern-screenshot), cropped
// to the selection plus some surrounding context, and the picked boxes are
// outlined so the agent can tell which element on the picture is meant.
// Agentation's own toolbar, markers and popup are left out of the picture.
//

import { domToCanvas } from "modern-screenshot";

export type ScreenshotRect = { x: number; y: number; width: number; height: number };

export type AnnotationScreenshotRequest = {
  /** The selection, in viewport coordinates. */
  rect: ScreenshotRect;
  /** Boxes to outline on the picture (viewport coordinates); defaults to `rect`. */
  highlights?: ScreenshotRect[];
  /** Context kept around the selection, in CSS pixels. */
  padding?: number;
  /** The picture covers at least this much of the page around the selection, in CSS pixels. */
  minWidth?: number;
  minHeight?: number;
  /** Outline colour. */
  accentColor?: string;
};

/** Longest side of the picture, in image pixels. */
const MAX_OUTPUT_SIDE = 1600;
/** Below this the selection is too small to be worth a picture. */
const MIN_SELECTION_SIDE = 2;

const AGENTATION_SELECTOR =
  "[data-agentation-portal], [data-agentation-root], [data-agentation-toolbar], [data-annotation-popup], agentation-toolbar";

function isAgentationNode(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  return node.matches(AGENTATION_SELECTOR);
}

/**
 * The smallest element whose box holds the whole capture area and whose own
 * content is not scrolled, so its rendering lines up with what the user sees.
 */
function findCaptureTarget(area: ScreenshotRect): HTMLElement {
  const doc = document;
  const cx = Math.min(Math.max(area.x + area.width / 2, 0), window.innerWidth - 1);
  const cy = Math.min(Math.max(area.y + area.height / 2, 0), window.innerHeight - 1);
  const stack = doc.elementsFromPoint(cx, cy);
  for (const element of stack) {
    if (!(element instanceof HTMLElement)) continue;
    if (element === doc.documentElement || element === doc.body) break;
    if (element.closest(AGENTATION_SELECTOR)) continue;
    let ancestor: HTMLElement | null = element;
    while (ancestor && ancestor !== doc.body && ancestor !== doc.documentElement) {
      if (ancestor.scrollTop !== 0 || ancestor.scrollLeft !== 0) {
        ancestor = null;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    if (!ancestor) continue;
    const box = element.getBoundingClientRect();
    if (
      box.left <= area.x &&
      box.top <= area.y &&
      box.right >= area.x + area.width &&
      box.bottom >= area.y + area.height
    ) {
      return element;
    }
  }
  // The whole page. Not <body>: modern-screenshot renders a <body> clone with the
  // browser's default 8px margin even when the page sets none, which shifts the
  // picture against the outline (measured 2026-11-07); <html> lines up exactly.
  return doc.documentElement;
}

function pageBackground(): string {
  for (const element of [document.body, document.documentElement]) {
    if (!element) continue;
    const color = getComputedStyle(element).backgroundColor;
    if (color && color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color)) return color;
  }
  return "#ffffff";
}

function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.stroke();
}

/**
 * Captures the selection as a PNG data URL, or `null` when the page cannot be
 * rendered (for example a selection with no size).
 */
export async function captureAnnotationScreenshot(
  request: AnnotationScreenshotRequest,
): Promise<string | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const { rect } = request;
  if (rect.width < MIN_SELECTION_SIDE && rect.height < MIN_SELECTION_SIDE) return null;
  const padding = request.padding ?? 24;
  // Enough of the surroundings to tell this element from similar ones nearby.
  const minWidth = request.minWidth ?? 640;
  const minHeight = request.minHeight ?? 400;
  const docLeft = -window.scrollX;
  const docTop = -window.scrollY;
  const docRight = docLeft + Math.max(document.documentElement.scrollWidth, window.innerWidth);
  const docBottom = docTop + Math.max(document.documentElement.scrollHeight, window.innerHeight);
  const span = (start: number, size: number, min: number, lower: number, upper: number) => {
    let from = start - padding;
    let to = start + size + padding;
    if (to - from < min) {
      const grow = (min - (to - from)) / 2;
      from -= grow;
      to += grow;
    }
    if (from < lower) { to += lower - from; from = lower; }
    if (to > upper) { from -= to - upper; to = upper; }
    from = Math.max(from, lower);
    return [from, to - from] as const;
  };
  const [ax, aw] = span(rect.x, rect.width, minWidth, docLeft, docRight);
  const [ay, ah] = span(rect.y, rect.height, minHeight, docTop, docBottom);
  const area: ScreenshotRect = { x: ax, y: ay, width: aw, height: ah };
  if (area.width < 1 || area.height < 1) return null;

  const target = findCaptureTarget(area);
  const targetBox = target.getBoundingClientRect();
  // Rendered at 2x at least so small text stays legible to the agent.
  const pixelRatio = Math.max(2, Math.min(window.devicePixelRatio || 1, 3));
  const outputScale = Math.min(
    pixelRatio,
    MAX_OUTPUT_SIDE / Math.max(area.width, area.height),
  );

  try {
    const rendered = await domToCanvas(target, {
      scale: pixelRatio,
      backgroundColor: pageBackground(),
      filter: (node: Node) => !isAgentationNode(node),
      timeout: 4000,
    });
    if (!rendered.width || !rendered.height || !targetBox.width) return null;
    const ratio = rendered.width / Math.max(target.scrollWidth, targetBox.width);

    const width = Math.max(1, Math.round(area.width * outputScale));
    const height = Math.max(1, Math.round(area.height * outputScale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = pageBackground();
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(
      rendered,
      (area.x - targetBox.left) * ratio,
      (area.y - targetBox.top) * ratio,
      area.width * ratio,
      area.height * ratio,
      0,
      0,
      width,
      height,
    );

    const highlights = request.highlights?.length ? request.highlights : [rect];
    ctx.strokeStyle = request.accentColor ?? "#3c82f7";
    ctx.lineWidth = Math.max(2, 2 * outputScale);
    for (const box of highlights) {
      // Just outside the box, so the element's own edge stays visible.
      const gap = 3;
      strokeRoundedRect(
        ctx,
        (box.x - gap - area.x) * outputScale,
        (box.y - gap - area.y) * outputScale,
        (box.width + gap * 2) * outputScale,
        (box.height + gap * 2) * outputScale,
        6 * outputScale,
      );
    }
    return canvas.toDataURL("image/png");
  } catch (error) {
    console.warn("[Agentation] Screenshot capture failed:", error);
    return null;
  }
}
