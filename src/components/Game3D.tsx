import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useRef, useMemo, useState } from 'react';
import { themes, type ColorTheme, type ThemeColors } from '@/data/levels';

interface Game3DProps {
  grid: number[][];
  playerPos: { x: number; y: number };
  cavePos: { x: number; y: number };
  selectedArrow?: { x: number; y: number } | null;
  selectorPos?: { x: number; y: number } | null;
  cameraOffset?: { x: number; z: number };
  viewMode?: '2d' | '3d';
  theme?: ColorTheme;
  onArrowClick?: (x: number, y: number) => void;
  onCancelSelection?: () => void;
  isFlashing?: boolean;
}

// Wall (Non-breakable Brown Rock) - low profile with X marker (unwalkable)
const FireWall = ({ position, color }: { position: [number, number, number]; color: string }) => {
  return (
    <group position={position}>
      {/* Low-profile tile cap with gradient effect */}
      <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.98, 0.2, 0.98]} />
        <meshStandardMaterial
          color={color}
          roughness={0.7}
          metalness={0.2}
          emissive={color}
          emissiveIntensity={0.1}
        />
      </mesh>

      {/* X marker to indicate blocked/unwalkable */}
      <mesh position={[0, 0.12, 0]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[0.96, 0.02, 0.08]} />
        <meshStandardMaterial
          color="#000000"
          emissive="#ff0000"
          emissiveIntensity={0.3}
          roughness={0.8}
        />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[0, -Math.PI / 4, 0]}>
        <boxGeometry args={[0.96, 0.02, 0.08]} />
        <meshStandardMaterial
          color="#000000"
          emissive="#ff0000"
          emissiveIntensity={0.3}
          roughness={0.8}
        />
      </mesh>
    </group>
  );
};

// Stone - enhanced with better colors
const Stone = ({ position, color }: { position: [number, number, number]; color: string }) => {
  return (
    <mesh position={[position[0], 0.25, position[2]]} castShadow receiveShadow>
      <dodecahedronGeometry args={[0.45, 1]} />
      <meshStandardMaterial
        color={color}
        roughness={0.8}
        metalness={0.2}
        emissive={color}
        emissiveIntensity={0.05}
      />
    </mesh>
  );
};

// Breakable Rock - enhanced with glowing effect
const BreakableRock = ({ position, color }: { position: [number, number, number]; color: string }) => {
  return (
    <mesh position={[position[0], 0.28, position[2]]} castShadow receiveShadow>
      <dodecahedronGeometry args={[0.48, 1]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.4}
        roughness={0.5}
        metalness={0.4}
        transparent
        opacity={0.95}
      />
    </mesh>
  );
};

