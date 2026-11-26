/* Giao diện Phòng thí nghiệm robot ảo – NGUYỄN SỸ HIỆP – ICTU
 * Hai chế độ: Nhà thông minh (ra lệnh) và Sân huấn luyện 5 cấp. */
{
  const C = window.RobotCore, H = window.RobotHouse, RM = window.RobotModels;
  const $ = id => document.getElementById(id);
  const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace(".", ",") : "–");
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("robotlab:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("robotlab:" + k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } },
  };
  const COL = { navy: "#0B2545", navy2: "#13315C", navy3: "#1F4E8C", sky: "#EAF0F8", red: "#D62839", ok: "#1E7B4F", amber: "#E0A100", wood: "#C99A68", woodD: "#8C623B", woodL: "#E2C9A6", white: "#FFFFFF", gray: "#9AA6B8" };

  // ------------------------------------------------------------ trạng thái
  const BUILTIN_BRAINS = [
    { id: "ban2_phat_lui", file: "brains/ban2_phat_lui.json" },
    { id: "hoc_thang_300k", file: "brains/hoc_thang_300k.json" },
    { id: "cap3_kaggle_5cap", file: "brains/cap3_kaggle_5cap.json" },
    { id: "cap2_kaggle_5cap", file: "brains/cap2_kaggle_5cap.json" },
    { id: "cap1_kaggle_5cap", file: "brains/cap1_kaggle_5cap.json" },
  ];
  const S = {
    mode: store.get("mode", "house"),
    cfg: Object.assign({}, C.DEFAULT_CFG, store.get("cfg", {})),
    level: store.get("level", 3), seed: store.get("seed2", 6),
    brains: {}, controllerId: store.get("controller3", "ban2_phat_lui"),
    customFn: null, keys: { up: 0, down: 0, left: 0, right: 0 },
    playing: false, speed: 2, acc: 0, view: "3d", tool: "none",
    stats: { ep: 0, dich: 0, vacham: 0, hetgio: 0 }, lastBench: null, robots: {},
    hStart: store.get("hStart", { x: -1.4, y: -1.0, yaw: 0 }), nav: new H.Navigator(), logShown: -1, cmdAt: 0,
    layout: store.get("layout", null), movers: store.get("movers", ["nguoi_khach"]), moveSel: null,
  };
  let sim = new C.Sim(S.cfg), scenario = null;

  // --------------------------------------------------------- bộ điều khiển
  function controller(obs) {
    const id = S.controllerId;
    if (id === "manual") { const k = S.keys; return [(k.up ? 1 : 0) - (k.down ? 1 : 0), (k.left ? 1 : 0) - (k.right ? 1 : 0)]; }
    if (id === "custom") {
      if (!S.customFn) return [0, 0];
      try { const a = S.customFn(obs, { level: S.level, cfg: S.cfg }); $("codeErr").textContent = ""; return [+a[0] || 0, +a[1] || 0]; }
      catch (e) { $("codeErr").textContent = "Lỗi khi chạy mã: " + e.message; return [0, 0]; }
    }
    const b = S.brains[id];
    return b ? b.act(obs) : [0, 0];
  }
  const isHouse = () => S.mode === "house";

  // ---------------------------------------------------------- vòng đời
  function buildHouse() { scenario = H.buildScenario(S.hStart, S.layout, S.movers); }
  function newScenario(seed) {
    if (isHouse()) { buildHouse(); return restart(); }
    S.seed = seed ?? S.seed; $("inSeed").value = S.seed;
    scenario = C.generateScenario(S.level, S.seed, S.cfg);
    store.set("level", S.level); store.set("seed2", S.seed);
    restart();
  }
  function restart(keepNav) {
    if (isHouse()) {
      sim.load(scenario, { seed: 7, randomize: true, endOnGoal: false, maxSteps: 1e9, bump: $("hsBump").checked });
      S.nav.reset(); S.logShown = -1;                     // trí nhớ đồ vật (nav.mem) vẫn giữ
    } else sim.load(scenario, { seed: S.seed, randomize: $("chkNoise").checked });
    S.acc = 0; three.rebuild(); updateMapInfo(); render(); updatePanel(); updateHouse(true);
  }
  function endEpisode() {
    S.stats.ep++; S.stats[sim.result]++; updateStats();
    if ($("chkAuto").checked) setTimeout(() => { if (S.playing && !isHouse()) newScenario(S.seed + 1); }, 600 / S.speed);
    else setPlaying(false);
  }
  function stepOnce() {
    if (isHouse()) {
      if (sim.done) { setPlaying(false); return; }
      const nav = S.nav; nav.tNow = sim.steps / sim.cfg.control_hz;
      let a = [0, 0];
      if (S.controllerId === "manual") a = controller(sim.obs);
      else if (nav.busy) a = nav.act(sim, controller);
      sim.step(a);
      if (!nav.busy && S.controllerId !== "manual" && nav.phase !== "rong") setPlaying(false);
      return;
    }
    if (sim.done) return;
    sim.step(controller(sim.obs));
    if (sim.done) endEpisode();
  }

  // ------------------------------------------------------------- vòng lặp
  let last = performance.now();
  function loop(t) {
    const dt = Math.min((t - last) / 1000, 0.1); last = t;
    if (S.playing && !(sim.done && !isHouse())) {
      S.acc += dt * S.speed;
      const ctl = 1 / sim.cfg.control_hz;
      let n = 0;
      while (S.acc >= ctl && S.playing && n < 200) { stepOnce(); S.acc -= ctl; n++; }
      if (n) { updatePanel(); updateHouse(); }
    }
    render();
    requestAnimationFrame(loop);
  }
  function setPlaying(p) {
    S.playing = p;
    if (p && sim.done && !isHouse()) restart();
    $("btnPlay").textContent = p ? "⏸ Dừng" : "▶ Chạy";
  }

  // ============================================================ VẼ 2D
  const c2d = $("c2d"), g = c2d.getContext("2d");
  let VT = { s: 1, ox: 0, oy: 0 }, DPR = 1;
  function resize2d() {
    const r = c2d.getBoundingClientRect(); DPR = Math.min(window.devicePixelRatio || 1, 2);
    c2d.width = Math.max(1, Math.round(r.width * DPR)); c2d.height = Math.max(1, Math.round(r.height * DPR));
  }
  function setView() {
    const B = sim.bounds, W = c2d.width, Hh = c2d.height, bw = B.x1 - B.x0, bh = B.y1 - B.y0, pad = 0.12;
    const s = Math.min(W / (bw + 2 * pad), Hh / (bh + 2 * pad));
    VT = { s, ox: (W - bw * s) / 2 - B.x0 * s, oy: (Hh + bh * s) / 2 + B.y0 * s };
  }
  const sx = x => VT.ox + x * VT.s, sy = y => VT.oy - y * VT.s, sl = l => l * VT.s;
  const toWorld = (px, py) => [(px - VT.ox) / VT.s, (VT.oy - py) / VT.s];
  const patterns = {};
  function pattern(type) {
    if (patterns[type]) return patterns[type];
    const c = document.createElement("canvas"), k = 64; c.width = c.height = k; const x = c.getContext("2d");
    if (type === "wood") { x.fillStyle = "#F1E4D1"; x.fillRect(0, 0, k, k); x.strokeStyle = "rgba(160,115,70,.22)"; x.lineWidth = 1;
      for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(0, i * 16); x.lineTo(k, i * 16); x.stroke(); }
      for (let i = 0; i < 4; i++) { const o = (i * 23) % 64; x.beginPath(); x.moveTo(o, i * 16); x.lineTo(o, i * 16 + 16); x.stroke(); } }
    else if (type === "tile") { x.fillStyle = "#F3F6FA"; x.fillRect(0, 0, k, k); x.strokeStyle = "#D6DEE9"; x.lineWidth = 1; x.strokeRect(0.5, 0.5, 32, 32); x.strokeRect(32.5, 32.5, 32, 32); x.strokeRect(32.5, 0.5, 32, 32); x.strokeRect(0.5, 32.5, 32, 32); }
    else { x.fillStyle = "#F6EFEC"; x.fillRect(0, 0, k, k); for (let i = 0; i < 120; i++) { x.fillStyle = "rgba(170,120,120,.08)"; x.fillRect(Math.random() * k, Math.random() * k, 1.5, 1.5); } }
    return (patterns[type] = g.createPattern(c, "repeat"));
  }
  function rrect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  const FACE_A = { ny: 0, py: Math.PI, px: -Math.PI / 2, nx: Math.PI / 2 };
  const ROOM_LABEL = { khach: [-2.3, -2.75], bep: [3.4, 0.22], ngu: [2.25, -0.25] };

  function drawFurniture2d(o, hl) {
    const px = sl(1);
    if (o.kind === "cyl") {
      g.fillStyle = "#E9F2EC"; g.strokeStyle = "#2E7D4F"; g.lineWidth = Math.max(1.2, px * 0.02);
      g.beginPath(); g.arc(sx(o.x), sy(o.y), sl(o.r), 0, 7); g.fill(); g.stroke();
      g.fillStyle = "#3E9B63"; for (let k = 0; k < 5; k++) { const a = k * 1.26; g.beginPath(); g.ellipse(sx(o.x) + Math.cos(a) * sl(o.r) * 0.45, sy(o.y) + Math.sin(a) * sl(o.r) * 0.45, sl(o.r) * 0.38, sl(o.r) * 0.2, a, 0, 7); g.fill(); }
      return;
    }
    const along = o.face === "px" || o.face === "nx";
    const W = sl(2 * (along ? o.hy : o.hx)), D = sl(2 * (along ? o.hx : o.hy));
    g.save(); g.translate(sx(o.x), sy(o.y)); g.rotate(FACE_A[o.face] || 0);
    const lw = Math.max(1, px * 0.015);
    g.lineWidth = lw; g.strokeStyle = COL.navy2;
    const base = (fill, r = 0.04) => { g.fillStyle = fill; rrect(-W / 2, -D / 2, W, D, sl(r)); g.fill(); g.stroke(); };
    switch (o.model) {
      case "sofa": case "armchair":
        base(COL.navy2, 0.06); g.fillStyle = COL.navy3;
        rrect(-W / 2 + sl(0.12), -D / 2 + sl(0.2), W - sl(0.24), D - sl(0.26), sl(0.04)); g.fill();
        g.fillStyle = "#D62839"; rrect(-W / 2 + sl(0.18), -D / 2 + sl(0.16), sl(0.3), sl(0.1), sl(0.02)); g.fill(); break;
      case "bed":
        base(COL.wood, 0.04); g.fillStyle = "#fff"; rrect(-W / 2 + sl(0.04), -D / 2 + sl(0.04), W - sl(0.08), D - sl(0.08), sl(0.05)); g.fill();
        g.fillStyle = COL.navy2; g.fillRect(-W / 2 + sl(0.03), -D / 2 + D * 0.4, W - sl(0.06), D * 0.58);
        g.fillStyle = COL.red; g.fillRect(-W / 2 + sl(0.03), -D / 2 + D * 0.4, W - sl(0.06), sl(0.06));
        g.fillStyle = "#EEF2F7"; for (const s of [-1, 1]) { rrect(s * W * 0.22 - W * 0.18, -D / 2 + sl(0.1), W * 0.36, sl(0.3), sl(0.06)); g.fill(); } break;
      case "fridge": base("#E9EDF2", 0.03); g.strokeStyle = "#9AA4B2"; g.beginPath(); g.moveTo(-W / 2, D / 2 - sl(0.04)); g.lineTo(W / 2, D / 2 - sl(0.04)); g.stroke(); break;
      case "sink": case "stove":
        base("#FFFFFF", 0.02); g.fillStyle = "#CDD3DB"; g.fillRect(-W / 2, -D / 2, W, sl(0.04));
        if (o.model === "sink") { g.fillStyle = "#B8C2CF"; rrect(-W * 0.25, -D * 0.25, W * 0.5, D * 0.55, sl(0.05)); g.fill(); }
        else { g.strokeStyle = COL.red; for (const [x, y] of [[-0.14, -0.1], [0.14, -0.1], [-0.14, 0.12], [0.14, 0.12]]) { g.beginPath(); g.arc(x * W, sl(y), sl(0.06), 0, 7); g.stroke(); } } break;
      case "tv": base("#FFFFFF", 0.02); g.fillStyle = "#23406B"; g.fillRect(-W * 0.45, -D / 2 + sl(0.06), W * 0.9, sl(0.05)); break;
      case "dining": case "coffee": case "desk":
        base(o.model === "desk" ? "#FFFFFF" : COL.wood, 0.03);
        if (o.model === "dining") { g.fillStyle = COL.red; g.fillRect(-W * 0.25, -sl(0.16), W * 0.5, sl(0.32)); } break;
      case "chair": base(COL.woodL, 0.03); g.fillStyle = COL.navy2; g.fillRect(-W / 2 + sl(0.03), -D / 2, W - sl(0.06), sl(0.05)); break;
      case "wardrobe": case "shelf": base(COL.woodL, 0.02); g.strokeStyle = COL.woodD; g.beginPath(); g.moveTo(0, -D / 2); g.lineTo(0, D / 2); g.stroke(); break;
      default: base("#F3C9A1", 0.03);
    }
    g.restore();
    if (hl) { g.save(); g.strokeStyle = COL.red; g.lineWidth = Math.max(2, px * 0.03); g.setLineDash([px * 0.08, px * 0.05]);
      const r = sl(0.08); rrect(sx(o.x - o.hx) - r, sy(o.y + o.hy) - r, sl(2 * o.hx) + 2 * r, sl(2 * o.hy) + 2 * r, r); g.stroke(); g.restore(); }
  }
  function label(text, x, y, size, color = COL.navy, bg = "rgba(255,255,255,.85)") {
    g.font = `600 ${size}px "Be Vietnam Pro",system-ui,sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    const w = g.measureText(text).width + size * 0.7;
    g.fillStyle = bg; rrect(x - w / 2, y - size * 0.75, w, size * 1.5, size * 0.4); g.fill();
    g.fillStyle = color; g.fillText(text, x, y + size * 0.04);
  }

  function draw2d() {
    setView();
    const w = c2d.width, h = c2d.height, house = !!sim.sc?.house, px = sl(1);
    g.clearRect(0, 0, w, h); g.fillStyle = "#F4F7FB"; g.fillRect(0, 0, w, h);
    const sc = sim.sc; if (!sc) return;
    const B = sim.bounds;
    if (house) {
      for (const [k, R] of Object.entries(H.ROOMS)) {
        const [a, b, c, d] = R.rect; g.fillStyle = pattern(R.floor); g.fillRect(sx(a), sy(d), sl(b - a), sl(d - c));
        const lp = ROOM_LABEL[k]; label(R.name.toUpperCase(), sx(lp[0]), sy(lp[1]), Math.max(10, px * 0.12), COL.navy2, "rgba(255,255,255,.7)");
      }
      for (const r of H.DECOR) { g.fillStyle = r.color; rrect(sx(r.x - r.w / 2), sy(r.y + r.d / 2), sl(r.w), sl(r.d), sl(0.06)); g.fill(); }
    } else {
      g.fillStyle = "#fff"; g.fillRect(sx(B.x0), sy(B.y1), sl(B.x1 - B.x0), sl(B.y1 - B.y0));
      g.strokeStyle = "#E3E9F2"; g.lineWidth = 1;
      for (let x = Math.ceil(B.x0 * 2) / 2; x <= B.x1; x += 0.5) { g.beginPath(); g.moveTo(sx(x), sy(B.y0)); g.lineTo(sx(x), sy(B.y1)); g.stroke(); }
      for (let y = Math.ceil(B.y0 * 2) / 2; y <= B.y1; y += 0.5) { g.beginPath(); g.moveTo(sx(B.x0), sy(y)); g.lineTo(sx(B.x1), sy(y)); g.stroke(); }
    }
    // tầm nhìn camera
    const fov = sim.cfg.cam_fov_half, R = sl(sim.cfg.cam_range);
    g.fillStyle = "rgba(31,78,140,.10)"; g.beginPath(); g.moveTo(sx(sim.x), sy(sim.y));
    g.arc(sx(sim.x), sy(sim.y), R, -sim.yaw - fov, -sim.yaw + fov); g.closePath(); g.fill();
    // vật
    const nav = S.nav, tgt = house && nav.target && !nav.target.isRoom ? nav.target : null;
    for (const o of sim.allObstacles()) {
      if (o.kind === "wall") { g.fillStyle = COL.navy; g.fillRect(sx(o.x - o.hx), sy(o.y + o.hy), sl(2 * o.hx), sl(2 * o.hy)); continue; }
      if (o.kind === "mover") { drawMover2d(o); continue; }
      if (house && o.model) { drawFurniture2d(o, tgt && o.id === tgt.id); continue; }
      g.lineWidth = 2;
      if (o.kind === "box") { g.fillStyle = "#E8D2B0"; g.strokeStyle = COL.woodD; } else { g.fillStyle = "#C9D6EA"; g.strokeStyle = COL.navy3; }
      if (o.kind === "box") { rrect(sx(o.x - o.hx), sy(o.y + o.hy), sl(2 * o.hx), sl(2 * o.hy), sl(0.03)); g.fill(); g.stroke(); }
      else { g.beginPath(); g.arc(sx(o.x), sy(o.y), sl(o.r), 0, 7); g.fill(); g.stroke(); }
      if (o === sim.yoloSeen) { const r = o.kind === "box" ? Math.hypot(o.hx, o.hy) : o.r; g.strokeStyle = COL.red; g.setLineDash([6, 4]);
        g.strokeRect(sx(o.x - r) - 4, sy(o.y + r) - 4, sl(2 * r) + 8, sl(2 * r) + 8); g.setLineDash([]); label("YOLO", sx(o.x), sy(o.y + r) - 12, Math.max(10, px * 0.1), COL.red); }
    }
    if (house) {
      // cửa + mốc
      for (const d of H.DOORS) {
        g.strokeStyle = "rgba(19,49,92,.45)"; g.lineWidth = 1.2; g.setLineDash([4, 3]);
        g.beginPath(); g.arc(sx(d.x), sy(d.y - d.width / 2), sl(d.width), -Math.PI / 2, 0); g.stroke(); g.setLineDash([]);
        g.strokeStyle = COL.woodD; g.lineWidth = Math.max(2, px * 0.04); g.beginPath(); g.moveTo(sx(d.x), sy(d.y - d.width / 2)); g.lineTo(sx(d.x + d.width), sy(d.y - d.width / 2)); g.stroke();
        drawMarker2d(d.marker, d.x, d.y + d.width / 2 + 0.02);
      }
      for (const m of H.ROOM_MARKERS) drawMarker2d(m.marker, m.x + m.n[0] * 0.12, m.y + m.n[1] * 0.12);
      for (const o of sim.sc.obstacles) if (o.model && o.label && o.model !== "chair" && o.kind !== "cyl" || (o.kind === "cyl" && o.label))
        label(o.label, sx(o.x), sy(o.y), Math.max(9, px * 0.085), tgt && o.id === tgt.id ? "#fff" : COL.navy, tgt && o.id === tgt.id ? COL.red : "rgba(255,255,255,.82)");
      if (nav.goal && nav.busy) { const x = sx(nav.goal.x), y = sy(nav.goal.y), r = Math.max(6, px * 0.09);
        g.strokeStyle = COL.red; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, 7); g.moveTo(x - r * 1.6, y); g.lineTo(x + r * 1.6, y); g.moveTo(x, y - r * 1.6); g.lineTo(x, y + r * 1.6); g.stroke(); }
      const now = Date.now();
      for (const m of nav.seen) { const age = (now - m.t) / 1000; if (age > 1.6) continue;
        g.strokeStyle = `rgba(214,40,57,${1 - age / 1.6})`; g.lineWidth = 3; g.beginPath(); g.arc(sx(m.x), sy(m.y), sl(0.15 + age * 0.4), 0, 7); g.stroke();
        g.setLineDash([5, 5]); g.beginPath(); g.moveTo(sx(sim.x), sy(sim.y)); g.lineTo(sx(m.x), sy(m.y)); g.stroke(); g.setLineDash([]); }
    } else {
      g.fillStyle = "rgba(214,40,57,.12)"; g.beginPath(); g.arc(sx(sc.goal.x), sy(sc.goal.y), sl(sim.cfg.goal_tol), 0, 7); g.fill();
      g.fillStyle = COL.red; g.beginPath(); g.arc(sx(sc.goal.x), sy(sc.goal.y), Math.max(5, sl(0.06)), 0, 7); g.fill();
    }
    // vệt đường
    g.strokeStyle = "rgba(31,78,140,.55)"; g.lineWidth = Math.max(2, px * 0.025); g.lineJoin = "round"; g.beginPath();
    const tr = sim.trail, step = Math.max(1, Math.floor(tr.length / 1500));
    for (let i = 0; i < tr.length; i += step) i ? g.lineTo(sx(tr[i][0]), sy(tr[i][1])) : g.moveTo(sx(tr[i][0]), sy(tr[i][1]));
    g.stroke();
    // tia siêu âm
    if (sim.rays) { g.strokeStyle = sim.safetyActive ? COL.red : COL.amber; g.lineWidth = 1.5;
      for (const [x0, y0, x1, y1] of sim.rays) { g.beginPath(); g.moveTo(sx(x0), sy(y0)); g.lineTo(sx(x1), sy(y1)); g.stroke(); } }
    // xe
    g.save(); g.translate(sx(sim.x), sy(sim.y)); g.rotate(-sim.yaw);
    const L = Math.max(sl(sim.cfg.body_lx), 10), Bw = Math.max(sl(sim.cfg.body_ly), 8), wr = Math.max(sl(sim.cfg.wheel_radius), 3), wb = Math.max(sl(sim.cfg.wheel_base), 6);
    g.fillStyle = "#1B1F27"; g.fillRect(-wr, -wb / 2 - 3, 2 * wr, 5); g.fillRect(-wr, wb / 2 - 2, 2 * wr, 5);
    g.fillStyle = sim.result === "vacham" || sim.bumped ? COL.red : COL.navy; rrect(-L / 2, -Bw / 2, L, Bw, 3); g.fill();
    g.fillStyle = COL.red; g.fillRect(L / 2 - 3, -Bw / 2, 3, Bw);
    g.fillStyle = "#fff"; g.beginPath(); g.moveTo(L / 2 - 5, 0); g.lineTo(L / 2 - 12, -4); g.lineTo(L / 2 - 12, 4); g.fill();
    g.restore();
  }
  function drawMover2d(o) {
    const a = Math.atan2(o.vy || 0, o.vx || 1), x = sx(o.x), y = sy(o.y);
    g.save(); g.translate(x, y); g.rotate(-a);
    if (o.model === "cat") {
      g.fillStyle = "#E39B4E"; g.beginPath(); g.ellipse(0, 0, sl(0.16), sl(0.075), 0, 0, 7); g.fill();
      g.beginPath(); g.arc(sl(0.17), 0, sl(0.06), 0, 7); g.fill();
      g.strokeStyle = "#E39B4E"; g.lineWidth = sl(0.025); g.beginPath(); g.moveTo(-sl(0.15), 0); g.quadraticCurveTo(-sl(0.28), sl(0.1), -sl(0.22), sl(0.16)); g.stroke();
    } else {
      const sh = "#" + (o.look?.shirt ?? 0xD62839).toString(16).padStart(6, "0"), sw = Math.sin((o.walk || 0) * 7.5) * sl(0.08) * (o.moving ? 1 : 0);
      g.fillStyle = "#22262E"; g.beginPath(); g.ellipse(sw, -sl(0.08), sl(0.09), sl(0.045), 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(-sw, sl(0.08), sl(0.09), sl(0.045), 0, 0, 7); g.fill();
      g.fillStyle = sh; g.strokeStyle = COL.navy2; g.lineWidth = 1.5; g.beginPath(); g.ellipse(0, 0, sl(0.13), sl(0.24), 0, 0, 7); g.fill(); g.stroke();
      g.fillStyle = "#" + (o.look?.hair ?? 0x2B1D14).toString(16).padStart(6, "0"); g.beginPath(); g.arc(0, 0, sl(0.1), 0, 7); g.fill();
      g.fillStyle = "#E7C3A0"; g.beginPath(); g.arc(sl(0.035), 0, sl(0.06), -1.2, 1.2); g.fill();
    }
    g.restore();
  }
  function drawMarker2d(id, x, y) {
    const s = Math.max(9, sl(0.16)); g.fillStyle = "#111"; g.fillRect(sx(x) - s / 2, sy(y) - s / 2, s, s);
    g.fillStyle = "#fff"; g.fillRect(sx(x) - s / 4, sy(y) - s / 4, s / 4, s / 4); g.fillRect(sx(x), sy(y), s / 4, s / 4);
    label(String(id), sx(x) + s * 0.95, sy(y) - s * 0.55, Math.max(9, s * 0.62), "#fff", COL.red);
  }

  // ============================================================ VẼ 3D
  const three = (() => {
    const ok = typeof THREE !== "undefined" && RM;
    const wrapEl = $("c3dwrap");
    let renderer, scene, cam, controls, robot, objs = [], staticGroup, trailLine, rayLines = [], fovLine, goalMesh, navGoal, ring, sun;
    const to3 = (x, y, h = 0) => new THREE.Vector3(x, h, -y);
    function init() {
      if (!ok || renderer) return;
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputEncoding = THREE.sRGBEncoding;
      wrapEl.appendChild(renderer.domElement);
      scene = new THREE.Scene(); scene.background = new THREE.Color(0xEEF3F9);
      cam = new THREE.PerspectiveCamera(50, 1, 0.02, 100);
      if (THREE.OrbitControls) { controls = new THREE.OrbitControls(cam, renderer.domElement); controls.maxPolarAngle = Math.PI / 2.1; controls.enableDamping = true; controls.dampingFactor = 0.1; }
      scene.add(new THREE.HemisphereLight(0xffffff, 0xC9D3E0, 0.75));
      sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(-3, 8, 4); sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 25 }); sun.shadow.bias = -0.0005;
      scene.add(sun);
      robot = RM.robot(); robot.traverse(m => { if (m.isMesh) m.castShadow = true; }); scene.add(robot);
      goalMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.006, 40), new THREE.MeshStandardMaterial({ color: 0xD62839, transparent: true, opacity: 0.35 })); scene.add(goalMesh);
      navGoal = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 16), new THREE.MeshStandardMaterial({ color: 0xD62839, emissive: 0x5A0A12 })); navGoal.rotation.x = Math.PI; scene.add(navGoal);
      ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 48), new THREE.MeshBasicMaterial({ color: 0xD62839, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })); ring.rotation.x = -Math.PI / 2; scene.add(ring);
      trailLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x1F4E8C })); scene.add(trailLine);
      for (let i = 0; i < 3; i++) { const l = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xE0A100 })); rayLines.push(l); scene.add(l); }
      fovLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x6F8FBF })); scene.add(fovLine);
      renderer.domElement.addEventListener("pointerdown", e => pick3d(e));
      rebuild();
    }
    function wallMesh(o, h) {
      const grp = new THREE.Group();
      const m = RM.box(2 * o.hx, h, 2 * o.hy, RM.M(0xF7F8FA, { roughness: 0.9 })); m.position.set(o.x, h / 2, -o.y); grp.add(m);
      const cap = RM.box(2 * o.hx + 0.004, 0.025, 2 * o.hy + 0.004, RM.M(0x13315C)); cap.position.set(o.x, h + 0.012, -o.y); grp.add(cap);
      const base = RM.box(2 * o.hx + 0.01, 0.06, 2 * o.hy + 0.01, RM.M(0x0B2545)); base.position.set(o.x, 0.03, -o.y); grp.add(base);
      return grp;
    }
    function rebuild() {
      if (!scene) return;
      if (staticGroup) scene.remove(staticGroup);
      staticGroup = new THREE.Group(); objs = [];
      const B = sim.bounds, house = !!sim.sc?.house;
      if (house) {
        for (const R of Object.values(H.ROOMS)) {
          const [a, b, c, d] = R.rect, t = RM.floorTex[R.floor]();
          t.repeat.set((b - a) / (R.floor === "wood" ? 1.6 : 1.2), (d - c) / (R.floor === "wood" ? 1.6 : 1.2));
          const f = new THREE.Mesh(new THREE.PlaneGeometry(b - a, d - c), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
          f.rotation.x = -Math.PI / 2; f.position.set((a + b) / 2, 0, -(c + d) / 2); f.receiveShadow = true; staticGroup.add(f);
        }
        for (const r of H.DECOR) { const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshStandardMaterial({ color: r.color, roughness: 1 })); m.rotation.x = -Math.PI / 2; m.position.set(r.x, 0.004, -r.y); m.receiveShadow = true; staticGroup.add(m); }
        for (const d of H.DOORS) {
          for (const s of [-1, 1]) { const post = RM.box(0.12, 1.02, 0.06, RM.M(0x8C623B)); post.position.set(d.x, 0.51, -(d.y + s * (d.width / 2 + 0.0))); staticGroup.add(post); }
          const lintel = RM.box(0.12, 0.08, d.width + 0.06, RM.M(0x8C623B)); lintel.position.set(d.x, 0.98, -d.y); staticGroup.add(lintel);
          const leaf = RM.box(d.width - 0.06, 0.95, 0.035, RM.M(0xD9B88E)); leaf.position.set(d.x + d.width / 2 - 0.01, 0.48, -(d.y - d.width / 2 + 0.02)); staticGroup.add(leaf);
          for (const s of [-1, 1]) { const mk = RM.marker(d.marker, 0.16); mk.position.set(d.x + s * 0.065, 0.83, -d.y); mk.rotation.y = s * Math.PI / 2; staticGroup.add(mk); }
        }
        for (const m of H.ROOM_MARKERS) {
          const mk = RM.marker(m.marker, 0.2); mk.position.set(m.x + m.n[0] * 0.06, 0.62, -(m.y + m.n[1] * 0.06));
          mk.rotation.y = m.n[0] === 1 ? Math.PI / 2 : m.n[0] === -1 ? -Math.PI / 2 : m.n[1] === 1 ? Math.PI : 0; staticGroup.add(mk);
        }
      } else {
        const t = RM.floorTex.grid(); t.repeat.set((B.x1 - B.x0) / 2, (B.y1 - B.y0) / 2);
        const f = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0, B.y1 - B.y0), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
        f.rotation.x = -Math.PI / 2; f.receiveShadow = true; staticGroup.add(f);
      }
      for (const o of sim.allObstacles()) {
        let m;
        if (o.kind === "wall") { m = wallMesh(o, house ? 1.0 : 0.4); m.traverse(x => { x.userData.o = o; }); }
        else if (o.kind === "mover") { m = o.model === "cat" ? RM.cat() : RM.person(o.look); m.position.copy(to3(o.x, o.y)); m.userData.o = o; m.userData.mover = true; }
        else if (house && o.model) m = RM.build(o);
        else if (o.kind === "box") {                    // thùng các-tông có băng dính
          m = new THREE.Group(); m.add(RM.box(2 * o.hx, 0.4, 2 * o.hy, RM.M(0xD9B88E), o.x, 0.2, -o.y));
          m.add(RM.box(2 * o.hx + 0.004, 0.006, 0.05, RM.M(0xC79A62), o.x, 0.403, -o.y)); m.userData.o = o;
        } else {                                          // trụ/thùng tròn xanh hải quân, viền đỏ
          m = new THREE.Group(); m.add(RM.cyl(o.r, o.r, 0.4, RM.M(0x1F4E8C, { roughness: 0.5 }), o.x, 0.2, -o.y, 28));
          m.add(RM.cyl(o.r + 0.003, o.r + 0.003, 0.03, RM.M(0xD62839), o.x, 0.3, -o.y, 28)); m.userData.o = o;
        }
        staticGroup.add(m); objs.push(m);
      }
      scene.add(staticGroup);
      goalMesh.visible = !house; if (!house && sim.sc) goalMesh.position.copy(to3(sim.sc.goal.x, sim.sc.goal.y, 0.004));
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
      robot.userData.body.material = RM.M(sim.result === "vacham" || sim.bumped ? 0xD62839 : 0x0B2545, { roughness: 0.5 });
      for (const m of objs) if (m.userData.mover) {
        const o = m.userData.o; m.position.copy(to3(o.x, o.y));
        if (o.vx || o.vy) m.rotation.y = Math.atan2(o.vy, o.vx);
        m.userData.pose && m.userData.pose(o.walk || 0, !!o.moving && S.playing);
      }
      trailLine.geometry.dispose(); const tr = sim.trail, st = Math.max(1, Math.floor(tr.length / 1500));
      trailLine.geometry = new THREE.BufferGeometry().setFromPoints(tr.filter((_, i) => i % st === 0).map(([x, y]) => to3(x, y, 0.012)));
      (sim.rays || []).forEach(([x0, y0, x1, y1], i) => { rayLines[i].geometry.dispose(); rayLines[i].geometry = new THREE.BufferGeometry().setFromPoints([to3(x0, y0, 0.08), to3(x1, y1, 0.08)]);
        rayLines[i].material.color.set(sim.safetyActive ? 0xD62839 : 0xE0A100); rayLines[i].visible = S.view !== "3dfpv"; });
      const f = sim.cfg.cam_fov_half, R = sim.cfg.cam_range, pts = [to3(sim.x, sim.y, 0.125)];
      for (let k = 0; k <= 12; k++) { const a = sim.yaw - f + (2 * f * k) / 12; pts.push(to3(sim.x + R * Math.cos(a), sim.y + R * Math.sin(a), 0.125)); }
      pts.push(to3(sim.x, sim.y, 0.125)); fovLine.geometry.dispose(); fovLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      fovLine.visible = S.view !== "3dfpv";
      const nav = S.nav, house = !!sim.sc?.house;
      navGoal.visible = house && nav.busy && !!nav.goal;
      if (navGoal.visible) navGoal.position.copy(to3(nav.goal.x, nav.goal.y, 0.25 + 0.04 * Math.sin(performance.now() / 250)));
      const t = house && nav.target && !nav.target.isRoom ? nav.target : null;
      ring.visible = !!t;
      if (t) { ring.position.copy(to3(t.x, t.y, 0.01)); const r = (t.kind === "cyl" ? t.r : Math.max(t.hx, t.hy)) + 0.15; ring.scale.setScalar(r / 0.53); }
      if (S.view === "3dfollow") {
        const back = to3(sim.x - 0.7 * Math.cos(sim.yaw), sim.y - 0.7 * Math.sin(sim.yaw), 1.5);
        cam.position.lerp(back, 0.1); cam.lookAt(to3(sim.x + 0.5 * Math.cos(sim.yaw), sim.y + 0.5 * Math.sin(sim.yaw), 0));
      } else if (S.view === "3dfpv") {
        cam.position.copy(to3(sim.x + 0.1 * Math.cos(sim.yaw), sim.y + 0.1 * Math.sin(sim.yaw), 0.13));
        cam.lookAt(to3(sim.x + 2 * Math.cos(sim.yaw), sim.y + 2 * Math.sin(sim.yaw), 0.1));
      } else if (controls) controls.update();
      renderer.render(scene, cam);
    }
    function setMode(v) {
      if (!ok) return false;
      init(); wrapEl.style.display = "block"; size();
      if (controls) controls.enabled = v === "3d";
      cam.fov = v === "3dfpv" ? 2 * sim.cfg.cam_fov_half * 180 / Math.PI * 0.85 : 50; cam.updateProjectionMatrix();
      if (v === "3d") {
        const house = !!sim.sc?.house;
        if (house) { cam.position.set(0.3, 6.6, 6.2); controls && controls.target.set(0, 0, 0.3); }
        else { cam.position.set(0, 5.2, 4.2); controls && controls.target.set(0, 0, 0); }
      }
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
    const el = $("hud"), r = sim.result;
    const brain = S.controllerId === "manual" ? "Lái tay" : S.controllerId === "custom" ? "Mã tự viết" : (S.brains[S.controllerId]?.name || "…");
    let h = "";
    if (isHouse()) {
      const nav = S.nav;
      h += `<span class="pill navy">${nav.room ? esc(H.ROOMS[nav.room].name) : "Chưa biết phòng"}</span>`;
      const cls = nav.phase === "xong" ? "ok" : ["that_bai", "va_cham"].includes(nav.phase) ? "bad" : ["lui_ra", "go_ket", "di_vong", "ve_giua"].includes(nav.phase) ? "warn" : "";
      h += `<span class="pill ${cls}">${esc(H.PHASE[nav.phase] || "")}</span>`;
      if (nav.target) h += `<span class="pill">Đích: ${esc(nav.target.label)}</span>`;
    } else {
      let st = '<span class="pill">Đang chờ</span>';
      if (r === "dich") st = '<span class="pill ok">✓ Tới đích</span>';
      else if (r === "vacham") st = '<span class="pill bad">✗ Va chạm</span>';
      else if (r === "hetgio") st = '<span class="pill warn">⏱ Hết giờ</span>';
      else if (S.playing) st = '<span class="pill">● Đang chạy</span>';
      h += `<span class="pill navy">Cấp ${S.level}: ${esc(C.LEVELS[S.level].name)}</span>${st}<span class="pill">${esc(brain)}</span>`;
    }
    if (sim.safetyActive) h += '<span class="pill bad">Lớp an toàn: dừng</span>';
    if (!sim.done && sim.cmdV < -0.02) h += '<span class="pill warn">◀ Đang lùi</span>';
    el.innerHTML = h;
  }

  // ======================================================== BẢNG NHÀ
  const CHIPS = [["Tủ lạnh", "đi tới tủ lạnh"], ["Sofa", "ra chỗ sofa"], ["Giường", "tới giường"], ["Tivi", "tới tivi"], ["Bàn ăn", "tới bàn ăn"],
    ["Bồn rửa", "tới bồn rửa"], ["Bếp nấu", "tới bếp nấu"], ["Tủ quần áo", "tới tủ quần áo"], ["Bàn làm việc", "tới bàn làm việc"], ["Kệ sách", "tới kệ sách"],
    ["Vào bếp", "vào bếp"], ["Vào phòng ngủ", "vào phòng ngủ"], ["Ra phòng khách", "ra phòng khách"]];
  function sendCommand(text) {
    text = String(text || "").trim(); if (!text) return;
    $("hsErr").textContent = "";
    if (S.controllerId === "manual" || S.controllerId === "custom") { $("selBrain").value = Object.keys(S.brains)[0] || "hoc_thang_300k"; onController(); }
    if (sim.done) restart();
    S.nav.tNow = sim.steps / sim.cfg.control_hz;
    if (S.nav.command(text, sim)) { S.cmdAt = sim.steps; setPlaying(true); }
    $("hsCmd").value = ""; updateHouse(true);
  }
  function stepState() {
    const n = S.nav, p = n.phase, st = [0, 0, 0, 0, 0];               // 0 chưa, 1 đang, 2 xong
    if (!n.target) return st;
    st[0] = 2;
    const roomKnown = !!n.room && p !== "dinh_vi";
    st[1] = roomKnown ? 2 : 1;
    const doorsDone = roomKnown && n.leg >= n.legs.length && !["tim_moc", "toi_moc", "qua_cua"].includes(p);
    st[2] = !roomKnown ? 0 : doorsDone ? 2 : 1;
    const found = ["toi_vat", "quay_mat", "xong"].includes(p) || (n.target.isRoom && doorsDone);
    st[3] = !doorsDone ? 0 : found ? 2 : 1;
    st[4] = p === "xong" ? 2 : found ? 1 : 0;
    if (["that_bai", "va_cham"].includes(p)) for (let i = 0; i < 5; i++) if (st[i] === 1) st[i] = 0;
    return st;
  }
  function updateHouse(force) {
    if (!isHouse()) return;
    const n = S.nav;
    [...$("hsSteps").children].forEach((el, i) => { const s = stepState()[i]; el.classList.toggle("done", s === 2); el.classList.toggle("now", s === 1); });
    $("hsRoom").textContent = n.room ? H.ROOMS[n.room].name.replace("Phòng ", "P. ") : "?";
    $("hsTime").textContent = n.target ? Math.round((sim.steps - S.cmdAt) / sim.cfg.control_hz) : 0;
    $("hsDist").textContent = n.goal && n.busy ? fmt(Math.hypot(n.goal.x - sim.x, n.goal.y - sim.y), 1) : "–";
    $("hsBumps").textContent = sim.bumps || 0;
    $("hsPhase").textContent = H.PHASE[n.phase] || "";
    const memKey = JSON.stringify(n.mem) + (S.layout ? JSON.stringify(Object.keys(S.layout)) : "") + scenario?.obstacles.length;
    if (force || memKey !== S.memKey) {
      S.memKey = memKey;
      $("hsMem").innerHTML = Object.entries(n.mem).map(([id, r]) => {
        const o = scenario.obstacles.find(q => q.id === id); if (!o) return "";
        const truth = H.roomAt(o.x, o.y), wrong = truth !== r;
        return `<div class="${wrong ? "wrong" : ""}" title="${wrong ? "Thật ra đang ở " + esc(H.ROOMS[truth].name) : "Đúng"}"><span>${esc(o.label)}${o.id === "cay_ngu" ? " 2" : ""}</span><b>${esc(H.ROOMS[r].name.replace("Phòng ", "P. "))}</b></div>`;
      }).join("");
    }
    if (force || n.log.length !== S.logShown) {
      S.logShown = n.log.length;
      const L = $("hsLog");
      L.innerHTML = n.log.length ? n.log.map(e => `<div class="${e.kind}"><span class="t">${fmt(e.t, 1)}s</span>${e.msg}</div>`).join("")
        : '<div>Gõ hoặc nói lệnh, hoặc chạm một nút ở trên. Robot sẽ ghi lại từng bước nó suy nghĩ ở đây.</div>';
      L.scrollTop = L.scrollHeight;
    }
  }
  function setupMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    $("hsMic").onclick = () => {
      if (!SR) { $("hsErr").textContent = "Trình duyệt này chưa hỗ trợ nhận giọng nói. Anh gõ lệnh vào ô bên cạnh."; return; }
      try {
        const rec = new SR(); rec.lang = "vi-VN"; rec.interimResults = false; rec.maxAlternatives = 1;
        $("hsMic").classList.add("rec"); $("hsErr").textContent = "Đang nghe…";
        rec.onresult = e => { const t = e.results[0][0].transcript; $("hsCmd").value = t; $("hsErr").textContent = `Nghe được: “${t}”`; sendCommand(t); };
        rec.onerror = e => { $("hsErr").textContent = e.error === "not-allowed" ? "Trang chưa được cấp quyền micro (một số trang nhúng chặn micro). Hãy gõ lệnh." : "Không nghe rõ: " + e.error; };
        rec.onend = () => $("hsMic").classList.remove("rec");
        rec.start();
      } catch (e) { $("hsMic").classList.remove("rec"); $("hsErr").textContent = "Không bật được micro: " + e.message; }
    };
  }
  function randomStart() {
    const sc = H.buildScenario(), t = new C.Sim();
    for (let i = 0; i < 300; i++) {
      const x = -3.7 + Math.random() * 7.4, y = -2.7 + Math.random() * 5.4;
      if (!H.roomAt(x, y)) continue;
      sc.start = { x, y, yaw: Math.random() * 6.28 - 3.14 }; t.load(sc, { endOnGoal: false });
      const free = t.allObstacles().every(o => {
        if (o.kind === "cyl" || o.kind === "mover") return Math.hypot(o.x - x, o.y - y) > o.r + 0.35;
        const qx = Math.max(o.x - o.hx, Math.min(x, o.x + o.hx)), qy = Math.max(o.y - o.hy, Math.min(y, o.y + o.hy));
        return Math.hypot(x - qx, y - qy) > 0.35;
      });
      if (free) return sc.start;
    }
    return { x: -1.4, y: -1.0, yaw: 0 };
  }

  // ======================================================== BẢNG SÂN HUẤN LUYỆN
  function buildObsList() {
    $("obsList").innerHTML = C.OBS_LABELS.map(([n, u], i) =>
      `<div class="obsrow" title="${esc(u)}"><span>${i + 1}. ${esc(n)}</span><div class="bar ${[1, 5, 6, 7, 8, 9, 10, 11].includes(i) ? "sym" : ""}"><i id="ob${i}"></i></div><span class="num" id="ov${i}">0</span></div>`).join("");
    $("net1").innerHTML = "<i></i>".repeat(64); $("net2").innerHTML = "<i></i>".repeat(64);
  }
  function updatePanel() {
    if (isHouse()) return;
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
      if (!a) return;
      for (let i = 0; i < cells.length && i < a.length; i++) {
        const v = a[i], t = Math.min(1, Math.abs(v));
        cells[i].style.background = v >= 0 ? `rgba(214,40,57,${0.1 + 0.9 * t})` : `rgba(31,78,140,${0.1 + 0.9 * t})`;
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
      catch (e) { $("brainErr").textContent = "Không tải được " + b.file + " (cần mở trang qua máy chủ web)."; }
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
    S.controllerId = $("selBrain").value; store.set("controller3", S.controllerId);
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
    const N = +$("selBenchN").value, out = $("benchOut"), csv = [["bo_nao", "cap", "luot", "toi_dich", "va_cham", "het_gio", "ti_le_buoc_lui"]];
    out.innerHTML = '<p class="muted">Đang chấm…</p>';
    const jobs = []; ids.forEach(id => { for (let lv = 1; lv <= 5; lv++) jobs.push([id, lv]); });
    const res = {}; let k = 0;
    const tick = () => {
      if (k >= jobs.length) return finish();
      const [id, lv] = jobs[k++];
      const r = C.benchmark(o => controllerFor(id)(o), lv, N, 50000, S.cfg);
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
          return `<td class="n"><b style="color:${p >= 80 ? "var(--ok)" : p >= 60 ? "var(--warn)" : "var(--red)"}">${p}%</b><br><span class="muted">va ${Math.round(r.coll * 100)}%</span><br><span class="muted" style="color:${r.rev > 0.3 ? "var(--red)" : "inherit"}">lùi ${Math.round(r.rev * 100)}%</span></td>`;
        }).join("") + "</tr>";
      }
      h += `</tbody></table><p class="muted">Tỉ lệ tới đích, va chạm và % bước đi lùi (lùi nhiều = lái mù vì cảm biến chỉ ở phía trước), ${N} lượt mỗi cấp, bản đồ cố định theo seed.</p>`;
      out.innerHTML = h; S.lastBench = csv.map(r => r.join(",")).join("\n"); $("btnBenchCsv").disabled = false;
    };
    tick();
  }
  function controllerFor(id) {
    if (id === S.controllerId) return controller;
    const b = S.brains[id]; return o => (b ? b.act(o) : [0, 0]);
  }

  // ======================================================== SỬA BẢN ĐỒ / ĐẶT XE
  function applyTool(x, y) {
    if (isHouse()) {
      if (!H.roomAt(x, y)) return;
      if (S.tool === "place") {
        S.hStart = { x, y, yaw: S.hStart.yaw || 0 }; store.set("hStart", S.hStart);
        S.tool = "none"; $("hsPlace").classList.remove("on"); buildHouse(); restart(true); return;
      }
      if (S.tool === "move1") {
        let best = null, bd = 0.7;
        for (const o of scenario.obstacles) if (H.MOVABLE.includes(o.id)) { const d = Math.hypot(o.x - x, o.y - y); if (d < bd) { bd = d; best = o; } }
        if (!best) { $("hsErr").textContent = "Chạm gần một món dời được: tivi, ghế bành, chậu cây, bàn trà, tủ lạnh, bàn làm việc, kệ sách, tủ quần áo."; return; }
        S.moveSel = best.id; S.tool = "move2"; $("hsErr").textContent = `Đã chọn ${best.label}. Chạm vào chỗ mới.`; return;
      }
      if (S.tool === "move2") {
        const o = scenario.obstacles.find(q => q.id === S.moveSel), e = o.kind === "cyl" ? [o.r, o.r] : [o.hx, o.hy];
        const n = { x, y, hx: o.hx, hy: o.hy, face: o.face, room: H.roomAt(x, y) };
        const box = { x, y, hx: e[0], hy: e[1] };
        const clash = sim.allObstacles().some(q => q !== o && q.kind !== "mover" &&
          Math.max(Math.abs(q.x - x) - (q.hx ?? q.r) - box.hx, Math.abs(q.y - y) - (q.hy ?? q.r) - box.hy) < 0.03);
        if (clash) { $("hsErr").textContent = "Chỗ đó bị vướng tường hoặc đồ khác, chạm chỗ trống hơn."; return; }
        S.layout = Object.assign({}, S.layout || {}, { [o.id]: n }); store.set("layout", S.layout);
        $("hsErr").textContent = `Đã dời ${o.label} sang ${H.ROOMS[n.room].name.toLowerCase()}. Robot chưa biết – thử ra lệnh xem!`;
        S.tool = "none"; S.moveSel = null; $("hsMove").classList.remove("on"); buildHouse(); restart(true); return;
      }
      return;
    }
    const B = sim.bounds;
    if (x < B.x0 + 0.1 || x > B.x1 - 0.1 || y < B.y0 + 0.1 || y > B.y1 - 0.1) return;
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
    if (isHouse() || !scenario) return;
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
    S.cfg = cfg; store.set("cfg", Object.fromEntries(Object.entries(cfg).filter(([k]) => cfg[k] !== C.DEFAULT_CFG[k])));
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

  // ======================================================== CHẾ ĐỘ & GÓC NHÌN
  function setViewMode(v) {
    S.view = v;
    for (const [id, vv] of [["v2d", "2d"], ["v3d", "3d"], ["v3dFollow", "3dfollow"], ["v3dFpv", "3dfpv"]]) $(id).classList.toggle("on", vv === v);
    if (v === "2d") three.hide();
    else if (!three.setMode(v)) { $("hsErr").textContent = $("brainErr").textContent = "Không tải được thư viện 3D, đang dùng mặt bằng 2D."; S.view = "2d"; $("v2d").classList.add("on"); $("v3d").classList.remove("on"); }
    render();
  }
  const LEGENDS = {
    house: [["#0B2545", "Tường"], ["#D62839", "Đích / người đi lại"], ["#111", "Mốc ArUco"], ["#E0A100", "Tia siêu âm"], ["#6F8FBF", "Tầm nhìn camera"], ["#1F4E8C", "Đường đã đi"]],
    train: [["#0B2545", "Xe / tường"], ["#D62839", "Đích"], ["#E8D2B0", "Thùng"], ["#1F4E8C", "Trụ tròn"], ["#E0A100", "Tia siêu âm"], ["#6F8FBF", "Tầm nhìn camera"]],
  };
  function setMode(m) {
    S.mode = m; store.set("mode", m);
    $("modeHouse").classList.toggle("on", m === "house"); $("modeTrain").classList.toggle("on", m === "train");
    $("panelHouse").classList.toggle("hide", m !== "house"); $("panel").classList.toggle("hide", m === "house");
    $("autoWrap").classList.toggle("hide", m === "house");
    $("btnNew").textContent = m === "house" ? "🎲 Chỗ xuất phát ngẫu nhiên" : "🎲 Bản đồ mới";
    $("headline").textContent = m === "house" ? "Robot nhận lệnh trong nhà" : "Sân huấn luyện 5 cấp";
    $("subline").textContent = m === "house"
      ? "Ra lệnh “đi tới tủ lạnh”: robot tự nhận phòng, tìm mốc cửa, qua cửa, nhận ra đồ vật bằng YOLO và để bộ não PPO lái tới nơi."
      : "Thả xe vào sân 5×5 m giống lúc huấn luyện, xem bộ não tự lái, né vật cản và chấm điểm hàng loạt.";
    $("legend").innerHTML = LEGENDS[m].map(([c, t]) => `<span style="--c:${c}">${esc(t)}</span>`).join("");
    setPlaying(false); S.tool = "none";
    const st = $("stage");
    st.style.aspectRatio = m === "house" ? "8.24 / 6.24" : "1 / 1";
    st.style.maxWidth = m === "house" ? "" : "min(100%, 74vh)";
    newScenario();
    setViewMode(m === "house" ? (S.view === "2d" ? "2d" : "3d") : (S.view === "3d" ? "2d" : S.view));
    resize2d(); three.size(); render();
  }

  // ======================================================== SỰ KIỆN
  function bind() {
    $("modeHouse").onclick = () => setMode("house"); $("modeTrain").onclick = () => setMode("train");
    $("selLevel").innerHTML = Object.entries(C.LEVELS).map(([k, L]) => `<option value="${k}">Cấp ${k}: ${esc(L.name)}</option>`).join("");
    $("selLevel").value = S.level;
    $("selLevel").onchange = e => { S.level = +e.target.value; newScenario(); };
    $("inSeed").onchange = e => newScenario(Math.max(1, +e.target.value || 1));
    $("chkNoise").onchange = () => restart();
    $("selBrain").onchange = () => { onController(); if (!isHouse()) restart(); };
    $("btnPlay").onclick = () => setPlaying(!S.playing);
    $("btnStep").onclick = () => { setPlaying(false); stepOnce(); updatePanel(); updateHouse(); render(); };
    $("btnReset").onclick = () => { setPlaying(false); if (isHouse()) buildHouse(); restart(); };
    $("btnNew").onclick = () => { if (isHouse()) { S.hStart = randomStart(); store.set("hStart", S.hStart); setPlaying(false); buildHouse(); restart(); } else newScenario(S.seed + 1); };
    $("selSpeed").value = String(S.speed);
    $("selSpeed").onchange = e => { S.speed = +e.target.value; };
    $("v2d").onclick = () => setViewMode("2d"); $("v3d").onclick = () => setViewMode("3d");
    $("v3dFollow").onclick = () => setViewMode("3dfollow"); $("v3dFpv").onclick = () => setViewMode("3dfpv");
    // nhà
    $("hsChips").innerHTML = CHIPS.map(([t, c]) => `<button class="chip" data-c="${esc(c)}">${esc(t)}</button>`).join("");
    $("hsChips").onclick = e => { const b = e.target.closest("button[data-c]"); if (b) sendCommand(b.dataset.c); };
    $("hsSend").onclick = () => sendCommand($("hsCmd").value);
    $("hsCmd").addEventListener("keydown", e => { if (e.key === "Enter") sendCommand($("hsCmd").value); });
    $("hsPlace").onclick = () => {
      S.tool = S.tool === "place" ? "none" : "place"; $("hsPlace").classList.toggle("on", S.tool === "place");
      $("hsErr").textContent = S.tool === "place" ? "Chạm vào chỗ trống trên mặt bằng để đặt xe." : "";
    };
    $("hsBump").onchange = () => { setPlaying(false); buildHouse(); restart(true); };
    const MV = [["mvNguoiKhach", "nguoi_khach"], ["mvNguoiBep", "nguoi_bep"], ["mvMeo", "meo"]];
    for (const [el, k] of MV) {
      $(el).checked = S.movers.includes(k);
      $(el).onchange = () => { S.movers = MV.filter(([e]) => $(e).checked).map(([, kk]) => kk); store.set("movers", S.movers); setPlaying(false); buildHouse(); restart(true); };
    }
    $("hsShuffle").onclick = () => {
      S.layout = H.shuffleLayout(1 + Math.floor(Math.random() * 1e6), S.hStart); store.set("layout", S.layout);
      setPlaying(false); buildHouse(); restart(true);
      const moved = Object.keys(S.layout).filter(id => S.layout[id].room !== H.FURNITURE.find(f => f.id === id).room).length;
      $("hsErr").textContent = `Đã xáo trộn ${Object.keys(S.layout).length} món (${moved} món sang phòng khác). Robot chưa biết – thử ra lệnh!`;
    };
    $("hsMove").onclick = () => {
      S.tool = S.tool.startsWith("move") ? "none" : "move1"; $("hsMove").classList.toggle("on", S.tool !== "none");
      $("hsErr").textContent = S.tool === "move1" ? "Chạm vào món đồ muốn dời (trên mặt bằng hoặc 3D)." : "";
    };
    $("hsRestore").onclick = () => { S.layout = null; store.set("layout", null); setPlaying(false); buildHouse(); restart(true); $("hsErr").textContent = "Đồ đạc đã về chỗ cũ."; };
    $("hsForget").onclick = () => { S.nav.forget(); updateHouse(true); };
    setupMic();
    // sân
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
    $("btnLoadMap").onclick = () => { const m = store.get("map", null); if (m && !m.house) { scenario = m; S.level = m.level; $("selLevel").value = m.level; restart(); } else $("mapInfo").textContent = "Chưa có bản đồ đã lưu."; };
    $("btnExportMap").onclick = () => showData("Bản đồ (JSON)", JSON.stringify(scenario, null, 1), false);
    $("btnImportMap").onclick = () => showData("Dán bản đồ JSON", "", true, txt => {
      const m = JSON.parse(txt); if (!m.obstacles || !m.start || !m.goal) throw new Error("thiếu obstacles/start/goal");
      scenario = m; S.level = m.level || 3; $("selLevel").value = S.level; restart();
    });
    c2d.addEventListener("pointerdown", e => {
      if (S.tool === "none") return;
      const r = c2d.getBoundingClientRect();
      const [x, y] = toWorld((e.clientX - r.left) * DPR, (e.clientY - r.top) * DPR);
      applyTool(x, y);
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
        S.customFn = fn; store.set("code", $("codeBox").value); $("codeErr").textContent = "Đã nạp. Đang dùng “Tự viết (JavaScript)”.";
        $("selBrain").value = "custom"; onController(); restart();
      } catch (e) { $("codeErr").textContent = "Không chạy được đoạn mã: " + e.message + " (một số trình duyệt chặn chạy mã tự viết trong trang này)."; }
    };
    $("btnTraj").onclick = () => {
      const rows = ["buoc,x_m,y_m"].concat(sim.trail.map(([x, y], i) => `${i},${x.toFixed(4)},${y.toFixed(4)}`));
      showData("Quỹ đạo lượt này (CSV)", rows.join("\n"), false);
    };
    const keyMap = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
    window.addEventListener("keydown", e => {
      if (S.controllerId !== "manual" || !keyMap[e.code] || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
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
    core: C, house: H, get sim() { return sim; }, get scenario() { return scenario; }, get nav() { return S.nav; },
    command: t => sendCommand(t),
    setController(fn) { S.customFn = fn; $("selBrain").value = "custom"; onController(); },
    loadScenario(obj) { scenario = obj; S.level = obj.level || S.level; restart(); },
    loadBrain(json) { const id = "api_" + Date.now(); S.brains[id] = new C.MLPBrain(json); S.controllerId = id; fillBrainSelect(); return id; },
    registerRobot(profile) { S.robots[profile.name] = profile; applyCfg(Object.assign({}, C.DEFAULT_CFG, profile)); $("projName").textContent = profile.name; },
    benchmark: (lv, n) => C.benchmark(controller, lv, n, 50000, S.cfg),
  };

  // ------------------------------------------------------------ khởi động
  buildObsList(); buildCfgForm(); bind(); resize2d();
  $("inSeed").value = S.seed;
  setMode(S.mode);
  updateHouse(true);
  loadBuiltins();
  requestAnimationFrame(loop);
}
