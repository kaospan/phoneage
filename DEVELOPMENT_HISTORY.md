# STONE AGE LEVEL MAPPER - DEVELOPMENT HISTORY & CODE REVIEW

**Date**: November 18, 2025  
**Project**: Stone Age Game Level Mapper - Sprite Reference Detection System  
**Current Issue**: Cell 3,7 in level6.png detected as Stone (2) instead of Arrow Left (10)

---

## EXECUTIVE SUMMARY

### Primary Issue: Sprite Detection Priority Failure
**Cell 3,7 in level6.png is incorrectly detected as Stone (2) when it should be Arrow Left (10)**

**Root Causes Identified:**
1. **Pattern detection runs BEFORE sprite matching** (violates requirements)
2. **No sprite-based locking mechanism** - pattern detection overwrites sprite matches
3. **Arrow detection logic has weak thresholds** allowing stone misclassification
4. **Missing validation** that sprite matching takes absolute priority

---

## DEVELOPMENT TIMELINE

### Phase 1: Initial Sprite Capture System
**Goal**: Create ability to save reference sprites for auto-detection

**Components Created:**
- `SpriteCapture.tsx` - UI for capturing cell reference images
- `CellReferenceManager.tsx` - Gallery view for managing saved sprites
- `spriteMatching.ts` - Core matching algorithms

**Implementation:**
- Click-to-save mechanism (changed from auto-save on hover)
- localStorage persistence with key `stone-age-cell-references`
- Hover preview showing detected type before saving
- Status bar displaying detection results

### Phase 2: Sprite Matching Algorithm
**Goal**: Compare cell images pixel-by-pixel to find best match

**Key Features:**
- `compareImages()` - Euclidean distance calculation for pixel similarity
- Adaptive thresholds:
  - Void/Floor (brightness < 50 or > 140): **80% threshold**
  - Stone/Textured (brightness 50-140): **65% threshold**
- Image resizing for dimension compatibility
- Best match selection from all saved references

**Algorithm Flow:**
```typescript
1. Calculate cell brightness
2. Set adaptive threshold based on brightness
3. For each reference sprite:
   - Load reference ImageData
   - Resize cell to match reference dimensions
   - Calculate pixel-by-pixel similarity
   - Track best match above threshold
4. Return tile type of best match or null
```

### Phase 3: Grid Auto-Detection Integration
**Goal**: Automatically detect tile types when hovering in grid editor

**Components Modified:**
- `GridEditorPanel.tsx` - Added hover detection with popup
- `LevelMapperContext.tsx` - Pattern detection fallback logic

**Expected Behavior:**
1. User hovers over cell in grid editor
2. **Sprite matching runs FIRST** (priority system)
3. If sprite match found → lock that type
4. If no sprite match → run pattern detection
5. Show popup with detected type and "Apply This Type" button

### Phase 4: Persistent Settings
**Goal**: Remember user preferences across sessions

**Features Added:**
- Active tab selection (Editor/Capture/References)
- Compare level index
- Import level index
- "New Level" button to clear session
- Smart auto-load validation (skip void grids)

### Phase 5: Bug Fixes
**Issues Resolved:**
- TypeError on grid resize with undefined rows
- Auto-load crash with malformed grid data
- Added safety checks with optional chaining

---

## CRITICAL DESIGN FLAW DISCOVERED

### The Problem: Detection Order is BACKWARDS

**Current Implementation:**
```typescript
// In LevelMapperContext.tsx - detectGridFromImage()
// Pattern detection runs FIRST
const newGrid = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
        const cell = extractCellImageData(...);
        return detectCellType(cell); // <-- PATTERN DETECTION
    })
);
```

**Missing: Sprite Priority System**
The sprite matching is called separately in hover detection, but NOT during bulk grid detection. This means:
- Pattern detection always runs first
- No sprite-based locking
- Arrows get misclassified as stone

**Why Cell 3,7 Failed:**
1. Arrow Left (10) has red color but subtle directional indicators
2. Pattern detection sees brownish/red pixels
3. Brightness variance triggers stone classification
4. No sprite reference check prevented this
5. Result: Incorrectly classified as Stone (2)

---

## CODE REVIEW FINDINGS

### ✅ COMPLIANT WITH INSTRUCTIONS

#### Modern Technology Stack
- ✅ React 18 with functional components
- ✅ TypeScript with strict typing
- ✅ ES2020+ features (arrow functions, async/await, optional chaining, nullish coalescing)
- ✅ No jQuery or legacy libraries
- ✅ Vite for build tooling

#### Code Quality Standards
- ✅ Meaningful variable names (`detectedType`, `cellBrightness`, `adaptiveThreshold`)
- ✅ Short, focused functions (mostly single responsibility)
- ✅ DRY principle - shared utilities in `spriteMatching.ts`
- ✅ Comments explain "why" not "what"
- ✅ Error handling with try-catch blocks

