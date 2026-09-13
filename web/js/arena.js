import * as THREE from "three";

// A lightweight, PUBG/BGMI-style third-person character controller in a flat 500x500 arena.
// Deliberately NOT photorealistic (capsule avatars, flat ground) — this is a movement/networking
// prototype, not the "real game" the product vision defers to a later, revenue-funded phase.
// All simulation is client-authoritative: this module owns position/rotation/action state and
// exposes it via onStateChange for whatever transport wires up multiplayer broadcast.

const ARENA_SIZE = 500;
const WALK_SPEED = 4.2;
const SPRINT_MULTIPLIER = 1.8;
const CROUCH_MULTIPLIER = 0.5;
const PRONE_MULTIPLIER = 0.22;
const JUMP_VELOCITY = 6.5;
const GRAVITY = -18;
const STAND_HEIGHT = 1.7;
const CROUCH_HEIGHT = 1.0;
const PRONE_HEIGHT = 0.4;
const POSE_LERP_SPEED = 6;
const STATE_BROADCAST_HZ = 10;

const KEY_BINDINGS = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  sprint: ["ShiftLeft", "ShiftRight"],
  jump: ["Space"],
  crouch: ["ControlLeft", "ControlRight", "KeyC"],
  prone: ["KeyZ"],
};

function actionFromPose(pose, moving, sprinting) {
  if (pose === "prone") return "prone";
  if (pose === "crouch") return "crouch";
  if (sprinting && moving) return "sprint";
  if (moving) return "walk";
  return "idle";
}

