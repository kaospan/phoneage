import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { themes, type ColorTheme } from '@/data/levels';
import { isArrowCell } from '@/game/arrows';
import { createClockIconCanvas, createKeyIconCanvas, createVortexIconCanvas } from '@/lib/canvasIcons';
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
  zoomFactor?: number;
  viewMode?: '2d' | '3d' | 'fps';
  theme?: ColorTheme;
  players: Array<{ id: string; pos: { x: number; y: number }; facing: PlayerFacing; color: string; isLocal?: boolean }>;
  localPlayerId?: string;
  onArrowClick?: (x: number, y: number) => void;
  onCancelSelection?: () => void;
  onPlayerClick?: () => void;
  playerFlashCount?: number;
}

type PlayerFacing = 'up' | 'right' | 'down' | 'left';

const playerRotationByFacing: Record<PlayerFacing, number> = {
  up: Math.PI,
  right: Math.PI / 2,
  down: 0,
  left: -Math.PI / 2,
};

const worldForwardByFacing: Record<PlayerFacing, { x: number; z: number }> = {
  up: { x: 0, z: -1 },
  right: { x: 1, z: 0 },
  down: { x: 0, z: 1 },
  left: { x: -1, z: 0 },
};

const FPS_CHASE_DISTANCE = 2.6;
const FPS_LOOK_DISTANCE = 1.4;
const FPS_LOOK_HEIGHT = 0.42;
const FPS_CHASE_ANGLE_DEG = 45;
const FPS_CHASE_HEIGHT =
  FPS_LOOK_HEIGHT +
  Math.tan((FPS_CHASE_ANGLE_DEG * Math.PI) / 180) * (FPS_CHASE_DISTANCE + FPS_LOOK_DISTANCE);

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

// Unity-like critically damped smoothing (ease-in/out) with stable dt.
const smoothDampScalar = (
  current: number,
  target: number,
  currentVelocity: number,
  smoothTime: number,
  deltaTime: number,
  maxSpeed = Infinity
) => {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * deltaTime;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

  let change = current - target;
  const originalTo = target;

  const maxChange = maxSpeed * st;
  change = THREE.MathUtils.clamp(change, -maxChange, maxChange);
  target = current - change;

  const temp = (currentVelocity + omega * change) * deltaTime;
  let newVelocity = (currentVelocity - omega * temp) * exp;
  let output = target + (change + temp) * exp;

  // Prevent overshooting.
  const origMinusCurrent = originalTo - current;
  const outMinusOrig = output - originalTo;
  if (origMinusCurrent > 0 === outMinusOrig > 0) {
    output = originalTo;
    newVelocity = (output - originalTo) / Math.max(0.0001, deltaTime);
  }

  return { value: output, velocity: newVelocity };
};

const smoothDampVec3 = (
  current: THREE.Vector3,
  target: THREE.Vector3,
  velocity: THREE.Vector3,
  smoothTime: number,
  deltaTime: number,
  maxSpeed = Infinity
) => {
  const x = smoothDampScalar(current.x, target.x, velocity.x, smoothTime, deltaTime, maxSpeed);
  const y = smoothDampScalar(current.y, target.y, velocity.y, smoothTime, deltaTime, maxSpeed);
  const z = smoothDampScalar(current.z, target.z, velocity.z, smoothTime, deltaTime, maxSpeed);
  current.set(x.value, y.value, z.value);
  velocity.set(x.velocity, y.velocity, z.velocity);
};