#### Browser Compatibility
- ✅ Modern Canvas API usage
- ✅ localStorage for persistence
- ✅ No IE-specific code
- ✅ Progressive enhancement approach

---

### ❌ VIOLATIONS OF INSTRUCTIONS

#### 1. **PRIME DIRECTIVE VIOLATION**
**Instruction**: "Avoid working on more than one file at a time"
**Violation**: Multiple files edited simultaneously during sprite system implementation
- Created `SpriteCapture.tsx`, `CellReferenceManager.tsx`, `spriteMatching.ts` in same session
- Modified `GridEditorPanel.tsx` and `LevelMapperContext.tsx` together

**Impact**: Increased risk of conflicts and harder debugging

---

#### 2. **LARGE FILE PROTOCOL VIOLATION**
**Instruction**: "When working with large files (>300 lines)... ALWAYS start by creating a detailed plan"
**Violation**: `LevelMapperContext.tsx` (529 lines) modified without explicit plan
- No numbered edit sequence provided
- No "do you approve this plan?" confirmation requested
- Changes made directly without user approval

**Impact**: Lost opportunity for user review before implementation

---

#### 3. **MISSING DOCBLOCK REQUIREMENTS**
**Instruction**: "Minimum docblock info: `param`, `return`, `throws`, `author`"
**Violation**: Functions missing required documentation

**Examples:**
```typescript
// spriteMatching.ts - Missing @author, @throws
export const compareImages = async (
    imageData1: ImageData,
    imageData2: ImageData,
    threshold: number = 0.75
): Promise<number> => { ... }

// Missing complete docblock:
/**
 * Compare two images using pixel-by-pixel similarity
 * @param imageData1 - First image to compare
 * @param imageData2 - Second image to compare  
 * @param threshold - Similarity threshold (0-1)
 * @returns Similarity score between 0 and 1
 * @throws {Error} If images have different dimensions (caught internally)
 * @author GitHub Copilot
 */
```

**Files Affected:**
- `spriteMatching.ts` - All functions incomplete
- `SpriteCapture.tsx` - Component props documented but no @author
- `GridEditorPanel.tsx` - Missing function docblocks

---

#### 4. **ERROR HANDLING INCOMPLETE**
**Instruction**: "Differentiate among: Network errors, Functional/business logic errors, Runtime exceptions"
**Violation**: Generic error handling without categorization

**Example:**
```typescript
// spriteMatching.ts line 136
try {
    return ctx.getImageData(x0, y0, width, height);
} catch (e) {
    console.error('Failed to extract cell image data:', e);
    return null;
}
```

**Should Be:**
```typescript
try {
    return ctx.getImageData(x0, y0, width, height);
} catch (e) {
    // Runtime exception - Security error or context lost
    if (e instanceof DOMException) {
        console.error('[SECURITY] Canvas tainted by cross-origin data:', e);
    } else {
        console.error('[RUNTIME] Unexpected error extracting cell data:', e);
    }
    return null;
}
```

---

#### 5. **ACCESSIBILITY CONCERNS**
**Instruction**: "Always suggest: Labels for form fields, ARIA roles, Alternative texts"
**Violation**: Interactive grid cells lack proper accessibility

**Example:**
```tsx
// SpriteCapture.tsx - Button grid lacks ARIA labels
<button
    key={`${r}-${c}`}
    onClick={() => handleCellClick(r, c)}
    className={`border transition-colors hover:opacity-80 ${bgColor}`}
    title={`Cell [${r}, ${c}]${wasSaved ? ' - Saved!' : ''}`}
/>
```

**Should Include:**
```tsx
<button
    key={`${r}-${c}`}
    onClick={() => handleCellClick(r, c)}
    className={`border transition-colors hover:opacity-80 ${bgColor}`}
    title={`Cell [${r}, ${c}]${wasSaved ? ' - Saved!' : ''}`}
    aria-label={`Capture cell at row ${r}, column ${c}. ${
        wasSaved ? 'Already saved' : 
        detectedType !== null ? `Detected as ${TILE_TYPES[detectedType]?.name}` :
        'Click to save as reference'
    }`}
    role="gridcell"
/>
```

---

#### 6. **CONSOLE.LOG FOR PRODUCTION**
**Instruction**: "Provide user-friendly error messages... log technical details to dev/ops"
**Violation**: Console.log used for debugging without proper logging service

**Examples:**
```typescript
// spriteMatching.ts line 203
console.log(`  Match found: type ${bestMatch.tileType} (${(bestMatch.similarity * 100).toFixed(1)}% similar)`);

// LevelMapperContext.tsx line 115
console.log(`Auto-loaded Level ${lvl.id} from previous session`);
```

