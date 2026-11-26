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

  // ---------------------------------------------------------- người (có khớp, bước đi)
  function limb(len, r0, r1, mat) {                    // chi treo từ khớp ở gốc, dài xuống dưới
    const g = new THREE.Group(), m = cyl(r1, r0, len, mat, 0, -len / 2, 0, 12); g.add(m);
    const j = new THREE.Mesh(new THREE.SphereGeometry(r0, 12, 8), mat); j.castShadow = true; g.add(j); return g;
  }
  function person(look = {}) {
    const skin = M(look.skin || 0xE7C3A0, { roughness: 0.7 }), shirt = M(look.shirt || 0xD62839, { roughness: 0.9 });
    const pants = M(look.pants || 0x13315C, { roughness: 0.9 }), shoe = M(0x22262E, { roughness: 0.6 }), hair = M(look.hair || 0x2B1D14, { roughness: 0.9 });
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const legs = [], arms = [];
    for (const s of [-1, 1]) {                         // chân: đùi + cẳng + giày, gập gối khi bước
      const hip = new THREE.Group(); hip.position.set(0, 0.86, s * 0.085);
      const thigh = limb(0.42, 0.07, 0.058, pants); hip.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -0.42; thigh.add(knee);
      const shin = limb(0.4, 0.056, 0.045, pants); knee.add(shin);
      const foot = box(0.22, 0.06, 0.09, shoe, 0.05, -0.42, 0); shin.add(foot);
      body.add(hip); legs.push({ hip: thigh, knee });
    }
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.56, 16), shirt); torso.position.y = 1.15; torso.scale.z = 1.35; torso.castShadow = true; body.add(torso);
    const pelvis = cyl(0.135, 0.13, 0.12, pants, 0, 0.9, 0, 16); pelvis.scale.z = 1.3; body.add(pelvis);
    if (look.apron) { const ap = box(0.03, 0.5, 0.26, M(look.apron), 0.15, 1.0, 0); body.add(ap); }
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), shirt); sh.position.y = 1.42; sh.scale.set(1, 0.45, 1.35); body.add(sh);
    for (const s of [-1, 1]) {                         // tay: cánh tay + cẳng tay + bàn tay
      const sh2 = new THREE.Group(); sh2.position.set(0, 1.4, s * 0.21);
      const up = limb(0.3, 0.05, 0.045, shirt); sh2.add(up);
      const el = new THREE.Group(); el.position.y = -0.3; up.add(el);
      const fo = limb(0.27, 0.042, 0.035, skin); el.add(fo);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin); hand.position.y = -0.29; fo.add(hand);
      body.add(sh2); arms.push({ sh: up, el });
    }
    body.add(cyl(0.045, 0.05, 0.09, skin, 0, 1.5, 0, 10));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), skin); head.position.y = 1.64; head.scale.set(1, 1.12, 0.95); head.castShadow = true; body.add(head);
    const hr = new THREE.Mesh(new THREE.SphereGeometry(0.117, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair); hr.position.set(-0.012, 1.655, 0); hr.scale.set(1, 1.12, 0.98); body.add(hr);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), M(0x1B1F27)); e.position.set(0.095, 1.66, s * 0.04); body.add(e); }
    /* cập nhật dáng đi: phase = quãng đường đã đi (m), moving = đang bước hay đứng */
    g.userData.pose = (phase, moving) => {
      const a = moving ? Math.sin(phase * 7.5) : 0, k = moving ? Math.abs(Math.cos(phase * 7.5)) : 0;
      legs[0].hip.rotation.z = 0.45 * a; legs[1].hip.rotation.z = -0.45 * a;
      legs[0].knee.rotation.z = -0.5 * Math.max(0, -a) - 0.05; legs[1].knee.rotation.z = -0.5 * Math.max(0, a) - 0.05;
      arms[0].sh.rotation.z = -0.38 * a; arms[1].sh.rotation.z = 0.38 * a;
      arms[0].el.rotation.z = arms[1].el.rotation.z = 0.25;
      body.position.y = moving ? 0.018 * k : 0;
    };
    g.userData.pose(0, false);
    return g;
  }

  // ---------------------------------------------------------- mèo
  function cat() {
    const fur = M(0xE39B4E, { roughness: 0.95 }), white = M(0xFBF4EA, { roughness: 0.95 }), dark = M(0x1B1F27);
    const g = new THREE.Group(), legs = [];
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 12), fur); body.scale.set(1.9, 0.95, 0.95); body.position.y = 0.17; body.castShadow = true; g.add(body);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), white); chest.position.set(0.13, 0.15, 0); g.add(chest);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), fur); head.position.set(0.23, 0.25, 0); head.castShadow = true; g.add(head);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), white); muzzle.position.set(0.29, 0.23, 0); g.add(muzzle);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.06, 4), fur); ear.position.set(0.21, 0.32, s * 0.04); g.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), dark); eye.position.set(0.295, 0.265, s * 0.028); g.add(eye);
    }
    for (const [x, z] of [[0.11, 0.05], [0.11, -0.05], [-0.11, 0.05], [-0.11, -0.05]]) {
      const hip = new THREE.Group(); hip.position.set(x, 0.14, z); hip.add(cyl(0.018, 0.016, 0.13, fur, 0, -0.065, 0, 8));
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), white); paw.position.y = -0.13; hip.add(paw);
      g.add(hip); legs.push(hip);
    }
    const tail = new THREE.Group(); tail.position.set(-0.18, 0.2, 0); g.add(tail);
    const tc = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.016, 8, 16, Math.PI * 0.8), fur); tc.rotation.z = Math.PI * 0.35; tc.position.set(-0.06, 0.07, 0); tail.add(tc);
    g.userData.pose = (phase, moving) => {
      const a = moving ? Math.sin(phase * 16) * 0.5 : 0;
      legs[0].rotation.z = a; legs[3].rotation.z = a; legs[1].rotation.z = -a; legs[2].rotation.z = -a;
      tail.rotation.x = Math.sin(performance.now() / 300) * 0.3;
    };
    return g;
  }

  // ---------------------------------------------------------- xe 2 bánh (bộ kit 2WD: 2 tầng mica, 2 motor TT, bánh tự lựa)
  function plate(w, d, r, mat) {
    const sh = new THREE.Shape(), x0 = -w / 2, z0 = -d / 2;
    sh.moveTo(x0 + r, z0); sh.lineTo(x0 + w - r, z0); sh.quadraticCurveTo(x0 + w, z0, x0 + w, z0 + r);
    sh.lineTo(x0 + w, z0 + d - r); sh.quadraticCurveTo(x0 + w, z0 + d, x0 + w - r, z0 + d);
    sh.lineTo(x0 + r, z0 + d); sh.quadraticCurveTo(x0, z0 + d, x0, z0 + d - r); sh.lineTo(x0, z0 + r); sh.quadraticCurveTo(x0, z0, x0 + r, z0);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false }); geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m;
  }
  function robot() {
    const g = new THREE.Group();
    const acrylic = M(0x8FB4E3, { transparent: true, opacity: 0.7, roughness: 0.15, metalness: 0.05 });
    const p1 = plate(0.21, 0.13, 0.03, acrylic); p1.position.y = 0.052; g.add(p1);
    const p2 = plate(0.17, 0.12, 0.03, M(0x0B2545, { roughness: 0.4 })); p2.position.y = 0.092; g.add(p2); g.userData.body = p2;
    for (const [x, z] of [[0.065, 0.045], [0.065, -0.045], [-0.065, 0.045], [-0.065, -0.045]]) g.add(cyl(0.0035, 0.0035, 0.04, M(0xC9A227, { metalness: 0.9, roughness: 0.3 }), x, 0.07, z, 6));
    for (const s of [1, -1]) {
      g.add(box(0.07, 0.022, 0.019, M(0xF2C230, { roughness: 0.5 }), 0.0, 0.034, s * 0.046));        // motor TT vàng
      const shaft = cyl(0.003, 0.003, 0.03, M(0xFFFFFF), 0, 0.0325, s * 0.065, 6); shaft.rotation.x = Math.PI / 2; g.add(shaft);
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.0255, 0.0085, 10, 28), M(0x1B1F27, { roughness: 0.95 }));
      tire.position.set(0, 0.0325, s * 0.078); tire.castShadow = true; g.add(tire);
      const rim = cyl(0.022, 0.022, 0.024, M(0xF2C230, { roughness: 0.45 }), 0, 0.0325, s * 0.078, 18); rim.rotation.x = Math.PI / 2; g.add(rim);
      const hub = cyl(0.007, 0.007, 0.026, M(0xFFFFFF), 0, 0.0325, s * 0.078, 10); hub.rotation.x = Math.PI / 2; g.add(hub);
    }
    g.add(cyl(0.006, 0.006, 0.03, M(METAL, { metalness: 0.8 }), -0.085, 0.035, 0, 8));                 // bánh tự lựa
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), M(METAL, { metalness: 0.9, roughness: 0.2 })); ball.position.set(-0.085, 0.011, 0); g.add(ball);
    g.add(box(0.06, 0.02, 0.075, M(0x22262E), -0.03, 0.065, 0));                                          // hộp pin 18650
    for (const s of [-1, 1]) { const c18 = cyl(0.009, 0.009, 0.065, M(s > 0 ? 0xD62839 : 0x1F4E8C), -0.03, 0.078, s * 0.017, 10); c18.rotation.z = Math.PI / 2; g.add(c18); }
    g.add(box(0.085, 0.016, 0.056, M(0xD62839, { roughness: 0.5 }), -0.02, 0.102, 0));                  // Pi 4 trong vỏ đỏ
    g.add(box(0.03, 0.004, 0.02, M(0xFFFFFF), -0.01, 0.111, 0.012));
    g.add(box(0.012, 0.022, 0.046, M(0x1F4E8C), 0.1, 0.066, 0));                                         // HC-SR04
    for (const s of [-1, 1]) { const e = cyl(0.008, 0.008, 0.014, M(METAL, { metalness: 0.85, roughness: 0.2 }), 0.112, 0.066, s * 0.012, 14); e.rotation.z = Math.PI / 2; g.add(e); }
    g.add(box(0.012, 0.045, 0.012, M(0x22262E), 0.07, 0.12, 0));                                         // cột camera
    g.add(box(0.016, 0.022, 0.026, M(0x111111), 0.075, 0.148, 0));
    const lens = cyl(0.006, 0.006, 0.006, M(0x3A6EA5, { metalness: 0.5, roughness: 0.1 }), 0.085, 0.148, 0, 12); lens.rotation.z = Math.PI / 2; g.add(lens);
    g.add(box(0.008, 0.012, 0.13, M(0xD62839), 0.108, 0.04, 0));                                          // cản trước (công tắc chạm)
    // vòng sáng dưới xe để dễ nhìn thấy trong nhà
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.18, 40), new THREE.MeshBasicMaterial({ color: 0x1F4E8C, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.003; g.add(halo);
    return g;
  }

  root.RobotModels = { floorTex, marker, build, person, cat, robot, M, box, cyl, COLORS: { NAVY, NAVY2, NAVY3, RED, WHITE, WOOD, WOOD_D } };
})(typeof self !== "undefined" ? self : this);
