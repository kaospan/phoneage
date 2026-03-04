import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { themes, type ColorTheme } from '@/data/levels';
import { isArrowCell } from '@/game/arrows';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader';

interface Game3DProps {
  grid: number[][];
  cavePos: { x: number; y: number };
  selectedArrow?: { x: number; y: number } | null;
  selectorPos?: { x: number; y: number } | null;
  cameraOffset?: { x: number; z: number };
  viewMode?: '2d' | '3d';
  theme?: ColorTheme;
  players: Array<{ id: string; pos: { x: number; y: number }; color: string; isLocal?: boolean }>;
  localPlayerId?: string;
  onArrowClick?: (x: number, y: number) => void;
  onCancelSelection?: () => void;
  onPlayerClick?: () => void;
  playerFlashCount?: number;
}


// Directional Arrow Block - raft platform
const ArrowTile = ({
  position,
  direction,
  isSelected,
  hasSelection,
  color,
  onClick,
  noiseMap
}: {
  position: [number, number, number];
  direction: number;
  isSelected?: boolean;
  hasSelection?: boolean;
  color: string;
  onClick?: (e: any) => void;
  noiseMap?: THREE.Texture | null;
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
          roughnessMap={noiseMap ?? undefined}
          bumpMap={noiseMap ?? undefined}
          bumpScale={0.03}
          envMapIntensity={0.5}
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
          metalness={0.2}
          envMapIntensity={0.6}
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
  onClick,
  noiseMap
}: {
  position: [number, number, number];
  direction: 11 | 12;
  isSelected?: boolean;
  hasSelection?: boolean;
  color: string;
  onClick?: (e: any) => void;
  noiseMap?: THREE.Texture | null;
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
          roughnessMap={noiseMap ?? undefined}
          bumpMap={noiseMap ?? undefined}
          bumpScale={0.03}
          envMapIntensity={0.5}
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
          envMapIntensity={0.6}
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
          envMapIntensity={0.6}
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
  onClick,
  noiseMap
}: {
  position: [number, number, number];
  isSelected?: boolean;
  hasSelection?: boolean;
  color: string;
  onClick?: (e: any) => void;
  noiseMap?: THREE.Texture | null;
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
          roughnessMap={noiseMap ?? undefined}
          bumpMap={noiseMap ?? undefined}
          bumpScale={0.03}
          envMapIntensity={0.5}
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
          envMapIntensity={0.6}
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
          envMapIntensity={0.6}
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
          envMapIntensity={0.6}
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
          envMapIntensity={0.6}
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
const Cave = ({
  position,
  color,
  noiseMap
}: {
  position: [number, number, number];
  color: string;
  noiseMap?: THREE.Texture | null;
}) => {
  return (
    <group position={position}>
      {/* Base platform */}
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.6, 0.15, 32]} />
        <meshStandardMaterial
          color={color}
          roughness={0.8}
          metalness={0.1}
          roughnessMap={noiseMap ?? undefined}
          bumpMap={noiseMap ?? undefined}
          bumpScale={0.04}
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
          roughnessMap={noiseMap ?? undefined}
          bumpMap={noiseMap ?? undefined}
          bumpScale={0.05}
          envMapIntensity={0.35}
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
              roughnessMap={noiseMap ?? undefined}
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
const Player = ({
  position,
  color,
  onClick,
  showFlash
}: {
  position: [number, number, number];
  color: string;
  onClick?: () => void;
  showFlash?: boolean;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const leftEyeRef = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);
  const targetPos = useRef(new THREE.Vector3(...position));
  const lastTapTimeRef = useRef<number>(0);
  const blinkTimerRef = useRef(0);

  const palette = useMemo(() => {
    const base = new THREE.Color(color).lerp(new THREE.Color('#27d36b'), 0.65);
    return {
      base,
      belly: base.clone().lerp(new THREE.Color('#b7ff9a'), 0.55),
      dark: base.clone().multiplyScalar(0.65),
      spike: new THREE.Color('#1f6b3a'),
      stripe: base.clone().multiplyScalar(0.8),
      highlight: base.clone().lerp(new THREE.Color('#eaffd6'), 0.5),
    };
  }, [color]);

  useEffect(() => {
    targetPos.current.set(...position);
  }, [position]);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      // Smooth interpolation to target position
      groupRef.current.position.lerp(targetPos.current, 0.3);
    }

    const t = clock.getElapsedTime();
    const bob = Math.sin(t * 4) * 0.03;
    const sway = Math.sin(t * 2.2) * 0.12;
    const tailSwing = Math.sin(t * 3.2) * 0.35;
    const headNod = Math.sin(t * 2.4) * 0.18;

    if (torsoRef.current) {
      torsoRef.current.position.y = 0.05 + bob;
      torsoRef.current.rotation.z = sway * 0.15;
    }
    if (tailRef.current) {
      tailRef.current.rotation.y = tailSwing;
      tailRef.current.rotation.x = -0.1 + Math.sin(t * 2.8) * 0.05;
    }
    if (headRef.current) {
      headRef.current.rotation.x = -0.1 + headNod * 0.4;
      headRef.current.rotation.y = sway * 0.4;
    }

    // Blink logic
    blinkTimerRef.current += 0.016;
    const blinkPhase = Math.sin(t * 1.8 + Math.sin(t * 0.3));
    const blink = blinkPhase > 0.92 ? 0.15 : 1;
    if (leftEyeRef.current) leftEyeRef.current.scale.y = blink;
    if (rightEyeRef.current) rightEyeRef.current.scale.y = blink;
  });

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTimeRef.current;

    // Detect double-tap/double-click (within 300ms)
    if (timeSinceLastTap < 300) {
      onClick?.();
    }

    lastTapTimeRef.current = now;
  };

  return (
    <group ref={groupRef} position={position} onPointerDown={handlePointerDown}>
      {/* Yellow flash highlight when showFlash is true */}
      {showFlash && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.4, 0.55, 32]} />
          <meshBasicMaterial color="#FFD700" transparent opacity={0.8} />
        </mesh>
      )}
      <group ref={torsoRef} position={[0, 0, 0]}>
        {/* Body core */}
        <mesh position={[0, 0.34, 0]} castShadow>
          <capsuleGeometry args={[0.26, 0.55, 14, 24]} />
          <meshPhysicalMaterial
            color={palette.base}
            roughness={0.45}
            metalness={0.08}
            clearcoat={0.25}
            clearcoatRoughness={0.2}
          />
        </mesh>
        {/* Rim shell */}
        <mesh position={[0, 0.34, 0]} scale={[1.06, 1.06, 1.06]}>
          <capsuleGeometry args={[0.26, 0.55, 12, 20]} />
          <meshBasicMaterial
            color="#a6ffb6"
            transparent
            opacity={0.18}
            side={THREE.BackSide}
          />
        </mesh>

        {/* Belly */}
        <mesh position={[0, 0.26, 0.09]} castShadow>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshStandardMaterial color={palette.belly} roughness={0.6} />
        </mesh>

        {/* Shoulder plates */}
        {[-0.22, 0.22].map((x, idx) => (
          <mesh key={`shoulder-${idx}`} position={[x, 0.43, 0.02]} castShadow>
            <sphereGeometry args={[0.14, 12, 12]} />
            <meshStandardMaterial color={palette.highlight} roughness={0.4} />
          </mesh>
        ))}

        {/* Arms */}
        {[-0.25, 0.25].map((x, idx) => (
          <group key={`arm-${idx}`} position={[x, 0.22, 0.2]} rotation={[0.2, idx === 0 ? 0.3 : -0.3, 0]}>
            <mesh castShadow>
              <capsuleGeometry args={[0.06, 0.2, 8, 12]} />
              <meshStandardMaterial color={palette.dark} roughness={0.7} />
            </mesh>
            <mesh position={[0, -0.14, 0.05]} castShadow>
              <coneGeometry args={[0.05, 0.12, 6]} />
              <meshStandardMaterial color={palette.spike} />
            </mesh>
          </group>
        ))}

        {/* Legs */}
        {[-0.16, 0.16].map((x, idx) => (
          <group key={`leg-${idx}`} position={[x, 0.08, -0.05]} rotation={[0.1, 0, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.1, 0.12, 0.28, 10]} />
              <meshStandardMaterial color={palette.dark} roughness={0.8} />
            </mesh>
            <mesh position={[0, -0.16, 0.08]} castShadow>
              <boxGeometry args={[0.18, 0.08, 0.24]} />
              <meshStandardMaterial color={palette.spike} roughness={0.5} />
            </mesh>
          </group>
        ))}

        {/* Back spikes */}
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={`spike-${i}`} position={[0, 0.62 - i * 0.12, -0.12 - i * 0.1]}>
            <coneGeometry args={[0.08 - i * 0.008, 0.22, 6]} />
            <meshStandardMaterial color={palette.spike} roughness={0.6} />
          </mesh>
        ))}
      </group>

      {/* Tail */}
      <group ref={tailRef} position={[0, 0.24, -0.45]} rotation={[0.2, 0, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={`tail-${i}`} position={[0, 0, -i * 0.2]} castShadow>
            <coneGeometry args={[0.14 - i * 0.03, 0.28, 8]} />
            <meshStandardMaterial color={palette.dark} roughness={0.7} />
          </mesh>
        ))}
        <mesh position={[0, 0.02, -0.6]} castShadow>
          <coneGeometry args={[0.05, 0.2, 8]} />
          <meshStandardMaterial color={palette.spike} />
        </mesh>
      </group>

      {/* Head */}
      <group ref={headRef} position={[0, 0.85, 0.18]}>
        <mesh castShadow>
          <sphereGeometry args={[0.3, 22, 22]} />
          <meshPhysicalMaterial
            color={palette.base}
            roughness={0.4}
            metalness={0.1}
            clearcoat={0.2}
          />
        </mesh>
        <mesh scale={[1.08, 1.08, 1.08]}>
          <sphereGeometry args={[0.3, 18, 18]} />
          <meshBasicMaterial
            color="#baffc7"
            transparent
            opacity={0.16}
            side={THREE.BackSide}
          />
        </mesh>
        <mesh position={[0, -0.05, 0.22]} castShadow>
          <boxGeometry args={[0.2, 0.12, 0.28]} />
          <meshStandardMaterial color={palette.highlight} roughness={0.5} />
        </mesh>
        {/* Jaw */}
        <mesh position={[0, -0.12, 0.26]} castShadow>
          <boxGeometry args={[0.22, 0.08, 0.26]} />
          <meshStandardMaterial color={palette.belly} roughness={0.6} />
        </mesh>
        {/* Nostrils */}
        {[-0.05, 0.05].map((x, idx) => (
          <mesh key={`nostril-${idx}`} position={[x, -0.02, 0.36]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        ))}
        {/* Eyes */}
        <mesh ref={leftEyeRef} position={[0.12, 0.06, 0.26]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color="#f5fffa" emissive="#b6ffd1" emissiveIntensity={0.3} />
        </mesh>
        <mesh ref={rightEyeRef} position={[-0.12, 0.06, 0.26]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color="#f5fffa" emissive="#b6ffd1" emissiveIntensity={0.3} />
        </mesh>
        {/* Pupils */}
        {[-0.12, 0.12].map((x, idx) => (
          <mesh key={`pupil-${idx}`} position={[x, 0.06, 0.3]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshStandardMaterial color="#111111" />
          </mesh>
        ))}
      </group>

      {/* Ambient glow */}
      <pointLight position={[0.1, 0.6, 0.1]} intensity={0.7} color="#7dff9b" distance={2.8} />
    </group>
  );
};


const InstancedMeshSet = ({
  positions,
  geometry,
  material,
  castShadow = false,
  receiveShadow = true,
  rotation,
  scale
}: {
  positions: Array<[number, number, number]>;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
  rotation?: THREE.Euler;
  scale?: THREE.Vector3;
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tempObject = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    positions.forEach((pos, index) => {
      tempObject.position.set(pos[0], pos[1], pos[2]);
      if (rotation) tempObject.rotation.copy(rotation);
      if (scale) tempObject.scale.copy(scale);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(index, tempObject.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions, rotation, scale, tempObject]);

  if (positions.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, positions.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
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
  cavePos,
  selectedArrow,
  selectorPos,
  cameraOffset,
  viewMode = '3d',
  theme = 'default',
  players,
  localPlayerId,
  onArrowClick,
  onCancelSelection,
  onPlayerClick,
  playerFlashCount = 0
}: Game3DProps) => {
  const gridHeight = grid.length;
  const gridWidth = grid[0]?.length || 0;

  // Get theme colors
  const themeColors = themes[theme];

  // Center the grid
  const offsetX = -gridWidth / 2;
  const offsetZ = -gridHeight / 2;

  const hasSelection = selectedArrow !== null && selectedArrow !== undefined;
  const focusPlayer = players.find((p) => p.id === localPlayerId) ?? players[0];
  const focusPlayerPos = focusPlayer?.pos ?? { x: 0, y: 0 };

  // Camera settings based on view mode
  const is2D = viewMode === '2d';
  // Make 3D view more top-down and clearer
  const initialCameraY = is2D ? 24 : 18;
  const initialCameraZ = is2D ? 0.5 : 6;
  const fov = is2D ? 42 : 50;

  const noiseTexture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const imageData = ctx.createImageData(size, size);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const value = 90 + Math.random() * 80;
      imageData.data[i] = value;
      imageData.data[i + 1] = value;
      imageData.data[i + 2] = value;
      imageData.data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(6, 6);
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, []);

  const environmentMap = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const makeFace = (top: string, bottom: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) return canvas;
      const gradient = ctx.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, top);
      gradient.addColorStop(1, bottom);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
      return canvas;
    };
    const faces = [
      makeFace('#1c2a3a', '#0f172a'),
      makeFace('#1c2a3a', '#0f172a'),
      makeFace('#243b55', '#0f172a'),
      makeFace('#0f172a', '#05070f'),
      makeFace('#1c2a3a', '#0f172a'),
      makeFace('#1c2a3a', '#0f172a')
    ];
    const cube = new THREE.CubeTexture(faces);
    cube.needsUpdate = true;
    cube.colorSpace = THREE.SRGBColorSpace;
    return cube;
  }, []);

  const tileData = useMemo(() => {
    const floor: Array<[number, number, number]> = [];
    const water: Array<[number, number, number]> = [];
    const wallBase: Array<[number, number, number]> = [];
    const wallBars: Array<[number, number, number]> = [];
    const stone: Array<[number, number, number]> = [];
    const breakable: Array<[number, number, number]> = [];
    const arrows: Array<{ x: number; y: number; cell: number }> = [];

    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < grid[y].length; x += 1) {
        const cell = grid[y][x];
        if (cell === 5) continue;
        const pos: [number, number, number] = [x + offsetX, 0, y + offsetZ];
        if (cell === 4) {
          water.push(pos);
        } else {
          floor.push(pos);
        }
        if (cell === 1) {
          wallBase.push([pos[0], 0.1, pos[2]]);
          wallBars.push([pos[0], 0.12, pos[2]]);
        }
        if (cell === 2) stone.push([pos[0], 0.25, pos[2]]);
        if (cell === 6) breakable.push([pos[0], 0.28, pos[2]]);
        if (isArrowCell(cell) || cell === 11 || cell === 12 || cell === 13) {
          arrows.push({ x, y, cell });
        }
      }
    }

    return { floor, water, wallBase, wallBars, stone, breakable, arrows };
  }, [grid, offsetX, offsetZ]);

  const floorGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1, 8, 8), []);
  const waterGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1, 8, 8), []);
  const wallGeometry = useMemo(() => new THREE.BoxGeometry(0.98, 0.2, 0.98), []);
  const wallBarGeometry = useMemo(() => new THREE.BoxGeometry(0.96, 0.02, 0.08), []);
  const stoneGeometry = useMemo(() => new THREE.DodecahedronGeometry(0.45, 1), []);
  const breakableGeometry = useMemo(() => new THREE.DodecahedronGeometry(0.48, 1), []);
  const planeRotation = useMemo(() => new THREE.Euler(-Math.PI / 2, 0, 0), []);
  const wallBarRotA = useMemo(() => new THREE.Euler(0, Math.PI / 4, 0), []);
  const wallBarRotB = useMemo(() => new THREE.Euler(0, -Math.PI / 4, 0), []);

  const floorMaterial = useMemo(() => new THREE.MeshStandardMaterial(), []);
  const waterMaterial = useMemo(() => new THREE.MeshStandardMaterial(), []);
  const wallMaterial = useMemo(() => new THREE.MeshStandardMaterial(), []);
  const wallBarMaterial = useMemo(() => new THREE.MeshStandardMaterial(), []);
  const stoneMaterial = useMemo(() => new THREE.MeshStandardMaterial(), []);
  const breakableMaterial = useMemo(() => new THREE.MeshStandardMaterial(), []);

  useEffect(() => {
    floorMaterial.color = new THREE.Color(themeColors.floor);
    floorMaterial.roughness = 0.7;
    floorMaterial.emissive = new THREE.Color(themeColors.floor);
    floorMaterial.emissiveIntensity = 0.05;
    floorMaterial.roughnessMap = noiseTexture ?? null;
    floorMaterial.bumpMap = noiseTexture ?? null;
    floorMaterial.bumpScale = 0.02;
    floorMaterial.needsUpdate = true;

    waterMaterial.color = new THREE.Color('#1e90ff');
    waterMaterial.transparent = true;
    waterMaterial.opacity = 0.82;
    waterMaterial.roughness = 0.08;
    waterMaterial.metalness = 0.6;
    waterMaterial.emissive = new THREE.Color('#2aa9ff');
    waterMaterial.emissiveIntensity = 0.2;
    waterMaterial.roughnessMap = noiseTexture ?? null;
    waterMaterial.needsUpdate = true;

    wallMaterial.color = new THREE.Color(themeColors.wall);
    wallMaterial.roughness = 0.7;
    wallMaterial.metalness = 0.2;
    wallMaterial.emissive = new THREE.Color(themeColors.wall);
    wallMaterial.emissiveIntensity = 0.1;
    wallMaterial.roughnessMap = noiseTexture ?? null;
    wallMaterial.bumpMap = noiseTexture ?? null;
    wallMaterial.bumpScale = 0.03;
    wallMaterial.envMapIntensity = 0.4;
    wallMaterial.needsUpdate = true;

    wallBarMaterial.color = new THREE.Color('#000000');
    wallBarMaterial.emissive = new THREE.Color('#ff0000');
    wallBarMaterial.emissiveIntensity = 0.3;
    wallBarMaterial.roughness = 0.8;
    wallBarMaterial.needsUpdate = true;

    stoneMaterial.color = new THREE.Color(themeColors.stone);
    stoneMaterial.roughness = 0.8;
    stoneMaterial.metalness = 0.2;
    stoneMaterial.emissive = new THREE.Color(themeColors.stone);
    stoneMaterial.emissiveIntensity = 0.05;
    stoneMaterial.roughnessMap = noiseTexture ?? null;
    stoneMaterial.bumpMap = noiseTexture ?? null;
    stoneMaterial.bumpScale = 0.08;
    stoneMaterial.envMapIntensity = 0.45;
    stoneMaterial.needsUpdate = true;

    breakableMaterial.color = new THREE.Color(themeColors.breakable);
    breakableMaterial.emissive = new THREE.Color(themeColors.breakable);
    breakableMaterial.emissiveIntensity = 0.4;
    breakableMaterial.roughness = 0.5;
    breakableMaterial.metalness = 0.4;
    breakableMaterial.transparent = true;
    breakableMaterial.opacity = 0.95;
    breakableMaterial.roughnessMap = noiseTexture ?? null;
    breakableMaterial.bumpMap = noiseTexture ?? null;
    breakableMaterial.bumpScale = 0.1;
    breakableMaterial.envMapIntensity = 0.6;
    breakableMaterial.needsUpdate = true;
  }, [themeColors, noiseTexture, floorMaterial, waterMaterial, wallMaterial, wallBarMaterial, stoneMaterial, breakableMaterial]);

  return (
    <div className="w-full h-full bg-gradient-to-b from-blue-950 via-slate-900 to-blue-950 overflow-hidden touch-none relative z-30">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{
          antialias: true,
          physicallyCorrectLights: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          outputColorSpace: THREE.SRGBColorSpace
        }}
        onClick={() => onCancelSelection?.()}
      >
        <EnvironmentSetup envMap={environmentMap} />
        <PostProcessing />
        <WaterAnimator material={waterMaterial} />
        <PerspectiveCamera
          makeDefault
          position={[0, initialCameraY, initialCameraZ]}
          fov={fov}
          key={`camera-${viewMode}-${initialCameraY}-${initialCameraZ}`}
        />
        <CameraController
          playerPos={focusPlayerPos}
          offsetX={offsetX}
          offsetZ={offsetZ}
          gridWidth={gridWidth}
          gridHeight={gridHeight}
          cameraOffset={cameraOffset}
          viewMode={viewMode}
        />

        {/* Scene mood */}
        <fog attach="fog" args={['#0a141f', 10, 40]} />

        {/* Enhanced Lighting with theme-based ambient */}
        <ambientLight intensity={0.35} color={themeColors.ambient} />
        <hemisphereLight intensity={0.35} color="#dff6ff" groundColor="#1b2a3a" />
        <directionalLight
          position={[10, 15, 10]}
          intensity={1.35}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.0008}
          shadow-radius={3}
          color="#ffffff"
        />
        <directionalLight position={[-12, 8, -6]} intensity={0.6} color="#9cc7ff" />
        <pointLight position={[-5, 5, -5]} intensity={0.7} color={themeColors.wall} />
        <pointLight position={[5, 6, 5]} intensity={0.5} color={themeColors.floor} />
        <pointLight position={[0, 8, 0]} intensity={0.25} color="#ffffff" />
        <directionalLight position={[-6, 6, 14]} intensity={0.45} color="#9dffcc" />

        {/* Animated moonlit sky background */}
        <AnimatedSkyBackground gridWidth={gridWidth} gridHeight={gridHeight} />

        {/* Grid (Instanced) */}
        <InstancedMeshSet
          positions={tileData.floor}
          geometry={floorGeometry}
          material={floorMaterial}
          rotation={planeRotation}
          receiveShadow
        />
        <InstancedMeshSet
          positions={tileData.water}
          geometry={waterGeometry}
          material={waterMaterial}
          rotation={planeRotation}
          receiveShadow
        />
        <InstancedMeshSet
          positions={tileData.wallBase}
          geometry={wallGeometry}
          material={wallMaterial}
          castShadow
          receiveShadow
        />
        <InstancedMeshSet
          positions={tileData.wallBars}
          geometry={wallBarGeometry}
          material={wallBarMaterial}
          castShadow
          receiveShadow
          rotation={wallBarRotA}
        />
        <InstancedMeshSet
          positions={tileData.wallBars}
          geometry={wallBarGeometry}
          material={wallBarMaterial}
          castShadow
          receiveShadow
          rotation={wallBarRotB}
        />
        <InstancedMeshSet
          positions={tileData.stone}
          geometry={stoneGeometry}
          material={stoneMaterial}
          castShadow
          receiveShadow
        />
        <InstancedMeshSet
          positions={tileData.breakable}
          geometry={breakableGeometry}
          material={breakableMaterial}
          castShadow
          receiveShadow
        />

        {/* Arrows (interactive) */}
        {tileData.arrows.map((arrow) => {
          const pos: [number, number, number] = [arrow.x + offsetX, 0, arrow.y + offsetZ];
          const isArrowTile = arrow.cell >= 7 && arrow.cell <= 10;
          const isBidirectionalArrow = arrow.cell === 11 || arrow.cell === 12;
          const isOmnidirectionalArrow = arrow.cell === 13;

          if (isArrowTile) {
            return (
              <ArrowTile
                key={`arrow-${arrow.x}-${arrow.y}`}
                position={[pos[0], 0, pos[2]]}
                direction={arrow.cell}
                isSelected={selectedArrow?.x === arrow.x && selectedArrow?.y === arrow.y}
                hasSelection={hasSelection}
                color={themeColors.arrow}
                noiseMap={noiseTexture}
                onClick={(e) => {
                  e.stopPropagation();
                  onArrowClick?.(arrow.x, arrow.y);
                }}
              />
            );
          }
          if (isBidirectionalArrow) {
            return (
              <BidirectionalArrowTile
                key={`arrow-${arrow.x}-${arrow.y}`}
                position={[pos[0], 0, pos[2]]}
                isSelected={selectedArrow?.x === arrow.x && selectedArrow?.y === arrow.y}
                hasSelection={hasSelection}
                color={themeColors.arrow}
                noiseMap={noiseTexture}
                onClick={(e) => {
                  e.stopPropagation();
                  onArrowClick?.(arrow.x, arrow.y);
                }}
                direction={arrow.cell as 11 | 12}
              />
            );
          }
          if (isOmnidirectionalArrow) {
            return (
              <OmnidirectionalArrowTile
                key={`arrow-${arrow.x}-${arrow.y}`}
                position={[pos[0], 0, pos[2]]}
                isSelected={selectedArrow?.x === arrow.x && selectedArrow?.y === arrow.y}
                hasSelection={hasSelection}
                color={themeColors.arrow}
                noiseMap={noiseTexture}
                onClick={(e) => {
                  e.stopPropagation();
                  onArrowClick?.(arrow.x, arrow.y);
                }}
              />
            );
          }
          return null;
        })}

        {/* Cave */}
        <Cave position={[cavePos.x + offsetX, 0.05, cavePos.y + offsetZ]} color={themeColors.cave} noiseMap={noiseTexture} />

        {/* Players */}
        {players.map((player) => {
          const cell = grid[player.pos.y]?.[player.pos.x];
          const isOnArrow = cell !== undefined && isArrowCell(cell);
          const height = isOnArrow ? 0.25 : 0;
          return (
            <Player
              key={player.id}
              position={[player.pos.x + offsetX, height, player.pos.y + offsetZ]}
              color={player.color}
              onClick={player.isLocal ? onPlayerClick : undefined}
              showFlash={player.isLocal && playerFlashCount > 0 && (playerFlashCount % 2 === 0)}
            />
          );
        })}

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

