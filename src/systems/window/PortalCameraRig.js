import {
  Color,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Vector3,
  WebGLRenderTarget
} from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const DEFAULT_TARGET_SIZE = 512;

/**
 * Utility responsible for rendering exterior scenes into portal textures and
 * computing the ghost camera pose that matches the player's interior camera.
 */
export default class PortalCameraRig {
  constructor({ renderer, primaryCamera, exteriorWindows = [], renderTargetOptions = {} } = {}) {
    if (!renderer) {
      throw new Error('PortalCameraRig requires a WebGLRenderer instance.');
    }

    if (!primaryCamera) {
      throw new Error('PortalCameraRig requires a primary camera.');
    }

    this.renderer = renderer;
    this.primaryCamera = primaryCamera;
    this.renderTargetOptions = renderTargetOptions;
    this.windows = [];

    this._interiorMatrix = new Matrix4();
    this._exteriorMatrix = new Matrix4();
    this._cameraLocalMatrix = new Matrix4();
    this._ghostWorldMatrix = new Matrix4();
    this._worldToInterior = new Matrix4();
    this._clearColor = new Color();
    this._tempPosition = new Vector3();
    this._tempQuaternion = new Quaternion();
    this._tempScale = new Vector3(1, 1, 1);

    exteriorWindows.forEach((meta) => this.addWindow(meta));
  }

  addWindow(metadata) {
    if (!metadata) {
      throw new Error('addWindow requires metadata with portal configuration.');
    }

    if (!metadata.exteriorScene) {
      throw new Error('Portal metadata must provide an exteriorScene to render.');
    }

    const entry = {
      id: metadata.id || `portal-${this.windows.length}`,
      meta: metadata,
      camera: this._createGhostCamera(),
      renderTarget: null,
      clearColor: metadata.clearColor ?? null,
      clearAlpha: metadata.clearAlpha ?? 1
    };

    entry.renderTarget = this._createRenderTarget(metadata);
    metadata.renderTarget = entry.renderTarget;
    metadata.renderTexture = entry.renderTarget.texture;

    this._syncGhostCamera(entry, true);
    this.windows.push(entry);

    return entry;
  }

  removeWindow(target) {
    const index = this.windows.findIndex((entry) => entry.meta === target || entry.id === target);

    if (index === -1) {
      return false;
    }

    const [entry] = this.windows.splice(index, 1);
    entry.renderTarget.dispose();
    entry.camera = null;

    return true;
  }

  dispose() {
    this.windows.forEach((entry) => {
      entry.renderTarget.dispose();
    });

    this.windows.length = 0;
  }

  update() {
    const { renderer } = this;

    if (!this.windows.length) {
      return;
    }

    const prevRenderTarget = renderer.getRenderTarget();
    const prevXREnabled = renderer.xr ? renderer.xr.enabled : undefined;
    const prevAutoClear = renderer.autoClear;

    renderer.autoClear = true;
    if (prevXREnabled !== undefined) {
      renderer.xr.enabled = false;
    }

    for (const entry of this.windows) {
      this._syncGhostCamera(entry, false);
      this._ensureTargetSize(entry);

      renderer.setRenderTarget(entry.renderTarget);

      if (entry.clearColor !== null) {
        renderer.getClearColor(this._clearColor);
        const alpha = renderer.getClearAlpha();
        renderer.setClearColor(entry.clearColor, entry.clearAlpha);
        renderer.clear(true, true, true);
        renderer.setClearColor(this._clearColor, alpha);
      } else {
        renderer.clear(true, true, true);
      }

      renderer.render(entry.meta.exteriorScene, entry.camera);
    }

    renderer.setRenderTarget(prevRenderTarget);
    renderer.autoClear = prevAutoClear;

    if (prevXREnabled !== undefined) {
      renderer.xr.enabled = prevXREnabled;
    }
  }

  _syncGhostCamera(entry, force) {
    const { meta, camera } = entry;
    const interiorMatrix = this._resolveMatrix(meta.interiorTransform || meta.interiorMatrix || meta.interiorPose, this._interiorMatrix);
    const exteriorMatrix = this._resolveMatrix(meta.exteriorTransform || meta.exteriorMatrix || meta.exteriorPose, this._exteriorMatrix);

    if (!interiorMatrix || !exteriorMatrix) {
      return;
    }

    const primary = this.primaryCamera;
    if (primary.matrixWorldNeedsUpdate) {
      primary.updateMatrixWorld();
    }

    if (force || camera.matrixWorldNeedsUpdate) {
      camera.updateMatrixWorld();
    }

    this._worldToInterior.copy(interiorMatrix).invert();
    this._cameraLocalMatrix.multiplyMatrices(this._worldToInterior, primary.matrixWorld);
    this._ghostWorldMatrix.multiplyMatrices(exteriorMatrix, this._cameraLocalMatrix);

    camera.matrixWorld.copy(this._ghostWorldMatrix);
    camera.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale);
    camera.matrixWorldNeedsUpdate = false;