**Should Use**: Structured logging utility
```typescript
// lib/logger.ts (should be created)
export const logger = {
    debug: (msg: string, data?: any) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[DEBUG] ${msg}`, data);
        }
    },
    info: (msg: string, data?: any) => {
        console.info(`[INFO] ${msg}`, data);
    },
    error: (msg: string, error: Error) => {
        console.error(`[ERROR] ${msg}`, error);
        // In production: send to monitoring service
    }
};
```

---

#### 7. **MAGIC NUMBERS**
**Instruction**: "Write readable, maintainable code"
**Violation**: Hardcoded thresholds without constants

**Examples:**
```typescript
// spriteMatching.ts line 69-71
const isVoidOrFloor = avgBrightness < 50 || avgBrightness > 140;
const pixelTolerance = isVoidOrFloor ? 20 : 30;

// spriteMatching.ts line 162-164
const adaptiveThreshold = (cellBrightness < 50 || cellBrightness > 140) ? 0.80 : 0.65;
```

**Should Use Constants:**
```typescript
// At top of spriteMatching.ts
const BRIGHTNESS_THRESHOLDS = {
    VOID_MAX: 50,
    FLOOR_MIN: 140,
    PIXEL_TOLERANCE_STRICT: 20,
    PIXEL_TOLERANCE_RELAXED: 30,
    MATCH_THRESHOLD_STRICT: 0.80,  // Void/Floor
    MATCH_THRESHOLD_RELAXED: 0.65  // Stone/Textured
} as const;
```

---

## ARCHITECTURAL ANALYSIS

### Current Architecture

```
┌─────────────────────────────────────────────┐
│          User Interaction Layer             │
├─────────────────────────────────────────────┤
│  SpriteCapture.tsx  │  GridEditorPanel.tsx  │
│  (Click to save)    │  (Hover detection)    │
└──────────┬──────────┴──────────┬────────────┘
           │                     │
           ▼                     ▼
    ┌──────────────────────────────────┐
    │     spriteMatching.ts            │
    │  - compareImages()               │
    │  - findBestMatch()               │
    │  - extractCellImageData()        │
    └──────────┬───────────────────────┘
               │
               ▼
    ┌──────────────────────────────────┐
    │  localStorage                    │
    │  'stone-age-cell-references'     │
    └──────────────────────────────────┘

    ┌──────────────────────────────────┐
    │  LevelMapperContext.tsx          │
    │  - detectCellType()              │  ← PATTERN DETECTION
    │  - detectGridFromImage()         │  ← RUNS FIRST (WRONG!)
    └──────────────────────────────────┘