// Directional Arrow Block - raft platform
const ArrowTile = ({
  position,
  direction,
  isSelected,
  hasSelection,
  color,
  onClick,
  isFlashing
}: {
  position: [number, number, number];
  direction: number;
  isSelected?: boolean;
  hasSelection?: boolean;
  color: string;
  onClick?: (e: any) => void;
  isFlashing?: boolean;
}) => {
  const touchStartTimeRef = useRef<number | null>(null);
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapTimeRef = useRef<number>(0);

  const rotations: { [key: number]: number } = {
    7: 0,           // up - points in -Z direction
    8: -Math.PI / 2, // right - points in +X direction
    9: Math.PI,     // down - points in +Z direction
    10: Math.PI / 2 // left - points in -X direction
  };

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    touchStartTimeRef.current = Date.now();

    // Set timer for 1 second to select arrow (only if nothing selected or this is not the selected one)
    if (!hasSelection || !isSelected) {
      touchTimerRef.current = setTimeout(() => {
        onClick?.(e);
      }, 1000);
    }
  };

  const handlePointerUp = (e: any) => {
    e.stopPropagation();

    // Clear the timer
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }

    const now = Date.now();
    const timeSinceLastTap = now - lastTapTimeRef.current;
    const touchDuration = touchStartTimeRef.current ? now - touchStartTimeRef.current : 1000;

    // If it was a quick tap (less than 1 second)
    if (touchDuration < 1000) {
      // If another arrow is already selected, switch to this one with single tap
      if (hasSelection && !isSelected) {
        onClick?.(e);
        lastTapTimeRef.current = 0;
      }
      // Double tap detected (within 300ms) - for selecting when nothing is selected
      else if (timeSinceLastTap < 300) {
        onClick?.(e);
        lastTapTimeRef.current = 0;
      }
      // Single tap on selected arrow - deselect
      else if (isSelected) {
        onClick?.(e);
      }
      // First tap when nothing selected - record time for potential double tap
      else if (!hasSelection) {
        lastTapTimeRef.current = now;
      }
    }

    touchStartTimeRef.current = null;
  };

  const handleDoubleClick = (e: any) => {
    e.stopPropagation();
    onClick?.(e);
  };

  return (
    <group position={position}>
      {/* Platform base - raft */}
      <mesh
        position={[0, 0.15, 0]}
        rotation={[0, rotations[direction] || 0, 0]}
        castShadow
        receiveShadow
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <boxGeometry args={[0.9, 0.15, 0.9]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 0.5 : 0.2}
          roughness={0.6}
          metalness={0.3}
        />
      </mesh>

      {/* Large arrow indicator pointing in direction */}
      <mesh
        position={[0, 0.35, 0]}
        rotation={[-Math.PI / 2, 0, rotations[direction] || 0]}
        castShadow
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <coneGeometry args={[0.35, 0.6, 3]} />
        <meshStandardMaterial
          color="#FF6B6B"
          emissive="#FF4444"
          emissiveIntensity={0.6}
          roughness={0.3}
        />
      </mesh>

      {/* Yellow hollow square border on top face when selected */}
      {isSelected && (
        <group position={[0, 0.24, 0]}>
          {/* Front edge */}
          <mesh position={[0, 0, 0.5]}>
            <boxGeometry args={[1.05, 0.04, 0.04]} />
            <meshBasicMaterial color="#FFD700" />
          </mesh>
          {/* Back edge */}
          <mesh position={[0, 0, -0.5]}>
            <boxGeometry args={[1.05, 0.04, 0.04]} />
            <meshBasicMaterial color="#FFD700" />
          </mesh>
          {/* Left edge */}
          <mesh position={[-0.5, 0, 0]}>
            <boxGeometry args={[0.04, 0.04, 1.05]} />
            <meshBasicMaterial color="#FFD700" />
          </mesh>
          {/* Right edge */}
          <mesh position={[0.5, 0, 0]}>
            <boxGeometry args={[0.04, 0.04, 1.05]} />
            <meshBasicMaterial color="#FFD700" />
          </mesh>
        </group>
      )}
    </group>
  );
};

// Bidirectional arrow tile
const BidirectionalArrowTile = ({
  position,
  direction,
  isSelected,
  hasSelection,
  color,
  onClick
}: {
  position: [number, number, number];
  direction: 11 | 12;
  isSelected?: boolean;
  hasSelection?: boolean;
  color: string;
  onClick?: (e: any) => void;
}) => {
  const touchStartTimeRef = useRef<number | null>(null);
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const isVertical = direction === 11;

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    touchStartTimeRef.current = Date.now();

    // Set timer for 1 second to select arrow (only if nothing selected or this is not the selected one)
    if (!hasSelection || !isSelected) {
      touchTimerRef.current = setTimeout(() => {
        onClick?.(e);
      }, 1000);
    }
  };

  const handlePointerUp = (e: any) => {
    e.stopPropagation();

    // Clear the timer
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }

    const now = Date.now();
    const timeSinceLastTap = now - lastTapTimeRef.current;
    const touchDuration = touchStartTimeRef.current ? now - touchStartTimeRef.current : 1000;

    // If it was a quick tap (less than 1 second)
    if (touchDuration < 1000) {
      // If another arrow is already selected, switch to this one with single tap
      if (hasSelection && !isSelected) {
        onClick?.(e);
        lastTapTimeRef.current = 0;
      }
      // Double tap detected (within 300ms) - for selecting when nothing is selected
      else if (timeSinceLastTap < 300) {
        onClick?.(e);
        lastTapTimeRef.current = 0;
      }
      // Single tap on selected arrow - deselect
      else if (isSelected) {
        onClick?.(e);
      }
      // First tap when nothing selected - record time for potential double tap
      else if (!hasSelection) {
        lastTapTimeRef.current = now;
      }
    }

    touchStartTimeRef.current = null;
  };

  const handleDoubleClick = (e: any) => {
    e.stopPropagation();
    onClick?.(e);
  };

  return (
    <group position={position}>
      {/* Platform base - raft */}
      <mesh
        position={[0, 0.15, 0]}
        castShadow
        receiveShadow
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <boxGeometry args={[0.9, 0.15, 0.9]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 0.5 : 0.2}
          roughness={0.6}
          metalness={0.3}
        />
      </mesh>

      {/* First arrow */}
      <mesh
        position={isVertical ? [0, 0.35, -0.25] : [-0.25, 0.35, 0]}
        rotation={[-Math.PI / 2, 0, isVertical ? 0 : Math.PI / 2]}
        castShadow
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <coneGeometry args={[0.25, 0.45, 3]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.7}
          roughness={0.3}
          metalness={0.2}
        />
      </mesh>

      {/* Second arrow */}
      <mesh
        position={isVertical ? [0, 0.35, 0.25] : [0.25, 0.35, 0]}
        rotation={[-Math.PI / 2, 0, isVertical ? Math.PI : -Math.PI / 2]}
        castShadow
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <coneGeometry args={[0.25, 0.45, 3]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.7}
          roughness={0.3}
          metalness={0.2}
        />
      </mesh>

      {/* Yellow hollow square border on top face when selected */}
      {isSelected && (
        <group position={[0, 0.24, 0]}>
          {/* Front edge */}
          <mesh position={[0, 0, 0.5]}>
            <boxGeometry args={[1.05, 0.04, 0.04]} />
            <meshBasicMaterial color="#FFD700" />
          </mesh>
          {/* Back edge */}
          <mesh position={[0, 0, -0.5]}>
            <boxGeometry args={[1.05, 0.04, 0.04]} />
            <meshBasicMaterial color="#FFD700" />
          </mesh>
          {/* Left edge */}
          <mesh position={[-0.5, 0, 0]}>
            <boxGeometry args={[0.04, 0.04, 1.05]} />
            <meshBasicMaterial color="#FFD700" />
          </mesh>
          {/* Right edge */}
          <mesh position={[0.5, 0, 0]}>
            <boxGeometry args={[0.04, 0.04, 1.05]} />
            <meshBasicMaterial color="#FFD700" />
          </mesh>
        </group>
      )}
    </group>
  );
};

