import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const palletDefaults = {
  length: 1.2,
  width: 1.0,
  thickness: 0.13,
  maxHeight: 1.6,
};

const form = document.getElementById('calculator-form');
const resultBox = document.getElementById('result');
const exampleButton = document.getElementById('load-example');

let scene, camera, renderer, palletGroup;

let cameraControls = {
  isRotating: false,
  previousMousePosition: { x: 0, y: 0 },
  rotation: { x: 0, y: 0 },
  zoom: 5.4,
  minZoom: 2,
  maxZoom: 15,
};

const cameraInitialPosition = {
  distance: 5.4,
  x: 2.8,
  y: 2.8,
};

function getInputs() {
  const box = {
    length: parseFloat(document.getElementById('box-length').value),
    width: parseFloat(document.getElementById('box-width').value),
    height: parseFloat(document.getElementById('box-height').value),
  };

  const pallet = {
    length: parseFloat(document.getElementById('pallet-length').value) || palletDefaults.length,
    width: parseFloat(document.getElementById('pallet-width').value) || palletDefaults.width,
    thickness: parseFloat(document.getElementById('pallet-thickness').value) || palletDefaults.thickness,
    maxHeight: parseFloat(document.getElementById('max-height').value) || palletDefaults.maxHeight,
  };

  return { box, pallet };
}

function formatNumber(value, decimals = 2) {
  return Number(value).toFixed(decimals).replace('.', ',');
}

function permuteDimensions(dimensions) {
  const variants = [];
  const d = [...dimensions];

  for (let i = 0; i < 3; i++) {
    const current = d.slice();
    variants.push(current);
    const next = [d[1], d[2], d[0]];
    d.splice(0, d.length, ...next);
  }

  return variants;
}

function getAlternatingPatternCount(palletObj, variant) {
  if (variant.x <= 0 || variant.y <= 0) return 0;

  let total = 0;
  let rowIndex = 0;

  while (true) {
    const useRotated = rowIndex % 2 === 1 && variant.x !== variant.y;
    const currentLength = useRotated ? variant.y : variant.x;
    const currentWidth = useRotated ? variant.x : variant.y;

    const boxesPerRow = Math.max(0, Math.floor(palletObj.length / currentLength));
    const boxesPerColumn = Math.max(0, Math.floor(palletObj.width / currentWidth));
    const boxesThisRow = boxesPerRow * boxesPerColumn;

    if (boxesThisRow <= 0) {
      break;
    }

    total += boxesThisRow;
    rowIndex += 1;

    if (total >= 100000) break;
  }

  return total;
}

function getBestOrientation(box, palletObj) {
  const variants = [];
  const dimensions = [box.length, box.width, box.height];
  const seen = new Set();

  for (const variant of permuteDimensions(dimensions)) {
    const key = variant.join('-');
    if (!seen.has(key)) {
      seen.add(key);
      variants.push({ x: variant[0], y: variant[1], z: variant[2] });
    }
  }

  const valid = [];

  for (const variant of variants) {
    if (variant.x <= 0 || variant.y <= 0 || variant.z <= 0) {
      continue;
    }

    const boxesPerLayer = getAlternatingPatternCount(palletObj, variant);
    if (boxesPerLayer <= 0) {
      continue;
    }

    const usableStackHeight = Math.max(0, palletObj.maxHeight - palletObj.thickness);
    const layers = Math.floor(usableStackHeight / variant.z);

    if (layers <= 0) {
      continue;
    }

    valid.push({
      ...variant,
      boxesPerLayer,
      layers,
      totalBoxes: boxesPerLayer * layers,
      totalHeight: palletObj.thickness + variant.z * layers,
      volume: boxesPerLayer * layers * variant.x * variant.y * variant.z,
    });
  }

  if (!valid.length) {
    return null;
  }

  valid.sort((a, b) => {
    if (b.totalBoxes !== a.totalBoxes) return b.totalBoxes - a.totalBoxes;
    if (b.volume !== a.volume) return b.volume - a.volume;
    return a.totalHeight - b.totalHeight;
  });

  return valid[0];
}

