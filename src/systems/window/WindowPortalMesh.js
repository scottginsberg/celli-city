import {
  AlwaysStencilFunc,
  DoubleSide,
  EqualStencilFunc,
  Group,
  KeepStencilOp,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ReplaceStencilOp
} from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const DEFAULT_SIZE = { width: 1, height: 1 };

/**
 * Mesh grouping that draws the interior side of a portal window.
 */
export default class WindowPortalMesh extends Group {
  constructor(metadata = {}, options = {}) {
    super();

    this.metadata = metadata;
    this.options = options;

    this.matrixAutoUpdate = false;

    const size = this._resolveSize(metadata, options);
    const geometry = new PlaneGeometry(size.width, size.height);

    const stencilRef = options.stencilRef ?? metadata.stencilRef ?? 1;
    const renderOrder = options.renderOrder ?? metadata.renderOrder ?? 10;

    this.maskMaterial = new MeshBasicMaterial({ colorWrite: false });
    this.maskMaterial.depthWrite = true;
    this.maskMaterial.depthTest = true;
    this.maskMaterial.stencilWrite = true;
    this.maskMaterial.stencilRef = stencilRef;
    this.maskMaterial.stencilFunc = AlwaysStencilFunc;
    this.maskMaterial.stencilFail = KeepStencilOp;
    this.maskMaterial.stencilZFail = KeepStencilOp;
    this.maskMaterial.stencilZPass = ReplaceStencilOp;

    this.maskMesh = new Mesh(geometry, this.maskMaterial);
    this.maskMesh.renderOrder = renderOrder;

    this.screenMaterial = new MeshBasicMaterial({
      side: DoubleSide,
      toneMapped: false,
      depthTest: true,
      depthWrite: false,
      transparent: true
    });
    this.screenMaterial.stencilWrite = true;
    this.screenMaterial.stencilRef = stencilRef;
    this.screenMaterial.stencilFunc = EqualStencilFunc;
    this.screenMaterial.stencilFail = KeepStencilOp;
    this.screenMaterial.stencilZFail = KeepStencilOp;
    this.screenMaterial.stencilZPass = KeepStencilOp;

    this.screenMesh = new Mesh(geometry.clone(), this.screenMaterial);
    this.screenMesh.renderOrder = renderOrder + 1;

    this.add(this.maskMesh);
    this.add(this.screenMesh);

    if (metadata.renderTarget) {
      this.updateTexture(metadata.renderTarget);
    }

    if (metadata.interiorTransform) {
      this.setFromMatrix(metadata.interiorTransform);
    } else if (metadata.interiorMatrix) {
      this.setFromMatrix(metadata.interiorMatrix);
    }
  }

  updateTexture(renderTarget) {
    if (!renderTarget) {
      return;
    }

    const texture = renderTarget.texture ?? renderTarget;
    this.screenMaterial.map = texture;
    this.screenMaterial.needsUpdate = true;
  }

  setFromMatrix(matrix) {
    this.matrix.copy(matrix);
    this.matrix.decompose(this.position, this.quaternion, this.scale);
  }

  dispose() {
    this.maskMaterial.dispose();
    this.screenMaterial.dispose();
    this.maskMesh.geometry.dispose();
    this.screenMesh.geometry.dispose();
  }

  _resolveSize(metadata, options) {
    const source = options.size || metadata.size;

    if (!source) {
      return { ...DEFAULT_SIZE };
    }

    if (typeof source === 'number') {
      return { width: source, height: source };
    }

    if (Array.isArray(source)) {
      return { width: source[0] ?? DEFAULT_SIZE.width, height: source[1] ?? source[0] ?? DEFAULT_SIZE.height };
    }

    if (source && typeof source === 'object') {
      return {
        width: source.width ?? source.w ?? DEFAULT_SIZE.width,
        height: source.height ?? source.h ?? source.width ?? DEFAULT_SIZE.height
      };
    }

    return { ...DEFAULT_SIZE };
  }
}
