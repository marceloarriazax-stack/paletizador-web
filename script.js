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

function getBestOrientation(box, pallet) {
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

    const boxesPerRow = Math.floor(pallet.length / variant.x);
    const boxesPerColumn = Math.floor(pallet.width / variant.y);
    const boxesPerLayer = boxesPerRow * boxesPerColumn;

    if (boxesPerLayer <= 0) {
      continue;
    }

    const usableStackHeight = Math.max(0, pallet.maxHeight - pallet.thickness);
    const layers = Math.floor(usableStackHeight / variant.z);

    if (layers <= 0) {
      continue;
    }

    valid.push({
      ...variant,
      boxesPerLayer,
      layers,
      totalBoxes: boxesPerLayer * layers,
      totalHeight: pallet.thickness + variant.z * layers,
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

function init3DScene() {
  const container = document.getElementById('canvas-container');
  if (!container) return;

  if (typeof THREE === 'undefined') {
    console.error('Three.js no está cargado. Revisa la CDN o el acceso a internet.');
    container.innerHTML = '<p class="muted">No se pudo cargar la vista 3D.</p>';
    return;
  }

  if (!container.clientWidth || !container.clientHeight) {
    container.style.height = '500px';
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f7ff);

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.set(2.8, 2.8, 5.4);
  camera.lookAt(0, 0.7, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
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

  function animate() {
    requestAnimationFrame(animate);
    if (palletGroup) {
      palletGroup.rotation.y += 0.006;
    }
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

function render3DFromResult(best) {
  if (!scene) {
    init3DScene();
  }

  if (!palletGroup || !renderer || !camera) return;

  clearGroup(palletGroup);

  const palletLength = parseFloat(document.getElementById('pallet-length').value);
  const palletWidth = parseFloat(document.getElementById('pallet-width').value);
  const palletThickness = parseFloat(document.getElementById('pallet-thickness').value);

  const palletGeometry = new THREE.BoxGeometry(palletLength, palletThickness, palletWidth);
  const palletMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b5e3c,
    roughness: 0.85,
    metalness: 0.08,
  });

  const palletMesh = new THREE.Mesh(palletGeometry, palletMaterial);
  palletMesh.position.y = palletThickness / 2;
  palletGroup.add(palletMesh);

  const boxLength = best.x;
  const boxWidth = best.y;
  const boxHeight = best.z;
  const rows = Math.max(1, Math.floor(palletLength / boxLength));
  const cols = Math.max(1, Math.floor(palletWidth / boxWidth));
  let created = 0;

  for (let layer = 0; layer < best.layers; layer++) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (created >= best.totalBoxes) break;

        const geometry = new THREE.BoxGeometry(boxLength, boxHeight, boxWidth);
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL((created % 8) / 8, 0.7, 0.6),
          roughness: 0.45,
          metalness: 0.12,
        });

        const boxMesh = new THREE.Mesh(geometry, material);
        const x = -palletLength / 2 + boxLength / 2 + row * boxLength;
        const z = -palletWidth / 2 + boxWidth / 2 + col * boxWidth;
        const y = palletThickness + boxHeight / 2 + layer * boxHeight;

        boxMesh.position.set(x, y, z);
        palletGroup.add(boxMesh);
        created += 1;
      }
    }
  }

  palletGroup.rotation.y = Math.PI / 5;
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
    <p class="muted">Se aprovecha la orientación que maximiza la cantidad de cajas y mantiene capas iguales.</p>

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
      <li>Las capas son todas iguales para mantener la estructura uniforme.</li>
    </ul>
  `;

  render3DFromResult(best);
}

form.addEventListener('submit', function (event) {
  event.preventDefault();
  calculateLayout();
});

exampleButton.addEventListener('click', () => {
  document.getElementById('box-length').value = '0.4';
  document.getElementById('box-width').value = '0.3';
  document.getElementById('box-height').value = '0.2';
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
