import { useCallback, useRef, useState } from "react";

/*
 * useSwipe - Detect swipe gestures on mobile devices
 * 
 * Usage:
 * const { bind, swipedLeft, swipedRight } = useSwipe({
 *   onSwipeLeft: () => console.log('swiped left'),
 *   onSwipeRight: () => console.log('swiped right'),
 *   threshold: 50, // minimum swipe distance in px
 * });
 * 
 * <div {...bind}>Swipe me!</div>
 */

export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 50 }) {
  const [swipedLeft, setSwipedLeft] = useState(false);
  const [swipedRight, setSwipedRight] = useState(false);
  
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const currentY = useRef(0);
  const isSwiping = useRef(false);

  const handleTouchStart = useCallback((e) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isSwiping.current = true;
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!isSwiping.current) return;
    currentX.current = e.touches[0].clientX;
    currentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isSwiping.current) return;
    isSwiping.current = false;

    const deltaX = currentX.current - startX.current;
    const deltaY = currentY.current - startY.current;

    // Only trigger if horizontal swipe is dominant
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > threshold && onSwipeRight) {
        setSwipedRight(true);
        onSwipeRight();
        setTimeout(() => setSwipedRight(false), 300);
      } else if (deltaX < -threshold && onSwipeLeft) {
        setSwipedLeft(true);
        onSwipeLeft();
        setTimeout(() => setSwipedLeft(false), 300);
      }
    }
  }, [threshold, onSwipeLeft, onSwipeRight]);

  return {
    bind: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    swipedLeft,
    swipedRight,
  };
}
