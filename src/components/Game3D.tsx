import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useRef } from 'react';

interface Game3DProps {
  grid: number[][];
  playerPos: { x: number; y: number };
  cavePos: { x: number; y: number };
  selectedArrow?: { x: number; y: number } | null;
  cameraOffset?: { x: number; z: number };
  viewMode?: '2d' | '3d';
  onArrowClick?: (x: number, y: number) => void;
  onCancelSelection?: () => void;
}

// Wall (Non-breakable Brown Rock) - low profile with X marker (unwalkable)
const FireWall = ({ position }: { position: [number, number, number] }) => {
  return (
    <group position={position}>
      {/* Low-profile tile cap */}
      <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.98, 0.2, 0.98]} />
        <meshStandardMaterial color="#a67c52" roughness={0.8} metalness={0.1} />
      </mesh>

      {/* X marker to indicate blocked/unwalkable */}
      <mesh position={[0, 0.12, 0]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[0.96, 0.02, 0.08]} />
        <meshStandardMaterial color="#5a3b22" emissive="#2b1c11" emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[0, -Math.PI / 4, 0]}>
        <boxGeometry args={[0.96, 0.02, 0.08]} />
        <meshStandardMaterial color="#5a3b22" emissive="#2b1c11" emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
};

// Stone - lower profile
const Stone = ({ position }: { position: [number, number, number] }) => {
  return (
    <mesh position={[position[0], 0.25, position[2]]}>
      <dodecahedronGeometry args={[0.45, 0]} />
      <meshStandardMaterial color="#6b4423" roughness={0.9} metalness={0.1} />
    </mesh>
  );
};

// Breakable Rock - lower profile but distinct color
const BreakableRock = ({ position }: { position: [number, number, number] }) => {
  return (
    <mesh position={[position[0], 0.28, position[2]]}>
      <dodecahedronGeometry args={[0.48, 0]} />
      <meshStandardMaterial
        color="#4a9eff"
        emissive="#2b5a99"
        emissiveIntensity={0.3}
        roughness={0.6}
        metalness={0.3}
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
  onClick
}: {
  position: [number, number, number];
  direction: number;
  isSelected?: boolean;
  hasSelection?: boolean;
  onClick?: (e: any) => void;
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
          color="#8B7355"
          roughness={0.7}
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
  onClick
}: {
  position: [number, number, number];
  direction: 11 | 12;
  isSelected?: boolean;
  hasSelection?: boolean;
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
          color="#8B7355"
          roughness={0.7}
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
          color="#FF6B6B"
          emissive="#FF4444"
          emissiveIntensity={0.6}
          roughness={0.3}
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

// Omnidirectional arrow tile (all 4 directions)
const OmnidirectionalArrowTile = ({
  position,
  isSelected,
  hasSelection,
  onClick
}: {
  position: [number, number, number];
  isSelected?: boolean;
  hasSelection?: boolean;
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
          color="#8B7355"
          roughness={0.7}
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
          color="#FF6B6B"
          emissive="#FF4444"
          emissiveIntensity={0.6}
          roughness={0.3}
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
          color="#FF6B6B"
          emissive="#FF4444"
          emissiveIntensity={0.6}
          roughness={0.3}
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
          color="#FF6B6B"
          emissive="#FF4444"
          emissiveIntensity={0.6}
          roughness={0.3}
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

// Cave entrance - detailed
const Cave = ({ position }: { position: [number, number, number] }) => {
  return (
    <group position={position}>
      {/* Base platform */}
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.6, 0.15, 32]} />
        <meshStandardMaterial
          color="#4a3322"
          roughness={0.9}
        />
      </mesh>

      {/* Main cave structure */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.4, 32]} />
        <meshStandardMaterial
          color="#2d5016"
          emissive="#4a7c23"
          emissiveIntensity={0.4}
          roughness={0.7}
        />
      </mesh>

      {/* Decorative rocks around entrance */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const angle = (i / 6) * Math.PI * 2;
        const x = Math.cos(angle) * 0.45;
        const z = Math.sin(angle) * 0.45;
        return (
          <mesh key={i} position={[x, 0.1, z]} castShadow>
            <dodecahedronGeometry args={[0.1 + Math.random() * 0.05, 0]} />
            <meshStandardMaterial color="#5a4833" roughness={0.95} />
          </mesh>
        );
      })}

      {/* Glow effects */}
      <pointLight position={[0, 0.5, 0]} intensity={1.5} color="#6ab82e" distance={4} />
      <pointLight position={[0, 0.2, 0]} intensity={0.8} color="#4a7c23" distance={2} />

      {/* Particles effect ring */}
      <mesh position={[0, 0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.45, 32]} />
        <meshStandardMaterial
          color="#6ab82e"
          emissive="#6ab82e"
          emissiveIntensity={0.6}
          transparent
          opacity={0.4}
        />
      </mesh>
    </group>
  );
};

