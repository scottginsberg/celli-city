import * as THREE from 'three';

/**
 * MagnifyingGlass renders a top-down orthographic view of a micro-city into a HUD quad.
 * It also exposes interaction helpers so callers can route pointer/keyboard events to
 * pan, zoom, and select citizens from inside the magnified view.
 */
export default class MagnifyingGlass {
  constructor(options) {
    const {
      renderer,
      scene,
      target,
      overlaySize = 240,
      overlayMargin = 24,
      minZoom = 0.5,
      maxZoom = 4,
      onCitizenSelected = () => {},
      selectable = [],
    } = options;

    this.renderer = renderer;
    this.scene = scene;
    this.target = target;
    this.overlaySize = overlaySize;
    this.overlayMargin = overlayMargin;
    this.minZoom = minZoom;
    this.maxZoom = maxZoom;
    this.onCitizenSelected = onCitizenSelected;
    this.selectable = selectable;

    this.active = false;
    this.dragging = false;
    this.pointerInside = false;
    this.pointerId = null;
    this.clickThreshold = 4;
    this.lastPointer = new THREE.Vector2();
    this.initialPointer = new THREE.Vector2();
    this.renderSize = new THREE.Vector2();

    this.viewport = {
      x: 0,
      y: 0,
      width: overlaySize,
      height: overlaySize,
    };

    this.pixelViewport = {
      x: 0,
      y: 0,
      width: overlaySize,
      height: overlaySize,
    };

    this.raycaster = new THREE.Raycaster();

    this.targetBounds = new THREE.Box3();
    this.targetCenter = new THREE.Vector3();

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 2000);
    this.camera.up.set(0, 0, -1);

