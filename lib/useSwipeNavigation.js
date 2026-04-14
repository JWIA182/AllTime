import { useCallback, useEffect, useRef } from "react";

export function useSwipeNavigation({ onSwipeLeft, onSwipeRight, threshold = 80 }) {
  const startRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const containerRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    isDraggingRef.current = true;
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const deltaX = e.changedTouches[0].clientX - startRef.current.x;
    const deltaY = e.changedTouches[0].clientY - startRef.current.y;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
      if (deltaX > 0 && onSwipeRight) onSwipeRight();
      else if (deltaX < 0 && onSwipeLeft) onSwipeLeft();
    }
  }, [threshold, onSwipeLeft, onSwipeRight]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd]);

  return { containerRef };
}