// Player (Detailed Green Dinosaur) with smooth movement
const Player = ({ position }: { position: [number, number, number] }) => {
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
      <mesh position={[0, 0.35, 0]}>
        <capsuleGeometry args={[0.22, 0.5, 12, 20]} />
        <meshStandardMaterial
          color="#2d5016"
          roughness={0.7}
          metalness={0.1}
        />
      </mesh>

      {/* Head - larger and more detailed */}
      <mesh position={[0, 0.85, 0.15]}>
        <sphereGeometry args={[0.28, 20, 20]} />
        <meshStandardMaterial
          color="#3a6b1f"
          roughness={0.6}
        />
      </mesh>

      {/* Snout */}
      <mesh position={[0, 0.8, 0.35]}>
        <boxGeometry args={[0.15, 0.12, 0.2]} />
        <meshStandardMaterial color="#325918" />
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
const FloorTile = ({ position }: { position: [number, number, number] }) => {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial color="#c9a876" roughness={0.8} />
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

    // Only follow if map is larger than view (with some margin)
    const shouldFollowX = gridWidth > viewWidth * 0.7;
    const shouldFollowZ = gridHeight > viewHeight * 0.7;

    // Apply camera offset for manual panning
    const panOffsetX = cameraOffset?.x || 0;
    const panOffsetZ = cameraOffset?.z || 0;

    if (shouldFollowX || shouldFollowZ) {
      const playerX = playerPos.x + offsetX;
      const playerZ = playerPos.y + offsetZ;

      // Smooth camera follow with constraints + manual offset
      const targetX = (shouldFollowX ? playerX : 0) + panOffsetX;
      const targetZ = (shouldFollowZ ? playerZ : 0) + panOffsetZ;

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

export const Game3D = ({ grid, playerPos, cavePos, selectedArrow, cameraOffset, viewMode = '3d', onArrowClick, onCancelSelection }: Game3DProps) => {
  const gridHeight = grid.length;
  const gridWidth = grid[0]?.length || 0;

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
    <div className="w-full h-full bg-gradient-to-b from-stone-900 to-stone-800 overflow-hidden touch-none relative">
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

        {/* Lighting */}
        <ambientLight intensity={0.3} />
        <directionalLight
          position={[10, 15, 10]}
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <pointLight position={[-5, 5, -5]} intensity={0.5} color="#ff6600" />

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
                {/* Only render floor for non-void cells */}
                {cell !== 5 && (cell === 4 ? <WaterTile position={pos} /> : <FloorTile position={pos} />)}
                {cell === 1 && <FireWall position={[pos[0], 0.5, pos[2]]} />}
                {cell === 2 && <Stone position={[pos[0], 0.4, pos[2]]} />}
                {cell === 6 && <BreakableRock position={[pos[0], 0.4, pos[2]]} />}
                {isArrowTile && (
                  <group>
                    <ArrowTile
                      position={[pos[0], 0, pos[2]]}
                      direction={cell}
                      isSelected={selectedArrow?.x === x && selectedArrow?.y === y}
                      hasSelection={hasSelection}
                      onClick={(e) => {
                        e.stopPropagation();
                        onArrowClick?.(x, y);
                      }}
                    />
                    {/* Show player on top of arrow when riding */}
                    {isPlayer && (
                      <Player position={[pos[0], 0.25, pos[2]]} />
                    )}
                  </group>
                )}
                {isBidirectionalArrow && (
                  <group>
                    <BidirectionalArrowTile
                      position={[pos[0], 0, pos[2]]}
                      isSelected={selectedArrow?.x === x && selectedArrow?.y === y}
                      hasSelection={hasSelection}
                      onClick={(e) => {
                        e.stopPropagation();
                        onArrowClick?.(x, y);
                      }}
                      direction={cell as 11 | 12}
                    />
                    {/* Show player on top of arrow when riding */}
                    {isPlayer && (
                      <Player position={[pos[0], 0.25, pos[2]]} />
                    )}
                  </group>
                )}
                {isOmnidirectionalArrow && (
                  <group>
                    <OmnidirectionalArrowTile
                      position={[pos[0], 0, pos[2]]}
                      isSelected={selectedArrow?.x === x && selectedArrow?.y === y}
                      hasSelection={hasSelection}
                      onClick={(e) => {
                        e.stopPropagation();
                        onArrowClick?.(x, y);
                      }}
                    />
                    {/* Show player on top of arrow when riding */}
                    {isPlayer && (
                      <Player position={[pos[0], 0.25, pos[2]]} />
                    )}
                  </group>
                )}
                {isCave && <Cave position={[pos[0], 0.15, pos[2]]} />}
                {/* Show player on land (not on arrow) */}
                {isPlayer && !isArrowTile && !isBidirectionalArrow && !isOmnidirectionalArrow && <Player position={[pos[0], 0, pos[2]]} />}
              </group>
            );
          })
        )}

        {/* Ground plane - lighter for better visibility */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]} receiveShadow>
          <planeGeometry args={[gridWidth + 10, gridHeight + 10]} />
          <meshStandardMaterial color="#3a3a3a" emissive="#1a1a1a" />
        </mesh>
      </Canvas>
    </div>
  );
};