function setupCameraControls(container) {
  container.addEventListener('mousedown', (e) => {
    cameraControls.isRotating = true;
    cameraControls.previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  document.addEventListener('mousemove', (e) => {
    if (!cameraControls.isRotating) return;

    const deltaX = e.clientX - cameraControls.previousMousePosition.x;
    const deltaY = e.clientY - cameraControls.previousMousePosition.y;

    cameraControls.rotation.y += deltaX * 0.01;
    cameraControls.rotation.x += deltaY * 0.01;
    cameraControls.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraControls.rotation.x));

    cameraControls.previousMousePosition = { x: e.clientX, y: e.clientY };
    updateCameraPosition();
  });

  document.addEventListener('mouseup', () => {
    cameraControls.isRotating = false;
  });

  container.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const zoomSpeed = 0.5;
      if (e.deltaY < 0) {
        cameraControls.zoom = Math.max(cameraControls.minZoom, cameraControls.zoom - zoomSpeed);
      } else {
        cameraControls.zoom = Math.min(cameraControls.maxZoom, cameraControls.zoom + zoomSpeed);
      }
      updateCameraPosition();
    },
    { passive: false }
  );

  document.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') {
      cameraControls.rotation = { x: 0, y: 0 };
      cameraControls.zoom = cameraInitialPosition.distance;
      updateCameraPosition();
    }
  });
}

function updateCameraPosition() {
  if (!camera) return;

  const radius = cameraControls.zoom;
  const x = radius * Math.sin(cameraControls.rotation.y) * Math.cos(cameraControls.rotation.x);
  const y = radius * Math.sin(cameraControls.rotation.x) + 0.7;
  const z = radius * Math.cos(cameraControls.rotation.y) * Math.cos(cameraControls.rotation.x);

  camera.position.set(x, y, z);
  camera.lookAt(0, 0.7, 0);
}

function init3DScene() {
  const container = document.getElementById('canvas-container');
  if (!container) return;

  if (!container.clientWidth || !container.clientHeight) {
    container.style.height = '500px';
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f7ff);

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
  updateCameraPosition();

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.3);
  directionalLight.position.set(3, 5, 4);
  scene.add(directionalLight);

  const grid = new THREE.GridHelper(6, 20, 0x9bb7d4, 0xc8d9ea);
  grid.position.y = 0;
  scene.add(grid);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 6),
    new THREE.MeshStandardMaterial({ color: 0xeaf2ff, side: THREE.DoubleSide })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);

  palletGroup = new THREE.Group();
  scene.add(palletGroup);

  setupCameraControls(container);

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  animate();
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    }
  }
}

function render3DFromResult(best, palletObj) {
  if (!scene) {
    init3DScene();
  }

  if (!palletGroup || !renderer || !camera) return;

  clearGroup(palletGroup);

  const pLen = palletObj.length;
  const pWid = palletObj.width;
  const pThick = palletObj.thickness;

  const palletGeometry = new THREE.BoxGeometry(pLen, pThick, pWid);
  const palletMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b5e3c,
    roughness: 0.85,
    metalness: 0.08,
  });

  const palletMesh = new THREE.Mesh(palletGeometry, palletMaterial);
  palletMesh.position.y = pThick / 2;
  palletGroup.add(palletMesh);

  const boxLength = best.x;
  const boxWidth = best.y;
  const boxHeight = best.z;
  let created = 0;
  let rowIndex = 0;

  while (created < best.totalBoxes) {
    const useRotated = rowIndex % 2 === 1 && boxLength !== boxWidth;
    const currentLength = useRotated ? boxWidth : boxLength;
    const currentWidth = useRotated ? boxLength : boxWidth;

    const countPerRow = Math.max(0, Math.floor(pLen / currentLength));
    const countCols = Math.max(0, Math.floor(pWid / currentWidth));

    if (countPerRow <= 0 || countCols <= 0) {
      break;
    }

    for (let i = 0; i < countPerRow; i++) {
      for (let j = 0; j < countCols; j++) {
        if (created >= best.totalBoxes) break;

        const geometry = new THREE.BoxGeometry(currentLength, boxHeight, currentWidth);
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL((created % 8) / 8, 0.7, 0.6),
          roughness: 0.45,
          metalness: 0.12,
        });

        const boxMesh = new THREE.Mesh(geometry, material);
        const x = -pLen / 2 + currentLength / 2 + i * currentLength;
        const z = -pWid / 2 + currentWidth / 2 + j * currentWidth;
        const y = pThick + boxHeight / 2 + (Math.floor(created / best.boxesPerLayer)) * boxHeight;

        boxMesh.position.set(x, y, z);
        palletGroup.add(boxMesh);
        created += 1;
      }
    }

    rowIndex += 1;
  }

  camera.lookAt(0, 0.7, 0);
  renderer.render(scene, camera);
}