// Omnidirectional arrow tile (all 4 directions)
const OmnidirectionalArrowTile = ({
  position,
  isSelected,
  hasSelection,
  color,
  onClick
}: {
  position: [number, number, number];
  isSelected?: boolean;
  hasSelection?: boolean;
  color: string;
  onClick?: (e: any) => void;
}) => {
  const touchStartTimeRef = useRef<number | null>(null);
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapTimeRef = useRef<number>(0);

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    touchStartTimeRef.current = Date.now();

    // Set timer for 1 second to select arrow (only if nothing selected or this is not the selected one)
    if (!hasSelection || !isSelected) {
      touchTimerRef.current = setTimeout(() => {
        onClick?.(e);
      }, 1000);
    }
  };

  const handlePointerUp = (e: any) => {
    e.stopPropagation();

    // Clear the timer
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }

    const now = Date.now();
    const timeSinceLastTap = now - lastTapTimeRef.current;
    const touchDuration = touchStartTimeRef.current ? now - touchStartTimeRef.current : 1000;

    // If it was a quick tap (less than 1 second)
    if (touchDuration < 1000) {
      // If another arrow is already selected, switch to this one with single tap
      if (hasSelection && !isSelected) {
        onClick?.(e);
        lastTapTimeRef.current = 0;
      }
      // Double tap detected (within 300ms) - for selecting when nothing is selected
      else if (timeSinceLastTap < 300) {
        onClick?.(e);
        lastTapTimeRef.current = 0;
      }
      // Single tap on selected arrow - deselect
      else if (isSelected) {
        onClick?.(e);
      }
      // First tap when nothing selected - record time for potential double tap
      else if (!hasSelection) {
        lastTapTimeRef.current = now;
      }
    }

    touchStartTimeRef.current = null;
  };

  const handleDoubleClick = (e: any) => {
    e.stopPropagation();
    onClick?.(e);
  };

  return (
    <group position={position}>
      {/* Platform base - raft */}
      <mesh
        position={[0, 0.15, 0]}
        castShadow
        receiveShadow
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <boxGeometry args={[0.9, 0.15, 0.9]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 0.5 : 0.2}
          roughness={0.6}
          metalness={0.3}
        />
      </mesh>

      {/* Four arrows pointing in all directions */}
      {/* Up arrow */}
      <mesh
        position={[0, 0.35, -0.25]}
        rotation={[-Math.PI / 2, 0, 0]}
        castShadow
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <coneGeometry args={[0.2, 0.35, 3]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.7}
          roughness={0.3}
          metalness={0.2}
        />
      </mesh>

      {/* Right arrow */}
      <mesh
        position={[0.25, 0.35, 0]}
        rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
        castShadow
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <coneGeometry args={[0.2, 0.35, 3]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.7}
          roughness={0.3}
          metalness={0.2}
        />
      </mesh>

      {/* Down arrow */}
      <mesh
        position={[0, 0.35, 0.25]}
        rotation={[-Math.PI / 2, 0, Math.PI]}
        castShadow
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <coneGeometry args={[0.2, 0.35, 3]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.7}
          roughness={0.3}
          metalness={0.2}
        />
      </mesh>

      {/* Left arrow */}
      <mesh
        position={[-0.25, 0.35, 0]}
        rotation={[-Math.PI / 2, 0, Math.PI / 2]}
        castShadow
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <coneGeometry args={[0.2, 0.35, 3]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.7}
          roughness={0.3}
          metalness={0.2}
        />
      </mesh>

      {/* Yellow hollow square border on top face when selected */}
      {isSelected && (
        <group position={[0, 0.24, 0]}>
          {/* Front edge */}
          <mesh position={[0, 0, 0.5]}>
            <boxGeometry args={[1.05, 0.04, 0.04]} />
            <meshBasicMaterial color="#FFD700" />
          </mesh>
          {/* Back edge */}
          <mesh position={[0, 0, -0.5]}>
            <boxGeometry args={[1.05, 0.04, 0.04]} />
            <meshBasicMaterial color="#FFD700" />
          </mesh>
          {/* Left edge */}
          <mesh position={[-0.5, 0, 0]}>
            <boxGeometry args={[0.04, 0.04, 1.05]} />
            <meshBasicMaterial color="#FFD700" />
          </mesh>
          {/* Right edge */}
          <mesh position={[0.5, 0, 0]}>
            <boxGeometry args={[0.04, 0.04, 1.05]} />
            <meshBasicMaterial color="#FFD700" />
          </mesh>
        </group>
      )}
    </group>
  );
};

