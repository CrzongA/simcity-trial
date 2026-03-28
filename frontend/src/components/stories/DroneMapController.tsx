import React, { useEffect, useRef } from 'react';
import {
  Cartesian3,
  Math as CesiumMath,
  Ellipsoid,
  Transforms,
  PerspectiveFrustum,
} from 'cesium';
import { useAppDispatch, useAppSelector } from '../../store';
import { setFlightMode, setSpeedTier, AxisCalibration } from '../../store/droneSlice';
import { setBaseLayer } from '../../store/uiSlice';

interface DroneMapControllerProps {
  viewerRef: React.MutableRefObject<any>;
  altRef:    React.MutableRefObject<HTMLSpanElement | null>;
  spdRef:    React.MutableRefObject<HTMLSpanElement | null>;
  hdgRef:    React.MutableRefObject<HTMLSpanElement | null>;
  horizonRef: React.MutableRefObject<SVGLineElement | null>;
  ctrlRef:   React.MutableRefObject<HTMLSpanElement | null>;
}

// ── Physics ────────────────────────────────────────────────────────────────────
const GRAVITY = 9.81; // m/s² — fixed physical constant

// ── Angle mode ─────────────────────────────────────────────────────────────────
const ANGLE_SPEED   = { slow: 10,  normal: 40,  sport: 120 } as const; // m/s
const ANGLE_YAW     = { slow: 30,  normal: 60,  sport: 120 } as const; // deg/s
const ANGLE_INERTIA = 5;   // 1/s — exp-decay rate, ~0.2 s to reach target speed
const MAX_TILT_DEG  = 25;  // cosmetic camera tilt at full stick deflection

// ── Acro mode angular rates (deg/s) ───────────────────────────────────────────
const ACRO_RATES = {
  slow:   { pitch:  90, roll:  90, yaw:  60 },
  normal: { pitch: 180, roll: 180, yaw: 120 },
  sport:  { pitch: 360, roll: 360, yaw: 240 },
} as const;

// ── Module-level scratch vectors (avoid per-frame GC) ─────────────────────────
const _east    = new Cartesian3();
const _north   = new Cartesian3();
const _up      = new Cartesian3();
const _fwd     = new Cartesian3();
const _right   = new Cartesian3();
const _bodyUp  = new Cartesian3();
const _worldUp = new Cartesian3();
const _newPos  = new Cartesian3();

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Body-up unit vector in ECEF, derived analytically from drone HPR.
 *
 * Cesium HPR convention:
 *   h — heading : clockwise from North around ENU-up (Z)
 *   p — pitch   : positive = nose up
 *   r — roll    : positive = right wing up (clockwise viewed from behind)
 *
 * Body-up in ENU frame:
 *   East  (X): −cos(r)·sin(p)·sin(h) + sin(r)·cos(h)
 *   North (Y): −cos(r)·sin(p)·cos(h) − sin(r)·sin(h)
 *   Up    (Z):  cos(r)·cos(p)
 */
