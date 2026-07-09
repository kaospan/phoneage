#REPLACE_SECTION_START:123:124
const EMPTY_KEYS: KeyInventory = { red: 0, green: 0 };
const DEFAULT_BONUS_TIME_SECONDS = 50;
const pinchDistanceBetweenTouches = (touches: Pick<Touch, "clientX" | "clientY">[]) => {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
};
#REPLACE_SECTION_END

#REPLACE_SECTION_START:256:260
  // Dragging state for panning the view
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragOffsetStart, setDragOffsetStart] = useState({ x: 0, z: 0 });
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomIndexRef = useRef<number | null>(null);
#REPLACE_SECTION_END

#REPLACE_SECTION_START:1628:1656
    // Touch handlers for mobile dragging
    const handleTouchStart = (e: React.TouchEvent) => {
      if (viewMode === 'fps' || viewMode === 'sprite') return;
      if (e.touches.length === 2) {
        const distance = pinchDistanceBetweenTouches([e.touches[0], e.touches[1]]);
        if (distance > 0) {
          pinchStartDistanceRef.current = distance;
          pinchStartZoomIndexRef.current = cameraZoomIndex;
          setIsDragging(false);
        }
        return;
      }
      if (e.touches.length === 1 && e.target === e.currentTarget) {
        const touch = e.touches[0];
        setIsDragging(true);
        setDragStart({ x: touch.clientX, y: touch.clientY });
        setDragOffsetStart({ x: cameraOffset.x, z: cameraOffset.z });
      }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
      if (viewMode === 'fps' || viewMode === 'sprite') return;
      if (e.touches.length === 2) {
        const startDistance = pinchStartDistanceRef.current;
        const startZoomIndex = pinchStartZoomIndexRef.current;
        if (startDistance && startZoomIndex != null) {
          const nextDistance = pinchDistanceBetweenTouches([e.touches[0], e.touches[1]]);
          if (nextDistance > 0) {
            const pinchScale = nextDistance / startDistance;
            const zoomDelta = Math.round((pinchScale - 1) * 10);
            const nextZoomIndex = Math.max(
              0,
              Math.min(CAMERA_ZOOM_LEVELS.length - 1, startZoomIndex + zoomDelta)
            );
            if (nextZoomIndex !== cameraZoomIndex) {
              setUserZoomTouched(true);
              setCameraZoomIndex(nextZoomIndex);
            }
          }
        }
        setIsDragging(false);
        return;
      }
      if (isDragging && e.touches.length === 1) {
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

    const handleTouchEnd = (e: React.TouchEvent) => {
      if (e.touches.length < 2) {
        pinchStartDistanceRef.current = null;
        pinchStartZoomIndexRef.current = null;
      }
      setIsDragging(false);
    };
#REPLACE_SECTION_END