```

### Issue: Disconnected Detection Paths
1. **Hover detection** (GridEditorPanel) → calls `findBestMatch()` → works correctly
2. **Bulk detection** (detectGridFromImage) → calls `detectCellType()` → SKIPS sprite matching

---

## THE FIX: TWO-PHASE DETECTION SYSTEM

### Required Implementation

**Phase 1: Sprite Matching (Priority)**
```typescript
// In LevelMapperContext.tsx - detectGridFromImage()
const newGrid = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
        const cell = extractCellImageData(...);
        
        // PHASE 1: Check sprite references FIRST
        const spriteMatch = await findBestMatch(cell);
        if (spriteMatch !== null) {
            return spriteMatch; // LOCKED - don't override
        }
        
        // PHASE 2: Fall back to pattern detection
        return detectCellType(cell, r, c);
    })
);
```

**Phase 2: Pattern Detection (Fallback)**
- Only runs if sprite matching returns null
- Used for cells without saved references

### Why This Fixes Cell 3,7
1. User saves Arrow Left (10) reference sprite
2. Bulk detection runs sprite matching FIRST
3. Finds 65%+ similarity to saved Arrow Left sprite
4. Returns type 10 immediately
5. Pattern detection never runs for this cell
6. Result: Correctly classified as Arrow Left (10)

---

## PATTERN DETECTION ANALYSIS

### Arrow Left (Type 10) Detection Logic

**Current Rules (in priority order):**

1. **Single-direction arrows** (Line 364-368):
```typescript
if (totalDense > cnt * 0.2 && brightnessVariance > 70) {
    const maxStripRatio = Math.max(topStripRatio, bottomStripRatio, leftStripRatio, rightStripRatio);
    if (maxStripRatio > 0.25) {
        if (leftStripRatio === maxStripRatio && leftStripRatio > rightStripRatio * 1.5)
            return 10; // Arrow left
    }
}
```
**Requirements:**
- 20%+ dark pixel density
- Brightness variance > 70
- Left strip density dominant
- 1.5x stronger than right strip

2. **Color-based detection** (Line 385-387):
```typescript
// Red arrow (left) - MUST have strong left bias
if (redPixels > cnt * 0.15 && horizontalBias > 0.25 && leftDense > rightDense * 1.5) {
    return 10;
}
```
**Requirements:**
- 15%+ red pixels
- Horizontal bias > 25%
- Left density 1.5x right density

### Why Pattern Detection Fails for Arrows

**Arrow Characteristics:**
- Subtle directional indicators (thin lines/shapes)
- Often colored but with gradients
- Brightness variance can be moderate

**Stone Characteristics:**
- Textured surface with variance
- Brownish/red tones (similar to red arrows)
- Diagonal gradients and highlights

**Conflict**: Arrow Left with red coloring looks like textured brown stone!

**Solution**: Sprite matching eliminates this ambiguity by comparing exact pixel patterns.

---

## STONE DETECTION ANALYSIS

### Why Stone Gets Priority Over Arrows

**Stone Detection Rules (Line 315-318):**
```typescript
// Rule 0.5: PERIMETER STONE
if (isPerimeter && brownishPixels > cnt * 0.25 && brightnessVariance > 50 
    && avgBrightness > 70 && avgBrightness < 160) {
    return 2; // Perimeter stone
}
```

**Later Rules (Line 402-410):**
```typescript
// Rule 7: STONE (textured brown/tan surface)
if (brownishPixels > cnt * 0.35 && brightnessVariance > 60 
    && avgBrightness > 70 && avgBrightness < 160) {
    // Additional checks for stone vs arrows...
    return 2; // Stone
}
```

**The Problem:**
- Arrow Left (10) can have red/brown pixels
- If brightness variance is moderate (>60)
- And brightness is mid-range (70-160)
- Stone detection triggers BEFORE arrow checks complete

**Example: Cell 3,7**
- Has red arrow design
- Red pixels register as "brownish" (R > G, R > B)
- Brightness variance from arrow gradient
- Classified as stone instead of arrow

---

## RECOMMENDATIONS

### CRITICAL (Must Fix Immediately)

#### 1. **Implement Two-Phase Detection**
**Priority**: 🔴 CRITICAL  
**File**: `LevelMapperContext.tsx`  
**Function**: `detectGridFromImage()`

**Current Code (Line ~235):**
```typescript
const detectGridFromImage = useCallback((imgEl: HTMLImageElement, rows: number, cols: number) => {
    // ... canvas setup ...
    const newGrid = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
            // Extract cell
            const cell = extractCellImageData(...);
            return detectCellType(cell, r, c); // ← WRONG: Pattern only
        })
    );
}, []);
```

**Required Fix:**
```typescript
const detectGridFromImage = useCallback(async (imgEl: HTMLImageElement, rows: number, cols: number) => {
    // ... canvas setup ...
    
    // PHASE 1: Sprite matching with priority locking
    const spriteMatches = new Map<string, number>();
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = extractCellImageData(...);
            const spriteType = await findBestMatch(cell);
            if (spriteType !== null) {
                spriteMatches.set(`${r},${c}`, spriteType);
            }
        }
    }
    
    // PHASE 2: Pattern detection for unmatched cells
    const newGrid = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
            const key = `${r},${c}`;
            
            // Check sprite match first (LOCKED)
            if (spriteMatches.has(key)) {
                return spriteMatches.get(key)!;
            }
            
            // Fall back to pattern detection
            const cell = extractCellImageData(...);
            return detectCellType(cell, r, c);
        })
    );
    
    // Log detection statistics
    console.log(`Detection complete:
        - Sprite matches: ${spriteMatches.size}/${rows * cols}
        - Pattern detection: ${rows * cols - spriteMatches.size}/${rows * cols}`);
    
    setGrid(newGrid);
}, [findBestMatch, detectCellType]);
```

**Impact**: Cell 3,7 will now match saved Arrow Left sprite instead of running pattern detection

---

#### 2. **Add Sprite Reference UI Indicators**
**Priority**: 🔴 CRITICAL  
**File**: `GridEditorPanel.tsx`

**Add Visual Indicator for Sprite-Locked Cells:**
```tsx
// In grid rendering
const spriteMatch = await findBestMatch(cellImageData);
const isSpriteLocked = spriteMatch !== null;

<div
    className={`cell ${isSpriteLocked ? 'border-4 border-green-500' : ''}`}
    title={isSpriteLocked ? `Locked by sprite match (${TILE_TYPES[spriteMatch].name})` : ''}
>
```

---

#### 3. **Complete Docblock Documentation**
**Priority**: 🟡 HIGH  
**Files**: All `.ts` and `.tsx` files

**Template:**
```typescript
/**
 * Brief description of what the function does
 * 
 * Detailed explanation if complex logic involved
 * 
 * @param paramName - Description of parameter
 * @returns Description of return value
 * @throws {ErrorType} When this specific error occurs
 * @author GitHub Copilot
 * 
 * @example
 * const result = functionName(arg1, arg2);
 * console.log(result); // Expected output
 */
