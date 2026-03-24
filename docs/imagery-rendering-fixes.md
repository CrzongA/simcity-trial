# Imagery & Globe Terrain Rendering — Problem Log

> **Scope:** Resolving imagery / photorealistic tile z-fighting and base-map layer switching in `CityMap.tsx`.  
> **Date:** 2026-03-24

---

## Problem

The CartoDB Dark Matter imagery layer was visually clipping **through** the Google Photorealistic 3D Tileset inside Portsmouth. Applying a `ClippingPolygon` to the imagery was not an option because:

1. Cesium's `ClippingPolygonCollection` API is only available on `Globe`, `Cesium3DTileset`, and `Model` — **not** on individual `ImageryLayer` objects.
2. Polygon-clipping the tileset or globe also affected the water flood volume entity in the same footprint, which is anchored to the same polygon.

---

## Root Causes (Layered)

| Layer | Cause |
|---|---|
| **Imagery bleed** | Imagery layers are composited onto the globe terrain surface. The photorealistic 3D tiles (scene primitives) cannot fully occlude them due to depth precision, so imagery shows through tile gaps. |
| **Default satellite imagery** | Cesium `Viewer` auto-adds a Bing Maps (Ion) imagery layer on init. When CartoDB was removed, this default layer was exposed. |
| **Globe terrain mesh bleed** | Even with no imagery layer, the globe terrain mesh itself (coloured by `globe.baseColor`) bleeds through thin gaps in photorealistic tile geometry. |

---

## Solutions Applied

### 1 — Strip the default imagery layer on init (`CityMap.tsx`)

```ts
// Remove Cesium's auto-added default imagery (Bing satellite via Ion).
viewer.imageryLayers.removeAll();
viewer.scene.globe.baseColor = Color.fromCssColorString('#101217');
```

### 2 — Base Map Control Panel (`BaseMapControls.tsx`)

New component in the lower-right corner offering five switchable base maps:

| Option | Mode | Detail |
|---|---|---|
| 🛰 Satellite | ESRI World Imagery | No API key required |
| 🗺 Streets | OpenStreetMap | Free tiles |
| 🌆 Dark Streets | CartoDB Dark Matter | Original style |

Imagery layers are managed **imperatively** via `viewerRef` — no Resium `<ImageryLayer>` JSX.

### 3 — `globe.clippingPolygons` to remove terrain mesh bleed-through (`CityMap.tsx`)

The final remaining issue was the dark globe terrain **mesh** (not imagery) showing through 3D tile geometry gaps. Fix:

```ts
// Hide the globe terrain mesh inside Portsmouth.
// The photorealistic tileset fully covers this area → no visible void.
viewer.scene.globe.clippingPolygons = new ClippingPolygonCollection({
  polygons: [new ClippingPolygon({ positions: polygonPositionsForWater })],
  // inverse: false (default) → terrain hidden INSIDE the polygon
});
```

**Why the water entity is unaffected:** The flood volume polygon uses absolute sampled heights (`baseHeightRef.current` from `sampleTerrainMostDetailed`), not `HeightReference.CLAMP_TO_GROUND`. It renders correctly regardless of whether the globe terrain mesh is present beneath it.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/components/CityMap.tsx` | Removed imagery layer + `UrlTemplateImageryProvider` imports; added `imageryLayers.removeAll()` on init; added `globe.clippingPolygons` with Portsmouth polygon; mounted `<BaseMapControls>` |
| `frontend/src/components/BaseMapControls.tsx` | **New file** — base map switcher with 5 options, cutout rectangle, imperative layer management |

---

## Key Takeaways

- `ImageryLayer` has no `clippingPolygons` support — use `cutoutRectangle` (rectangular, computed from polygon bounds) instead.
- `globe.clippingPolygons` hides the terrain mesh within a polygon. When a 3D tileset covers the same footprint, the visual result is seamless.
- Polygon entities with absolute `height`/`extrudedHeight` are **not** affected by globe terrain clipping.
- Always call `viewer.imageryLayers.removeAll()` on init if you intend to manage imagery yourself — Cesium always adds a default Bing layer otherwise.