const EnvironmentSetup = ({ envMap }: { envMap: THREE.CubeTexture | null }) => {
  const { scene } = useThree();

  useEffect(() => {
    if (!envMap) return;
    const previous = scene.environment;
    scene.environment = envMap;
    return () => {
      scene.environment = previous;
    };
  }, [envMap, scene]);

  return null;
};

const PostProcessing = () => {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);

  useEffect(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));

    const bloom = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.6, 0.8, 0.85);
    composer.addPass(bloom);

    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms.offset.value = 1.08;
    vignette.uniforms.darkness.value = 1.15;
    composer.addPass(vignette);

    composerRef.current = composer;
    return () => {
      composerRef.current = null;
    };
  }, [gl, scene, camera, size.width, size.height]);

  useEffect(() => {
    if (composerRef.current) {
      composerRef.current.setSize(size.width, size.height);
    }
  }, [size.width, size.height]);

  useFrame(() => {
    if (composerRef.current) {
      composerRef.current.render();
    }
  }, 1);

  return null;
};

const WaterAnimator = ({ material }: { material: THREE.MeshStandardMaterial }) => {
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    material.emissiveIntensity = 0.18 + Math.sin(t * 2.2) * 0.06;
    material.opacity = 0.78 + Math.sin(t * 1.6) * 0.04;
  });

  return null;
};