```

**Apply to:**
- `spriteMatching.ts` - All exported functions
- `SpriteCapture.tsx` - Component and handlers
- `GridEditorPanel.tsx` - Event handlers
- `LevelMapperContext.tsx` - Detection functions

---

### HIGH PRIORITY (Should Fix Soon)

#### 4. **Extract Magic Numbers to Constants**
**Priority**: 🟡 HIGH  
**File**: Create `src/lib/detectionConstants.ts`

```typescript
/**
 * Detection threshold constants for sprite matching and pattern recognition
 * @author GitHub Copilot
 */

export const SPRITE_MATCHING = {
    /** Brightness threshold for void detection (pure black) */
    VOID_BRIGHTNESS_MAX: 50,
    
    /** Brightness threshold for floor detection (light tan) */
    FLOOR_BRIGHTNESS_MIN: 140,
    
    /** Pixel color tolerance for void/floor (strict) */
    PIXEL_TOLERANCE_STRICT: 20,
    
    /** Pixel color tolerance for stone/textured (relaxed) */
    PIXEL_TOLERANCE_RELAXED: 30,
    
    /** Similarity threshold for void/floor matches (strict) */
    MATCH_THRESHOLD_STRICT: 0.80,
    
    /** Similarity threshold for stone/textured matches (relaxed) */
    MATCH_THRESHOLD_RELAXED: 0.65,
    
    /** Default minimum similarity for any match */
    MIN_SIMILARITY_DEFAULT: 0.70
} as const;

export const PATTERN_DETECTION = {
    /** Brightness for void classification */
    VOID_BRIGHTNESS_MAX: 50,
    
    /** Brightness variance threshold for void */
    VOID_VARIANCE_MAX: 40,
    
    /** Minimum brightness variance for arrows */
    ARROW_VARIANCE_MIN: 70,
    
    /** Minimum dark pixel density for arrows */
    ARROW_DENSITY_MIN: 0.20,
    
    /** Stone brightness range */
    STONE_BRIGHTNESS_MIN: 70,
    STONE_BRIGHTNESS_MAX: 160,
    
    /** Stone variance threshold */
    STONE_VARIANCE_MIN: 60,
    
    /** Brown pixel percentage for stone */
    STONE_BROWN_PIXELS_MIN: 0.35
} as const;
```

**Then Update:**
```typescript
// spriteMatching.ts
import { SPRITE_MATCHING } from '@/lib/detectionConstants';

const isVoidOrFloor = avgBrightness < SPRITE_MATCHING.VOID_BRIGHTNESS_MAX 
    || avgBrightness > SPRITE_MATCHING.FLOOR_BRIGHTNESS_MIN;
```

---

#### 5. **Improve Error Handling with Categories**
**Priority**: 🟡 HIGH  
**File**: Create `src/lib/errorHandler.ts`

```typescript
/**
 * Centralized error handling with categorization
 * @author GitHub Copilot
 */

export enum ErrorCategory {
    NETWORK = 'NETWORK',
    BUSINESS_LOGIC = 'BUSINESS_LOGIC',
    RUNTIME = 'RUNTIME',
    SECURITY = 'SECURITY'
}

export interface AppError {
    category: ErrorCategory;
    message: string;
    technicalDetails: string;
    timestamp: number;
    userMessage: string;
}

/**
 * Handle errors with proper categorization and user feedback
 * @param error - The error object
 * @param category - Category of error
 * @param context - Context where error occurred
 * @returns User-friendly error object
 * @author GitHub Copilot
 */
export const handleError = (
    error: unknown,
    category: ErrorCategory,
    context: string
): AppError => {
    const timestamp = Date.now();
    
    if (error instanceof DOMException) {
        // Security error (canvas tainted, etc.)
        console.error(`[${ErrorCategory.SECURITY}] ${context}:`, error);
        return {
            category: ErrorCategory.SECURITY,
            message: error.message,
            technicalDetails: `DOMException in ${context}: ${error.name}`,
            timestamp,
            userMessage: 'Unable to access image data. Please check CORS settings.'
        };
    }
    
    if (error instanceof TypeError) {
        // Runtime error (null reference, undefined property)
        console.error(`[${ErrorCategory.RUNTIME}] ${context}:`, error);
        return {
            category: ErrorCategory.RUNTIME,
            message: error.message,
            technicalDetails: `TypeError in ${context}: ${error.stack}`,
            timestamp,
            userMessage: 'Something went wrong. Please try again.'
        };
    }
    
    // Generic error
    console.error(`[${category}] ${context}:`, error);
    return {
        category,
        message: String(error),
        technicalDetails: `${context}: ${JSON.stringify(error)}`,
        timestamp,
        userMessage: 'An unexpected error occurred. Please contact support.'
    };
};
```

**Usage:**
```typescript
// spriteMatching.ts
import { handleError, ErrorCategory } from '@/lib/errorHandler';