// Cave entrance - detailed
const Cave = ({ position, color }: { position: [number, number, number]; color: string }) => {
  return (
    <group position={position}>
      {/* Base platform */}
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.6, 0.15, 32]} />
        <meshStandardMaterial
          color={color}
          roughness={0.8}
          metalness={0.1}
        />
      </mesh>

      {/* Main cave structure */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.4, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          roughness={0.6}
        />
      </mesh>

      {/* Decorative rocks around entrance */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const angle = (i / 6) * Math.PI * 2;
        const x = Math.cos(angle) * 0.45;
        const z = Math.sin(angle) * 0.45;
        return (
          <mesh key={i} position={[x, 0.1, z]} castShadow>
            <dodecahedronGeometry args={[0.1 + Math.random() * 0.05, 1]} />
            <meshStandardMaterial
              color={color}
              roughness={0.9}
              emissive={color}
              emissiveIntensity={0.2}
            />
          </mesh>
        );
      })}

      {/* Glow effects */}
      <pointLight position={[0, 0.5, 0]} intensity={2} color={color} distance={4} />
      <pointLight position={[0, 0.2, 0]} intensity={1.2} color={color} distance={2} />

      {/* Particles effect ring */}
      <mesh position={[0, 0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.45, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
          transparent
          opacity={0.5}
        />
      </mesh>
    </group>
  );
};