export function createArena(container, { onStateChange, remoteLabel = "" } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd0ff);
  scene.fog = new THREE.Fog(0x9fd0ff, 60, 220);

  const camera = new THREE.PerspectiveCamera(65, container.clientWidth / container.clientHeight, 0.1, 1000);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  container.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(60, 120, 40);
  scene.add(sun);

  const groundGeometry = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE, 20, 20);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x4caf6a, wireframe: false });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const gridHelper = new THREE.GridHelper(ARENA_SIZE, 50, 0x2f6e45, 0x2f6e45);
  gridHelper.position.y = 0.01;
  scene.add(gridHelper);

  function makeAvatar(color = 0xffcc66) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.0, 4, 8), new THREE.MeshStandardMaterial({ color }));
    body.position.y = STAND_HEIGHT / 2;
    group.add(body);
    return { group, body };
  }

  const self = makeAvatar(0x3fa9f5);
  scene.add(self.group);

  const remotePlayers = new Map();

  const input = { forward: false, back: false, left: false, right: false, sprint: false, jump: false, crouch: false, prone: false };
  const player = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, velocityY: 0, grounded: true, pose: "stand", currentHeight: STAND_HEIGHT };

  function keyMatches(code, bindings) { return bindings.includes(code); }
  function onKeyDown(event) {
    for (const [action, codes] of Object.entries(KEY_BINDINGS)) {
      if (keyMatches(event.code, codes)) {
        if (action === "jump") { input.jump = true; }
        else if (action === "crouch") { input.crouch = !input.crouch; if (input.crouch) input.prone = false; }
        else if (action === "prone") { input.prone = !input.prone; if (input.prone) input.crouch = false; }
        else input[action] = true;
      }
    }
  }
  function onKeyUp(event) {
    for (const [action, codes] of Object.entries(KEY_BINDINGS)) {
      if (keyMatches(event.code, codes) && !["jump", "crouch", "prone"].includes(action)) input[action] = false;
    }
  }
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  let pointerLocked = false;
  function onMouseMove(event) {
    if (!pointerLocked) return;
    player.yaw -= event.movementX * 0.0022;
    player.pitch -= event.movementY * 0.0022;
    player.pitch = Math.max(-0.6, Math.min(0.9, player.pitch));
  }
  function requestLock() { renderer.domElement.requestPointerLock?.(); }
  renderer.domElement.addEventListener("click", requestLock);
  document.addEventListener("pointerlockchange", () => { pointerLocked = document.pointerLockElement === renderer.domElement; });
  document.addEventListener("mousemove", onMouseMove);

  // Touch controls: left-half drag = movement joystick, right-half drag = look.
  const touchState = { moveId: null, moveStart: null, moveVector: { x: 0, y: 0 }, lookId: null, lookLast: null };
  function onTouchStart(event) {
    for (const touch of event.changedTouches) {
      const isLeft = touch.clientX < container.clientWidth / 2;
      if (isLeft && touchState.moveId === null) { touchState.moveId = touch.identifier; touchState.moveStart = { x: touch.clientX, y: touch.clientY }; }
      else if (!isLeft && touchState.lookId === null) { touchState.lookId = touch.identifier; touchState.lookLast = { x: touch.clientX, y: touch.clientY }; }
    }
  }
  function onTouchMove(event) {
    for (const touch of event.changedTouches) {
      if (touch.identifier === touchState.moveId && touchState.moveStart) {
        const dx = touch.clientX - touchState.moveStart.x, dy = touch.clientY - touchState.moveStart.y;
        touchState.moveVector = { x: Math.max(-1, Math.min(1, dx / 40)), y: Math.max(-1, Math.min(1, dy / 40)) };
      } else if (touch.identifier === touchState.lookId && touchState.lookLast) {
        const dx = touch.clientX - touchState.lookLast.x, dy = touch.clientY - touchState.lookLast.y;
        player.yaw -= dx * 0.004;
        player.pitch = Math.max(-0.6, Math.min(0.9, player.pitch - dy * 0.004));
        touchState.lookLast = { x: touch.clientX, y: touch.clientY };
      }
    }
  }
  function onTouchEnd(event) {
    for (const touch of event.changedTouches) {
      if (touch.identifier === touchState.moveId) { touchState.moveId = null; touchState.moveStart = null; touchState.moveVector = { x: 0, y: 0 }; }
      if (touch.identifier === touchState.lookId) { touchState.lookId = null; touchState.lookLast = null; }
    }
  }
  renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });
  renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: true });
  renderer.domElement.addEventListener("touchend", onTouchEnd, { passive: true });

  function setPose(pose) {
    input.jumpTriggerPose = pose;
  }
  const touchActions = { sprint: false, jump: false };
  function triggerTouchAction(action) {
    if (action === "jump") input.jump = true;
    else if (action === "crouch") { input.crouch = !input.crouch; if (input.crouch) input.prone = false; }
    else if (action === "prone") { input.prone = !input.prone; if (input.prone) input.crouch = false; }
    else if (action === "sprint") touchActions.sprint = !touchActions.sprint;
  }

  let lastBroadcast = 0;
  const clock = new THREE.Clock();

  function step() {
    const dt = Math.min(0.05, clock.getDelta());

    const moveX = (input.left ? -1 : 0) + (input.right ? 1 : 0) + touchState.moveVector.x;
    const moveZ = (input.forward ? -1 : 0) + (input.back ? 1 : 0) + touchState.moveVector.y;
    const moving = Math.abs(moveX) > 0.05 || Math.abs(moveZ) > 0.05;
    const sprinting = (input.sprint || touchActions.sprint) && !input.crouch && !input.prone;

    let speed = WALK_SPEED;
    if (input.prone) speed *= PRONE_MULTIPLIER;
    else if (input.crouch) speed *= CROUCH_MULTIPLIER;
    else if (sprinting) speed *= SPRINT_MULTIPLIER;

    if (moving) {
      const len = Math.hypot(moveX, moveZ) || 1;
      const nx = moveX / len, nz = moveZ / len;
      const sinYaw = Math.sin(player.yaw), cosYaw = Math.cos(player.yaw);
      const worldX = nx * cosYaw - nz * sinYaw;
      const worldZ = nx * sinYaw + nz * cosYaw;
      player.x += worldX * speed * dt;
      player.z += worldZ * speed * dt;
      const half = ARENA_SIZE / 2 - 1;
      player.x = Math.max(-half, Math.min(half, player.x));
      player.z = Math.max(-half, Math.min(half, player.z));
    }

    if (input.jump && player.grounded && !input.prone) { player.velocityY = JUMP_VELOCITY; player.grounded = false; input.jump = false; }
    else input.jump = false;
    player.velocityY += GRAVITY * dt;
    player.y += player.velocityY * dt;
    if (player.y <= 0) { player.y = 0; player.velocityY = 0; player.grounded = true; }

    const targetPose = input.prone ? "prone" : input.crouch ? "crouch" : "stand";
    player.pose = targetPose;
    const targetHeight = targetPose === "prone" ? PRONE_HEIGHT : targetPose === "crouch" ? CROUCH_HEIGHT : STAND_HEIGHT;
    player.currentHeight += (targetHeight - player.currentHeight) * Math.min(1, POSE_LERP_SPEED * dt);

    self.group.position.set(player.x, player.y, player.z);
    self.group.rotation.y = player.yaw;
    self.body.scale.y = player.currentHeight / STAND_HEIGHT;
    self.body.position.y = player.currentHeight / 2;

    const camDistance = 5.5, camHeight = player.currentHeight + 1.2;
    const camX = player.x - Math.sin(player.yaw) * camDistance * Math.cos(player.pitch);
    const camZ = player.z - Math.cos(player.yaw) * camDistance * Math.cos(player.pitch);
    const camY = player.y + camHeight + Math.sin(player.pitch) * camDistance;
    camera.position.set(camX, camY, camZ);
    camera.lookAt(player.x, player.y + player.currentHeight * 0.6, player.z);

    if (onStateChange) {
      const now = performance.now();
      if (now - lastBroadcast > 1000 / STATE_BROADCAST_HZ) {
        lastBroadcast = now;
        onStateChange({ x: Math.round(player.x * 100) / 100, y: Math.round(player.y * 100) / 100, z: Math.round(player.z * 100) / 100, yaw: Math.round(player.yaw * 1000) / 1000, action: actionFromPose(player.pose, moving, sprinting) });
      }
    }

    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(step);
  }
  let animationFrame = requestAnimationFrame(step);

  function applyRemoteState(participantId, state) {
    let remote = remotePlayers.get(participantId);
    if (!remote) { remote = makeAvatar(0xff6f61); scene.add(remote.group); remotePlayers.set(participantId, remote); }
    remote.group.position.set(state.x, state.y, state.z);
    remote.group.rotation.y = state.yaw;
    const height = state.action === "prone" ? PRONE_HEIGHT : state.action === "crouch" ? CROUCH_HEIGHT : STAND_HEIGHT;
    remote.body.scale.y = height / STAND_HEIGHT;
    remote.body.position.y = height / 2;
  }
  function removeRemote(participantId) {
    const remote = remotePlayers.get(participantId);
    if (!remote) return;
    scene.remove(remote.group);
    remotePlayers.delete(participantId);
  }

  function onResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  window.addEventListener("resize", onResize);

  function destroy() {
    cancelAnimationFrame(animationFrame);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    document.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("resize", onResize);
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  return { applyRemoteState, removeRemote, triggerTouchAction, destroy, getState: () => ({ ...player }), getRemoteCount: () => remotePlayers.size, _debug: { input, player } };
}