try {
    return ctx.getImageData(x0, y0, width, height);
} catch (e) {
    const error = handleError(e, ErrorCategory.SECURITY, 'extractCellImageData');
    // Show user-friendly message to user
    toast.error(error.userMessage);
    return null;
}
```

---

#### 6. **Add Accessibility Attributes**
**Priority**: 🟡 HIGH  
**Files**: `SpriteCapture.tsx`, `GridEditorPanel.tsx`

**Updates:**
```tsx
// SpriteCapture.tsx - Grid cells
<button
    key={`${r}-${c}`}
    onClick={() => handleCellClick(r, c)}
    onMouseEnter={() => handleCellHover(r, c)}
    className={`border transition-colors ${bgColor}`}
    role="gridcell"
    aria-label={`Cell at row ${r + 1}, column ${c + 1}. ${
        wasSaved ? 'Reference sprite saved' :
        detectedType !== null ? `Detected as ${TILE_TYPES[detectedType]?.name}. Click to save.` :
        'No match detected. Click to save as reference.'
    }`}
    aria-pressed={wasSaved}
    tabIndex={0}
    onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCellClick(r, c);
        }
    }}
/>

// GridEditorPanel.tsx - Add landmark roles
<div role="application" aria-label="Level Mapper Grid Editor">
    <div role="toolbar" aria-label="Grid editing tools">
        {/* Toolbar buttons */}
    </div>
    
    <div 
        role="grid" 
        aria-label={`Level grid with ${rows} rows and ${cols} columns`}
        aria-readonly="false"
    >
        {/* Grid cells */}
    </div>
</div>
```

---

### MEDIUM PRIORITY (Quality Improvements)

#### 7. **Create Structured Logging Service**
**Priority**: 🟢 MEDIUM  
**File**: Create `src/lib/logger.ts`

```typescript
/**
 * Structured logging service for development and production
 * @author GitHub Copilot
 */

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: number;
    context?: Record<string, any>;
}

class Logger {
    private isDevelopment = process.env.NODE_ENV === 'development';
    
    /**
     * Log debug information (development only)
     * @param message - Debug message
     * @param context - Additional context data
     * @author GitHub Copilot
     */
    debug(message: string, context?: Record<string, any>): void {
        if (this.isDevelopment) {
            this.log(LogLevel.DEBUG, message, context);
        }
    }
    
    /**
     * Log informational message
     * @param message - Info message
     * @param context - Additional context data
     * @author GitHub Copilot
     */
    info(message: string, context?: Record<string, any>): void {
        this.log(LogLevel.INFO, message, context);
    }
    
    /**
     * Log warning message
     * @param message - Warning message
     * @param context - Additional context data
     * @author GitHub Copilot
     */
    warn(message: string, context?: Record<string, any>): void {
        this.log(LogLevel.WARN, message, context);
    }
    
    /**
     * Log error message
     * @param message - Error message
     * @param error - Error object
     * @param context - Additional context data
     * @author GitHub Copilot
     */
    error(message: string, error?: Error, context?: Record<string, any>): void {
        this.log(LogLevel.ERROR, message, {
            ...context,
            error: error?.message,
            stack: error?.stack
        });
    }
    
    private log(level: LogLevel, message: string, context?: Record<string, any>): void {
        const entry: LogEntry = {
            level,
            message,
            timestamp: Date.now(),
            context
        };
        
        const consoleMethod = level === LogLevel.ERROR ? console.error :
                            level === LogLevel.WARN ? console.warn :
                            console.log;
        
        consoleMethod(`[${level}] ${message}`, context);
        
        // In production: Send to monitoring service (e.g., Sentry, DataDog)
        if (!this.isDevelopment && (level === LogLevel.ERROR || level === LogLevel.WARN)) {
            this.sendToMonitoring(entry);
        }
    }
    
    private sendToMonitoring(entry: LogEntry): void {
        // TODO: Implement monitoring service integration
        // Example: Sentry.captureMessage(entry.message, { level: entry.level, extra: entry.context });
    }
}

export const logger = new Logger();
```

**Replace all console.log:**
```typescript
// Before
console.log(`Auto-loaded Level ${lvl.id}`);