// Player (Detailed Green Dinosaur) with smooth movement
const Player = ({ position, color }: { position: [number, number, number]; color: string }) => {
  const groupRef = useRef<THREE.Group>(null);
  const targetPos = useRef(new THREE.Vector3(...position));

  useEffect(() => {
    targetPos.current.set(...position);
  }, [position]);

  useFrame(() => {
    if (groupRef.current) {
      // Smooth interpolation to target position
      groupRef.current.position.lerp(targetPos.current, 0.3);
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Body - more detailed */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.5, 12, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          roughness={0.6}
          metalness={0.2}
        />
      </mesh>

      {/* Head - larger and more detailed */}
      <mesh position={[0, 0.85, 0.15]} castShadow>
        <sphereGeometry args={[0.28, 20, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.2}
          roughness={0.5}
        />
      </mesh>

      {/* Snout */}
      <mesh position={[0, 0.8, 0.35]} castShadow>
        <boxGeometry args={[0.15, 0.12, 0.2]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.1}
        />
      </mesh>

      {/* Eyes */}
      <mesh position={[0.12, 0.9, 0.3]}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffff00" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[-0.12, 0.9, 0.3]}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffff00" emissiveIntensity={0.2} />
      </mesh>

      {/* Spikes on back */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, 0.65 - i * 0.15, -0.15 - i * 0.08]} rotation={[0, 0, 0]}>
          <coneGeometry args={[0.08, 0.2, 4]} />
          <meshStandardMaterial color="#4a7c23" />
        </mesh>
      ))}

      {/* Tail - longer and more detailed */}
      <mesh position={[0, 0.25, -0.4]} rotation={[0.6, 0, 0]}>
        <coneGeometry args={[0.12, 0.6, 8]} />
        <meshStandardMaterial color="#2d5016" />
      </mesh>

      {/* Legs */}
      <mesh position={[0.15, 0.1, 0.15]}>
        <cylinderGeometry args={[0.08, 0.06, 0.25, 8]} />
        <meshStandardMaterial color="#264014" />
      </mesh>
      <mesh position={[-0.15, 0.1, 0.15]}>
        <cylinderGeometry args={[0.08, 0.06, 0.25, 8]} />
        <meshStandardMaterial color="#264014" />
      </mesh>

      {/* Glow effect */}
      <pointLight position={[0, 0.6, 0]} intensity={0.5} color="#6ab82e" distance={2.5} />
    </group>
  );
};

// Floor tile
const FloorTile = ({ position, color }: { position: [number, number, number]; color: string }) => {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        color={color}
        roughness={0.7}
        emissive={color}
        emissiveIntensity={0.05}
      />
    </mesh>
  );
};

// Water tile - improved with wave effect
const WaterTile = ({ position }: { position: [number, number, number] }) => {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial
          color="#1e90ff"
          transparent
          opacity={0.8}
          roughness={0.1}
          metalness={0.5}
          emissive="#0066cc"
          emissiveIntensity={0.2}
        />
      </mesh>
      {/* Subtle glow */}
      <pointLight position={[0, 0.2, 0]} intensity={0.3} color="#1e90ff" distance={1.5} />
    </group>
  );
};

