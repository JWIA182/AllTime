import { useCallback, useEffect, useRef, useState } from "react";

/*
 * usePullToRefresh - Pull down to refresh on mobile
 * 
 * Usage:
 * const { containerRef, isRefreshing } = usePullToRefresh({
 *   onRefresh: async () => await fetchData(),
 *   threshold: 100,
 * });
 */

export function usePullToRefresh({ onRefresh, threshold = 100 }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isDragging = useRef(false);
  const containerRef = useRef(null);
  const scrollRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    // Only allow pull-to-refresh when scrolled to top
    const scrollTop = scrollRef.current?.scrollTop || window.scrollY || document.documentElement.scrollTop;
    if (scrollTop > 0) return;
    
    startY.current = e.touches[0].clientY;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging.current || isRefreshing) return;
    
    currentY.current = e.touches[0].clientY;
    const distance = Math.max(0, currentY.current - startY.current);
    
    // Only track downward pull
    if (distance > 0) {
      setPullDistance(distance);
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isDragging.current || isRefreshing) return;
    isDragging.current = false;

    if (pullDistance > threshold && onRefresh) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
    
    setPullDistance(0);
  }, [pullDistance, threshold, onRefresh, isRefreshing]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Find scrollable container
    scrollRef.current = container.closest(".tab-content") || container;

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { containerRef, isRefreshing, pullDistance };
}
