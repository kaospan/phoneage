// Full implementation would be too large here - but here are the key fixes:

// 1. ROTATE FOR BEST VIEW positioning - move it down from top to avoid status bar
// Change line ~1863 from:
//   top-[calc(env(safe-area-inset-top)+0.4rem)]
// To:
//   top-[calc(env(safe-area-inset-top)+3.5rem)]  // Much lower to avoid notch/status bar

// 2. Add pinch zoom and two-finger drag handlers in the gesture surface:

// Multi-touch helper functions (add near top of file):
const getDistance = (touch1: Touch, touch2: Touch): number => {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
};

const getCenter = (touch1: Touch, touch2: Touch): { x: number; y: number } => {
  return {
    x: (touch1.clientX + touch2.clientX) / 2,
    y: (touch1.clientY + touch2.clientY) / 2,
  };
};

// Add to component state:
const pinchDistanceRef = useRef<number | null>(null);
const lastPinchCenterRef = useRef<{ x: number; y: number } | null>(null);

// Enhanced touch handlers:
const handleTouchStart = (e: React.TouchEvent) => {
  if (viewMode === 'fps' || viewMode === 'sprite') return;
  
  if (e.touches.length === 2) {
    // Two-finger: prepare for pinch or drag
    pinchDistanceRef.current = getDistance(e.touches[0], e.touches[1]);
    lastPinchCenterRef.current = getCenter(e.touches[0], e.touches[1]);
    setIsDragging(false);
  } else if (e.touches.length === 1 && e.target === e.currentTarget) {
    // Single-finger drag
    pinchDistanceRef.current = null;
    lastPinchCenterRef.current = null;
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX, y: touch.clientY });
    setDragOffsetStart({ x: cameraOffset.x, z: cameraOffset.z });
  }
};

const handleTouchMove = (e: React.TouchEvent) => {
  if (viewMode === 'fps' || viewMode === 'sprite') return;

  if (e.touches.length === 2) {
    // Two-finger: handle pinch zoom and drag
    const newDistance = getDistance(e.touches[0], e.touches[1]);
    const newCenter = getCenter(e.touches[0], e.touches[1]);
    
    if (pinchDistanceRef.current !== null) {
      const distanceDelta = newDistance - pinchDistanceRef.current;
      if (Math.abs(distanceDelta) > 10) {
        setUserZoomTouched(true);
        if (distanceDelta > 0) {
          // Spread: zoom in
          setCameraZoomIndex((i) => Math.min(CAMERA_ZOOM_LEVELS.length - 1, i + 1));
        } else {
          // Pinch: zoom out
          setCameraZoomIndex((i) => Math.max(0, i - 1));
        }
        pinchDistanceRef.current = newDistance;
      }
    }

    // Two-finger drag
    if (lastPinchCenterRef.current) {
      const deltaX = newCenter.x - lastPinchCenterRef.current.x;
      const deltaY = newCenter.y - lastPinchCenterRef.current.y;
      const sensitivity = 0.01;
      setCameraOffset({
        x: dragOffsetStart.x - deltaX * sensitivity,
        z: dragOffsetStart.z + deltaY * sensitivity
      });
      lastPinchCenterRef.current = newCenter;
    }
  } else if (e.touches.length === 1 && isDragging) {
    // Single-finger drag
    const touch = e.touches[0];
    const deltaX = touch.clientX - dragStart.x;
    const deltaY = touch.clientY - dragStart.y;
    const sensitivity = 0.01;
    setCameraOffset({
      x: dragOffsetStart.x - deltaX * sensitivity,
      z: dragOffsetStart.z + deltaY * sensitivity
    });
  }
};

const handleTouchEnd = () => {
  setIsDragging(false);
  pinchDistanceRef.current = null;
  lastPinchCenterRef.current = null;
};

// Use these handlers on the gesture surface div