// Animated moonlit sky background - floats across entire scene
const AnimatedSkyBackground = ({ gridWidth, gridHeight }: { gridWidth: number; gridHeight: number }) => {
  const cloudGroupRef = useRef<THREE.Group>(null);
  const cloudRefs = useRef<THREE.Group[]>([]);
  const backgroundGroupRef = useRef<THREE.Group>(null);

  useFrame(({ clock, camera }) => {
    const time = clock.getElapsedTime();

    // Keep background centered on camera position (only X and Z, not Y)
    if (backgroundGroupRef.current) {
      backgroundGroupRef.current.position.x = camera.position.x;
      backgroundGroupRef.current.position.z = camera.position.z;
    }

    // Animate clouds horizontally across the screen
    cloudRefs.current.forEach((cloudGroup, i) => {
      if (cloudGroup) {
        // Horizontal drift - each cloud moves at different speeds
        const speed = 0.5 + (i * 0.2);
        const xOffset = (time * speed) % (gridWidth + 20);
        cloudGroup.position.x = xOffset - 10 - gridWidth / 2;

        // Subtle vertical bob
        cloudGroup.position.y = -1.5 + Math.sin(time * 0.3 + i * 2) * 0.15;

        // Slight opacity variation
        cloudGroup.children.forEach((mesh) => {
          if (mesh instanceof THREE.Mesh && mesh.material instanceof THREE.MeshStandardMaterial) {
            mesh.material.opacity = 0.35 + Math.sin(time * 0.2 + i) * 0.1;
          }
        });
      }
    });
  });

  // Generate clouds once with useMemo to prevent regeneration on every render
  const cloudData = useMemo(() => {
    return Array.from({ length: 8 }).map((_, i) => ({
      id: i,
      startX: (Math.random() - 0.5) * 30,
      startZ: (Math.random() - 0.5) * 30,
      scale: 0.6 + Math.random() * 0.6,
      spheres: [
        { pos: [0, 0, 0] as [number, number, number], size: 1.5, opacity: 0.4 },
        { pos: [1.2 + Math.random() * 0.3, 0.1, 0] as [number, number, number], size: 1.2 + Math.random() * 0.3, opacity: 0.35 },
        { pos: [-1.1 - Math.random() * 0.2, 0, 0.2] as [number, number, number], size: 1.3 + Math.random() * 0.2, opacity: 0.38 },
        { pos: [0.5, 0.3, 0.3] as [number, number, number], size: 1.0, opacity: 0.33 }
      ]
    }));
  }, []); // Empty dependency array - generate only once

  // Create multiple clouds at different starting positions
  const clouds = cloudData.map((cloud) => {
    return (
      <group
        key={`cloud-${cloud.id}`}
        ref={(el) => {
          if (el) cloudRefs.current[cloud.id] = el;
        }}
        position={[cloud.startX, -1.5, cloud.startZ]}
        scale={cloud.scale}
      >
        {/* Cloud made of overlapping spheres */}
        {cloud.spheres.map((sphere, idx) => (
          <mesh key={idx} position={sphere.pos}>
            <sphereGeometry args={[sphere.size, 12, 12]} />
            <meshStandardMaterial
              color="#d4e5f5"
              emissive="#4a6278"
              emissiveIntensity={0.15}
              transparent
              opacity={sphere.opacity}
              roughness={0.8}
            />
          </mesh>
        ))}
      </group>
    );
  });

  return (
    <group ref={backgroundGroupRef}>
      {/* Deep sky background plane - far below the grid */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.5, 0]}>
        <planeGeometry args={[gridWidth + 40, gridHeight + 40]} />
        <meshStandardMaterial
          color="#0a1929"
          emissive="#1a2a3a"
          emissiveIntensity={0.3}
          roughness={0.9}
        />
      </mesh>

      {/* Moonlight - positioned off to the side */}
      <pointLight
        position={[10, 3, -10]}
        intensity={2}
        color="#b8c5d6"
        distance={50}
        decay={1.5}
      />

      {/* Moon */}
      <mesh position={[10, 1, -10]}>
        <sphereGeometry args={[0.8, 16, 16]} />
        <meshStandardMaterial
          color="#f5f5f5"
          emissive="#fff8dc"
          emissiveIntensity={1.2}
          roughness={0.7}
        />
      </mesh>

      {/* Stars scattered across the sky - fixed positions relative to camera */}
      {Array.from({ length: 30 }).map((_, i) => {
        const angle = (i / 30) * Math.PI * 2;
        const radius = 15 + (i % 3) * 5;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = -1 - (i % 5) * 0.1;
        const size = 0.02 + (i % 4) * 0.01;
        return (
          <mesh key={`star-${i}`} position={[x, y, z]}>
            <sphereGeometry args={[size, 6, 6]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        );
      })}

      {/* Animated clouds */}
      <group ref={cloudGroupRef}>
        {clouds}
      </group>
    </group>
  );
};

// Camera controller component
const CameraController = ({
  playerPos,
  offsetX,
  offsetZ,
  gridWidth,
  gridHeight,
  cameraOffset,
  viewMode = '3d'
}: {
  playerPos: { x: number; y: number };
  offsetX: number;
  offsetZ: number;
  gridWidth: number;
  gridHeight: number;
  cameraOffset?: { x: number; z: number };
  viewMode?: '2d' | '3d';
}) => {
  const { camera } = useThree();
  const targetRef = useRef(new THREE.Vector3());

  useEffect(() => {
    const playerX = playerPos.x + offsetX;
    const playerZ = playerPos.y + offsetZ;
    targetRef.current.set(playerX, 0, playerZ);
  }, [playerPos, offsetX, offsetZ]);

  useFrame(() => {
    // Camera settings based on view mode
    const is2D = viewMode === '2d';
    const cameraHeight = is2D ? 24 : 18;
    const cameraDistance = is2D ? 0.5 : 6;
    const fov = is2D ? 42 : 50;

    // Calculate if the entire map fits in view at current zoom
    const fovRad = fov * (Math.PI / 180);
    const viewHeight = 2 * Math.tan(fovRad / 2) * cameraHeight;
    const perspectiveCamera = camera as THREE.PerspectiveCamera;

    // Update camera FOV if it changed
    if (Math.abs(perspectiveCamera.fov - fov) > 0.1) {
      perspectiveCamera.fov = fov;
      perspectiveCamera.updateProjectionMatrix();
    }

    const viewWidth = viewHeight * perspectiveCamera.aspect;

    // Only follow if map is larger than view (with margin for edge detection)
    // Use 0.8 threshold so camera starts following when player nears edge
    const shouldFollowX = gridWidth > viewWidth * 0.8;
    const shouldFollowZ = gridHeight > viewHeight * 0.8;

    // Apply camera offset for manual panning
    const panOffsetX = cameraOffset?.x || 0;
    const panOffsetZ = cameraOffset?.z || 0;

    if (shouldFollowX || shouldFollowZ) {
      const playerX = playerPos.x + offsetX;
      const playerZ = playerPos.y + offsetZ;

      // Define edge margins (distance from player where camera starts following)
      const edgeMarginX = viewWidth * 0.3; // Start following at 30% from edge
      const edgeMarginZ = viewHeight * 0.3;

      // Calculate map bounds
      const minX = -gridWidth / 2;
      const maxX = gridWidth / 2;
      const minZ = -gridHeight / 2;
      const maxZ = gridHeight / 2;

      // Camera target with edge clamping
      let targetX = shouldFollowX ? playerX : 0;
      let targetZ = shouldFollowZ ? playerZ : 0;

      // Clamp camera to keep edges in view
      if (shouldFollowX) {
        targetX = Math.max(minX + viewWidth / 2 - edgeMarginX, Math.min(maxX - viewWidth / 2 + edgeMarginX, targetX));
      }
      if (shouldFollowZ) {
        targetZ = Math.max(minZ + viewHeight / 2 - edgeMarginZ, Math.min(maxZ - viewHeight / 2 + edgeMarginZ, targetZ));
      }

      // Apply manual pan offset
      targetX += panOffsetX;
      targetZ += panOffsetZ;

      camera.position.lerp(
        new THREE.Vector3(targetX, cameraHeight, targetZ + cameraDistance),
        0.08
      );
      camera.lookAt(new THREE.Vector3(targetX, 0, targetZ));
    } else {
      // Center on entire map + manual offset
      camera.position.lerp(
        new THREE.Vector3(panOffsetX, cameraHeight, cameraDistance + panOffsetZ),
        0.08
      );
      camera.lookAt(new THREE.Vector3(panOffsetX, 0, panOffsetZ));
    }
  });

  return null;
};

