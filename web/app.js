/* Giao diện Phòng thí nghiệm robot ảo – NGUYỄN SỸ HIỆP – ICTU */
{
  const C = window.RobotCore;
  const $ = id => document.getElementById(id);
  const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace(".", ",") : "–");
  const store = {
    get(k, d) { try { const v = localStorage.getItem("robotlab:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("robotlab:" + k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } },
  };

  // ------------------------------------------------------------ trạng thái
  const BUILTIN_BRAINS = [
    { id: "hoc_thang_300k", file: "brains/hoc_thang_300k.json" },
    { id: "cap3_kaggle_5cap", file: "brains/cap3_kaggle_5cap.json" },
    { id: "cap2_kaggle_5cap", file: "brains/cap2_kaggle_5cap.json" },
    { id: "cap1_kaggle_5cap", file: "brains/cap1_kaggle_5cap.json" },
  ];
  const S = {
    cfg: Object.assign({}, C.DEFAULT_CFG, store.get("cfg", {})),
    level: store.get("level", 3), seed: store.get("seed2", 6),
    brains: {}, controllerId: store.get("controller2", "hoc_thang_300k"),
    customFn: null, keys: { up: 0, down: 0, left: 0, right: 0 },
    playing: false, speed: 1, acc: 0, view: "2d", tool: "none",
    stats: { ep: 0, dich: 0, vacham: 0, hetgio: 0 }, lastBench: null, robots: {},
  };
  let sim = new C.Sim(S.cfg), scenario = null;

  // --------------------------------------------------------- bộ điều khiển
  function controller(obs) {
    const id = S.controllerId;
    if (id === "manual") {
      const k = S.keys;
      return [(k.up ? 1 : 0) - (k.down ? 1 : 0), (k.left ? 1 : 0) - (k.right ? 1 : 0)];
    }
    if (id === "custom") {
      if (!S.customFn) return [0, 0];
      try { const a = S.customFn(obs, { level: S.level, cfg: S.cfg }); $("codeErr").textContent = ""; return [+a[0] || 0, +a[1] || 0]; }
      catch (e) { $("codeErr").textContent = "Lỗi khi chạy mã: " + e.message; return [0, 0]; }
    }
    const b = S.brains[id];
    return b ? b.act(obs) : [0, 0];
  }

  // ---------------------------------------------------------- vòng đời lượt
  function newScenario(seed) {
    S.seed = seed ?? S.seed; $("inSeed").value = S.seed;
    scenario = C.generateScenario(S.level, S.seed, S.cfg);
    store.set("level", S.level); store.set("seed2", S.seed);
    restart();
  }
  function restart() {
    sim.load(scenario, { seed: S.seed, randomize: $("chkNoise").checked });
    S.acc = 0; three.rebuild(); updateMapInfo(); render(); updatePanel();
  }
  function endEpisode() {
    S.stats.ep++; S.stats[sim.result]++; updateStats();
    if ($("chkAuto").checked) setTimeout(() => { if (S.playing) newScenario(S.seed + 1); }, 600 / S.speed);
    else setPlaying(false);
  }
  function stepOnce() {
    if (sim.done) return;
    sim.step(controller(sim.obs));
    if (sim.done) endEpisode();
  }

  // ------------------------------------------------------------- vòng lặp
  let last = performance.now();
  function loop(t) {
    const dt = Math.min((t - last) / 1000, 0.1); last = t;
    if (S.playing && !sim.done) {
      S.acc += dt * S.speed;
      const ctl = 1 / sim.cfg.control_hz;
      let n = 0;
      while (S.acc >= ctl && !sim.done && n < 200) { stepOnce(); S.acc -= ctl; n++; }
      if (n) updatePanel();
    }
    render();
    requestAnimationFrame(loop);
  }
  function setPlaying(p) {
    S.playing = p;
    if (p && sim.done) restart();
    $("btnPlay").textContent = p ? "⏸ Dừng" : "▶ Chạy";
  }

  // ============================================================ VẼ 2D
  const c2d = $("c2d"), g = c2d.getContext("2d");
  function resize2d() {
    const r = c2d.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    c2d.width = Math.max(1, Math.round(r.width * dpr)); c2d.height = Math.max(1, Math.round(r.height * dpr));
  }
  const W2 = () => c2d.width, H2 = () => c2d.height;
  const sx = x => (x + sim.cfg.arena / 2) / sim.cfg.arena * W2();
  const sy = y => H2() - (y + sim.cfg.arena / 2) / sim.cfg.arena * H2();
  const sl = l => l / sim.cfg.arena * W2();
  function draw2d() {
    const w = W2(), h = H2(), A = sim.cfg.arena;
    g.clearRect(0, 0, w, h); g.fillStyle = "#fbfaf7"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#ebe8df"; g.lineWidth = 1;
    for (let i = 0; i <= A * 2; i++) {
      const p = i / (A * 2) * w; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke();
    }
    const sc = sim.sc; if (!sc) return;
    // tầm nhìn camera
    const fov = sim.cfg.cam_fov_half, R = sl(sim.cfg.cam_range);
    g.fillStyle = "rgba(156,195,230,.22)"; g.beginPath(); g.moveTo(sx(sim.x), sy(sim.y));
    g.arc(sx(sim.x), sy(sim.y), R, -sim.yaw - fov, -sim.yaw + fov); g.closePath(); g.fill();
    // vật cản
    for (const o of sim.allObstacles()) {
      const seen = o === sim.yoloSeen;
      if (o.kind === "wall") { g.fillStyle = o.border ? "#8a8f96" : "#7a7f86"; g.fillRect(sx(o.x - o.hx), sy(o.y + o.hy), sl(2 * o.hx), sl(2 * o.hy)); }
      else if (o.kind === "box") { g.fillStyle = "#f3c9a1"; g.strokeStyle = "#d9822b"; g.lineWidth = 2; g.fillRect(sx(o.x - o.hx), sy(o.y + o.hy), sl(2 * o.hx), sl(2 * o.hy)); g.strokeRect(sx(o.x - o.hx), sy(o.y + o.hy), sl(2 * o.hx), sl(2 * o.hy)); }
      else { g.fillStyle = o.kind === "mover" ? "#f4b6cf" : "#f3c9a1"; g.strokeStyle = o.kind === "mover" ? "#c2185b" : "#d9822b"; g.lineWidth = 2; g.beginPath(); g.arc(sx(o.x), sy(o.y), sl(o.r), 0, 7); g.fill(); g.stroke();
        if (o.kind === "mover") { g.beginPath(); g.moveTo(sx(o.x), sy(o.y)); g.lineTo(sx(o.x + o.vx * 2), sy(o.y + o.vy * 2)); g.stroke(); } }
      if (seen) { const r = o.kind === "box" ? Math.hypot(o.hx, o.hy) : o.r; g.strokeStyle = "#1565c0"; g.setLineDash([6, 4]); g.lineWidth = 2;
        g.strokeRect(sx(o.x - r) - 4, sy(o.y + r) - 4, sl(2 * r) + 8, sl(2 * r) + 8); g.setLineDash([]);
        g.fillStyle = "#1565c0"; g.font = `${Math.max(11, w / 60)}px sans-serif`; g.fillText("YOLO", sx(o.x - r) - 4, sy(o.y + r) - 8); }
    }
    // đích
    g.fillStyle = "rgba(46,125,50,.15)"; g.beginPath(); g.arc(sx(sc.goal.x), sy(sc.goal.y), sl(sim.cfg.goal_tol), 0, 7); g.fill();
    g.fillStyle = "#2e7d32"; g.beginPath(); g.arc(sx(sc.goal.x), sy(sc.goal.y), Math.max(5, sl(0.06)), 0, 7); g.fill();
    // vệt đường
    g.strokeStyle = "rgba(11,79,138,.45)"; g.lineWidth = 2.5; g.beginPath();
    sim.trail.forEach(([x, y], i) => i ? g.lineTo(sx(x), sy(y)) : g.moveTo(sx(x), sy(y))); g.stroke();
    // tia siêu âm
    if (sim.rays) { g.strokeStyle = sim.safetyActive ? "#c62828" : "#e0a800"; g.lineWidth = 1.5;
      for (const [x0, y0, x1, y1] of sim.rays) { g.beginPath(); g.moveTo(sx(x0), sy(y0)); g.lineTo(sx(x1), sy(y1)); g.stroke(); } }
    // xe
    g.save(); g.translate(sx(sim.x), sy(sim.y)); g.rotate(-sim.yaw);
    const L = sl(sim.cfg.body_lx), B = sl(sim.cfg.body_ly), wb = sl(sim.cfg.wheel_base), wr = sl(sim.cfg.wheel_radius);
    g.fillStyle = "#222"; g.fillRect(-wr, -wb / 2 - 3, 2 * wr, 6); g.fillRect(-wr, wb / 2 - 3, 2 * wr, 6);
    g.fillStyle = sim.result === "vacham" ? "#c62828" : "#0b4f8a"; g.fillRect(-L / 2, -B / 2, L, B);
    g.fillStyle = "#fff"; g.beginPath(); g.moveTo(L / 2 - 2, 0); g.lineTo(L / 2 - 10, -5); g.lineTo(L / 2 - 10, 5); g.fill();
    g.restore();
  }

  // ============================================================ VẼ 3D
  const three = (() => {
    const ok = typeof THREE !== "undefined";
    const wrapEl = $("c3dwrap");
    let renderer, scene, cam, controls, robot, objs = [], trailLine, rayLines = [], fovLine, goalMesh;
    const to3 = (x, y, h = 0) => new THREE.Vector3(x, h, -y);
    function init() {
      if (!ok || renderer) return;
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      wrapEl.appendChild(renderer.domElement);
      scene = new THREE.Scene(); scene.background = new THREE.Color(0xf6f5f1);
      cam = new THREE.PerspectiveCamera(55, 1, 0.02, 100);
      cam.position.set(0, 5.2, 4.2);
      if (THREE.OrbitControls) { controls = new THREE.OrbitControls(cam, renderer.domElement); controls.target.set(0, 0, 0); controls.maxPolarAngle = Math.PI / 2.05; }
      scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b3a6, 0.9));
      const dl = new THREE.DirectionalLight(0xffffff, 0.6); dl.position.set(3, 6, 2); scene.add(dl);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshLambertMaterial({ color: 0xf3efe6 }));
      floor.rotation.x = -Math.PI / 2; scene.add(floor);
      const grid = new THREE.GridHelper(5, 10, 0xd2cdbf, 0xe3dfd3); grid.position.y = 0.002; scene.add(grid);
      robot = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.15), new THREE.MeshLambertMaterial({ color: 0x0b4f8a }));
      body.position.y = 0.0325; robot.add(body); robot.userData.body = body;
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.015, 0.056), new THREE.MeshLambertMaterial({ color: 0x2e7d32 }));
      board.position.set(-0.02, 0.065, 0); robot.add(board);
      const camBox = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.03), new THREE.MeshLambertMaterial({ color: 0x222222 }));
      camBox.position.set(0.095, 0.075, 0); robot.add(camBox);
      for (const s of [1, -1]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.0325, 0.0325, 0.026, 20), new THREE.MeshLambertMaterial({ color: 0x222222 }));
        wh.rotation.x = Math.PI / 2; wh.position.set(0, 0.0325, s * 0.065); robot.add(wh);
      }
      const caster = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshLambertMaterial({ color: 0x888888 }));
      caster.position.set(-0.08, 0.012, 0); robot.add(caster);
      scene.add(robot);
      goalMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.004, 32), new THREE.MeshLambertMaterial({ color: 0x2e7d32, transparent: true, opacity: 0.45 }));
      scene.add(goalMesh);
      trailLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x0b4f8a }));
      scene.add(trailLine);
      for (let i = 0; i < 3; i++) { const l = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xe0a800 })); rayLines.push(l); scene.add(l); }
      fovLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x6fa8dc })); scene.add(fovLine);
      renderer.domElement.addEventListener("pointerdown", e => pick3d(e));
      rebuild();
    }
    function rebuild() {
      if (!scene) return;
      for (const m of objs) scene.remove(m); objs = [];
      for (const o of sim.allObstacles()) {
        let m;
        if (o.kind === "wall") m = new THREE.Mesh(new THREE.BoxGeometry(2 * o.hx, 0.4, 2 * o.hy), new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }));
        else if (o.kind === "box") m = new THREE.Mesh(new THREE.BoxGeometry(2 * o.hx, 0.4, 2 * o.hy), new THREE.MeshLambertMaterial({ color: 0xe8a56b }));
        else m = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, o.kind === "mover" ? 1.0 : 0.4, 28), new THREE.MeshLambertMaterial({ color: o.kind === "mover" ? 0xd8649a : 0xe8a56b }));
        m.userData.o = o; m.position.copy(to3(o.x, o.y, (o.kind === "mover" ? 1.0 : 0.4) / 2));
        scene.add(m); objs.push(m);
      }
      if (sim.sc) goalMesh.position.copy(to3(sim.sc.goal.x, sim.sc.goal.y, 0.003));
    }
    function size() {
      if (!renderer) return;
      const r = wrapEl.getBoundingClientRect();
      renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
      renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "100%";
      cam.aspect = r.width / Math.max(1, r.height); cam.updateProjectionMatrix();
    }
    function draw() {
      if (!renderer) return;
      robot.position.copy(to3(sim.x, sim.y)); robot.rotation.y = sim.yaw;
      robot.userData.body.material.color.set(sim.result === "vacham" ? 0xc62828 : 0x0b4f8a);
      for (const m of objs) { const o = m.userData.o; if (o.kind === "mover") m.position.copy(to3(o.x, o.y, 0.5));
        m.material.emissive && m.material.emissive.set(o === sim.yoloSeen ? 0x1e4d8c : 0x000000); }
      trailLine.geometry.dispose(); trailLine.geometry = new THREE.BufferGeometry().setFromPoints(sim.trail.map(([x, y]) => to3(x, y, 0.01)));
      (sim.rays || []).forEach(([x0, y0, x1, y1], i) => { rayLines[i].geometry.dispose(); rayLines[i].geometry = new THREE.BufferGeometry().setFromPoints([to3(x0, y0, 0.035), to3(x1, y1, 0.035)]);
        rayLines[i].material.color.set(sim.safetyActive ? 0xc62828 : 0xe0a800); });
      const f = sim.cfg.cam_fov_half, R = sim.cfg.cam_range, pts = [to3(sim.x, sim.y, 0.08)];
      for (let k = 0; k <= 12; k++) { const a = sim.yaw - f + (2 * f * k) / 12; pts.push(to3(sim.x + R * Math.cos(a), sim.y + R * Math.sin(a), 0.08)); }
      pts.push(to3(sim.x, sim.y, 0.08)); fovLine.geometry.dispose(); fovLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      fovLine.visible = S.view !== "3dfpv";
      if (S.view === "3dfollow") {
        const back = to3(sim.x - 0.9 * Math.cos(sim.yaw), sim.y - 0.9 * Math.sin(sim.yaw), 0.6);
        cam.position.lerp(back, 0.15); cam.lookAt(to3(sim.x + 0.6 * Math.cos(sim.yaw), sim.y + 0.6 * Math.sin(sim.yaw), 0));
      } else if (S.view === "3dfpv") {
        cam.position.copy(to3(sim.x + 0.1 * Math.cos(sim.yaw), sim.y + 0.1 * Math.sin(sim.yaw), 0.09));
        cam.lookAt(to3(sim.x + 2 * Math.cos(sim.yaw), sim.y + 2 * Math.sin(sim.yaw), 0.05));
        cam.fov = 2 * sim.cfg.cam_fov_half * 180 / Math.PI * 0.8; cam.updateProjectionMatrix();
      } else if (controls) { controls.update(); }
      renderer.render(scene, cam);
    }
    function setMode(v) {
      if (!ok) return false;
      init(); wrapEl.style.display = "block"; size();
      if (controls) controls.enabled = v === "3d";
      cam.fov = 55; cam.updateProjectionMatrix();
      if (v === "3d") { cam.position.set(0, 5.2, 4.2); if (controls) controls.target.set(0, 0, 0); }
      return true;
    }
    function hide() { wrapEl.style.display = "none"; }
    function pick3d(e) {
      if (S.tool === "none") return;
      const r = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, cam);
      const p = new THREE.Vector3();
      if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) applyTool(p.x, -p.z);
    }
    return { ok, rebuild, draw, size, setMode, hide };
  })();

  function render() {
    if (S.view === "2d") draw2d(); else three.draw();
    hud();
  }
  function hud() {
    const r = sim.result, el = $("hud");
    const brain = S.controllerId === "manual" ? "Lái tay" : S.controllerId === "custom" ? "Mã tự viết" : (S.brains[S.controllerId]?.name || "…");
    let st = '<span class="pill">Đang chờ</span>';
    if (r === "dich") st = '<span class="pill ok">✓ Tới đích</span>';
    else if (r === "vacham") st = '<span class="pill bad">✗ Va chạm</span>';
    else if (r === "hetgio") st = '<span class="pill warn">⏱ Hết giờ</span>';
    else if (S.playing) st = '<span class="pill">● Đang chạy</span>';
    el.innerHTML = `<span class="pill">Cấp ${S.level}: ${esc(C.LEVELS[S.level].name)}</span>${st}` +
      (sim.safetyActive ? '<span class="pill bad">Lớp an toàn: dừng</span>' : "") +
      (!sim.done && sim.cmdV < -0.02 ? '<span class="pill warn">◀ Đang lùi (không có cảm biến sau)</span>' : "") +
      `<span class="pill">${esc(brain)}</span>`;
  }
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  // ======================================================== BẢNG SỐ LIỆU
  function buildObsList() {
    $("obsList").innerHTML = C.OBS_LABELS.map(([n, u], i) =>
      `<div class="obsrow" title="${esc(u)}"><span>${i + 1}. ${esc(n)}</span><div class="bar ${[1, 5, 6, 7, 8, 9, 10, 11].includes(i) ? "sym" : ""}"><i id="ob${i}"></i></div><span class="num" id="ov${i}">0</span></div>`).join("");
    $("net1").innerHTML = "<i></i>".repeat(64); $("net2").innerHTML = "<i></i>".repeat(64);
  }
  function updatePanel() {
    const o = sim.obs || [];
    o.forEach((v, i) => {
      const sym = [1, 5, 6, 7, 8, 9, 10, 11].includes(i), b = $("ob" + i);
      if (sym) { const w = Math.abs(v) * 50; b.style.left = (v >= 0 ? 50 : 50 - w) + "%"; b.style.width = w + "%"; }
      else { b.style.left = "0"; b.style.width = Math.max(0, Math.min(1, v)) * 100 + "%"; }
      $("ov" + i).textContent = fmt(v);
    });
    $("stStep").textContent = sim.steps; $("stV").textContent = fmt(sim.cmdV ?? 0); $("stW").textContent = fmt(sim.cmdW ?? 0);
    $("stRet").textContent = fmt(sim.ret, 0);
    const b = S.brains[S.controllerId];
    if (b && b.activations) ["net1", "net2"].forEach((id, k) => {
      const a = b.activations[k], cells = $(id).children;
      for (let i = 0; i < cells.length && i < a.length; i++) {
        const v = a[i], t = Math.min(1, Math.abs(v));
        cells[i].style.background = v >= 0 ? `rgba(217,98,43,${0.12 + 0.88 * t})` : `rgba(11,79,138,${0.12 + 0.88 * t})`;
      }
    });
  }
  function updateStats() {
    $("cEp").textContent = S.stats.ep; $("cOk").textContent = S.stats.dich; $("cHit").textContent = S.stats.vacham; $("cTo").textContent = S.stats.hetgio;
  }

  // ============================================================ BỘ NÃO
  async function loadBuiltins() {
    for (const b of BUILTIN_BRAINS) {
      try { const r = await fetch(b.file); S.brains[b.id] = new C.MLPBrain(await r.json()); }
      catch (e) { $("brainErr").textContent = "Không tải được " + b.file + " (mở trang qua máy chủ web, không mở trực tiếp file)."; }
    }
    for (const [id, j] of Object.entries(store.get("uploaded", {}))) { try { S.brains[id] = new C.MLPBrain(j); } catch (e) { /* bỏ qua */ } }
    fillBrainSelect();
  }
  function fillBrainSelect() {
    const sel = $("selBrain");
    const opts = Object.entries(S.brains).map(([id, b]) => `<option value="${esc(id)}">🧠 ${esc(b.name)}</option>`);
    opts.push('<option value="manual">🎮 Lái tay (bàn phím / nút)</option>', '<option value="custom">✍️ Tự viết (JavaScript)</option>');
    sel.innerHTML = opts.join("");
    if (![...sel.options].some(o => o.value === S.controllerId)) S.controllerId = Object.keys(S.brains)[0] || "manual";
    sel.value = S.controllerId; onController();
  }
  function onController() {
    S.controllerId = $("selBrain").value; store.set("controller2", S.controllerId);
    $("joy").classList.toggle("show", S.controllerId === "manual");
    const b = S.brains[S.controllerId];
    $("brainInfo").textContent = b ? `Mạng MLP ${b.layers.map(l => l.b.length).join("-")}, ${b.params.toLocaleString("vi-VN")} tham số, đầu vào 12 số → (v, ω).`
      : S.controllerId === "manual" ? "Bạn tự lái: lớp an toàn vẫn hoạt động." : "Đoạn mã ở mục 6 sẽ quyết định (v, ω).";
    hud();
  }
  async function uploadBrain(file) {
    $("brainErr").textContent = "";
    try {
      let json;
      if (file.name.endsWith(".json")) json = JSON.parse(await file.text());
      else {
        if (typeof JSZip === "undefined") throw new Error("Thiếu thư viện JSZip để đọc .npz");
        const zip = await JSZip.loadAsync(await file.arrayBuffer()), files = {};
        for (const n of Object.keys(zip.files)) files[n] = await zip.files[n].async("arraybuffer");
        json = C.npzToBrainJSON(files, file.name.replace(/\.npz$/, ""));
      }
      json.name = json.name || file.name;
      const brain = new C.MLPBrain(json), id = "up_" + Date.now();
      S.brains[id] = brain;
      const up = store.get("uploaded", {}); up[id] = json; store.set("uploaded", up);
      S.controllerId = id; fillBrainSelect();
    } catch (e) { $("brainErr").textContent = "Không đọc được bộ não: " + e.message; }
  }

  // ======================================================== CHẤM ĐIỂM
  function runBench(ids) {
    const N = +$("selBenchN").value, out = $("benchOut"), rows = [], csv = [["bo_nao", "cap", "luot", "toi_dich", "va_cham", "het_gio", "ti_le_buoc_lui"]];
    out.innerHTML = '<p class="muted">Đang chấm…</p>';
    const jobs = []; ids.forEach(id => { for (let lv = 1; lv <= 5; lv++) jobs.push([id, lv]); });
    const res = {};
    let k = 0;
    const tick = () => {
      if (k >= jobs.length) return finish();
      const [id, lv] = jobs[k++];
      const ctl = id === "manual" ? (() => [0, 0]) : (o => controllerFor(id)(o));
      const r = C.benchmark(ctl, lv, N, 50000, S.cfg);
      (res[id] = res[id] || {})[lv] = r;
      csv.push([S.brains[id]?.name || id, lv, N, r.dich, r.vacham, r.hetgio, r.rev.toFixed(3)]);
      out.innerHTML = `<p class="muted">Đang chấm… ${k}/${jobs.length}</p>`;
      setTimeout(tick, 0);
    };
    const finish = () => {
      let h = `<table><thead><tr><th>Bộ não</th>${[1, 2, 3, 4, 5].map(l => `<th class="n">Cấp ${l}</th>`).join("")}</tr></thead><tbody>`;
      for (const id of ids) {
        h += `<tr><td>${esc(S.brains[id]?.name || id)}</td>` + [1, 2, 3, 4, 5].map(l => {
          const r = res[id][l], p = Math.round(r.succ * 100);
          return `<td class="n"><b style="color:${p >= 80 ? "var(--green)" : p >= 60 ? "var(--amber)" : "var(--red)"}">${p}%</b><br><span class="muted">va ${Math.round(r.coll * 100)}%</span><br><span class="muted" style="color:${r.rev > 0.3 ? "var(--red)" : "inherit"}">lùi ${Math.round(r.rev * 100)}%</span></td>`;
        }).join("") + "</tr>";
      }
      h += `</tbody></table><p class="muted">Tỉ lệ tới đích, va chạm và % số bước đi lùi (lùi nhiều = lái mù vì cảm biến chỉ ở phía trước), ${N} lượt mỗi cấp, bản đồ cố định theo seed – so sánh công bằng giữa các bộ não.</p>`;
      out.innerHTML = h; S.lastBench = csv.map(r => r.join(",")).join("\n"); $("btnBenchCsv").disabled = false;
    };
    tick();
  }
  function controllerFor(id) {
    if (id === S.controllerId) return controller;
    const b = S.brains[id]; return o => (b ? b.act(o) : [0, 0]);
  }

  // ======================================================== SỬA BẢN ĐỒ
  function applyTool(x, y) {
    const half = sim.cfg.arena / 2 - 0.1;
    if (Math.abs(x) > half || Math.abs(y) > half) return;
    const obs = scenario.obstacles;
    switch (S.tool) {
      case "cyl": obs.push({ kind: "cyl", x, y, r: 0.15 }); break;
      case "box": obs.push({ kind: "box", x, y, hx: 0.2, hy: 0.15 }); break;
      case "wall": obs.push({ kind: "wall", x, y, hx: 1.0, hy: 0.05 }); break;
      case "mover": { const a = Math.random() * 6.28; obs.push({ kind: "mover", x, y, r: 0.15, vx: 0.18 * Math.cos(a), vy: 0.18 * Math.sin(a) }); break; }
      case "goal": scenario.goal = { x, y }; break;
      case "start": scenario.start = Object.assign({}, scenario.start, { x, y }); break;
      case "rotate": scenario.start.yaw = C.wrap(scenario.start.yaw + Math.PI / 4); break;
      case "del": {
        let best = -1, bd = 0.5;
        obs.forEach((o, i) => { const d = Math.hypot(o.x - x, o.y - y); if (d < bd) { bd = d; best = i; } });
        if (best >= 0) obs.splice(best, 1); break;
      }
    }
    scenario.custom = true; setPlaying(false); restart();
  }
  function updateMapInfo() {
    const o = scenario.obstacles, cnt = k => o.filter(x => x.kind === k).length;
    $("mapInfo").textContent = `Bản đồ: ${cnt("cyl")} trụ, ${cnt("box")} hộp, ${cnt("wall")} tường trong, ${cnt("mover")} người đi lại${scenario.custom ? " (đã sửa tay)" : ""}.`;
  }

  // ======================================================== CẤU HÌNH ROBOT
  const CFG_FIELDS = [
    ["wheel_base", "Khoảng cách 2 bánh (m)", 0.01], ["wheel_radius", "Bán kính bánh (m)", 0.001],
    ["v_max", "Tốc độ tiến tối đa (m/s)", 0.01], ["w_max", "Tốc độ quay tối đa (rad/s)", 0.1],
    ["sonar_range", "Tầm siêu âm (m)", 0.1], ["safety_stop", "Khoảng dừng an toàn (m)", 0.01],
    ["cam_range", "Tầm YOLO tin cậy (m)", 0.1], ["collide_r", "Bán kính va chạm thân (m)", 0.005],
  ];
  function buildCfgForm() {
    $("cfgForm").innerHTML = CFG_FIELDS.map(([k, n, st]) =>
      `<label>${esc(n)}<br><input type="number" id="cf_${k}" step="${st}" value="${S.cfg[k]}" style="width:100%"></label>`).join("") +
      `<label>Góc nhìn camera (độ)<br><input type="number" id="cf_fov" step="1" value="${Math.round(S.cfg.cam_fov_half * 360 / Math.PI)}" style="width:100%"></label>`;
  }
  function applyCfg(cfg) {
    S.cfg = cfg; store.set("cfg", Object.fromEntries(Object.entries(cfg).filter(([k, v]) => cfg[k] !== C.DEFAULT_CFG[k])));
    sim = new C.Sim(S.cfg); buildCfgForm(); restart();
  }

  // ======================================================== HỘP DỮ LIỆU
  function showData(title, text, editable, onOk) {
    $("modalTitle").textContent = title; $("modalText").value = text; $("modalText").readOnly = !editable;
    $("modalMsg").textContent = ""; $("modal").classList.add("show");
    $("modalOk").textContent = editable ? "Nạp" : "Đóng";
    $("modalOk").onclick = () => { if (editable && onOk) { try { onOk($("modalText").value); } catch (e) { $("modalMsg").textContent = "Lỗi: " + e.message; return; } } $("modal").classList.remove("show"); };
  }
  $("modalCopy").onclick = async () => {
    try { await navigator.clipboard.writeText($("modalText").value); $("modalMsg").textContent = "Đã sao chép"; }
    catch (e) { $("modalText").select(); $("modalMsg").textContent = "Hãy nhấn Ctrl+C (hoặc giữ để sao chép)"; }
  };
  $("modal").addEventListener("click", e => { if (e.target.id === "modal") $("modal").classList.remove("show"); });

  // ======================================================== SỰ KIỆN
  function setView(v) {
    S.view = v;
    for (const [id, vv] of [["v2d", "2d"], ["v3d", "3d"], ["v3dFollow", "3dfollow"], ["v3dFpv", "3dfpv"]]) $(id).classList.toggle("on", vv === v);
    if (v === "2d") three.hide();
    else if (!three.setMode(v)) { $("brainErr").textContent = "Không tải được thư viện 3D, đang dùng chế độ 2D."; S.view = "2d"; $("v2d").classList.add("on"); }
    render();
  }
  function bind() {
    $("selLevel").innerHTML = Object.entries(C.LEVELS).map(([k, L]) => `<option value="${k}">Cấp ${k}: ${esc(L.name)}</option>`).join("");
    $("selLevel").value = S.level;
    $("selLevel").onchange = e => { S.level = +e.target.value; newScenario(); };
    $("inSeed").onchange = e => newScenario(Math.max(1, +e.target.value || 1));
    $("chkNoise").onchange = () => restart();
    $("selBrain").onchange = () => { onController(); restart(); };
    $("btnPlay").onclick = () => setPlaying(!S.playing);
    $("btnStep").onclick = () => { setPlaying(false); stepOnce(); updatePanel(); render(); };
    $("btnReset").onclick = () => restart();
    $("btnNew").onclick = () => newScenario(S.seed + 1);
    $("selSpeed").onchange = e => { S.speed = +e.target.value; };
    $("v2d").onclick = () => setView("2d"); $("v3d").onclick = () => setView("3d");
    $("v3dFollow").onclick = () => setView("3dfollow"); $("v3dFpv").onclick = () => setView("3dfpv");
    $("btnUpload").onclick = () => $("fileBrain").click();
    $("fileBrain").onchange = e => { if (e.target.files[0]) uploadBrain(e.target.files[0]); e.target.value = ""; };
    $("btnBench").onclick = () => runBench([S.controllerId === "manual" ? Object.keys(S.brains)[0] : S.controllerId]);
    $("btnCompare").onclick = () => runBench(Object.keys(S.brains));
    $("btnBenchCsv").onclick = () => showData("Kết quả chấm điểm (CSV)", S.lastBench || "", false);
    $("btnResetStats").onclick = () => { S.stats = { ep: 0, dich: 0, vacham: 0, hetgio: 0 }; updateStats(); };
    document.querySelectorAll("#tools button").forEach(b => b.onclick = () => {
      S.tool = b.dataset.tool; document.querySelectorAll("#tools button").forEach(x => x.classList.toggle("on", x === b));
    });
    $("btnClear").onclick = () => { scenario.obstacles = []; scenario.custom = true; restart(); };
    $("btnSaveMap").onclick = () => { store.set("map", scenario); $("mapInfo").textContent = "Đã lưu bản đồ trong trình duyệt này."; };
    $("btnLoadMap").onclick = () => { const m = store.get("map", null); if (m) { scenario = m; S.level = m.level; $("selLevel").value = m.level; restart(); } else $("mapInfo").textContent = "Chưa có bản đồ đã lưu."; };
    $("btnExportMap").onclick = () => showData("Bản đồ (JSON)", JSON.stringify(scenario, null, 1), false);
    $("btnImportMap").onclick = () => showData("Dán bản đồ JSON", "", true, txt => {
      const m = JSON.parse(txt); if (!m.obstacles || !m.start || !m.goal) throw new Error("thiếu obstacles/start/goal");
      scenario = m; S.level = m.level || 3; $("selLevel").value = S.level; restart();
    });
    c2d.addEventListener("pointerdown", e => {
      if (S.tool === "none") return;
      const r = c2d.getBoundingClientRect(), A = sim.cfg.arena;
      applyTool((e.clientX - r.left) / r.width * A - A / 2, A / 2 - (e.clientY - r.top) / r.height * A);
    });
    $("btnCfgApply").onclick = () => {
      const cfg = Object.assign({}, S.cfg);
      for (const [k] of CFG_FIELDS) { const v = parseFloat($("cf_" + k).value); if (Number.isFinite(v) && v > 0) cfg[k] = v; }
      const f = parseFloat($("cf_fov").value); if (Number.isFinite(f) && f > 5) cfg.cam_fov_half = f * Math.PI / 360;
      applyCfg(cfg);
    };
    $("btnCfgDefault").onclick = () => applyCfg(Object.assign({}, C.DEFAULT_CFG));
    $("btnCfgExport").onclick = () => showData("Hồ sơ robot (JSON)", JSON.stringify(S.cfg, null, 1), false);
    const SAMPLE = `// obs: 12 số (xem mục 2). Trả về [tiến, quay] trong khoảng -1…1
// Ví dụ: bám đích + né khi siêu âm thấy vật gần
function (obs) {
  const sonar = obs[0], seen = obs[3], objAngle = obs[1];
  const sinG = obs[5], cosG = obs[6];
  let turn = Math.atan2(sinG, cosG) * 1.5;      // quay về phía đích
  let fwd = cosG > 0.3 ? 0.8 : 0.1;
  if (sonar < 0.3) { fwd = 0.1; turn = 1; }     // vật gần: chậm lại, rẽ trái
  else if (seen && obs[2] < 0.25) turn += objAngle > 0 ? -0.8 : 0.8;
  return [fwd, Math.max(-1, Math.min(1, turn))];
}`;
    $("codeBox").value = store.get("code", SAMPLE);
    $("btnCodeSample").onclick = () => { $("codeBox").value = SAMPLE; };
    $("btnCodeApply").onclick = () => {
      try {
        const fn = new Function("return (" + $("codeBox").value + ")")();
        if (typeof fn !== "function") throw new Error("Đoạn mã phải là một hàm");
        S.customFn = fn; store.set("code", $("codeBox").value); $("codeErr").textContent = "Đã nạp. Chọn “Tự viết (JavaScript)” ở mục 1.";
        $("selBrain").value = "custom"; onController(); restart();
      } catch (e) { $("codeErr").textContent = "Không chạy được đoạn mã: " + e.message + " (một số trình duyệt chặn chạy mã tự viết trong trang này)."; }
    };
    $("btnTraj").onclick = () => {
      const rows = ["buoc,x_m,y_m"].concat(sim.trail.map(([x, y], i) => `${i},${x.toFixed(4)},${y.toFixed(4)}`));
      showData("Quỹ đạo lượt này (CSV)", rows.join("\n"), false);
    };
    const keyMap = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
    window.addEventListener("keydown", e => {
      if (S.controllerId !== "manual" || !keyMap[e.code] || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      S.keys[keyMap[e.code]] = 1; e.preventDefault(); if (!S.playing) setPlaying(true);
    });
    window.addEventListener("keyup", e => { if (keyMap[e.code]) S.keys[keyMap[e.code]] = 0; });
    document.querySelectorAll("#joy button").forEach(b => {
      const k = b.dataset.k;
      const on = e => { e.preventDefault(); if (k === "stop") { S.keys = { up: 0, down: 0, left: 0, right: 0 }; return; } S.keys[k] = 1; if (!S.playing) setPlaying(true); };
      const off = () => { if (k !== "stop") S.keys[k] = 0; };
      b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off);
    });
    const ro = new ResizeObserver(() => { resize2d(); three.size(); render(); });
    ro.observe($("stage"));
  }

  // ======================================================== API MỞ RỘNG
  window.RobotLab = {
    core: C, get sim() { return sim; }, get scenario() { return scenario; },
    setController(fn) { S.customFn = fn; $("selBrain").value = "custom"; onController(); },
    loadScenario(obj) { scenario = obj; S.level = obj.level || S.level; restart(); },
    loadBrain(json) { const id = "api_" + Date.now(); S.brains[id] = new C.MLPBrain(json); S.controllerId = id; fillBrainSelect(); return id; },
    registerRobot(profile) { S.robots[profile.name] = profile; applyCfg(Object.assign({}, C.DEFAULT_CFG, profile)); $("projName").textContent = "Dự án: " + profile.name; },
    benchmark: (lv, n) => C.benchmark(controller, lv, n, 50000, S.cfg),
  };

  // ------------------------------------------------------------ khởi động
  buildObsList(); buildCfgForm(); bind(); resize2d();
  $("inSeed").value = S.seed;
  newScenario(S.seed);
  loadBuiltins().then(() => restart());
  requestAnimationFrame(loop);
}
