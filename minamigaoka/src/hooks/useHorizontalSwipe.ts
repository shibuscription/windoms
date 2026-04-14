import { useRef } from "react";

type UseHorizontalSwipeOptions = {
  enabled?: boolean;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  minDistance?: number;
  dominanceRatio?: number;
  maxVerticalDrift?: number;
};

type SwipeState = {
  startX: number;
  startY: number;
  started: boolean;
};

const defaultMinDistance = 56;
const defaultDominanceRatio = 1.35;
const defaultMaxVerticalDrift = 96;

const shouldIgnoreSwipeTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, option, button, a[href], [contenteditable='true'], [data-swipe-ignore='true']",
    ),
  );
};

export function useHorizontalSwipe({
  enabled = true,
  onSwipeLeft,
  onSwipeRight,
  minDistance = defaultMinDistance,
  dominanceRatio = defaultDominanceRatio,
  maxVerticalDrift = defaultMaxVerticalDrift,
}: UseHorizontalSwipeOptions) {
  const swipeStateRef = useRef<SwipeState>({ startX: 0, startY: 0, started: false });
  const suppressClickRef = useRef(false);

  const reset = () => {
    swipeStateRef.current = { startX: 0, startY: 0, started: false };
  };

  const onTouchStart: React.TouchEventHandler<HTMLElement> = (event) => {
    if (!enabled) {
      reset();
      return;
    }
    if (event.touches.length !== 1) {
      reset();
      return;
    }
    if (shouldIgnoreSwipeTarget(event.target)) {
      reset();
      return;
    }
    const touch = event.touches[0];
    swipeStateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      started: true,
    };
  };

  const onTouchMove: React.TouchEventHandler<HTMLElement> = (event) => {
    if (!enabled || !swipeStateRef.current.started) return;
    if (event.touches.length !== 1) {
      reset();
    }
  };

  const onTouchCancel: React.TouchEventHandler<HTMLElement> = () => {
    reset();
  };

  const onTouchEnd: React.TouchEventHandler<HTMLElement> = (event) => {
    if (!enabled || !swipeStateRef.current.started) {
      reset();
      return;
    }
    const touch = event.changedTouches[0];
    if (!touch) {
      reset();
      return;
    }

    const deltaX = touch.clientX - swipeStateRef.current.startX;
    const deltaY = touch.clientY - swipeStateRef.current.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    reset();

    if (absY > maxVerticalDrift) return;
    if (absX < minDistance) return;
    if (absX <= absY * dominanceRatio) return;

    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    if (deltaX < 0) {
      onSwipeLeft?.();
      return;
    }

    onSwipeRight?.();
  };

  const onClickCapture: React.MouseEventHandler<HTMLElement> = (event) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  };

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    onClickCapture,
  };
}