const darkenHexColor = (hex: string, amount = 0.35) => {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return hex;

  const mix = (channel: string) => {
    const value = parseInt(channel, 16);
    const darkened = Math.max(0, Math.round(value * (1 - amount)));
    return darkened.toString(16).padStart(2, '0');
  };

  return `#${mix(normalized.slice(0, 2))}${mix(normalized.slice(2, 4))}${mix(normalized.slice(4, 6))}`;
};

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${a})`;
};

const KeyTile = ({
  position,
  glowColor,
  accentColor,
}: {
  position: [number, number, number];
  glowColor: string;
  accentColor: string;
}) => {
  const groupRef = useRef<THREE.Group | null>(null);

  const iconTexture = useMemo(() => {
    const canvas = createKeyIconCanvas(256, {
      accent: accentColor,
      glow: hexToRgba(glowColor, 0.22),
    });
    if (!canvas) return null;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 1;
    texture.needsUpdate = true;
    return texture;
  }, [accentColor, glowColor]);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const t = state.clock.getElapsedTime();
    g.position.y = position[1] + 0.04 + Math.sin(t * 2.2) * 0.02;
    g.rotation.y = t * 0.65;
  });

  return (
    <group ref={groupRef} position={position} scale={1.25}>
      {/* Top-down decal so "key" reads clearly even from high/top cameras. */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={9}>
        <circleGeometry args={[0.34, 40]} />
        <meshBasicMaterial color={glowColor} transparent opacity={0.14} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
        <planeGeometry args={[0.82, 0.82]} />
        <meshBasicMaterial
          map={iconTexture ?? undefined}
          transparent
          opacity={0.98}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.15, 0.15, 0.06, 24]} />
        <meshStandardMaterial
          color="#f5e6a8"
          emissive={glowColor}
          emissiveIntensity={0.25}
          roughness={0.28}
          metalness={0.75}
        />
      </mesh>
      <mesh position={[0, 0.42, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[0.14, 0.04, 12, 24]} />
        <meshStandardMaterial
          color="#f5e6a8"
          emissive={glowColor}
          emissiveIntensity={0.35}
          roughness={0.22}
          metalness={0.82}
        />
      </mesh>
      <mesh position={[0.12, 0.3, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <boxGeometry args={[0.28, 0.06, 0.06]} />
        <meshStandardMaterial
          color="#f5e6a8"
          emissive={glowColor}
          emissiveIntensity={0.2}
          roughness={0.22}
          metalness={0.82}
        />
      </mesh>
      <mesh position={[0.23, 0.24, 0]} castShadow>
        <boxGeometry args={[0.05, 0.12, 0.05]} />
        <meshStandardMaterial
          color="#f5e6a8"
          emissive={glowColor}
          emissiveIntensity={0.2}
          roughness={0.22}
          metalness={0.82}
        />
      </mesh>
      <mesh position={[0.28, 0.34, 0]} castShadow>
        <boxGeometry args={[0.05, 0.08, 0.05]} />
        <meshStandardMaterial
          color="#f5e6a8"
          emissive={glowColor}
          emissiveIntensity={0.2}
          roughness={0.22}
          metalness={0.82}
        />
      </mesh>

      {/* Colored gem so "red/green key" is obvious from far away */}
      <mesh position={[0, 0.56, 0]} castShadow>
        <octahedronGeometry args={[0.09, 0]} />
        <meshStandardMaterial
          color={glowColor}
          emissive={glowColor}
          emissiveIntensity={0.7}
          roughness={0.12}
          metalness={0.05}
        />
      </mesh>
    </group>
  );
};

const LockTile = ({
  position,
  color,
  glowColor,
}: {
  position: [number, number, number];
  color: string;
  glowColor: string;
}) => {
  const groupRef = useRef<THREE.Group | null>(null);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const t = state.clock.getElapsedTime();
    g.position.y = position[1] + 0.02 + Math.sin(t * 1.8) * 0.012;
  });

  return (
    <group ref={groupRef} position={position} scale={1.2}>
      {/* Lock marker: dark disc + colored ring + keyhole (distinct from key) */}
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
        <ringGeometry args={[0.3, 0.42, 40]} />
        <meshBasicMaterial color={glowColor} transparent opacity={0.85} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={9}>
        <circleGeometry args={[0.3, 40]} />
        <meshBasicMaterial color="#0b0f19" transparent opacity={0.78} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* Keyhole silhouette */}
      <mesh position={[0, 0.007, 0.06]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={11}>
        <circleGeometry args={[0.07, 20]} />
        <meshBasicMaterial color="#fff1bf" transparent opacity={0.92} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.007, -0.06]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={11}>
        <planeGeometry args={[0.11, 0.18]} />
        <meshBasicMaterial color="#fff1bf" transparent opacity={0.92} depthWrite={false} toneMapped={false} />
      </mesh>

      <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.36, 0.3, 0.18]} />
        <meshStandardMaterial
          color={color}
          emissive={glowColor}
          emissiveIntensity={0.55}
          roughness={0.32}
          metalness={0.65}
        />
      </mesh>
      <mesh position={[0, 0.39, 0]} castShadow>
        <torusGeometry args={[0.13, 0.035, 12, 24, Math.PI]} />
        <meshStandardMaterial
          color={color}
          emissive={glowColor}
          emissiveIntensity={0.5}
          roughness={0.28}
          metalness={0.72}
        />
      </mesh>
      <mesh position={[0, 0.18, 0.1]}>
        <cylinderGeometry args={[0.035, 0.035, 0.06, 16]} />
        <meshStandardMaterial
          color="#f5e6a8"
          emissive="#f5e6a8"
          emissiveIntensity={0.35}
          roughness={0.38}
          metalness={0.45}
        />
      </mesh>
    </group>
  );
};

// Bonus Time collectible (clock) - adds time to the countdown when collected.
const BonusTimeTile = ({ position }: { position: [number, number, number] }) => {
  const groupRef = useRef<THREE.Group | null>(null);
  const glow = "#ef4444";

  const iconTexture = useMemo(() => {
    const canvas = createClockIconCanvas(128, { glow: "rgba(239,68,68,0.18)" });
    if (!canvas) return null;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 1;
    texture.needsUpdate = true;
    return texture;
  }, []);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const t = state.clock.getElapsedTime();
    g.position.y = position[1] + 0.03 + Math.sin(t * 2.1) * 0.012;
    g.rotation.y = 0;
  });

  return (
    <group ref={groupRef} position={position} scale={1.18}>
      {/* Glow ring */}
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
        <ringGeometry args={[0.28, 0.42, 40]} />
        <meshBasicMaterial color={glow} transparent opacity={0.8} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={9}>
        <circleGeometry args={[0.28, 40]} />
        <meshBasicMaterial color="#0b1220" transparent opacity={0.25} depthWrite={false} toneMapped={false} />
      </mesh>

      {/* Top-down clock icon (Bonus Time) */}
      <mesh position={[0, 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={12}>
        <planeGeometry args={[0.7, 0.7]} />
        <meshBasicMaterial
          map={iconTexture ?? undefined}
          transparent
          opacity={1}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <pointLight position={[0, 0.42, 0]} intensity={0.35} color={glow} distance={2.2} />
    </group>
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
  const baseColor = darkenHexColor(color, 0.38);
  const accentColor = darkenHexColor(color, 0.12);
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
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={isSelected ? 0.4 : 0.14}
          roughness={0.55}
          metalness={0.38}
          roughnessMap={noiseMap ?? undefined}
          bumpMap={noiseMap ?? undefined}
          bumpScale={0.05}
          envMapIntensity={0.65}
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
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={0.45}
          roughness={0.24}
          metalness={0.28}
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
  const baseColor = darkenHexColor(color, 0.38);
  const accentColor = darkenHexColor(color, 0.1);
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
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={isSelected ? 0.4 : 0.14}
          roughness={0.55}
          metalness={0.38}
          roughnessMap={noiseMap ?? undefined}
          bumpMap={noiseMap ?? undefined}
          bumpScale={0.05}
          envMapIntensity={0.65}
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
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={0.5}
          roughness={0.24}
          metalness={0.28}
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
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={0.5}
          roughness={0.24}
          metalness={0.28}
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
  const baseColor = darkenHexColor(color, 0.38);
  const accentColor = darkenHexColor(color, 0.08);
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
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={isSelected ? 0.4 : 0.14}
          roughness={0.55}
          metalness={0.38}
          roughnessMap={noiseMap ?? undefined}
          bumpMap={noiseMap ?? undefined}
          bumpScale={0.05}
          envMapIntensity={0.65}
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
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={0.5}
          roughness={0.24}
          metalness={0.28}
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
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={0.5}
          roughness={0.24}
          metalness={0.28}
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
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={0.5}
          roughness={0.24}
          metalness={0.28}
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
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={0.5}
          roughness={0.24}
          metalness={0.28}
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
  noiseMap
}: {
  position: [number, number, number];
  noiseMap?: THREE.Texture | null;
}) => {
  const mossColor = "#3d8a4b";
  const rockColor = "#295235";
  const deepRockColor = "#1b3423";
  const glowColor = "#7be495";

  return (
    <group position={position}>
      {/* Mossy cave floor */}
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.68, 0.75, 0.12, 32]} />
        <meshStandardMaterial
          color={mossColor}
          emissive={rockColor}
          emissiveIntensity={0.08}
          roughness={0.9}
          metalness={0.1}
          roughnessMap={noiseMap ?? undefined}
          bumpMap={noiseMap ?? undefined}
          bumpScale={0.05}
        />
      </mesh>

      {/* Main cave body */}
      <mesh position={[0, 0.28, 0.04]} castShadow receiveShadow>
        <sphereGeometry args={[0.58, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.82]} />
        <meshStandardMaterial
          color={rockColor}
          emissive={deepRockColor}
          emissiveIntensity={0.18}
          roughness={0.78}
          roughnessMap={noiseMap ?? undefined}
          bumpMap={noiseMap ?? undefined}
          bumpScale={0.08}
          envMapIntensity={0.25}
        />
      </mesh>

      {/* Cave mouth outer rim */}
      <mesh position={[0, 0.25, 0.38]} castShadow receiveShadow>
        <torusGeometry args={[0.24, 0.11, 16, 28]} />
        <meshStandardMaterial
          color={mossColor}
          emissive={rockColor}
          emissiveIntensity={0.1}
          roughness={0.82}
          bumpMap={noiseMap ?? undefined}
          bumpScale={0.04}
        />
      </mesh>

      {/* Cave opening */}
      <mesh position={[0, 0.22, 0.44]}>
        <cylinderGeometry args={[0.17, 0.22, 0.14, 24]} />
        <meshStandardMaterial
          color="#050805"
          emissive="#000000"
          roughness={1}
          metalness={0}
        />
      </mesh>

      {/* Moss cap */}
      <mesh position={[0, 0.54, 0.02]} castShadow>
        <sphereGeometry args={[0.28, 20, 16]} />
        <meshStandardMaterial
          color="#56a765"
          emissive={mossColor}
          emissiveIntensity={0.12}
          roughness={0.95}
        />
      </mesh>

      {/* Supporting side rocks */}
      {[-1, 1].map((side) => {
        const x = side * 0.34;
        return (
          <mesh key={side} position={[x, 0.16, 0.14]} rotation={[0.15, side * 0.4, 0]} castShadow>
            <dodecahedronGeometry args={[0.2, 1]} />
            <meshStandardMaterial
              color={deepRockColor}
              roughness={0.94}
              emissive={rockColor}
              emissiveIntensity={0.08}
              roughnessMap={noiseMap ?? undefined}
            />
          </mesh>
        );
      })}

      {/* Entrance glow */}
      <pointLight position={[0, 0.38, 0.36]} intensity={1.5} color={glowColor} distance={3.5} />
      <pointLight position={[0, 0.2, 0.1]} intensity={0.7} color={mossColor} distance={2} />

      {/* Entrance marker */}
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.44, 0.56, 32]} />
        <meshStandardMaterial
          color={glowColor}
          emissive={glowColor}
          emissiveIntensity={0.45}
          transparent
          opacity={0.7}
        />
      </mesh>
    </group>
  );
};

// Non-goal start marker cave (black). Purely cosmetic, used at player start positions.
const StartCave = ({ position }: { position: [number, number, number] }) => {
  return (
    <group position={position}>
      {/* Subtle dark rim */}
      <mesh position={[0, 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.22, 0.34, 32]} />
        <meshStandardMaterial
          color="#1f2937"
          emissive="#0b1220"
          emissiveIntensity={0.45}
          roughness={0.95}
          metalness={0}
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* Hole */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.21, 28]} />
        <meshStandardMaterial
          color="#050505"
          emissive="#000000"
          roughness={1}
          metalness={0}
        />
      </mesh>
    </group>
  );
};

// Teleport pad (wormhole/vortex) - stepping on a pad teleports to its paired pad.
const TeleportTile = ({ position }: { position: [number, number, number] }) => {
  const vortexRef = useRef<THREE.Mesh | null>(null);
  const shimmerRef = useRef<THREE.Mesh | null>(null);
  const lightRef = useRef<THREE.PointLight | null>(null);

  const vortexTexture = useMemo(() => {
    const canvas = createVortexIconCanvas(256, {
      glow: "rgba(16,185,129,0.20)",
    });
    if (!canvas) return null;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 1;
    texture.needsUpdate = true;
    return texture;
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (vortexRef.current) vortexRef.current.rotation.z = t * 0.75;
    if (shimmerRef.current) shimmerRef.current.rotation.z = -t * 1.05;
    if (lightRef.current) lightRef.current.intensity = 0.38 + Math.sin(t * 2.4) * 0.06;
  });

  return (
    <group position={position}>
      {/* Vortex surface */}
      <mesh ref={vortexRef} position={[0, 0.013, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
        <circleGeometry args={[0.38, 64]} />
        <meshBasicMaterial
          map={vortexTexture ?? undefined}
          transparent
          opacity={0.98}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Shimmer sweep */}
      <mesh ref={shimmerRef} position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={11}>
        <ringGeometry args={[0.16, 0.38, 64, 1, Math.PI * 0.95, Math.PI * 0.2]} />
        <meshBasicMaterial color="#eafff5" transparent opacity={0.10} depthWrite={false} toneMapped={false} />
      </mesh>

      <pointLight ref={lightRef} position={[0, 0.28, 0]} intensity={0.38} color="#34d399" distance={2.6} />
    </group>
  );
};

// Player (Detailed Green Dinosaur) with smooth movement
const Player = ({
  position,
  facing,
  color,
  onClick,
  showFlash
}: {
  position: [number, number, number];
  facing: PlayerFacing;
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
  const targetRotation = useRef(playerRotationByFacing[facing]);
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

  useEffect(() => {
    targetRotation.current = playerRotationByFacing[facing];
  }, [facing]);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      // Smooth interpolation to target position
      groupRef.current.position.lerp(targetPos.current, 0.3);

      const delta =
        THREE.MathUtils.euclideanModulo(
          targetRotation.current - groupRef.current.rotation.y + Math.PI,
          Math.PI * 2
        ) - Math.PI;
      groupRef.current.rotation.y += delta * 0.22;
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
        // Keep clouds safely below the board so they never overlap non-void tiles.
        cloudGroup.position.y = -2.2 + Math.sin(time * 0.3 + i * 2) * 0.1;

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
        position={[cloud.startX, -2.2, cloud.startZ]}
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
          color="#000000"
          emissive="#000000"
          emissiveIntensity={0}
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
  contentBounds,
  playerFacing,
  cameraOffset,
  zoomFactor = 0.93,
  viewMode = '3d'
}: {
  playerPos: { x: number; y: number };
  offsetX: number;
  offsetZ: number;
  gridWidth: number;
  gridHeight: number;
  contentBounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    centerX: number;
    centerZ: number;
    width: number;
    height: number;
  };
  playerFacing: PlayerFacing;
  cameraOffset?: { x: number; z: number };
  zoomFactor?: number;
  viewMode?: '2d' | '3d' | 'fps';
}) => {
  const { camera } = useThree();
  const targetRef = useRef(new THREE.Vector3());
  const fpsCameraTargetRef = useRef(new THREE.Vector3());
  const fpsLookCurrentRef = useRef(new THREE.Vector3());
  const fpsLookTargetRef = useRef(new THREE.Vector3());
  const followLookTargetRef = useRef(new THREE.Vector3());
  const followLookCurrentRef = useRef(new THREE.Vector3());
  const followLookVelRef = useRef(new THREE.Vector3());

  useEffect(() => {
    const playerX = playerPos.x + offsetX;
    const playerZ = playerPos.y + offsetZ;
    targetRef.current.set(playerX, 0, playerZ);
  }, [playerPos, offsetX, offsetZ]);

  useEffect(() => {
    // Reset camera smoothing when switching modes to avoid a single-frame "kick".
    followLookVelRef.current.set(0, 0, 0);
  }, [viewMode, zoomFactor]);

  useEffect(() => {
    if (viewMode !== 'fps') return;
    const playerX = playerPos.x + offsetX;
    const playerZ = playerPos.y + offsetZ;
    const forward = worldForwardByFacing[playerFacing];

    fpsCameraTargetRef.current.set(
      playerX - forward.x * FPS_CHASE_DISTANCE,
      FPS_CHASE_HEIGHT,
      playerZ - forward.z * FPS_CHASE_DISTANCE
    );
    fpsLookTargetRef.current.set(
      playerX + forward.x * FPS_LOOK_DISTANCE,
      FPS_LOOK_HEIGHT,
      playerZ + forward.z * FPS_LOOK_DISTANCE
    );
    fpsLookCurrentRef.current.copy(fpsLookTargetRef.current);
  }, [playerFacing, playerPos, offsetX, offsetZ, viewMode]);

    useFrame((_, delta) => {
    // Camera settings based on view mode
    const is2D = viewMode === '2d';
    const isFps = viewMode === 'fps';
    const baseCameraHeight = is2D ? 24 : 18;
    const baseCameraDistance = is2D ? 0.5 : 6;
    const cameraHeight = baseCameraHeight * zoomFactor;
    const cameraDistance = baseCameraDistance * zoomFactor;
    const fov = isFps ? 72 : is2D ? 42 : 50;

    // Calculate if the entire map fits in view at current zoom
    const perspectiveCamera = camera as THREE.PerspectiveCamera;

    // Update camera FOV if it changed
    if (Math.abs(perspectiveCamera.fov - fov) > 0.1) {
      perspectiveCamera.fov = fov;
      perspectiveCamera.updateProjectionMatrix();
    }

    const playerX = playerPos.x + offsetX;
    const playerZ = playerPos.y + offsetZ;

    if (isFps) {
      const forward = worldForwardByFacing[playerFacing];
      const targetPosition = new THREE.Vector3(
        playerX - forward.x * FPS_CHASE_DISTANCE,
        FPS_CHASE_HEIGHT,
        playerZ - forward.z * FPS_CHASE_DISTANCE
      );
      const lookTarget = new THREE.Vector3(
        playerX + forward.x * FPS_LOOK_DISTANCE,
        FPS_LOOK_HEIGHT,
        playerZ + forward.z * FPS_LOOK_DISTANCE
      );

      const positionAlpha = 1 - Math.exp(-delta * 6);
      const lookAlpha = 1 - Math.exp(-delta * 7.5);

      fpsCameraTargetRef.current.copy(targetPosition);
      fpsLookTargetRef.current.copy(lookTarget);

      camera.position.lerp(fpsCameraTargetRef.current, positionAlpha);
      fpsLookCurrentRef.current.lerp(fpsLookTargetRef.current, lookAlpha);
      camera.lookAt(fpsLookCurrentRef.current);
      return;
    }

    const fovRad = fov * (Math.PI / 180);
    const viewHeight = 2 * Math.tan(fovRad / 2) * cameraHeight;
    const viewWidth = viewHeight * perspectiveCamera.aspect;

    // Apply camera offset for manual panning
    const panOffsetX = cameraOffset?.x || 0;
    const panOffsetZ = cameraOffset?.z || 0;
    const edgeMarginX = viewWidth * 0.3;
    const edgeMarginZ = viewHeight * 0.3;
    const followStrengthX = smoothstep(0.68, 0.9, contentBounds.width / viewWidth);
    const followStrengthZ = smoothstep(0.68, 0.9, contentBounds.height / viewHeight);

    const followTargetX =
      contentBounds.width <= viewWidth
        ? contentBounds.centerX
        : THREE.MathUtils.clamp(
            playerX,
            contentBounds.minX + viewWidth / 2 - edgeMarginX,
            contentBounds.maxX - viewWidth / 2 + edgeMarginX
          );
    const followTargetZ =
      contentBounds.height <= viewHeight
        ? contentBounds.centerZ
        : THREE.MathUtils.clamp(
            playerZ,
            contentBounds.minZ + viewHeight / 2 - edgeMarginZ,
            contentBounds.maxZ - viewHeight / 2 + edgeMarginZ
          );

    const targetX =
      THREE.MathUtils.lerp(contentBounds.centerX, followTargetX, followStrengthX) + panOffsetX;
    const targetZ =
      THREE.MathUtils.lerp(contentBounds.centerZ, followTargetZ, followStrengthZ) + panOffsetZ;

    followLookTargetRef.current.set(targetX, 0, targetZ);

    // Critically damped smoothing = ease-in/out without frame-rate jitter.
    // Important: keep camera position and look target derived from the SAME smoothed center
    // to prevent tiny yaw jitter (rotation back and forth) while the player moves.
    const smoothTime = is2D ? 0.18 : 0.24;
    if (followLookCurrentRef.current.lengthSq() === 0) {
      // Initialize on first frame to avoid a long catch-up from (0,0,0).
      followLookCurrentRef.current.copy(followLookTargetRef.current);
    }

    smoothDampVec3(
      followLookCurrentRef.current,
      followLookTargetRef.current,
      followLookVelRef.current,
      smoothTime * 0.9,
      delta,
      250
    );

    camera.up.set(0, 1, 0);
    camera.position.set(
      followLookCurrentRef.current.x,
      cameraHeight,
      followLookCurrentRef.current.z + cameraDistance
    );
    camera.lookAt(followLookCurrentRef.current.x, 0, followLookCurrentRef.current.z);
  });

  return null;
};

export const Game3D = ({
  grid,
  cavePos,
  selectedArrow,
  selectorPos,
  cameraOffset,
  zoomFactor = 0.93,
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
  const focusPlayerFacing = focusPlayer?.facing ?? 'down';

  // Camera settings based on view mode
  const is2D = viewMode === '2d';
  const isFps = viewMode === 'fps';
  // Make 3D view more top-down and clearer
  const initialCameraY = isFps ? FPS_CHASE_HEIGHT : (is2D ? 24 : 18) * zoomFactor;
  const initialCameraZ = isFps ? FPS_CHASE_DISTANCE : (is2D ? 0.5 : 6) * zoomFactor;
  const fov = isFps ? 72 : is2D ? 42 : 50;

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

  const breakableTexture = useMemo(() => {
    if (typeof document === 'undefined') return null;

    // Build a pixel-art-ish cracked rock that reads like the original sprite tiles.
    // We draw at low-res then scale up with nearest-neighbor for crisp pixels.
    const outSize = 128;
    const srcSize = 32;

    const src = document.createElement('canvas');
    src.width = srcSize;
    src.height = srcSize;
    const ctx = src.getContext('2d');
    if (!ctx) return null;

    const wall = new THREE.Color(themeColors.wall);
    const stone = new THREE.Color(themeColors.stone);
    const floor = new THREE.Color(themeColors.floor);
    const base = wall.clone().lerp(stone, 0.55);

    ctx.fillStyle = `#${base.getHexString()}`;
    ctx.fillRect(0, 0, srcSize, srcSize);

    // Bevel border like DOS tiles (top/left highlight, bottom/right shadow).
    const highlight = floor.clone().lerp(new THREE.Color('#ffffff'), 0.15);
    const shadow = stone.clone().lerp(new THREE.Color('#000000'), 0.35);
    ctx.fillStyle = `#${highlight.getHexString()}`;
    ctx.fillRect(0, 0, srcSize, 1);
    ctx.fillRect(0, 0, 1, srcSize);
    ctx.fillStyle = `#${shadow.getHexString()}`;
    ctx.fillRect(0, srcSize - 1, srcSize, 1);
    ctx.fillRect(srcSize - 1, 0, 1, srcSize);

    // Speckle noise (deterministic-ish per theme because the base colors change).
    for (let i = 0; i < 110; i += 1) {
      const x = Math.floor(Math.random() * srcSize);
      const y = Math.floor(Math.random() * srcSize);
      const isLight = Math.random() > 0.55;
      const c = base
        .clone()
        .lerp(isLight ? highlight : shadow, isLight ? 0.22 : 0.18)
        .lerp(floor, isLight ? 0.05 : 0.0);
      ctx.fillStyle = `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},0.8)`;
      ctx.fillRect(x, y, 1, 1);
    }

    // Cracks: dark core + small light rim to emulate the sprite's etched look.
    const crackCore = shadow.clone().lerp(new THREE.Color('#000000'), 0.25);
    const crackRim = highlight.clone().lerp(floor, 0.35);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';

    const drawCrack = (seedX: number, seedY: number) => {
      const pts: Array<[number, number]> = [];
      let x = seedX;
      let y = seedY;
      pts.push([x, y]);

      for (let i = 0; i < 8; i += 1) {
        x += (Math.random() - 0.5) * 6;
        y += (Math.random() - 0.5) * 6;
        x = Math.max(2, Math.min(srcSize - 3, x));
        y = Math.max(2, Math.min(srcSize - 3, y));
        pts.push([x, y]);
      }

      const strokePath = (dx: number, dy: number, stroke: string) => {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy);
        for (let i = 1; i < pts.length; i += 1) {
          ctx.lineTo(pts[i][0] + dx, pts[i][1] + dy);
        }
        ctx.stroke();
      };

      // Dark crack core + rim highlight offset by 1px (sprite-like).
      strokePath(0, 0, `#${crackCore.getHexString()}`);
      strokePath(
        1,
        0,
        `rgba(${Math.round(crackRim.r * 255)},${Math.round(crackRim.g * 255)},${Math.round(crackRim.b * 255)},0.55)`
      );
    };

    for (let i = 0; i < 5; i += 1) {
      drawCrack(6 + Math.random() * (srcSize - 12), 6 + Math.random() * (srcSize - 12));
    }

    // Scale up to output size with nearest-neighbor.
    const out = document.createElement('canvas');
    out.width = outSize;
    out.height = outSize;
    const outCtx = out.getContext('2d');
    if (!outCtx) return null;
    outCtx.imageSmoothingEnabled = false;
    outCtx.drawImage(src, 0, 0, outSize, outSize);

    const texture = new THREE.CanvasTexture(out);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.anisotropy = 1;
    texture.needsUpdate = true;
    return texture;
  }, [themeColors.floor, themeColors.stone, themeColors.wall]);

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
    const redKeys: Array<[number, number, number]> = [];
    const greenKeys: Array<[number, number, number]> = [];
    const redLocks: Array<[number, number, number]> = [];
    const greenLocks: Array<[number, number, number]> = [];
    const startCaves: Array<[number, number, number]> = [];
    const teleports: Array<[number, number, number]> = [];
    const bonusTime: Array<[number, number, number]> = [];
    // Edge rails: thin blocks rendered along boundaries between non-void tiles and void/out-of-bounds.
    const edgeRailsH: Array<[number, number, number]> = []; // horizontal (along X), positioned at Z boundaries
    const edgeRailsV: Array<[number, number, number]> = []; // vertical (along Z), positioned at X boundaries
    const arrows: Array<{ x: number; y: number; cell: number }> = [];

    const isVoidAt = (x: number, y: number) => {
      if (y < 0 || y >= grid.length) return true;
      const row = grid[y];
      if (!row) return true;
      if (x < 0 || x >= row.length) return true;
      return row[x] === 5;
    };

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
        if (cell === 6) breakable.push([pos[0], 0.16, pos[2]]);
        if (cell === 14) redKeys.push([pos[0], 0, pos[2]]);
        if (cell === 15) greenKeys.push([pos[0], 0, pos[2]]);
        if (cell === 16) redLocks.push([pos[0], 0, pos[2]]);
        if (cell === 17) greenLocks.push([pos[0], 0, pos[2]]);
        if (cell === 18) startCaves.push([pos[0], 0.02, pos[2]]);
        if (cell === 19) teleports.push([pos[0], 0.02, pos[2]]);
        if (cell === 20) bonusTime.push([pos[0], 0.02, pos[2]]);
        if (isArrowCell(cell) || cell === 11 || cell === 12 || cell === 13) {
          arrows.push({ x, y, cell });
        }

        // Boundary rails (modern edge indicator): detect transitions to void/out-of-bounds.
        // We place a thin block centered on the tile edge.
        const edgeY = 0.06;
        if (isVoidAt(x, y - 1)) edgeRailsH.push([pos[0], edgeY, pos[2] - 0.5]); // top
        if (isVoidAt(x, y + 1)) edgeRailsH.push([pos[0], edgeY, pos[2] + 0.5]); // bottom
        if (isVoidAt(x - 1, y)) edgeRailsV.push([pos[0] - 0.5, edgeY, pos[2]]); // left
        if (isVoidAt(x + 1, y)) edgeRailsV.push([pos[0] + 0.5, edgeY, pos[2]]); // right
      }
    }

    return { floor, water, wallBase, wallBars, stone, breakable, redKeys, greenKeys, redLocks, greenLocks, startCaves, teleports, bonusTime, edgeRailsH, edgeRailsV, arrows };
  }, [grid, offsetX, offsetZ]);

  const contentBounds = useMemo(() => {
    let minGridX = Number.POSITIVE_INFINITY;
    let maxGridX = Number.NEGATIVE_INFINITY;
    let minGridY = Number.POSITIVE_INFINITY;
    let maxGridY = Number.NEGATIVE_INFINITY;

    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < grid[y].length; x += 1) {
        if (grid[y][x] === 5) continue;
        minGridX = Math.min(minGridX, x);
        maxGridX = Math.max(maxGridX, x);
        minGridY = Math.min(minGridY, y);
        maxGridY = Math.max(maxGridY, y);
      }
    }

    if (!Number.isFinite(minGridX) || !Number.isFinite(minGridY)) {
      return {
        minX: -gridWidth / 2,
        maxX: gridWidth / 2,
        minZ: -gridHeight / 2,
        maxZ: gridHeight / 2,
        centerX: 0,
        centerZ: 0,
        width: gridWidth,
        height: gridHeight,
      };
    }

    const minX = minGridX + offsetX - 0.5;
    const maxX = maxGridX + offsetX + 0.5;
    const minZ = minGridY + offsetZ - 0.5;
    const maxZ = maxGridY + offsetZ + 0.5;

    return {
      minX,
      maxX,
      minZ,
      maxZ,
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
      width: maxX - minX,
      height: maxZ - minZ,
    };
  }, [grid, gridHeight, gridWidth, offsetX, offsetZ]);

  // Full grid frame (rows×cols): draw a rectangular perimeter so the board boundary is obvious
  // even when the level has lots of void around the playable islands.
  const gridFrame = useMemo(() => {
    const thickness = 0.12;
    const height = 0.12;
    const y = 0.07;

    // Grid extents in world units (tile centers are integer coords, tiles span +/-0.5).
    const minX = offsetX - 0.5;
    const maxX = offsetX + gridWidth - 0.5;
    const minZ = offsetZ - 0.5;
    const maxZ = offsetZ + gridHeight - 0.5;

    return {
      thickness,
      height,
      y,
      minX,
      maxX,
      minZ,
      maxZ,
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
    };
  }, [gridHeight, gridWidth, offsetX, offsetZ]);

  // Render floor as a slightly smaller plane on top of a dark border plane, so tiles read clearly.
  const floorGeometry = useMemo(() => new THREE.PlaneGeometry(0.97, 0.97, 8, 8), []);
  const floorBorderGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1, 1, 1), []);
  const waterGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1, 8, 8), []);
  const edgeRailHGeometry = useMemo(() => new THREE.BoxGeometry(1.03, 0.08, 0.06), []);
  const edgeRailVGeometry = useMemo(() => new THREE.BoxGeometry(0.06, 0.08, 1.03), []);
  const wallGeometry = useMemo(() => new THREE.BoxGeometry(0.98, 0.2, 0.98), []);
  const wallBarGeometry = useMemo(() => new THREE.BoxGeometry(0.96, 0.02, 0.08), []);
  const stoneGeometry = useMemo(() => new THREE.DodecahedronGeometry(0.45, 1), []);
  const breakableGeometry = useMemo(() => new THREE.BoxGeometry(0.92, 0.24, 0.92, 1, 1, 1), []);
  const planeRotation = useMemo(() => new THREE.Euler(-Math.PI / 2, 0, 0), []);
  const wallBarRotA = useMemo(() => new THREE.Euler(0, Math.PI / 4, 0), []);
  const wallBarRotB = useMemo(() => new THREE.Euler(0, -Math.PI / 4, 0), []);

  const floorMaterial = useMemo(() => new THREE.MeshStandardMaterial(), []);
  const floorBorderMaterial = useMemo(() => new THREE.MeshStandardMaterial(), []);
  const waterMaterial = useMemo(() => new THREE.MeshStandardMaterial(), []);
  const edgeRailMaterial = useMemo(() => new THREE.MeshStandardMaterial(), []);
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

    // Medium-dark gray border around each floor tile (inset border effect).
    floorBorderMaterial.color = new THREE.Color('#4b5563');
    floorBorderMaterial.emissive = new THREE.Color('#0b1220');
    floorBorderMaterial.emissiveIntensity = 0.06;
    floorBorderMaterial.roughness = 0.95;
    floorBorderMaterial.metalness = 0.0;
    floorBorderMaterial.transparent = false;
    floorBorderMaterial.opacity = 1;
    floorBorderMaterial.needsUpdate = true;

    waterMaterial.color = new THREE.Color('#1e90ff');
    waterMaterial.transparent = false;
    waterMaterial.opacity = 1;
    waterMaterial.roughness = 0.08;
    waterMaterial.metalness = 0.6;
    waterMaterial.emissive = new THREE.Color('#2aa9ff');
    waterMaterial.emissiveIntensity = 0.2;
    waterMaterial.roughnessMap = noiseTexture ?? null;
    waterMaterial.needsUpdate = true;

    // Board edge indicator: modern "rail" around non-void islands so boundaries read clearly.
    edgeRailMaterial.color = new THREE.Color('#0b1220');
    edgeRailMaterial.emissive = new THREE.Color('#16324a');
    edgeRailMaterial.emissiveIntensity = 0.22;
    edgeRailMaterial.roughness = 0.92;
    edgeRailMaterial.metalness = 0.06;
    edgeRailMaterial.transparent = true;
    edgeRailMaterial.opacity = 0.92;
    edgeRailMaterial.needsUpdate = true;

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

    breakableMaterial.map = breakableTexture ?? null;
    breakableMaterial.color = new THREE.Color('#ffffff');
    breakableMaterial.emissive = new THREE.Color('#111111');
    breakableMaterial.emissiveIntensity = 0.08;
    breakableMaterial.roughness = 0.88;
    breakableMaterial.metalness = 0.06;
    breakableMaterial.transparent = false;
    breakableMaterial.opacity = 1;
    breakableMaterial.roughnessMap = null;
    breakableMaterial.bumpMap = breakableTexture ?? (noiseTexture ?? null);
    breakableMaterial.bumpScale = 0.06;
    breakableMaterial.envMapIntensity = 0.35;
    breakableMaterial.needsUpdate = true;
  }, [themeColors, noiseTexture, breakableTexture, floorMaterial, floorBorderMaterial, waterMaterial, edgeRailMaterial, wallMaterial, wallBarMaterial, stoneMaterial, breakableMaterial]);

  const floorBorderPositions = useMemo(
    () => tileData.floor.map(([x, y, z]) => [x, y + 0.001, z] as [number, number, number]),
    [tileData.floor]
  );
  const floorInnerPositions = useMemo(
    () => tileData.floor.map(([x, y, z]) => [x, y + 0.003, z] as [number, number, number]),
    [tileData.floor]
  );

  return (
    <div className="w-full h-full bg-black overflow-hidden touch-none relative z-30">
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
          contentBounds={contentBounds}
          playerFacing={focusPlayerFacing}
          cameraOffset={cameraOffset}
          zoomFactor={zoomFactor}
          viewMode={viewMode}
        />

        {/* Lighting: keep depth but avoid heavy/distracting shadows */}
        <ambientLight intensity={0.48} color={themeColors.ambient} />
        <hemisphereLight intensity={0.45} color="#e9f8ff" groundColor="#22374a" />
        <directionalLight
          position={[10, 15, 10]}
          intensity={0.95}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.00035}
          shadow-normalBias={0.02}
          shadow-radius={6}
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
          positions={floorBorderPositions}
          geometry={floorBorderGeometry}
          material={floorBorderMaterial}
          rotation={planeRotation}
          receiveShadow
        />
        <InstancedMeshSet
          positions={floorInnerPositions}
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
        {/* Island edge rails (visual only) */}
        <InstancedMeshSet
          positions={tileData.edgeRailsH}
          geometry={edgeRailHGeometry}
          material={edgeRailMaterial}
          castShadow={false}
          receiveShadow
        />
        <InstancedMeshSet
          positions={tileData.edgeRailsV}
          geometry={edgeRailVGeometry}
          material={edgeRailMaterial}
          castShadow={false}
          receiveShadow
        />

        {/* Full grid frame (always rows×cols, e.g. 12×20) */}
        {gridWidth > 0 && gridHeight > 0 && (
          <group raycast={() => null}>
            {/* Top */}
            <mesh position={[gridFrame.centerX, gridFrame.y, gridFrame.minZ - gridFrame.thickness / 2]}>
              <boxGeometry args={[gridWidth + gridFrame.thickness * 2, gridFrame.height, gridFrame.thickness]} />
              <primitive object={edgeRailMaterial} attach="material" />
            </mesh>
            {/* Bottom */}
            <mesh position={[gridFrame.centerX, gridFrame.y, gridFrame.maxZ + gridFrame.thickness / 2]}>
              <boxGeometry args={[gridWidth + gridFrame.thickness * 2, gridFrame.height, gridFrame.thickness]} />
              <primitive object={edgeRailMaterial} attach="material" />
            </mesh>
            {/* Left */}
            <mesh position={[gridFrame.minX - gridFrame.thickness / 2, gridFrame.y, gridFrame.centerZ]}>
              <boxGeometry args={[gridFrame.thickness, gridFrame.height, gridHeight + gridFrame.thickness * 2]} />
              <primitive object={edgeRailMaterial} attach="material" />
            </mesh>
            {/* Right */}
            <mesh position={[gridFrame.maxX + gridFrame.thickness / 2, gridFrame.y, gridFrame.centerZ]}>
              <boxGeometry args={[gridFrame.thickness, gridFrame.height, gridHeight + gridFrame.thickness * 2]} />
              <primitive object={edgeRailMaterial} attach="material" />
            </mesh>
          </group>
        )}
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

        {tileData.redKeys.map((position, index) => (
          <KeyTile
            key={`red-key-${index}-${position[0]}-${position[2]}`}
            position={position}
            glowColor="#ff8a80"
            accentColor="#ef4444"
          />
        ))}
        {tileData.greenKeys.map((position, index) => (
          <KeyTile
            key={`green-key-${index}-${position[0]}-${position[2]}`}
            position={position}
            glowColor="#b9f6ca"
            accentColor="#22c55e"
          />
        ))}
        {tileData.redLocks.map((position, index) => (
          <LockTile
            key={`red-lock-${index}-${position[0]}-${position[2]}`}
            position={position}
            color="#b71c1c"
            glowColor="#ff8a80"
          />
        ))}
        {tileData.greenLocks.map((position, index) => (
          <LockTile
            key={`green-lock-${index}-${position[0]}-${position[2]}`}
            position={position}
            color="#1b5e20"
            glowColor="#b9f6ca"
          />
        ))}

        {/* Start marker caves (non-goal) */}
        {tileData.startCaves.map((position, index) => (
          <StartCave key={`start-cave-${index}-${position[0]}-${position[2]}`} position={position} />
        ))}

        {/* Teleports */}
        {tileData.teleports.map((position, index) => (
          <TeleportTile key={`teleport-${index}-${position[0]}-${position[2]}`} position={position} />
        ))}

        {/* Bonus Time (clock) */}
        {tileData.bonusTime.map((position, index) => (
          <BonusTimeTile key={`bonus-time-${index}-${position[0]}-${position[2]}`} position={position} />
        ))}

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
        <Cave position={[cavePos.x + offsetX, 0.05, cavePos.y + offsetZ]} noiseMap={noiseTexture} />

        {/* Players */}
        {players.map((player) => {
          const cell = grid[player.pos.y]?.[player.pos.x];
          const isOnArrow = cell !== undefined && isArrowCell(cell);
          const height = isOnArrow ? 0.25 : 0;
          return (
            <Player
              key={player.id}
              position={[player.pos.x + offsetX, height, player.pos.y + offsetZ]}
              facing={player.facing}
              color={player.color}
              onClick={player.isLocal ? onPlayerClick : undefined}
              showFlash={player.isLocal && playerFlashCount > 0 && (playerFlashCount % 2 === 0)}
            />
          );
        })}

        {/* Ground plane (void/outside): keep it black so the board perimeter reads clearly. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]} receiveShadow>
          <planeGeometry args={[gridWidth + 10, gridHeight + 10]} />
          <meshStandardMaterial color="#000000" emissive="#000000" />
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
  });

  return null;
};