    if (primary.isPerspectiveCamera && camera.isPerspectiveCamera) {
      camera.fov = primary.fov;
      camera.near = primary.near;
      camera.far = primary.far;
      camera.aspect = camera.aspect || primary.aspect;
      camera.updateProjectionMatrix();
    } else if (primary.isOrthographicCamera && camera.isOrthographicCamera) {
      camera.left = primary.left;
      camera.right = primary.right;
      camera.top = primary.top;
      camera.bottom = primary.bottom;
      camera.near = primary.near;
      camera.far = primary.far;
      camera.updateProjectionMatrix();
    } else {
      camera.projectionMatrix.copy(primary.projectionMatrix);
      camera.projectionMatrixInverse.copy(primary.projectionMatrixInverse);
    }
  }

  _ensureTargetSize(entry) {
    const { renderTarget, camera, meta } = entry;
    const desired = this._getTargetSize(meta);

    if (renderTarget.width !== desired.width || renderTarget.height !== desired.height) {
      renderTarget.setSize(desired.width, desired.height);

      if (camera.isPerspectiveCamera) {
        camera.aspect = desired.width / desired.height;
        camera.updateProjectionMatrix();
      }
    }
  }

  _createRenderTarget(meta) {
    const size = this._getTargetSize(meta);
    const options = {
      depthBuffer: true,
      stencilBuffer: true,
      ...this.renderTargetOptions,
      ...meta.renderTargetOptions
    };

    const target = new WebGLRenderTarget(size.width, size.height, options);
    target.texture.name = meta.id ? `${meta.id}-portal-texture` : 'portal-texture';

    return target;
  }

  _createGhostCamera() {
    const primary = this.primaryCamera;

    if (primary.isOrthographicCamera) {
      const camera = new OrthographicCamera(primary.left, primary.right, primary.top, primary.bottom, primary.near, primary.far);
      camera.matrixAutoUpdate = false;
      return camera;
    }

    const camera = new PerspectiveCamera(primary.fov, primary.aspect || 1, primary.near, primary.far);
    camera.matrixAutoUpdate = false;

    return camera;
  }

  _getTargetSize(meta) {
    const size = meta.renderTargetSize || meta.resolution || meta.size;

    if (typeof size === 'number') {
      return { width: size, height: size };
    }

    if (Array.isArray(size)) {
      return { width: size[0] ?? DEFAULT_TARGET_SIZE, height: size[1] ?? size[0] ?? DEFAULT_TARGET_SIZE };
    }

    if (size && typeof size === 'object') {
      const width = size.width ?? size.w ?? DEFAULT_TARGET_SIZE;
      const height = size.height ?? size.h ?? width;
      return { width, height };
    }

    return { width: DEFAULT_TARGET_SIZE, height: DEFAULT_TARGET_SIZE };
  }

  _resolveMatrix(source, targetMatrix) {
    if (!source) {
      return null;
    }

    const matrix = targetMatrix || new Matrix4();

    if (source.isMatrix4) {
      return matrix.copy(source);
    }

    if (source.isObject3D) {
      if (source.matrixWorldNeedsUpdate) {
        source.updateMatrixWorld();
      }

      return matrix.copy(source.matrixWorld);
    }

    if (Array.isArray(source) && source.length === 16) {
      return matrix.fromArray(source);
    }

    if (typeof source === 'object' && source.position && source.quaternion) {
      const position = source.position.isVector3
        ? source.position
        : this._tempPosition.fromArray(source.position);
      const quaternion = source.quaternion.isQuaternion
        ? source.quaternion
        : this._tempQuaternion.fromArray(source.quaternion);
      const scale = source.scale && source.scale.isVector3
        ? source.scale
        : source.scale
          ? this._tempScale.fromArray(source.scale)
          : this._tempScale.set(1, 1, 1);

      return matrix.compose(position, quaternion, scale);
    }

    return null;
  }
}
