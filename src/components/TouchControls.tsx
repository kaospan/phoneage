import { useEffect, useRef } from "react";

interface TouchControlsProps {
    onMove: (dx: number, dy: number) => void;
    disabled?: boolean;
}

export const TouchControls = ({ onMove, disabled }: TouchControlsProps) => {
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const handleTouchStart = (e: TouchEvent) => {
            if (disabled) return;
            const touch = e.touches[0];
            touchStartRef.current = {
                x: touch.clientX,
                y: touch.clientY,
            };
        };

        const handleTouchEnd = (e: TouchEvent) => {
            if (disabled || !touchStartRef.current) return;

            const touch = e.changedTouches[0];
            const deltaX = touch.clientX - touchStartRef.current.x;
            const deltaY = touch.clientY - touchStartRef.current.y;

            // Minimum swipe distance to register
            const minSwipeDistance = 30;

            // Calculate total distance moved
            const totalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            // Only trigger movement if it's a clear swipe (moved enough distance)
            // This allows taps (little to no movement) to pass through to 3D objects
            if (totalDistance >= minSwipeDistance) {
                // Determine direction based on larger delta
                if (Math.abs(deltaX) > Math.abs(deltaY)) {
                    // Horizontal swipe
                    onMove(deltaX > 0 ? 1 : -1, 0);
                } else {
                    // Vertical swipe
                    onMove(0, deltaY > 0 ? 1 : -1);
                }
            }

            touchStartRef.current = null;
        };

        // Attach to the 3D canvas container
        const canvas = document.querySelector('canvas');
        if (canvas) {
            canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
            canvas.addEventListener('touchend', handleTouchEnd, { passive: true });

            return () => {
                canvas.removeEventListener('touchstart', handleTouchStart);
                canvas.removeEventListener('touchend', handleTouchEnd);
            };
        }
    }, [onMove, disabled]);

    return null;
};