function calculateLayout() {
  const { box, pallet } = getInputs();

  if (
    !Number.isFinite(box.length) ||
    !Number.isFinite(box.width) ||
    !Number.isFinite(box.height) ||
    box.length <= 0 ||
    box.width <= 0 ||
    box.height <= 0
  ) {
    resultBox.innerHTML = '<p class="muted">Ingresa medidas válidas para la caja.</p>';
    return;
  }

  if (
    !Number.isFinite(pallet.length) ||
    !Number.isFinite(pallet.width) ||
    !Number.isFinite(pallet.thickness) ||
    !Number.isFinite(pallet.maxHeight) ||
    pallet.length <= 0 ||
    pallet.width <= 0 ||
    pallet.thickness <= 0 ||
    pallet.maxHeight <= 0
  ) {
    resultBox.innerHTML = '<p class="muted">Ingresa dimensiones válidas del pallet.</p>';
    return;
  }

  const best = getBestOrientation(box, pallet);

  if (!best) {
    resultBox.innerHTML = `
      <h3>Sin solución válida</h3>
      <p class="muted">Las dimensiones de la caja no permiten acomodarse dentro del pallet y la altura máxima indicada.</p>
      <ul>
        <li>Prueba con una caja más pequeña.</li>
        <li>Considera otra orientación.</li>
        <li>Verifica que la altura máxima sea mayor que el grosor del pallet.</li>
      </ul>
    `;
    return;
  }

  const boxVolume = box.length * box.width * box.height;
  const utilization = (best.totalBoxes * boxVolume) / (pallet.length * pallet.width * pallet.maxHeight) * 100;
  const orientationText = `(${formatNumber(best.x)} × ${formatNumber(best.y)} × ${formatNumber(best.z)}) m`;

  resultBox.innerHTML = `
    <h3>Mejor disposición encontrada</h3>
    <p class="muted">Se aprovecha la orientación horizontal alternada para maximizar el uso por capa.</p>

    <div class="metrics">
      <div class="metric">
        <span class="label">Orientación</span>
        <span class="value">${orientationText}</span>
      </div>
      <div class="metric">
        <span class="label">Cajas por capa</span>
        <span class="value">${best.boxesPerLayer}</span>
      </div>
      <div class="metric">
        <span class="label">Capas</span>
        <span class="value">${best.layers}</span>
      </div>
      <div class="metric">
        <span class="label">Total cajas</span>
        <span class="value">${best.totalBoxes}</span>
      </div>
      <div class="metric">
        <span class="label">Altura final</span>
        <span class="value">${formatNumber(best.totalHeight)} m</span>
      </div>
      <div class="metric">
        <span class="label">Uso del volumen</span>
        <span class="value">${formatNumber(utilization, 1)}%</span>
      </div>
    </div>

    <ul>
      <li>El pallet mide ${formatNumber(pallet.length)} m × ${formatNumber(pallet.width)} m.</li>
      <li>La altura máxima permitida es ${formatNumber(pallet.maxHeight)} m, tomando en cuenta un pallet de ${formatNumber(pallet.thickness)} m.</li>
      <li>Las filas alternan orientación horizontal para aprovechar mejor el espacio por capa.</li>
    </ul>
  `;

  render3DFromResult(best, pallet);
}

form.addEventListener('submit', function (event) {
  event.preventDefault();
  calculateLayout();
});

exampleButton.addEventListener('click', () => {
  document.getElementById('box-length').value = '0.6';
  document.getElementById('box-width').value = '0.4';
  document.getElementById('box-height').value = '0.25';
  document.getElementById('pallet-length').value = '1.2';
  document.getElementById('pallet-width').value = '1.0';
  document.getElementById('pallet-thickness').value = '0.13';
  document.getElementById('max-height').value = '1.6';
  calculateLayout();
});

window.addEventListener('resize', () => {
  if (!renderer || !camera) return;
  const container = document.getElementById('canvas-container');
  if (!container) return;
  const width = container.clientWidth || 700;
  const height = container.clientHeight || 500;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

init3DScene();
calculateLayout();
