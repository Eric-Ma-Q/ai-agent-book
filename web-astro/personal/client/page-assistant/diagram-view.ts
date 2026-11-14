// Mac trackpad viewing for one diagram.
// Chrome and Firefox deliver a pinch as a wheel event with ctrlKey.
// Spreading the fingers sends a negative deltaY. Safari delivers a gesture
// event and also fires that wheel, so a browser with GestureEvent must not
// apply both. Two-finger scroll pans only after the diagram is enlarged.
// Movement left over at the edge goes back to the conversation. At the fitted
// size, a two-finger scroll is left for the conversation to handle.

export type DiagramView = { scale: number; x: number; y: number };
export type DiagramControl = { reset: () => void };

export const DIAGRAM_MIN_SCALE = 1;
export const DIAGRAM_MAX_SCALE = 8;
export const DIAGRAM_DOUBLE_CLICK_SCALE = 2.5;

const LINE_PIXELS = 16;
const FIT_SCALE = 1.001;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return DIAGRAM_MIN_SCALE;
  return Math.min(DIAGRAM_MAX_SCALE, Math.max(DIAGRAM_MIN_SCALE, scale));
}

/** One pinch event stays within 0.8–1.25 so a single tick cannot jump. */
export function pinchFactor(deltaY: number): number {
  const raw = Math.exp(-deltaY * 0.01);
  return Math.min(1.25, Math.max(0.8, raw));
}

export function wheelPixels(delta: number, mode: number, pageSize: number): number {
  if (mode === 1) return delta * LINE_PIXELS;
  if (mode === 2) return delta * pageSize;
  return delta;
}

/** Keep the viewport point under the fingers fixed while the scale changes. */
export function zoomAt(view: DiagramView, originX: number, originY: number, nextScale: number): DiagramView {
  const scale = clampScale(nextScale);
  const ratio = view.scale === 0 ? 1 : scale / view.scale;
  return {
    scale,
    x: originX - (originX - view.x) * ratio,
    y: originY - (originY - view.y) * ratio,
  };
}

export function clampPan(
  view: DiagramView,
  viewportWidth: number,
  viewportHeight: number,
  contentWidth: number,
  contentHeight: number,
): DiagramView {
  const minX = Math.min(0, viewportWidth - contentWidth * view.scale);
  const minY = Math.min(0, viewportHeight - contentHeight * view.scale);
  return {
    scale: view.scale,
    x: Math.min(0, Math.max(minX, view.x)),
    y: Math.min(0, Math.max(minY, view.y)),
  };
}

export function panBy(
  view: DiagramView,
  deltaX: number,
  deltaY: number,
  viewportWidth: number,
  viewportHeight: number,
  contentWidth: number,
  contentHeight: number,
): { view: DiagramView; leftoverX: number; leftoverY: number } {
  const next = clampPan(
    { scale: view.scale, x: view.x - deltaX, y: view.y - deltaY },
    viewportWidth,
    viewportHeight,
    contentWidth,
    contentHeight,
  );
  return {
    view: next,
    leftoverX: deltaX - (view.x - next.x),
    leftoverY: deltaY - (view.y - next.y),
  };
}

function settle(view: DiagramView): DiagramView {
  if (view.scale <= FIT_SCALE) return { scale: 1, x: 0, y: 0 };
  return view;
}

type GestureLike = Event & { scale: number; clientX: number; clientY: number };

function scrollParent(node: HTMLElement): HTMLElement | null {
  let parent = node.parentElement;
  while (parent) {
    const overflow = getComputedStyle(parent).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && parent.scrollHeight > parent.clientHeight + 1) return parent;
    parent = parent.parentElement;
  }
  return null;
}

export function attachDiagramView(
  viewport: HTMLElement,
  stage: HTMLElement,
  onZoomed: (zoomed: boolean) => void,
): DiagramControl {
  let view: DiagramView = { scale: 1, x: 0, y: 0 };
  let gestureBase = 1;
  const safariPinch = 'GestureEvent' in window;

  const apply = () => {
    stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    const zoomed = view.scale > 1;
    viewport.classList.toggle('is-zoomed', zoomed);
    onZoomed(zoomed);
  };

  const box = () => ({
    width: viewport.clientWidth,
    height: viewport.clientHeight,
    contentWidth: stage.offsetWidth,
    contentHeight: stage.offsetHeight,
  });

  const origin = (clientX: number, clientY: number) => {
    const rect = viewport.getBoundingClientRect();
    const style = getComputedStyle(viewport);
    return {
      x: clientX - rect.left - viewport.clientLeft - (Number.parseFloat(style.paddingLeft) || 0),
      y: clientY - rect.top - viewport.clientTop - (Number.parseFloat(style.paddingTop) || 0),
    };
  };

  const setScale = (clientX: number, clientY: number, nextScale: number) => {
    const frame = box();
    if (frame.width < 1 || frame.height < 1) return;
    const point = origin(clientX, clientY);
    view = settle(
      clampPan(zoomAt(view, point.x, point.y, nextScale), frame.width, frame.height, frame.contentWidth, frame.contentHeight),
    );
    apply();
  };

  viewport.addEventListener(
    'wheel',
    (event) => {
      const frame = box();
      if (frame.width < 1 || frame.height < 1) return;
      if (event.ctrlKey) {
        event.preventDefault();
        if (safariPinch) return;
        const point = origin(event.clientX, event.clientY);
        const delta = wheelPixels(event.deltaY, event.deltaMode, frame.height);
        view = settle(
          clampPan(
            zoomAt(view, point.x, point.y, view.scale * pinchFactor(delta)),
            frame.width,
            frame.height,
            frame.contentWidth,
            frame.contentHeight,
          ),
        );
        apply();
        return;
      }
      if (view.scale <= 1) return;
      const deltaX = wheelPixels(event.deltaX, event.deltaMode, frame.width);
      const deltaY = wheelPixels(event.deltaY, event.deltaMode, frame.height);
      const moved = panBy(view, deltaX, deltaY, frame.width, frame.height, frame.contentWidth, frame.contentHeight);
      const consumed = Math.abs(deltaX - moved.leftoverX) + Math.abs(deltaY - moved.leftoverY) > 0.5;
      if (!consumed) return;
      event.preventDefault();
      view = moved.view;
      apply();
      if (Math.abs(moved.leftoverY) > 0.5) {
        scrollParent(viewport)?.scrollBy({ top: moved.leftoverY, behavior: 'instant' });
      }
    },
    { passive: false },
  );

  viewport.addEventListener('dblclick', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('button, a, summary')) return;
    event.preventDefault();
    if (view.scale > 1) {
      view = { scale: 1, x: 0, y: 0 };
      apply();
      return;
    }
    setScale(event.clientX, event.clientY, DIAGRAM_DOUBLE_CLICK_SCALE);
  });

  const onGestureStart = (event: Event) => {
    event.preventDefault();
    gestureBase = view.scale;
  };
  const onGestureChange = (event: Event) => {
    const gesture = event as GestureLike;
    event.preventDefault();
    setScale(gesture.clientX, gesture.clientY, gestureBase * gesture.scale);
  };
  const onGestureEnd = (event: Event) => {
    event.preventDefault();
  };
  viewport.addEventListener('gesturestart', onGestureStart, { passive: false });
  viewport.addEventListener('gesturechange', onGestureChange, { passive: false });
  viewport.addEventListener('gestureend', onGestureEnd, { passive: false });

  const reset = () => {
    view = { scale: 1, x: 0, y: 0 };
    apply();
  };
  apply();
  return { reset };
}