function computeBodyUp(
  h: number, p: number, r: number,
  east: Cartesian3, north: Cartesian3, up: Cartesian3,
  result: Cartesian3,
): Cartesian3 {
  const ex = -Math.cos(r) * Math.sin(p) * Math.sin(h) + Math.sin(r) * Math.cos(h);
  const ny = -Math.cos(r) * Math.sin(p) * Math.cos(h) - Math.sin(r) * Math.sin(h);
  const uz =  Math.cos(r) * Math.cos(p);
  result.x = east.x * ex + north.x * ny + up.x * uz;
  result.y = east.y * ex + north.y * ny + up.y * uz;
  result.z = east.z * ex + north.z * ny + up.z * uz;
  return result;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function applyCalibration(raw: number, cal: AxisCalibration): number {
  const { low, mid, high, inverted } = cal;
  const range = raw >= mid ? high - mid : mid - low;
  if (range === 0) return 0;
  const n = (raw - mid) / range;
  return inverted ? -n : n;
}

function applyDeadzone(v: number, dz: number): number {
  if (Math.abs(v) < dz) return 0;
  return (v - Math.sign(v) * dz) / (1 - dz);
}

// ── Component ──────────────────────────────────────────────────────────────────

export const DroneMapController: React.FC<DroneMapControllerProps> = ({
  viewerRef,
  altRef, spdRef, hdgRef, horizonRef, ctrlRef,
}) => {
  const dispatch    = useAppDispatch();
  const activeStory = useAppSelector(state => state.story.activeStory);
  const drone       = useAppSelector(state => state.drone);
  const baseLayer   = useAppSelector(state => state.ui.baseLayer);

  const prevBaseLayerRef = useRef(baseLayer);

  // Switch to satellite on story activate; restore previous layer on exit
  useEffect(() => {
    if (activeStory !== 'drone-flying') return;
    prevBaseLayerRef.current = baseLayer;
    dispatch(setBaseLayer('satellite'));
    return () => { dispatch(setBaseLayer(prevBaseLayerRef.current)); };
  // baseLayer intentionally omitted — capture only at entry, not on every user change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStory, dispatch]);

  // Stale-closure-safe refs for all Redux state used inside preRender
  const activeStoryRef   = useRef(activeStory);
  const gamepadIndexRef  = useRef(drone.gamepadIndex);
  const axisMappingRef   = useRef(drone.axisMapping);
  const buttonMappingRef = useRef(drone.buttonMapping);
  const calibrationRef   = useRef(drone.calibration);
  const deadzoneRef      = useRef(drone.deadzone);
  const sensitivityRef   = useRef(drone.sensitivity);
  const flightModeRef    = useRef(drone.flightMode);
  const speedTierRef     = useRef(drone.speedTier);
  const fovRef           = useRef(drone.fov);
  const massRef              = useRef(drone.mass);
  const acroThrustRef        = useRef(drone.acroThrust);
  const acroDragRef          = useRef(drone.acroDrag);
  const acroCameraTiltRef    = useRef(drone.acroCameraTilt);

  useEffect(() => { activeStoryRef.current   = activeStory; },           [activeStory]);
  useEffect(() => { gamepadIndexRef.current   = drone.gamepadIndex; },   [drone.gamepadIndex]);
  useEffect(() => { axisMappingRef.current    = drone.axisMapping; },    [drone.axisMapping]);
  useEffect(() => { buttonMappingRef.current  = drone.buttonMapping; },  [drone.buttonMapping]);
  useEffect(() => { calibrationRef.current    = drone.calibration; },    [drone.calibration]);
  useEffect(() => { deadzoneRef.current       = drone.deadzone; },       [drone.deadzone]);
  useEffect(() => { sensitivityRef.current    = drone.sensitivity; },    [drone.sensitivity]);
  useEffect(() => { flightModeRef.current     = drone.flightMode; },     [drone.flightMode]);
  useEffect(() => { speedTierRef.current      = drone.speedTier; },      [drone.speedTier]);
  useEffect(() => { fovRef.current            = drone.fov; },            [drone.fov]);
  useEffect(() => { massRef.current           = drone.mass; },           [drone.mass]);
  useEffect(() => { acroThrustRef.current     = drone.acroThrust; },     [drone.acroThrust]);
  useEffect(() => { acroDragRef.current       = drone.acroDrag; },       [drone.acroDrag]);
  useEffect(() => { acroCameraTiltRef.current = drone.acroCameraTilt; }, [drone.acroCameraTilt]);

  // ── Angle mode state ─────────────────────────────────────────────────────────
  const velFwd    = useRef(0); // m/s, heading-forward
  const velStrafe = useRef(0); // m/s, heading-right
  const velClimb  = useRef(0); // m/s, world-up
  const anglePitch = useRef(0); // cosmetic tilt (rad)
  const angleRoll  = useRef(0); // cosmetic tilt (rad)

  // ── Acro mode state ──────────────────────────────────────────────────────────
  const velECEF     = useRef(new Cartesian3(0, 0, 0)); // 3D velocity in ECEF (m/s)
  const acroHeading = useRef(0); // rad
  const acroPitch   = useRef(0); // rad
  const acroRoll    = useRef(0); // rad

  // ── Shared ───────────────────────────────────────────────────────────────────
  const lastTimeRef    = useRef<number | null>(null);
  const keysRef        = useRef<Record<string, boolean>>({});
  const prevButtonsRef = useRef<Record<string | number, boolean>>({});
  const prevModeRef    = useRef(drone.flightMode);
  const lastTerrainSampleTimeRef = useRef<number>(0);
  const lastTerrainHeightRef = useRef<number>(0);

  // ── FOV: apply on change, restore original on story exit ─────────────────────
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;
    if (activeStory !== 'drone-flying') return;

    const frustum = viewer.camera.frustum;
    if (!(frustum instanceof PerspectiveFrustum)) return;

    const originalFov = frustum.fov;
    frustum.fov = CesiumMath.toRadians(fovRef.current);
    viewer.scene.requestRender();

    return () => {
      if (!viewer.isDestroyed() && viewer.camera.frustum instanceof PerspectiveFrustum)
        viewer.camera.frustum.fov = originalFov;
    };
  // Re-run when fov value changes or story activates
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drone.fov, activeStory, viewerRef]);

  // ── Main flight loop ───────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;
    if (activeStory !== 'drone-flying') return;

    viewer.scene.screenSpaceCameraController.enableInputs = false;

    const onKeyDown = (e: KeyboardEvent) => { keysRef.current[e.code] = true; };
    const onKeyUp   = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);

    const flightLoop = () => {
      if (!viewer || viewer.isDestroyed()) return;
      if (activeStoryRef.current !== 'drone-flying') return;

      // ── Delta time ────────────────────────────────────────────────────────
      const now = performance.now();
      const dt  = lastTimeRef.current !== null
        ? Math.min((now - lastTimeRef.current) / 1000, 0.1)
        : 0.016;
      lastTimeRef.current = now;

      // ── Gamepad input ────────────────────────────────────────────────────
      const gp = gamepadIndexRef.current !== null
        ? navigator.getGamepads()[gamepadIndexRef.current] ?? null
        : null;

      const axMap = axisMappingRef.current;
      const cal   = calibrationRef.current;
      const dz    = deadzoneRef.current;

      let throttleIn = 0, yawIn = 0, pitchIn = 0, rollIn = 0;

      if (gp) {
        throttleIn = applyDeadzone(applyCalibration(gp.axes[axMap.throttle] ?? 0, cal.throttle), dz);
        yawIn      = applyDeadzone(applyCalibration(gp.axes[axMap.yaw]      ?? 0, cal.yaw),      dz);
        pitchIn    = applyDeadzone(applyCalibration(gp.axes[axMap.pitch]    ?? 0, cal.pitch),    dz);
        rollIn     = applyDeadzone(applyCalibration(gp.axes[axMap.roll]     ?? 0, cal.roll),     dz);
        // Gamepad Y-axis: up = negative raw → invert for intuitive feel
        throttleIn = -throttleIn;
        pitchIn    = -pitchIn;

        // Button rising-edge detection
        const btnMap  = buttonMappingRef.current;
        const prev    = prevButtonsRef.current;
        const pressed = (i: number) => gp.buttons[i]?.pressed ?? false;

        if (pressed(btnMap.flightModeToggle) && !prev[btnMap.flightModeToggle])
          dispatch(setFlightMode(flightModeRef.current === 'angle' ? 'acro' : 'angle'));

        const tiers: Array<'slow' | 'normal' | 'sport'> = ['slow', 'normal', 'sport'];
        if (pressed(btnMap.speedTierUp) && !prev[btnMap.speedTierUp]) {
          const i = tiers.indexOf(speedTierRef.current);
          if (i < 2) dispatch(setSpeedTier(tiers[i + 1]));
        }
        if (pressed(btnMap.speedTierDown) && !prev[btnMap.speedTierDown]) {
          const i = tiers.indexOf(speedTierRef.current);
          if (i > 0) dispatch(setSpeedTier(tiers[i - 1]));
        }

        prevButtonsRef.current = {
          [btnMap.flightModeToggle]: pressed(btnMap.flightModeToggle),
          [btnMap.speedTierUp]:      pressed(btnMap.speedTierUp),
          [btnMap.speedTierDown]:    pressed(btnMap.speedTierDown),
        };
      }

      // ── Keyboard fallback ────────────────────────────────────────────────
      const keys = keysRef.current;
      if (keys['KeyW']) pitchIn    = Math.max(pitchIn,    1);
      if (keys['KeyS']) pitchIn    = Math.min(pitchIn,   -1);
      if (keys['KeyA']) rollIn     = Math.min(rollIn,    -1);
      if (keys['KeyD']) rollIn     = Math.max(rollIn,     1);
      if (keys['KeyQ']) yawIn      = Math.min(yawIn,    -1);
      if (keys['KeyE']) yawIn      = Math.max(yawIn,     1);
      if (keys['Space'])                            throttleIn = Math.max(throttleIn,  1);
      if (keys['ShiftLeft'] || keys['ShiftRight'])  throttleIn = Math.min(throttleIn, -1);
      if (keys['KeyF'] && !prevButtonsRef.current['__keyF'])
        dispatch(setFlightMode(flightModeRef.current === 'angle' ? 'acro' : 'angle'));
      prevButtonsRef.current['__keyF'] = !!keys['KeyF'];
      if (keys['Digit1']) dispatch(setSpeedTier('slow'));
      if (keys['Digit2']) dispatch(setSpeedTier('normal'));
      if (keys['Digit3']) dispatch(setSpeedTier('sport'));

      const mode = flightModeRef.current;

      // ── Mode transition ──────────────────────────────────────────────────
      if (mode !== prevModeRef.current) {
        const cam = viewer.camera;
        if (mode === 'acro') {
          // Carry current camera heading into acro; reset pitch/roll to level
          acroHeading.current = cam.heading;
          acroPitch.current   = 0;
          acroRoll.current    = 0;
          // Project angle-mode scalar velocity into ECEF 3D velocity
          const t = Transforms.eastNorthUpToFixedFrame(cam.position);
          const ex = t[0], ey = t[1], ez = t[2];
          const nx = t[4], ny = t[5], nz = t[6];
          const ux = t[8], uy = t[9], uz = t[10];
          const h  = cam.heading;
          const sh = Math.sin(h), ch = Math.cos(h);
          velECEF.current.x = (ex*sh + nx*ch)*velFwd.current + (ex*ch - nx*sh)*velStrafe.current + ux*velClimb.current;
          velECEF.current.y = (ey*sh + ny*ch)*velFwd.current + (ey*ch - ny*sh)*velStrafe.current + uy*velClimb.current;
          velECEF.current.z = (ez*sh + nz*ch)*velFwd.current + (ez*ch - nz*sh)*velStrafe.current + uz*velClimb.current;
          velFwd.current = velStrafe.current = velClimb.current = 0;
        } else {
          // acro → angle: full stop; camera will be re-levelled this frame
          velFwd.current = velStrafe.current = velClimb.current = 0;
          anglePitch.current = 0;
          angleRoll.current  = 0;
        }
        prevModeRef.current = mode;
      }

      // ── ENU frame at current camera position ─────────────────────────────
      const camera   = viewer.camera;
      const position = camera.position;
      const enuT     = Transforms.eastNorthUpToFixedFrame(position);
      _east.x  = enuT[0]; _east.y  = enuT[1]; _east.z  = enuT[2];
      _north.x = enuT[4]; _north.y = enuT[5]; _north.z = enuT[6];
      _up.x    = enuT[8]; _up.y    = enuT[9]; _up.z    = enuT[10];

      let finalPos: Cartesian3;

      // ═══════════════════════════════════════════════════════════════════
      //  ANGLE MODE
      //  - velocity lerps toward stick * maxSpeed  →  correct terminal vel
      //  - movement along camera-heading direction, not geographic N/E
      //  - camera pitch/roll = cosmetic tilt that follows stick and self-levels
      // ═══════════════════════════════════════════════════════════════════
      if (mode === 'angle') {
        const maxSpeed = ANGLE_SPEED[speedTierRef.current] * sensitivityRef.current;
        const yawRate  = CesiumMath.toRadians(ANGLE_YAW[speedTierRef.current]) * sensitivityRef.current;
        const lerpT    = 1 - Math.exp(-ANGLE_INERTIA * dt);

        velFwd.current    = lerp(velFwd.current,    pitchIn    * maxSpeed, lerpT);
        velStrafe.current = lerp(velStrafe.current, rollIn     * maxSpeed, lerpT);
        velClimb.current  = lerp(velClimb.current,  throttleIn * maxSpeed, lerpT);

        const yawDelta = yawIn * yawRate * dt;

        // Heading-relative forward and right (not geographic N/E)
        const h = camera.heading;
        const s = Math.sin(h), c = Math.cos(h);
        _fwd.x  = _east.x * s + _north.x * c;
        _fwd.y  = _east.y * s + _north.y * c;
        _fwd.z  = _east.z * s + _north.z * c;
        _right.x = _east.x * c - _north.x * s;
        _right.y = _east.y * c - _north.y * s;
        _right.z = _east.z * c - _north.z * s;

        _newPos.x = position.x + (_fwd.x*velFwd.current + _right.x*velStrafe.current + _up.x*velClimb.current) * dt;
        _newPos.y = position.y + (_fwd.y*velFwd.current + _right.y*velStrafe.current + _up.y*velClimb.current) * dt;
        _newPos.z = position.z + (_fwd.z*velFwd.current + _right.z*velStrafe.current + _up.z*velClimb.current) * dt;

        // Terrain floor clamp
        const carto = Ellipsoid.WGS84.cartesianToCartographic(_newPos);
        if (carto) {
          if (now - lastTerrainSampleTimeRef.current > 100) {
            lastTerrainHeightRef.current = viewer.scene.sampleHeight(carto) ?? 0;
            lastTerrainSampleTimeRef.current = now;
          }
          const terrainH = lastTerrainHeightRef.current;
          if (carto.height < terrainH + 2) {
            carto.height = terrainH + 2;
            velClimb.current = Math.max(0, velClimb.current);
            Ellipsoid.WGS84.cartographicToCartesian(carto, _newPos);
          }
        }
        finalPos = _newPos;

        // Cosmetic tilt: lerp camera pitch/roll toward stick deflection, self-levels on release
        const tiltT    = 1 - Math.exp(-6 * dt);
        const maxTilt  = CesiumMath.toRadians(MAX_TILT_DEG);
        anglePitch.current = lerp(anglePitch.current, -pitchIn * maxTilt, tiltT);
        angleRoll.current  = lerp(angleRoll.current,   rollIn  * maxTilt, tiltT);

        camera.setView({
          destination: finalPos,
          orientation: {
            heading: camera.heading + yawDelta,
            pitch:   anglePitch.current,
            roll:    angleRoll.current,
          },
        });

      // ═══════════════════════════════════════════════════════════════════
      //  ACRO MODE
      //  - sticks control angular rates (not absolute angles)
      //  - gravity pulls down at 9.81 m/s²; thrust along body-up axis
      //  - throttle centre = hover, bottom = free-fall, top = full climb
      //  - air drag provides terminal velocity limits
      // ═══════════════════════════════════════════════════════════════════
      } else {
        const rates = ACRO_RATES[speedTierRef.current];
        const sens  = sensitivityRef.current;

        // Integrate angular rates
        // pitchIn > 0 (stick forward) → nose down → Cesium pitch decreases
        acroHeading.current += yawIn   * CesiumMath.toRadians(rates.yaw)   * sens * dt;
        acroPitch.current   -= pitchIn * CesiumMath.toRadians(rates.pitch) * sens * dt;
        acroRoll.current    += rollIn  * CesiumMath.toRadians(rates.roll)  * sens * dt;
        acroHeading.current  = ((acroHeading.current % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

        // Body-up (thrust direction) computed analytically — no need to call setView first
        computeBodyUp(acroHeading.current, acroPitch.current, acroRoll.current, _east, _north, _up, _bodyUp);
        Ellipsoid.WGS84.geodeticSurfaceNormal(position, _worldUp);

        // Throttle: remap [-1, 1] → [0, 1] so stick centre = hover thrust
        const throttleNorm = (throttleIn + 1) / 2;

        // Mass scales both thrust and drag: heavier = slower response + more inertia
        const mass        = massRef.current;
        const thrustAccel = acroThrustRef.current / mass;
        const dragCoeff   = acroDragRef.current   / mass;

        // Net acceleration = thrust (body-up) − gravity (world-down)
        const ax = _bodyUp.x * thrustAccel * throttleNorm - _worldUp.x * GRAVITY;
        const ay = _bodyUp.y * thrustAccel * throttleNorm - _worldUp.y * GRAVITY;
        const az = _bodyUp.z * thrustAccel * throttleNorm - _worldUp.z * GRAVITY;

        // Integrate velocity with exponential air drag
        const drag = Math.exp(-dragCoeff * dt);
        velECEF.current.x = (velECEF.current.x + ax * dt) * drag;
        velECEF.current.y = (velECEF.current.y + ay * dt) * drag;
        velECEF.current.z = (velECEF.current.z + az * dt) * drag;

        _newPos.x = position.x + velECEF.current.x * dt;
        _newPos.y = position.y + velECEF.current.y * dt;
        _newPos.z = position.z + velECEF.current.z * dt;

        // Terrain floor clamp — cancel downward velocity component on contact
        const carto = Ellipsoid.WGS84.cartesianToCartographic(_newPos);
        if (carto) {
          if (now - lastTerrainSampleTimeRef.current > 100) {
            lastTerrainHeightRef.current = viewer.scene.sampleHeight(carto) ?? 0;
            lastTerrainSampleTimeRef.current = now;
          }
          const terrainH = lastTerrainHeightRef.current;
          if (carto.height < terrainH + 2) {
            carto.height = terrainH + 2;
            Ellipsoid.WGS84.geodeticSurfaceNormal(_newPos, _worldUp);
            const downVel = Cartesian3.dot(velECEF.current, _worldUp);
            if (downVel < 0) {
              velECEF.current.x -= _worldUp.x * downVel;
              velECEF.current.y -= _worldUp.y * downVel;
              velECEF.current.z -= _worldUp.z * downVel;
            }
            Ellipsoid.WGS84.cartographicToCartesian(carto, _newPos);
          }
        }
        finalPos = _newPos;

        camera.setView({
          destination: finalPos,
          orientation: {
            heading: acroHeading.current,
            pitch:   acroPitch.current + CesiumMath.toRadians(acroCameraTiltRef.current),
            roll:    acroRoll.current,
          },
        });
      }

      // ── HUD DOM updates (direct writes, no React re-renders) ─────────────
      const hudCarto = Ellipsoid.WGS84.cartesianToCartographic(finalPos);
      if (altRef.current && hudCarto)
        altRef.current.textContent = Math.round(hudCarto.height).toString();

      if (spdRef.current) {
        const spd = mode === 'acro'
          ? Cartesian3.magnitude(velECEF.current)
          : Math.sqrt(velFwd.current ** 2 + velStrafe.current ** 2 + velClimb.current ** 2);
        spdRef.current.textContent = Math.round(spd).toString();
      }

      if (hdgRef.current)
        hdgRef.current.textContent = Math.round((CesiumMath.toDegrees(camera.heading) + 360) % 360).toString();

      if (horizonRef.current) {
        const rollDeg  = CesiumMath.toDegrees(mode === 'acro' ? acroRoll.current  : angleRoll.current);
        const pitchDeg = CesiumMath.toDegrees(mode === 'acro' ? acroPitch.current : anglePitch.current);
        // translate(0, pitchOffset): pitchDeg negative (nose down) → horizon moves up (negative SVG Y)
        // rotate(rollDeg, cx, cy): positive roll (right wing up) → horizon tilts clockwise
        horizonRef.current.setAttribute(
          'transform',
          `translate(0, ${pitchDeg * 0.3}) rotate(${rollDeg}, 60, 30)`
        );
      }

      if (ctrlRef.current) {
        ctrlRef.current.textContent = gp ? 'CTRL' : 'KB';
        ctrlRef.current.style.color = gp ? '#00ffcc' : '#ffaa00';
      }
    };

    viewer.scene.preRender.addEventListener(flightLoop);

    return () => {
      viewer.scene.preRender.removeEventListener(flightLoop);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
      viewer.scene.screenSpaceCameraController.enableInputs = true;
      velFwd.current = velStrafe.current = velClimb.current = 0;
      Cartesian3.clone(Cartesian3.ZERO, velECEF.current);
      acroPitch.current = acroRoll.current = 0;
      lastTimeRef.current = null;
      keysRef.current     = {};
    };
  }, [activeStory, viewerRef, dispatch]);

  return null;
};