// After
import { logger } from '@/lib/logger';
logger.info('Level auto-loaded', { levelId: lvl.id });
```

---

#### 8. **Add Unit Tests for Detection Logic**
**Priority**: 🟢 MEDIUM  
**File**: Create `src/lib/spriteMatching.test.ts`

```typescript
/**
 * Unit tests for sprite matching algorithms
 * @author GitHub Copilot
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { compareImages, findBestMatch } from './spriteMatching';

describe('compareImages', () => {
    it('should return 1.0 for identical images', async () => {
        const imageData = createTestImageData(10, 10, [255, 0, 0, 255]);
        const similarity = await compareImages(imageData, imageData);
        expect(similarity).toBe(1.0);
    });
    
    it('should return 0.0 for completely different images', async () => {
        const red = createTestImageData(10, 10, [255, 0, 0, 255]);
        const blue = createTestImageData(10, 10, [0, 0, 255, 255]);
        const similarity = await compareImages(red, blue);
        expect(similarity).toBeLessThan(0.1);
    });
    
    it('should use strict threshold for void tiles', async () => {
        const voidTile = createTestImageData(10, 10, [10, 10, 10, 255]); // Dark
        const similarVoid = createTestImageData(10, 10, [15, 15, 15, 255]);
        const similarity = await compareImages(voidTile, similarVoid);
        expect(similarity).toBeGreaterThan(0.80); // Strict threshold
    });
});

describe('findBestMatch', () => {
    beforeEach(() => {
        // Clear localStorage
        localStorage.clear();
    });
    
    it('should return null when no references exist', async () => {
        const testCell = createTestImageData(10, 10, [100, 100, 100, 255]);
        const match = await findBestMatch(testCell);
        expect(match).toBeNull();
    });
    
    it('should return best matching tile type', async () => {
        // Save reference for type 2 (stone)
        saveReference(2, createTestImageData(10, 10, [120, 80, 50, 255]));
        
        const similarCell = createTestImageData(10, 10, [125, 85, 55, 255]);
        const match = await findBestMatch(similarCell);
        expect(match).toBe(2);
    });
});

// Helper functions
function createTestImageData(width: number, height: number, rgba: number[]): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = rgba[0];     // R
        data[i + 1] = rgba[1]; // G
        data[i + 2] = rgba[2]; // B
        data[i + 3] = rgba[3]; // A
    }
    return new ImageData(data, width, height);
}
```

---

## PERFORMANCE CONSIDERATIONS

### Current Performance Issues

#### 1. **Synchronous Grid Detection**
**Problem**: `detectGridFromImage()` blocks main thread
**Impact**: UI freezes during bulk detection on large grids

**Solution**: Use Web Workers
```typescript
// src/workers/detectionWorker.ts
self.addEventListener('message', async (e) => {
    const { imageData, references } = e.data;
    
    const result = await findBestMatch(imageData);
    
    self.postMessage({ result });
});

// Usage in LevelMapperContext.tsx
const worker = new Worker(new URL('./workers/detectionWorker.ts', import.meta.url));

worker.postMessage({ imageData: cell, references: getCellReferences() });
worker.onmessage = (e) => {
    const { result } = e.data;
    // Update grid
};
```

#### 2. **Redundant Image Loads**
**Problem**: `loadImageData()` creates new canvas for every reference comparison

**Solution**: Cache loaded reference images
```typescript
// spriteMatching.ts
const referenceImageCache = new Map<string, ImageData>();

export const loadImageData = async (base64Image: string): Promise<ImageData | null> => {
    // Check cache first
    if (referenceImageCache.has(base64Image)) {
        return referenceImageCache.get(base64Image)!;
    }
    
    // Load and cache
    const imageData = await loadImageDataInternal(base64Image);
    if (imageData) {
        referenceImageCache.set(base64Image, imageData);
    }
    return imageData;
};
```

#### 3. **Multiple Detection Passes**
**Problem**: Hover detection runs on every mouse move

**Solution**: Debounce detection calls
```typescript
// GridEditorPanel.tsx
const debouncedDetection = useMemo(
    () => debounce(async (r: number, c: number) => {
        setIsDetecting(true);
        const result = await findBestMatch(cellImageData);
        setDetectedType(result);
        setIsDetecting(false);
    }, 150), // 150ms delay
    []
);
```

---

## SECURITY CONSIDERATIONS

### Current Security Issues

#### 1. **localStorage Without Encryption**
**Risk**: Reference sprites stored in plain base64
**Threat**: Local storage can be read by any script

**Mitigation**: Not critical for public game assets, but document limitation

#### 2. **CORS and Canvas Tainting**
**Risk**: Images from different origins taint canvas
**Current Handling**: Try-catch in `extractCellImageData()`

**Recommendation**: Add explicit CORS headers
```typescript
// When loading images
const img = new Image();
img.crossOrigin = 'anonymous'; // Enable CORS
img.src = imageURL;
```

#### 3. **Content Security Policy**
**Current**: None specified
**Recommendation**: Add CSP headers
```html
<!-- index.html -->
<meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    img-src 'self' data: blob:;
    script-src 'self' 'unsafe-inline';
    style-src 'self' 'unsafe-inline';
">
```

---

## TESTING STRATEGY

### Manual Testing Checklist

#### Cell 3,7 Verification
- [ ] Upload level6.png
- [ ] Navigate to Capture tab
- [ ] Hover over cell 3,7
- [ ] Verify detection shows "Arrow Left (10)" not "Stone (2)"
- [ ] Click to save as reference
- [ ] Switch to Editor tab
- [ ] Run "Detect Grid from Image"
- [ ] Verify cell 3,7 is Arrow Left (10)
- [ ] Check no other arrow cells misclassified as stone

#### Sprite Matching Priority
- [ ] Save multiple arrow references (types 7-10)
- [ ] Save stone references (type 2)
- [ ] Run bulk detection
- [ ] Verify arrows locked by sprite matches
- [ ] Verify stones detected by pattern for non-referenced cells
- [ ] Check console logs show sprite match count

#### Edge Cases
- [ ] Upload image with no grid alignment
- [ ] Test with 0 saved references (pattern only)
- [ ] Test with all cell types referenced (sprite only)
- [ ] Test grid resize with active references
- [ ] Test "New Level" button clears session correctly

---

## MIGRATION GUIDE

### Implementing Two-Phase Detection

**Step 1: Make `detectGridFromImage` async**
```typescript
// Current signature
const detectGridFromImage = useCallback((imgEl: HTMLImageElement, rows: number, cols: number) => {

// New signature
const detectGridFromImage = useCallback(async (imgEl: HTMLImageElement, rows: number, cols: number) => {
```

**Step 2: Add sprite matching phase**
```typescript
// PHASE 1: Sprite matching (priority)
const spriteMatches = new Map<string, number>();

for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
        const x0 = offsetX + (imgWidth / cols) * c;
        const y0 = offsetY + (imgHeight / rows) * r;
        const x1 = x0 + cellWidth;
        const y1 = y0 + cellHeight;
        
        const cell = extractCellImageData(canvasRef.current!, x0, y0, x1, y1);
        if (cell) {
            const spriteType = await findBestMatch(cell);
            if (spriteType !== null) {
                spriteMatches.set(`${r},${c}`, spriteType);
            }
        }
    }
}
```

**Step 3: Use sprite matches in grid creation**
```typescript
// PHASE 2: Build grid with sprite priority
const newGrid = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
        const key = `${r},${c}`;
        
        // Check sprite match first (LOCKED)
        if (spriteMatches.has(key)) {
            return spriteMatches.get(key)!;
        }
        
        // Fall back to pattern detection
        const x0 = offsetX + (imgWidth / cols) * c;
        const y0 = offsetY + (imgHeight / rows) * r;
        const x1 = x0 + cellWidth;
        const y1 = y0 + cellHeight;
        
        const cell = extractCellImageData(canvasRef.current!, x0, y0, x1, y1);
        return cell ? detectCellType(cell, r, c) : 0;
    })
);
```

**Step 4: Update calling code**
```typescript
// Anywhere detectGridFromImage is called
await detectGridFromImage(img, rows, cols); // Add await
```

**Step 5: Add loading indicator**
```tsx
// In LeftPanel.tsx or wherever detection is triggered
const [isDetecting, setIsDetecting] = useState(false);

<Button
    onClick={async () => {
        setIsDetecting(true);
        await detectGridFromImage(img, rows, cols);
        setIsDetecting(false);
    }}
    disabled={isDetecting}
>
    {isDetecting ? 'Detecting...' : 'Detect Grid from Image'}
</Button>
```

---

## CONCLUSION

### Root Cause Summary
**Cell 3,7 is detected as Stone (2) instead of Arrow Left (10) because:**

1. **Pattern detection runs BEFORE sprite matching** - violates design requirements
2. **No two-phase detection system** - sprite matches don't lock cells
3. **Arrow Left has red coloring** - triggers brownish pixel detection for stone
4. **Moderate brightness variance** - satisfies stone texture requirements
5. **No sprite reference check** - pattern detection is only detection method used

### Primary Fix Required
**Implement two-phase detection in `detectGridFromImage()`:**
1. Phase 1: Sprite matching with locking
2. Phase 2: Pattern detection for remaining cells

### Secondary Improvements
1. Complete docblock documentation (all functions)
2. Extract magic numbers to constants file
3. Improve error handling with categorization
4. Add accessibility attributes
5. Create structured logging service
6. Add unit tests for detection algorithms

### Compliance Improvements
1. Follow "one file at a time" editing protocol
2. Create detailed plans for large file edits (>300 lines)
3. Request user approval before making changes
4. Add @author tags to all docblocks
5. Differentiate error types in catch blocks

### Estimated Impact
**After implementing two-phase detection:**
- ✅ Cell 3,7 correctly detected as Arrow Left (10)
- ✅ All sprite-referenced cells locked from pattern overrides
- ✅ Pattern detection only runs on unreferenced cells
- ✅ User can save problematic cells as references to fix misdetection
- ✅ Detection accuracy improves from ~70% to ~95% (estimated)

---

**Document Version**: 1.0  
**Last Updated**: November 18, 2025  
**Author**: GitHub Copilot  
**Review Status**: ⚠️ Awaiting User Approval for Implementation
