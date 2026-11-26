/* Mô hình 3D đồ đạc + robot dựng từ khối cơ bản (three.js r128)
 * NGUYỄN SỸ HIỆP – ICTU. Quy ước: mặt trước đồ vật hướng +z cục bộ, sàn y = 0. */
(function (root) {
  "use strict";
  if (typeof THREE === "undefined") { root.RobotModels = null; return; }
  const NAVY = 0x0B2545, NAVY2 = 0x13315C, NAVY3 = 0x1F4E8C, RED = 0xD62839, WHITE = 0xF7F8FA;
  const WOOD = 0xB98A5A, WOOD_D = 0x8C623B, WOOD_L = 0xD9B88E, METAL = 0xC5CCD6, DARK = 0x2A3342;
  const matCache = {};
  const M = (color, o = {}) => {
    const k = color + JSON.stringify(o);
    return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0.02 }, o)));
  };
  function box(w, h, d, mat, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
  }
  function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 20) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
  }
  const legs = (g, w, d, h, r, mat, inset = 0.05) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(r, r, h, mat, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset), 10));
  };

  // ---------------------------------------------------------- vân sàn (canvas)
  function canvasTex(draw, size = 512, rep = 1) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    draw(c.getContext("2d"), size);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
    t.anisotropy = 4; return t;
  }
  const floorTex = {
    wood: () => canvasTex((g, s) => {
      const rows = 8, h = s / rows;
      for (let r = 0; r < rows; r++) {
        let x = -((r * 97) % 180);
        while (x < s) {
          const L = 180 + ((r * 31 + x) % 120);
          const t = 0.86 + 0.1 * Math.sin(r * 2.3 + x * 0.01);
          g.fillStyle = `rgb(${Math.round(222 * t)},${Math.round(190 * t)},${Math.round(150 * t)})`;
          g.fillRect(x, r * h, L, h);
          g.strokeStyle = "rgba(120,80,40,.25)"; g.lineWidth = 2; g.strokeRect(x, r * h, L, h);
          g.strokeStyle = "rgba(140,95,50,.10)"; g.lineWidth = 1;
          for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x, r * h + 8 + k * 14); g.bezierCurveTo(x + L / 3, r * h + 4 + k * 14, x + 2 * L / 3, r * h + 14 + k * 14, x + L, r * h + 8 + k * 14); g.stroke(); }
          x += L;
        }
      }
    }, 512, 1),
    tile: () => canvasTex((g, s) => {
      g.fillStyle = "#EEF2F6"; g.fillRect(0, 0, s, s);
      const n = 4, d = s / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        g.fillStyle = (i + j) % 2 ? "#F6F8FB" : "#E7ECF3"; g.fillRect(i * d + 2, j * d + 2, d - 4, d - 4);
      }
      g.strokeStyle = "#C9D3E0"; g.lineWidth = 3;
      for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * d, 0); g.lineTo(i * d, s); g.stroke(); g.beginPath(); g.moveTo(0, i * d); g.lineTo(s, i * d); g.stroke(); }
    }, 256, 1),
    carpet: () => canvasTex((g, s) => {
      g.fillStyle = "#EFE7E4"; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${150 + Math.random() * 60},${120 + Math.random() * 40},${120 + Math.random() * 40},.08)`; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
    }, 256, 1),
    grid: () => canvasTex((g, s) => {
      g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, s, s);
      g.strokeStyle = "#E1E7F0"; g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) { const p = i * s / 4; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke(); }
      g.strokeStyle = "#C9D4E3"; g.lineWidth = 3; g.strokeRect(0, 0, s, s);
    }, 256, 1),
  };

  // ---------------------------------------------------------- mốc ArUco (mẫu 4×4 theo số)
  function arucoCanvas(id) {
    const c = document.createElement("canvas"); c.width = c.height = 120; const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 120, 120); g.fillStyle = "#111"; g.fillRect(10, 10, 100, 100);
    let s = (id * 2654435761) >>> 0;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      s = (s * 1103515245 + 12345) >>> 0;
      if ((s >>> 16) & 1) { g.fillStyle = "#fff"; g.fillRect(25 + i * 17.5, 25 + j * 17.5, 17.5, 17.5); }
    }
    return c;
  }
  function marker(id, size = 0.2) {
    const g = new THREE.Group();
    const t = new THREE.CanvasTexture(arucoCanvas(id));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: t }));
    face.position.z = 0.006; g.add(face);
    const back = box(size + 0.03, size + 0.03, 0.01, M(WHITE)); g.add(back);
    // nhãn số đỏ
    const c = document.createElement("canvas"); c.width = 128; c.height = 48; const x = c.getContext("2d");
    x.fillStyle = "#D62839"; x.fillRect(0, 0, 128, 48); x.fillStyle = "#fff"; x.font = "bold 30px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("Mốc " + id, 64, 25);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.9, size * 0.34), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
    lab.position.set(0, -size * 0.72, 0.006); g.add(lab);
    return g;
  }

  // ---------------------------------------------------------- đồ đạc
  const B = {};
  B.sofa = (W, D, H) => {
    const g = new THREE.Group(), fab = M(NAVY2, { roughness: 0.95 }), fab2 = M(NAVY3, { roughness: 0.95 });
    g.add(box(W, 0.12, D, M(WOOD_D), 0, 0.08, 0));
    g.add(box(W - 0.06, 0.24, D - 0.06, fab, 0, 0.26, 0));
    const n = W > 1.4 ? 3 : 2, cw = (W - 0.34) / n;
    for (let i = 0; i < n; i++) g.add(box(cw - 0.02, 0.12, D * 0.62, fab2, -W / 2 + 0.17 + cw * (i + 0.5), 0.44, D * 0.12));
    g.add(box(W - 0.06, 0.44, 0.2, fab, 0, 0.6, -D / 2 + 0.13));
    for (const s of [-1, 1]) g.add(box(0.16, 0.34, D - 0.04, fab, s * (W / 2 - 0.08), 0.5, 0));
    g.add(box(0.36, 0.3, 0.1, M(RED, { roughness: 0.9 }), -W / 2 + 0.42, 0.62, -D / 2 + 0.3));
    g.add(box(0.36, 0.3, 0.1, M(WHITE, { roughness: 0.9 }), W / 2 - 0.42, 0.62, -D / 2 + 0.3));
    return g;
  };
  B.armchair = (W, D, H) => {
    const g = B.sofa(W, D, H);
    return g;
  };
  B.coffee = (W, D, H) => {
    const g = new THREE.Group();
    g.add(box(W, 0.04, D, M(WOOD), 0, H - 0.02, 0));
    g.add(box(W - 0.12, 0.02, D - 0.12, M(WOOD_D), 0, 0.12, 0));
    legs(g, W, D, H - 0.04, 0.022, M(DARK));
    g.add(cyl(0.05, 0.05, 0.1, M(WHITE), 0.1, H + 0.05, 0.1));                     // cốc
    g.add(box(0.28, 0.02, 0.2, M(RED), -0.12, H + 0.01, -0.12));                    // sách
    return g;
  };
  B.tv = (W, D, H) => {
    const g = new THREE.Group();
    g.add(box(W, 0.45, D, M(WHITE), 0, 0.225, 0));
    g.add(box(W - 0.04, 0.02, D - 0.04, M(WOOD), 0, 0.46, 0));
    for (const s of [-1, 1]) g.add(box(W * 0.45, 0.32, 0.01, M(0xE6EAF0), s * W * 0.24, 0.22, D / 2 + 0.003));
    const tw = Math.min(W * 0.95, 1.3), th = tw * 0.56;
    g.add(box(0.2, 0.03, 0.12, M(DARK), 0, 0.485, 0));
    g.add(box(0.04, 0.1, 0.04, M(DARK), 0, 0.53, 0));
    g.add(box(tw, th, 0.04, M(0x1A2433, { roughness: 0.4 }), 0, 0.58 + th / 2, 0));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(tw - 0.04, th - 0.04), new THREE.MeshStandardMaterial({ color: 0x23406B, emissive: 0x0F2747, emissiveIntensity: 0.6, roughness: 0.25 }));
    scr.position.set(0, 0.58 + th / 2, 0.021); g.add(scr);
    return g;
  };
  B.shelf = (W, D, H) => {
    const g = new THREE.Group(), w = M(WOOD_L);
    for (const s of [-1, 1]) g.add(box(0.03, H, D, w, s * (W / 2 - 0.015), H / 2, 0));
    g.add(box(W, H, 0.02, M(0xEFE6D8), 0, H / 2, -D / 2 + 0.01));
    const cols = [NAVY, RED, WHITE, NAVY3, 0x9AA6B8, WOOD_D];
    for (let k = 0; k < 5; k++) {
      const y = 0.03 + k * (H - 0.06) / 4; g.add(box(W, 0.03, D, w, 0, y, 0));
      if (k < 4) { let x = -W / 2 + 0.06; let i = k * 3; while (x < W / 2 - 0.1) { const bw = 0.03 + ((i * 7) % 4) * 0.012, bh = 0.2 + ((i * 5) % 3) * 0.04; g.add(box(bw, bh, D * 0.7, M(cols[i % cols.length]), x + bw / 2, y + 0.015 + bh / 2, 0)); x += bw + 0.005; i++; } }
    }
    return g;
  };
  B.plant = (r, H) => {
    const g = new THREE.Group();
    g.add(cyl(r * 0.8, r * 0.6, H * 0.32, M(WHITE), 0, H * 0.16, 0));
    g.add(cyl(r * 0.78, r * 0.78, 0.02, M(0x5B4636), 0, H * 0.32, 0));
    const leaf = M(0x2E7D4F, { roughness: 0.9 }), leaf2 = M(0x3E9B63, { roughness: 0.9 });
    const pts = [[0, 0.62, 0, 0.55], [0.35, 0.5, 0.1, 0.42], [-0.3, 0.55, -0.15, 0.45], [0.05, 0.8, -0.3, 0.38], [-0.1, 0.45, 0.35, 0.4]];
    pts.forEach(([x, y, z, s], i) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s * 1.6, 1), i % 2 ? leaf : leaf2); m.position.set(x * r, H * y, z * r); m.castShadow = true; g.add(m); });
    return g;
  };
  B.fridge = (W, D, H) => {
    const g = new THREE.Group(), body = M(0xE9EDF2, { metalness: 0.35, roughness: 0.35 });
    g.add(box(W, H, D, body, 0, H / 2, 0));
    g.add(box(W - 0.01, 0.012, 0.01, M(0x9AA4B2), 0, H * 0.62, D / 2 + 0.002));
    for (const [y0, y1] of [[H * 0.66, H * 0.92], [H * 0.2, H * 0.55]]) g.add(cyl(0.012, 0.012, y1 - y0, M(METAL, { metalness: 0.8, roughness: 0.2 }), W / 2 - 0.08, (y0 + y1) / 2, D / 2 + 0.03, 10));
    g.add(box(0.14, 0.2, 0.01, M(0x1F4E8C, { emissive: 0x0B2545, emissiveIntensity: 0.4 }), -W / 2 + 0.16, H * 0.78, D / 2 + 0.003));
    g.add(box(W * 0.98, 0.06, D * 0.98, M(DARK), 0, 0.03, 0));
    return g;
  };
  function counter(W, D, H) {
    const g = new THREE.Group();
    g.add(box(W, H - 0.04, D, M(WHITE), 0, (H - 0.04) / 2, 0));
    g.add(box(W + 0.02, 0.04, D + 0.02, M(0xCDD3DB, { roughness: 0.4 }), 0, H - 0.02, 0));
    const n = Math.max(1, Math.round(W / 0.45));
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + W / n * (i + 0.5);
      g.add(box(W / n - 0.03, H - 0.16, 0.012, M(0xF0F3F7), x, (H - 0.04) / 2, D / 2 + 0.006));
      g.add(box(0.12, 0.015, 0.02, M(METAL, { metalness: 0.7 }), x, H - 0.16, D / 2 + 0.02));
    }
    g.add(box(W, 0.08, D - 0.06, M(DARK), 0, 0.04, -0.02));
    return g;
  }
  B.sink = (W, D, H) => {
    const g = counter(W, D, H);
    g.add(box(W * 0.5, 0.02, D * 0.55, M(0x9FAAB8, { metalness: 0.6, roughness: 0.3 }), 0, H + 0.001, 0.02));
    g.add(cyl(0.015, 0.015, 0.22, M(METAL, { metalness: 0.9, roughness: 0.15 }), 0, H + 0.11, -D / 2 + 0.1, 10));
    const arm = box(0.03, 0.03, 0.18, M(METAL, { metalness: 0.9, roughness: 0.15 }), 0, H + 0.22, -D / 2 + 0.18); g.add(arm);
    return g;
  };
  B.stove = (W, D, H) => {
    const g = counter(W, D, H);
    g.add(box(W * 0.62, 0.012, D * 0.7, M(0x1C2430, { roughness: 0.2 }), 0, H + 0.006, 0));
    for (const [x, z, r] of [[-0.14, -0.1, 0.07], [0.14, -0.1, 0.06], [-0.14, 0.12, 0.06], [0.14, 0.12, 0.07]]) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 24), M(RED, { emissive: 0x5A0A12, emissiveIntensity: 0.5 }));
      t.rotation.x = Math.PI / 2; t.position.set(x * W, H + 0.015, z); g.add(t);
    }
    g.add(cyl(0.11, 0.1, 0.12, M(METAL, { metalness: 0.8, roughness: 0.25 }), 0.14 * W, H + 0.075, -0.1));
    return g;
  };
  B.dining = (W, D, H) => {
    const g = new THREE.Group();
    g.add(box(W, 0.045, D, M(WOOD), 0, H - 0.022, 0));
    legs(g, W, D, H - 0.045, 0.03, M(WOOD_D), 0.08);
    g.add(box(W * 0.5, 0.005, 0.32, M(RED, { roughness: 0.9 }), 0, H + 0.003, 0));
    g.add(cyl(0.12, 0.08, 0.06, M(WHITE), 0, H + 0.035, 0));
    return g;
  };
  B.chair = (W, D, H) => {
    const g = new THREE.Group(), w = M(WOOD_D);
    g.add(box(W, 0.04, D, M(WOOD), 0, 0.46, 0));
    g.add(box(W - 0.04, 0.03, D - 0.06, M(NAVY2, { roughness: 0.95 }), 0, 0.495, 0.01));
    legs(g, W, D, 0.44, 0.016, w, 0.03);
    for (const s of [-1, 1]) g.add(box(0.03, 0.45, 0.03, w, s * (W / 2 - 0.03), 0.7, -D / 2 + 0.02));
    g.add(box(W - 0.04, 0.14, 0.025, w, 0, 0.84, -D / 2 + 0.02));
    return g;
  };
  B.bed = (W, D, H) => {
    const g = new THREE.Group();
    g.add(box(W, 0.26, D, M(WOOD), 0, 0.18, 0));
    g.add(box(W - 0.06, 0.18, D - 0.08, M(0xFBFCFD, { roughness: 0.95 }), 0, 0.4, 0.02));
    g.add(box(W - 0.02, 0.06, D * 0.6, M(NAVY2, { roughness: 0.95 }), 0, 0.51, D * 0.2));
    g.add(box(W - 0.02, 0.062, 0.08, M(RED, { roughness: 0.95 }), 0, 0.512, D * 0.2 - D * 0.3 + 0.05));
    for (const s of [-1, 1]) g.add(box(W * 0.36, 0.1, 0.34, M(WHITE, { roughness: 0.95 }), s * W * 0.22, 0.54, -D / 2 + 0.3));
    g.add(box(W + 0.04, 0.9, 0.08, M(WOOD_D), 0, 0.45, -D / 2 - 0.02));
    return g;
  };
  B.wardrobe = (W, D, H) => {
    const g = new THREE.Group();
    g.add(box(W, H, D, M(WOOD_L), 0, H / 2, 0));
    g.add(box(0.012, H - 0.12, 0.01, M(WOOD_D), 0, H / 2, D / 2 + 0.004));
    for (const s of [-1, 1]) g.add(box(0.02, 0.28, 0.025, M(METAL, { metalness: 0.7 }), s * 0.06, H * 0.55, D / 2 + 0.02));
    g.add(box(W + 0.02, 0.05, D + 0.02, M(WOOD_D), 0, H - 0.025, 0));
    g.add(box(W, 0.07, D - 0.04, M(WOOD_D), 0, 0.035, -0.01));
    return g;
  };
  B.desk = (W, D, H) => {
    const g = new THREE.Group();
    g.add(box(W, 0.035, D, M(WHITE), 0, H - 0.018, 0));
    for (const s of [-1, 1]) g.add(box(0.035, H - 0.035, D - 0.04, M(NAVY2), s * (W / 2 - 0.03), (H - 0.035) / 2, 0));
    g.add(box(0.34, 0.015, 0.24, M(0xAEB7C4, { metalness: 0.5 }), -0.1, H + 0.008, 0.04));
    const scr = box(0.34, 0.22, 0.012, M(0xAEB7C4, { metalness: 0.5 }), -0.1, H + 0.12, -0.08); scr.rotation.x = -0.25; g.add(scr);
    g.add(cyl(0.06, 0.07, 0.02, M(RED), 0.3, H + 0.01, -0.1));
    g.add(cyl(0.008, 0.008, 0.32, M(DARK), 0.3, H + 0.17, -0.1, 8));
    const shade = cyl(0.04, 0.08, 0.1, M(RED), 0.3, H + 0.34, -0.05); g.add(shade);
    return g;
  };
  B.rug = (W, D, color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.004; m.receiveShadow = true;
    const g = new THREE.Group(); g.add(m);
    return g;
  };
  B.generic = (W, D, H) => { const g = new THREE.Group(); g.add(box(W, H, D, M(0xE8A56B))); g.children[0].position.y = H / 2; return g; };

  // hướng mặt trước (trong toạ độ mô phỏng) -> góc quay quanh trục đứng
  const FACE_ROT = { ny: 0, py: Math.PI, px: Math.PI / 2, nx: -Math.PI / 2 };
  function build(o) {
    let g;
    if (o.kind === "cyl") g = B[o.model] ? B[o.model](o.r, o.h || 0.8) : B.plant(o.r, o.h || 0.8);
    else {
      const along = o.face === "px" || o.face === "nx";
      const W = 2 * (along ? o.hy : o.hx), D = 2 * (along ? o.hx : o.hy);
      g = (B[o.model] || B.generic)(W, D, o.h || 0.6);
      g.rotation.y = FACE_ROT[o.face] || 0;
    }
    g.position.set(o.x, 0, -o.y);
    g.traverse(m => { if (m.isMesh) m.userData.o = o; });
    return g;
  }

  // ---------------------------------------------------------- người đi lại
  function person() {
    const g = new THREE.Group();
    g.add(cyl(0.07, 0.08, 0.8, M(NAVY), 0, 0.4, 0, 12));
    g.add(cyl(0.13, 0.11, 0.55, M(RED), 0, 1.07, 0, 14));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), M(0xE8C4A0)); head.position.y = 1.47; head.castShadow = true; g.add(head);
    return g;
  }

  // ---------------------------------------------------------- robot 2 bánh
  function robot() {
    const g = new THREE.Group();
    const body = box(0.2, 0.035, 0.15, M(NAVY, { roughness: 0.5 }), 0, 0.045, 0); g.add(body); g.userData.body = body;
    g.add(box(0.19, 0.004, 0.14, M(0xFFFFFF, { transparent: true, opacity: 0.55, roughness: 0.1 }), 0, 0.105, 0));
    for (const [x, z] of [[0.08, 0.06], [0.08, -0.06], [-0.08, 0.06], [-0.08, -0.06]]) g.add(cyl(0.004, 0.004, 0.04, M(METAL, { metalness: 0.8 }), x, 0.083, z, 6));
    g.add(box(0.085, 0.012, 0.056, M(0x1E7B4F), -0.03, 0.07, 0));             // Raspberry Pi
    g.add(box(0.03, 0.012, 0.03, M(METAL, { metalness: 0.6 }), -0.055, 0.082, 0.012));
    g.add(box(0.06, 0.02, 0.1, M(0x2A3342), -0.06, 0.12, 0));                 // pin
    g.add(box(0.012, 0.03, 0.15, M(RED, { roughness: 0.6 }), 0.106, 0.045, 0));  // cản trước đỏ (công tắc chạm)
    const hc = box(0.012, 0.02, 0.045, M(0x1F4E8C), 0.1, 0.08, 0); g.add(hc);    // HC-SR04
    for (const s of [-1, 1]) { const e = cyl(0.008, 0.008, 0.012, M(METAL, { metalness: 0.8, roughness: 0.2 }), 0.11, 0.08, s * 0.012, 12); e.rotation.z = Math.PI / 2; g.add(e); }
    g.add(box(0.02, 0.022, 0.025, M(0x111111), 0.085, 0.125, 0));               // camera
    const lens = cyl(0.006, 0.006, 0.006, M(0x3A6EA5, { metalness: 0.5, roughness: 0.1 }), 0.097, 0.125, 0, 12); lens.rotation.z = Math.PI / 2; g.add(lens);
    for (const s of [1, -1]) {
      const tire = cyl(0.0325, 0.0325, 0.026, M(0x1B1F27, { roughness: 0.9 }), 0, 0.0325, s * 0.087, 24); tire.rotation.x = Math.PI / 2; g.add(tire);
      const hub = cyl(0.018, 0.018, 0.028, M(0xF1C40F), 0, 0.0325, s * 0.087, 12); hub.rotation.x = Math.PI / 2; g.add(hub);
      g.add(box(0.06, 0.022, 0.02, M(0xF1C40F), 0.0, 0.04, s * 0.06));          // motor TT vàng
    }
    const caster = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), M(METAL, { metalness: 0.8 })); caster.position.set(-0.08, 0.012, 0); g.add(caster);
    return g;
  }

  root.RobotModels = { floorTex, marker, build, person, robot, M, box, cyl, COLORS: { NAVY, NAVY2, NAVY3, RED, WHITE, WOOD, WOOD_D } };
})(typeof self !== "undefined" ? self : this);
