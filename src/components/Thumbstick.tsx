import { useState, useRef, useEffect, useCallback } from "react";

interface ThumbstickProps {
    onMove: (dx: number, dy: number) => void;
    disabled?: boolean;
}

export const Thumbstick = ({ onMove, disabled }: ThumbstickProps) => {
    const [active, setActive] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const baseRef = useRef<HTMLDivElement>(null);
    const lastMoveRef = useRef<string>("");
    const moveIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const maxDistance = 40; // Maximum distance the stick can move from center

    const handleStart = useCallback((clientX: number, clientY: number) => {
        if (disabled) return;
        setActive(true);
    }, [disabled]);

    const handleMove = useCallback((clientX: number, clientY: number) => {
        if (!active || disabled || !baseRef.current) return;

        const rect = baseRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let deltaX = clientX - centerX;
        let deltaY = clientY - centerY;

        // Limit the distance
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance > maxDistance) {
            deltaX = (deltaX / distance) * maxDistance;
            deltaY = (deltaY / distance) * maxDistance;
        }

        setPosition({ x: deltaX, y: deltaY });

        // Determine direction and trigger movement
        const threshold = 20; // Minimum distance to trigger movement
        if (distance > threshold) {
            const angle = Math.atan2(deltaY, deltaX);
            const degrees = (angle * 180) / Math.PI;

            let direction = "";
            if (degrees >= -45 && degrees < 45) {
                direction = "right";
            } else if (degrees >= 45 && degrees < 135) {
                direction = "down";
            } else if (degrees >= -135 && degrees < -45) {
                direction = "up";
            } else {
                direction = "left";
            }

            // Only trigger if direction changed
            if (direction !== lastMoveRef.current) {
                lastMoveRef.current = direction;

                // Clear existing interval
                if (moveIntervalRef.current) {
                    clearInterval(moveIntervalRef.current);
                }

                // Make the first move immediately
                switch (direction) {
                    case "up":
                        onMove(0, -1);
                        break;
                    case "down":
                        onMove(0, 1);
                        break;
                    case "left":
                        onMove(-1, 0);
                        break;
                    case "right":
                        onMove(1, 0);
                        break;
                }
            }
        }
    }, [active, disabled, onMove]);

    const handleEnd = useCallback(() => {
        setActive(false);
        setPosition({ x: 0, y: 0 });
        lastMoveRef.current = "";
        if (moveIntervalRef.current) {
            clearInterval(moveIntervalRef.current);
            moveIntervalRef.current = null;
        }
    }, []);

    // Touch events
    useEffect(() => {
        const handleTouchStart = (e: TouchEvent) => {
            e.preventDefault();
            const touch = e.touches[0];
            handleStart(touch.clientX, touch.clientY);
        };

        const handleTouchMove = (e: TouchEvent) => {
            e.preventDefault();
            const touch = e.touches[0];
            handleMove(touch.clientX, touch.clientY);
        };

        const handleTouchEnd = (e: TouchEvent) => {
            e.preventDefault();
            handleEnd();
        };

        const base = baseRef.current;
        if (base) {
            base.addEventListener("touchstart", handleTouchStart, { passive: false });
            document.addEventListener("touchmove", handleTouchMove, { passive: false });
            document.addEventListener("touchend", handleTouchEnd, { passive: false });

            return () => {
                base.removeEventListener("touchstart", handleTouchStart);
                document.removeEventListener("touchmove", handleTouchMove);
                document.removeEventListener("touchend", handleTouchEnd);
            };
        }
    }, [handleStart, handleMove, handleEnd]);

    // Mouse events
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            handleMove(e.clientX, e.clientY);
        };

        const handleMouseUp = () => {
            handleEnd();
        };

        if (active) {
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);

            return () => {
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
            };
        }
    }, [active, handleMove, handleEnd]);

    return (
        <div className="fixed bottom-6 left-6 z-50 md:hidden">
            <div
                ref={baseRef}
                className="relative w-32 h-32 rounded-full bg-muted/50 backdrop-blur border-2 border-border shadow-lg"
                onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
                style={{ touchAction: 'none' }}
            >
                {/* Center dot */}
                <div className="absolute top-1/2 left-1/2 w-2 h-2 -mt-1 -ml-1 rounded-full bg-muted-foreground/30" />

                {/* Directional indicators */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 text-muted-foreground/50 text-xs">↑</div>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-muted-foreground/50 text-xs">↓</div>
                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 text-xs">←</div>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 text-xs">→</div>

                {/* Thumbstick */}
                <div
                    className="absolute top-1/2 left-1/2 w-12 h-12 rounded-full bg-primary shadow-lg transition-transform"
                    style={{
                        transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
                        opacity: disabled ? 0.5 : 1,
                    }}
                >
                    <div className="w-full h-full rounded-full bg-primary/80 backdrop-blur" />
                </div>
            </div>
        </div>
    );
};