    this.hudScene = new THREE.Scene();
    this.hudCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);

    this.renderTarget = new THREE.WebGLRenderTarget(overlaySize, overlaySize, {
      depthBuffer: true,
    });

    this.hudQuad = this.#createHudQuad();
    this.hudScene.add(this.hudQuad);

    this.panLimits = {
      min: new THREE.Vector2(),
      max: new THREE.Vector2(),
    };

    this.zoom = 1;
    this.heightOffset = 20;
    this.dirty = true;

    this.updateTargetBounds(true);
    this.updateViewport();
  }

  activate() {
    if (this.active) return;
    this.active = true;
    this.hudQuad.visible = true;
    this.dirty = true;
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;
    this.hudQuad.visible = false;
    this.dragging = false;
    if (this.pointerId !== null) {
      try {
        this.renderer.domElement.releasePointerCapture(this.pointerId);
      } catch (e) {
        // ignore
      }
    }
    this.pointerId = null;
  }

  toggleActive() {
    if (this.active) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  updateTargetBounds(force = false) {
    if (!this.target) return;

    this.targetBounds.setFromObject(this.target);
    this.targetBounds.getCenter(this.targetCenter);

    const size = this.targetBounds.getSize(new THREE.Vector3());
    const maxHorizontal = Math.max(size.x, size.z);
    this.baseHalfExtent = Math.max(maxHorizontal * 0.5, 1);
    this.targetHeight = this.targetBounds.max.y - this.targetBounds.min.y;
    this.cameraHeight = this.targetBounds.max.y + this.targetHeight + this.heightOffset;

    this.panLimits.min.set(
      this.targetBounds.min.x,
      this.targetBounds.min.z,
    );
    this.panLimits.max.set(
      this.targetBounds.max.x,
      this.targetBounds.max.z,
    );

    if (force) {
      this.center = this.targetCenter.clone();
    } else if (!this.center) {
      this.center = this.targetCenter.clone();
    }

    this.dirty = true;

    this.updateCamera(force);
  }

  updateViewport() {
    const canvas = this.renderer.domElement;
    const clientWidth = canvas.clientWidth || canvas.width;
    const clientHeight = canvas.clientHeight || canvas.height;

    this.viewport.width = this.overlaySize;
    this.viewport.height = this.overlaySize;
    this.viewport.x = Math.max(this.overlayMargin, clientWidth - this.overlayMargin - this.viewport.width);
    this.viewport.y = this.overlayMargin;

    this.updatePixelViewport();
    this.dirty = true;
  }

  updatePixelViewport() {
    const canvas = this.renderer.domElement;
    const pixelRatio = this.renderer.getPixelRatio();
    const clientHeight = canvas.clientHeight || canvas.height;

    this.pixelViewport.width = Math.round(this.viewport.width * pixelRatio);
    this.pixelViewport.height = Math.round(this.viewport.height * pixelRatio);
    this.pixelViewport.x = Math.round(this.viewport.x * pixelRatio);
    this.pixelViewport.y = Math.round((clientHeight - this.viewport.y - this.viewport.height) * pixelRatio);

    if (
      this.renderSize.x !== this.pixelViewport.width ||
      this.renderSize.y !== this.pixelViewport.height
    ) {
      this.renderSize.set(this.pixelViewport.width, this.pixelViewport.height);
      this.renderTarget.setSize(Math.max(1, this.renderSize.x), Math.max(1, this.renderSize.y));
    }
  }

  updateCamera(force = false) {
    if (!this.center) {
      this.center = new THREE.Vector3();
    }

    const halfExtent = this.baseHalfExtent / this.zoom;
    this.camera.left = -halfExtent;
    this.camera.right = halfExtent;
    this.camera.top = halfExtent;
    this.camera.bottom = -halfExtent;
    this.camera.near = 0.01;
    this.camera.far = Math.max(2000, this.cameraHeight + halfExtent * 4);

    const clampedCenter = this.#clampCenter(this.center.clone(), halfExtent);
    this.center.copy(clampedCenter);

    this.camera.position.set(this.center.x, this.cameraHeight, this.center.z);
    this.camera.lookAt(this.center.x, this.targetCenter.y, this.center.z);
    this.camera.updateProjectionMatrix();

    if (force) {
      this.dirty = true;
    }
  }

  update(delta) {
    if (!this.active) return;

    if (this.dirty) {
      this.updatePixelViewport();
      this.dirty = false;
    }
  }

  render() {
    if (!this.active) return;

    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);

    this.renderer.clearDepth();

    const fullSize = new THREE.Vector2();
    this.renderer.getSize(fullSize);

    this.renderer.setViewport(
      this.pixelViewport.x,
      this.pixelViewport.y,
      this.pixelViewport.width,
      this.pixelViewport.height,
    );
    this.renderer.setScissor(
      this.pixelViewport.x,
      this.pixelViewport.y,
      this.pixelViewport.width,
      this.pixelViewport.height,
    );
    this.renderer.setScissorTest(true);

    this.renderer.render(this.hudScene, this.hudCamera);

    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, fullSize.x, fullSize.y);
  }

  resize() {
    this.updateViewport();
    this.updateCamera(true);
  }

  handlePointerDown(event) {
    if (!this.active) return false;
    if (!this.#updatePointerInside(event)) return false;

    this.dragging = true;
    this.pointerId = event.pointerId;
    this.initialPointer.set(event.clientX, event.clientY);
    this.lastPointer.copy(this.initialPointer);
    this.movedDuringDrag = false;

    try {
      this.renderer.domElement.setPointerCapture(event.pointerId);
    } catch (e) {
      // ignore capture errors (e.g., touch events when canvas is detached)
    }

    return true;
  }

  handlePointerMove(event) {
    if (!this.active) return false;

    const inside = this.#updatePointerInside(event);

    if (!inside) return false;

    if (this.dragging && event.pointerId === this.pointerId) {
      const deltaX = event.clientX - this.lastPointer.x;
      const deltaY = event.clientY - this.lastPointer.y;
      this.lastPointer.set(event.clientX, event.clientY);

      if (Math.abs(event.clientX - this.initialPointer.x) > this.clickThreshold ||
          Math.abs(event.clientY - this.initialPointer.y) > this.clickThreshold) {
        this.movedDuringDrag = true;
      }

      const worldWidth = (this.camera.right - this.camera.left);
      const worldHeight = (this.camera.top - this.camera.bottom);

      const moveX = (deltaX / this.viewport.width) * worldWidth;
      const moveZ = (deltaY / this.viewport.height) * worldHeight;

      this.center.x -= moveX;
      this.center.z += moveZ;
      this.updateCamera();
      this.dirty = true;

      return true;
    }

    return inside;
  }

  handlePointerUp(event) {
    if (!this.active) return false;

    const wasDragging = this.dragging;
    const moved = this.movedDuringDrag;

    if (this.dragging && event.pointerId === this.pointerId) {
      this.dragging = false;
      this.pointerId = null;
      this.movedDuringDrag = false;
      try {
        this.renderer.domElement.releasePointerCapture(event.pointerId);
      } catch (e) {
        // ignore
      }
    }

    if (!wasDragging) return false;

    const inside = this.#updatePointerInside(event);
    if (!inside) return false;

    const movement = Math.hypot(
      event.clientX - this.initialPointer.x,
      event.clientY - this.initialPointer.y,
    );

    if (movement <= this.clickThreshold && !moved) {
      this.#selectAtPointer(event);
      return true;
    }

    return false;
  }

  handleWheel(event) {
    if (!this.active) return false;
    if (!this.#updatePointerInside(event)) return false;

    event.preventDefault();

    const zoomFactor = Math.exp(event.deltaY * 0.001);
    this.zoom = THREE.MathUtils.clamp(this.zoom * zoomFactor, this.minZoom, this.maxZoom);
    this.updateCamera();
    this.dirty = true;
    return true;
  }

  handleKeyDown(event) {
    if (event.key.toLowerCase() === 'm') {
      this.toggleActive();
      return true;
    }
    return false;
  }

  getViewport() {
    return { ...this.viewport };
  }

  #selectAtPointer(event) {
    if (!this.selectable.length) return;

    const ndc = this.#pointerToNdc(event);
    if (!ndc) return;

    this.raycaster.setFromCamera(ndc, this.camera);
    const intersects = this.raycaster.intersectObjects(this.selectable, true);

    if (intersects.length > 0) {
      const first = intersects[0].object;
      this.onCitizenSelected(first);
    }
  }

  #pointerToNdc(event) {
    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    const x = event.clientX - canvasRect.left;
    const y = event.clientY - canvasRect.top;

    if (
      x < this.viewport.x ||
      y < this.viewport.y ||
      x > this.viewport.x + this.viewport.width ||
      y > this.viewport.y + this.viewport.height
    ) {
      return null;
    }

    const relativeX = (x - this.viewport.x) / this.viewport.width;
    const relativeY = (y - this.viewport.y) / this.viewport.height;

    const ndcX = relativeX * 2 - 1;
    const ndcY = -relativeY * 2 + 1;

    return new THREE.Vector2(ndcX, ndcY);
  }

  #updatePointerInside(event) {
    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    const x = event.clientX - canvasRect.left;
    const y = event.clientY - canvasRect.top;
    this.pointerInside = (
      x >= this.viewport.x &&
      y >= this.viewport.y &&
      x <= this.viewport.x + this.viewport.width &&
      y <= this.viewport.y + this.viewport.height
    );
    return this.pointerInside;
  }

  #createHudQuad() {
    const hudGroup = new THREE.Group();

    const backgroundGeom = new THREE.PlaneGeometry(2, 2, 16, 16);
    const backgroundMat = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.8,
    });

    const background = new THREE.Mesh(backgroundGeom, backgroundMat);
    background.position.z = -0.5;
    hudGroup.add(background);

    const quadGeom = new THREE.PlaneGeometry(1.8, 1.8, 1, 1);
    const quadMat = new THREE.MeshBasicMaterial({
      map: this.renderTarget.texture,
      transparent: true,
    });
    const quad = new THREE.Mesh(quadGeom, quadMat);
    quad.position.z = 0;
    hudGroup.add(quad);

    const frameGeom = new THREE.RingGeometry(0.93, 1, 64);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    const frame = new THREE.Mesh(frameGeom, frameMat);
    frame.position.z = 0.1;
    hudGroup.add(frame);

    return hudGroup;
  }

  #clampCenter(center, halfExtent) {
    const minX = this.panLimits.min.x + halfExtent;
    const maxX = this.panLimits.max.x - halfExtent;
    const minZ = this.panLimits.min.y + halfExtent;
    const maxZ = this.panLimits.max.y - halfExtent;

    if (minX > maxX) {
      center.x = this.targetCenter.x;
    } else {
      center.x = THREE.MathUtils.clamp(center.x, minX, maxX);
    }

    if (minZ > maxZ) {
      center.z = this.targetCenter.z;
    } else {
      center.z = THREE.MathUtils.clamp(center.z, minZ, maxZ);
    }

    return center;
  }
}
