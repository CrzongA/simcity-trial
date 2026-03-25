# Story Implementation Guide

This document outlines the standard design pattern for implementing interactive "stories" (simulations) in the City In Time project.

## Architecture Overview

A "Story" is a decoupled feature set that overlays interactive elements on the 3D map. It follows a 5-layer architecture to ensure clean state management and prevent map entity leaks.

### 1. State Layer (`redux/slice`)
Stores persistent user-added data. Using Redux ensures the state survives story switching and UI remounts.
- **Example**: `missileStrikeSlice.ts` tracks `pinnedStrikes`.

### 2. Controller Layer (`StoryMapController.tsx`)
A logic-only React component that bridges Redux and the Cesium Imperative API.
- **Role**: Synchronizes Redux state to Cesium entities using `useEffect`.
- **Pattern**: **React-to-Cesium Reconciliation**. Instead of toggling `show` properties, the controller actively adds/removes entities based on `activeStory`.
- **Reference**: [MissileMapController.tsx](file:///i:/LEONLAH/myprojects/cityintime/frontend/src/components/stories/MissileMapController.tsx)

### 3. UI Layer (`StoryMenu.tsx`)
Overlay panels for user interaction (sliders, buttons, data displays).
- **Role**: Dispatches actions to Redux.
- **Visibility**: Only rendered when `activeStory` matches the story ID.

### 4. Integration Layer (`CityMap.tsx`)
The root map component.
- **Role**: Mounts the **Story Controller** and **Story UI**.
- **Context Protection**: Uses `viewerRef` to provide the controller with access to the Cesium Viewer instance.

### 5. Interaction Layer (Screen Space Events)
Story-specific mouse/touch handlers.
- **Pattern**: Handlers should be initialized/destroyed inside the Controller's `useEffect`.

---

## Implementation Checklist

### Step 1: Define the Slice
Create a new Redux slice in `src/store/`. Include actions for adding/removing/updating story-specific data.

### Step 2: Create the Controller
Create `src/components/stories/StoryMapController.tsx`.
-   **Refs are Mandatory**: Use `useRef` to store `activeStory` and `viewer` to prevent **Stale Closures** inside Cesium `CallbackProperty` or `preRender` listeners.
-   **Cleanup is Critical**: Always implement an unmount cleanup that sweeps all story-specific entities from `viewer.entities`.
-   **Manual Render**: Call `viewer.scene.requestRender()` after adding/removing entities for immediate feedback.

### Step 3: Implement the UI Overlay
Create the menu/HUD in `src/components/stories/`.

### Step 4: Mount in CityMap
Add the controller below the `CesiumComponent` and the UI overlay in the conditional rendering block.

---

## Case Study: Missile Strike

- **Data**: `pinnedStrikes` array (Redux).
- **Visuals**: `Ellipsoid` (Blast Domes) and `Polyline` (Connecting Paths) managed by `MissileMapController`.
- **HTML Overlays**: Draggable HUDs rendered via React but positioned using `SceneTransforms.worldToWindowCoordinates` in the controller's `preRender` loop.
- **Decoupling**: The main `CityMap.tsx` knows nothing about missile math; it only provides the coordinate system and the viewer handle.