export const Game3D = ({
  grid,
  playerPos,
  cavePos,
  selectedArrow,
  selectorPos,
  cameraOffset,
  viewMode = '3d',
  theme = 'default',
  onArrowClick,
  onCancelSelection
}: Game3DProps) => {
  const gridHeight = grid.length;
  const gridWidth = grid[0]?.length || 0;

  // Get theme colors
  const themeColors = themes[theme];

  // Center the grid
  const offsetX = -gridWidth / 2;
  const offsetZ = -gridHeight / 2;

  const hasSelection = selectedArrow !== null && selectedArrow !== undefined;

  // Camera settings based on view mode
  const is2D = viewMode === '2d';
  // Make 3D view more top-down and clearer
  const initialCameraY = is2D ? 24 : 18;
  const initialCameraZ = is2D ? 0.5 : 6;
  const fov = is2D ? 42 : 50;

  return (
    <div className="w-full h-full bg-gradient-to-b from-stone-900 to-stone-800 overflow-hidden touch-none relative z-30">
      <Canvas shadows onClick={() => onCancelSelection?.()}>
        <PerspectiveCamera
          makeDefault
          position={[0, initialCameraY, initialCameraZ]}
          fov={fov}
          key={`camera-${viewMode}-${initialCameraY}-${initialCameraZ}`}
        />
        <CameraController
          playerPos={playerPos}
          offsetX={offsetX}
          offsetZ={offsetZ}
          gridWidth={gridWidth}
          gridHeight={gridHeight}
          cameraOffset={cameraOffset}
          viewMode={viewMode}
        />

        {/* Enhanced Lighting with theme-based ambient */}
        <ambientLight intensity={0.4} color={themeColors.ambient} />
        <directionalLight
          position={[10, 15, 10]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          color="#ffffff"
        />
        <pointLight position={[-5, 5, -5]} intensity={0.6} color={themeColors.wall} />
        <pointLight position={[5, 5, 5]} intensity={0.4} color={themeColors.floor} />

        {/* Animated moonlit sky background */}
        <AnimatedSkyBackground gridWidth={gridWidth} gridHeight={gridHeight} />

        {/* Grid */}
        {grid.map((row, y) =>
          row.map((cell, x) => {
            const pos: [number, number, number] = [x + offsetX, 0, y + offsetZ];
            const isPlayer = playerPos.x === x && playerPos.y === y;
            const isCave = cavePos.x === x && cavePos.y === y;
            const isArrowTile = cell >= 7 && cell <= 10;
            const isBidirectionalArrow = cell === 11 || cell === 12;
            const isOmnidirectionalArrow = cell === 13;

            return (
              <group key={`${x}-${y}`}>
                {/* Render floor for non-void cells, void cells (5) are transparent */}
                {cell !== 5 && (
                  cell === 4 ? <WaterTile position={pos} /> : <FloorTile position={pos} color={themeColors.floor} />
                )}
                {cell === 1 && <FireWall position={[pos[0], 0.5, pos[2]]} color={themeColors.wall} />}
                {cell === 2 && <Stone position={[pos[0], 0.4, pos[2]]} color={themeColors.stone} />}
                {cell === 6 && <BreakableRock position={[pos[0], 0.4, pos[2]]} color={themeColors.breakable} />}
                {isArrowTile && (
                  <group>
                    <ArrowTile
                      position={[pos[0], 0, pos[2]]}
                      direction={cell}
                      isSelected={selectedArrow?.x === x && selectedArrow?.y === y}
                      hasSelection={hasSelection}
                      color={themeColors.arrow}
                      onClick={(e) => {
                        e.stopPropagation();
                        onArrowClick?.(x, y);
                      }}
                    />
                    {/* Show player on top of arrow when riding */}
                    {isPlayer && (
                      <Player position={[pos[0], 0.25, pos[2]]} color={themeColors.player} />
                    )}
                  </group>
                )}
                {isBidirectionalArrow && (
                  <group>
                    <BidirectionalArrowTile
                      position={[pos[0], 0, pos[2]]}
                      isSelected={selectedArrow?.x === x && selectedArrow?.y === y}
                      hasSelection={hasSelection}
                      color={themeColors.arrow}
                      onClick={(e) => {
                        e.stopPropagation();
                        onArrowClick?.(x, y);
                      }}
                      direction={cell as 11 | 12}
                    />
                    {/* Show player on top of arrow when riding */}
                    {isPlayer && (
                      <Player position={[pos[0], 0.25, pos[2]]} color={themeColors.player} />
                    )}
                  </group>
                )}
                {isOmnidirectionalArrow && (
                  <group>
                    <OmnidirectionalArrowTile
                      position={[pos[0], 0, pos[2]]}
                      isSelected={selectedArrow?.x === x && selectedArrow?.y === y}
                      hasSelection={hasSelection}
                      color={themeColors.arrow}
                      onClick={(e) => {
                        e.stopPropagation();
                        onArrowClick?.(x, y);
                      }}
                    />
                    {/* Show player on top of arrow when riding */}
                    {isPlayer && (
                      <Player position={[pos[0], 0.25, pos[2]]} color={themeColors.player} />
                    )}
                  </group>
                )}
                {isCave && <Cave position={[pos[0], 0.05, pos[2]]} color={themeColors.cave} />}
                {/* Show player at ground level when not on arrow */}
                {isPlayer && !isArrowTile && !isBidirectionalArrow && !isOmnidirectionalArrow && (
                  <Player position={[pos[0], 0, pos[2]]} color={themeColors.player} />
                )}
              </group>
            );
          })
        )}

        {/* Ground plane - lighter for better visibility */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]} receiveShadow>
          <planeGeometry args={[gridWidth + 10, gridHeight + 10]} />
          <meshStandardMaterial color="#3a3a3a" emissive="#1a1a1a" />
        </mesh>

        {/* Selector highlight (white ring) when active and not currently selecting an arrow */}
        {selectorPos && !selectedArrow && (
          <group position={[selectorPos.x + offsetX, 0.6, selectorPos.y + offsetZ]}>
            {/* Front edge */}
            <mesh position={[0, 0, 0.5]}>
              <boxGeometry args={[1.05, 0.04, 0.04]} />
              <meshBasicMaterial color="#FFFFFF" />
            </mesh>
            {/* Back edge */}
            <mesh position={[0, 0, -0.5]}>
              <boxGeometry args={[1.05, 0.04, 0.04]} />
              <meshBasicMaterial color="#FFFFFF" />
            </mesh>
            {/* Left edge */}
            <mesh position={[-0.5, 0, 0]}>
              <boxGeometry args={[0.04, 0.04, 1.05]} />
              <meshBasicMaterial color="#FFFFFF" />
            </mesh>
            {/* Right edge */}
            <mesh position={[0.5, 0, 0]}>
              <boxGeometry args={[0.04, 0.04, 1.05]} />
              <meshBasicMaterial color="#FFFFFF" />
            </mesh>
          </group>
        )}
      </Canvas>
    </div >
  );
};
