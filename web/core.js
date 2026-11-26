/* =====================================================================
 * LÕI MÔ PHỎNG ROBOT 2 BÁNH (robot2wd) – chạy trong trình duyệt và Node
 * NGUYỄN SỸ HIỆP – Trường ĐH CNTT&TT (ICTU), ĐH Thái Nguyên
 *
 * Bám sát môi trường huấn luyện PyBullet (kaggle-robot/robot2wd_env.py):
 *  - Quan sát 12 số, chuẩn hóa giống hệt
 *  - Hành động 2 số [-1,1] -> (v, ω)
 *  - Động học vi sai + lớp an toàn (cấm tiến khi siêu âm < 15 cm)
 *  - Mô hình motor TT bậc 1, nhiễu cảm biến, YOLO giả lập bỏ sót
 *  - Kịch bản 5 cấp
 * Vật lý ở đây là động học 2D (không mô phỏng trượt bánh) nên kết quả
 * gần đúng với PyBullet, không trùng khớp tuyệt đối.
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RobotCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ------------------------------------------------------------ cấu hình
  const DEFAULT_CFG = {
    name: "Robot 2 bánh vi sai (2WD)",
    wheel_radius: 0.0325, wheel_base: 0.13, body_lx: 0.20, body_ly: 0.15,
    collide_r: 0.105,            // bán kính va chạm gần đúng của thân xe
    v_max: 0.30, w_max: 1.50, wheel_v_max: 0.40,
    sonar_range: 2.0, sonar_offset: 0.11, sonar_spread: 0.13,
    cam_fov_half: 31 * Math.PI / 180, cam_range: 3.0,
    safety_stop: 0.15, arena: 5.0,
    control_hz: 10, physics_hz: 240, max_steps: 400, goal_tol: 0.20,
  };

  const LEVELS = {
    1: { name: "Tập lái: sân trống", obs: [0, 0], walls: 0, moving: 0, noise: 0.0, rand: false, miss: 0.0 },
    2: { name: "Né vật đơn giản", obs: [1, 2], walls: 0, moving: 0, noise: 0.5, rand: true, miss: 0.05 },
    3: { name: "Lái trong đông đúc", obs: [3, 7], walls: 0, moving: 0, noise: 1.0, rand: true, miss: 0.10 },
    4: { name: "Hành lang, ngõ cụt", obs: [1, 3], walls: 2, moving: 0, noise: 1.0, rand: true, miss: 0.10 },
    5: { name: "Gần đời thật: vật di động", obs: [2, 4], walls: 1, moving: 2, noise: 1.3, rand: true, miss: 0.20 },
  };

  const OBS_LABELS = [
    ["Siêu âm phía trước", "0–2 m → 0–1"],
    ["Góc vật cản (YOLO)", "−31°…31° → −1…1"],
    ["Khoảng cách vật cản (YOLO)", "0–3 m → 0–1"],
    ["Có thấy vật cản", "0 / 1"],
    ["Khoảng cách tới đích", "0–5 m → 0–1"],
    ["sin góc tới đích", "−1…1"],
    ["cos góc tới đích", "−1…1"],
    ["Tốc độ quay thân (IMU)", "±3 rad/s → ±1"],
    ["Tốc độ bánh trái", "±0,4 m/s → ±1"],
    ["Tốc độ bánh phải", "±0,4 m/s → ±1"],
    ["Lệnh tiến bước trước", "±1"],
    ["Lệnh quay bước trước", "±1"],
  ];

  // ------------------------------------------------------- số ngẫu nhiên
  function rng(seed) {                       // mulberry32: có seed, lặp lại được
    let a = (seed >>> 0) || 1;
    const f = () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.uniform = (lo, hi) => lo + (hi - lo) * f();
    f.int = (lo, hiIncl) => lo + Math.floor(f() * (hiIncl - lo + 1));
    f.normal = (mu, sd) => {
      let u = 0, v = 0;
      while (u === 0) u = f();
      while (v === 0) v = f();
      return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    return f;
  }

  const wrap = a => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  // ---------------------------------------------------- tạo kịch bản (map)
  /* Một kịch bản: { level, seed, obstacles:[...], start:{x,y,yaw}, goal:{x,y} }
   * obstacle: {kind:'cyl'|'box'|'wall'|'mover', x,y, r | hx,hy, vx,vy} */
  function generateScenario(level, seed, cfg = DEFAULT_CFG) {
    const L = LEVELS[level], R = rng(seed), half = cfg.arena / 2;
    const obstacles = [];
    for (let i = 0; i < L.walls; i++) {
      const len = R.uniform(1.5, 3.0), horiz = R() < 0.5;
      const cx = R.uniform(-half + 1.0, half - 1.0), cy = R.uniform(-half + 1.0, half - 1.0);
      obstacles.push({ kind: "wall", x: cx, y: cy, hx: horiz ? len / 2 : 0.05, hy: horiz ? 0.05 : len / 2 });
    }
    for (let i = 0; i < L.moving; i++) {
      const x = R.uniform(-half + 0.6, half - 0.6), y = R.uniform(-half + 0.6, half - 0.6);
      const a = R.uniform(-Math.PI, Math.PI), s = R.uniform(0.1, 0.25);
      obstacles.push({ kind: "mover", x, y, r: 0.15, vx: s * Math.cos(a), vy: s * Math.sin(a) });
    }
    const n = R.int(L.obs[0], L.obs[1]);
    for (let i = 0; i < n; i++) {
      const x = R.uniform(-half + 0.5, half - 0.5), y = R.uniform(-half + 0.5, half - 0.5);
      if (R() < 0.5) obstacles.push({ kind: "cyl", x, y, r: R.uniform(0.08, 0.25) });
      else obstacles.push({ kind: "box", x, y, hx: R.uniform(0.08, 0.3), hy: R.uniform(0.08, 0.3) });
    }
    const sc = { level, seed, obstacles, start: null, goal: null };
    const s = freePoint(sc, R, 0.4, null, 0, cfg);
    sc.start = { x: s[0], y: s[1], yaw: R.uniform(-Math.PI, Math.PI) };
    const g = freePoint(sc, R, 0.4, s, 1.5, cfg);
    sc.goal = { x: g[0], y: g[1] };
    return sc;
  }

  function footprint(o) {           // các hình tròn đại diện (để chọn chỗ trống)
    if (o.kind === "wall") {
      const pts = [], horiz = o.hx > o.hy, L = 2 * Math.max(o.hx, o.hy);
      const k = Math.floor(L / 0.2) + 1;
      for (let i = 0; i < k; i++) {
        const t = -L / 2 + (L * i) / Math.max(k - 1, 1);
        pts.push([o.x + (horiz ? t : 0), o.y + (horiz ? 0 : t), 0.1]);
      }
      return pts;
    }
    return [[o.x, o.y, o.kind === "box" ? Math.hypot(o.hx, o.hy) : o.r]];
  }

  function freePoint(sc, R, margin, farFrom, minDist, cfg) {
    const half = cfg.arena / 2 - margin;
    const circles = sc.obstacles.flatMap(footprint);
    let pt = [0, 0];
    for (let i = 0; i < 200; i++) {
      pt = [R.uniform(-half, half), R.uniform(-half, half)];
      const ok = circles.every(([x, y, r]) => Math.hypot(pt[0] - x, pt[1] - y) > r + margin);
      if (ok && (!farFrom || Math.hypot(pt[0] - farFrom[0], pt[1] - farFrom[1]) >= minDist)) return pt;
    }
    return pt;
  }

  // ------------------------------------------------------- hình học 2D
  function rayCircle(ox, oy, dx, dy, cx, cy, r) {
    const fx = ox - cx, fy = oy - cy;
    const b = fx * dx + fy * dy, c = fx * fx + fy * fy - r * r;
    const disc = b * b - c;
    if (disc < 0) return Infinity;
    const s = Math.sqrt(disc), t1 = -b - s, t2 = -b + s;
    if (t1 >= 0) return t1;
    if (t2 >= 0) return 0;
    return Infinity;
  }
  function rayBox(ox, oy, dx, dy, cx, cy, hx, hy) {
    let tmin = -Infinity, tmax = Infinity;
    for (const [o, d, c, h] of [[ox, dx, cx, hx], [oy, dy, cy, hy]]) {
      if (Math.abs(d) < 1e-12) { if (o < c - h || o > c + h) return Infinity; continue; }
      let t1 = (c - h - o) / d, t2 = (c + h - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
    if (tmax < 0) return Infinity;
    return Math.max(tmin, 0);
  }
  function circleHits(x, y, r, o) {
    if (o.kind === "cyl" || o.kind === "mover") return Math.hypot(x - o.x, y - o.y) < r + o.r;
    const qx = clamp(x, o.x - o.hx, o.x + o.hx), qy = clamp(y, o.y - o.hy, o.y + o.hy);
    return Math.hypot(x - qx, y - qy) < r;
  }

  // ------------------------------------------------------------ môi trường
  class Sim {
    constructor(cfg = {}) {
      this.cfg = Object.assign({}, DEFAULT_CFG, cfg);
      this.trail = [];
    }

    /* Nạp kịch bản. opts.randomize: thay đổi vật lý & nhiễu theo cấp
     * opts.seed: hạt giống cho nhiễu (lặp lại được) */
    load(scenario, opts = {}) {
      const c = this.cfg, half = c.arena / 2;
      this.sc = JSON.parse(JSON.stringify(scenario));
      const L = LEVELS[this.sc.level] || LEVELS[3];
      this.L = Object.assign({}, L, opts.levelOverride || {});
      this.R = rng((opts.seed ?? this.sc.seed ?? 1) * 7919 + 13);
      const rnd = this.L.rand && opts.randomize !== false;
      this.motorLag = rnd ? this.R.uniform(0.3, 0.8) : 0.5;
      this.motorGain = rnd ? [this.R.uniform(0.85, 1.15), this.R.uniform(0.85, 1.15)] : [1, 1];
      this.noise = opts.randomize === false ? 0 : this.L.noise;
      this.miss = opts.randomize === false ? 0 : this.L.miss;
      // tường bao quanh sân
      this.border = [
        { kind: "wall", x: 0, y: half, hx: half, hy: 0.05, border: true },
        { kind: "wall", x: 0, y: -half, hx: half, hy: 0.05, border: true },
        { kind: "wall", x: half, y: 0, hx: 0.05, hy: half, border: true },
        { kind: "wall", x: -half, y: 0, hx: 0.05, hy: half, border: true },
      ];
      const s = this.sc.start;
      this.x = s.x; this.y = s.y; this.yaw = s.yaw;
      this.wheel = [0, 0]; this.wheelCmd = [0, 0];
      this.prevAction = [0, 0];
      this.steps = 0; this.done = false; this.result = null;
      this.lastSonar = c.sonar_range; this.safetyActive = false;
      this.ret = 0;
      this.trail = [[this.x, this.y]];
      this.prevGoalDist = this.goalPolar()[0];
      this.obs = this.observe();
      return this.obs;
    }

    allObstacles() { return this.border.concat(this.sc.obstacles); }

    goalPolar() {
      const dx = this.sc.goal.x - this.x, dy = this.sc.goal.y - this.y;
      return [Math.hypot(dx, dy), wrap(Math.atan2(dy, dx) - this.yaw)];
    }

    sonarRays() {                  // trả về [[x0,y0,x1,y1,dist],...] để vẽ
      const c = this.cfg, out = [];
      const sx = this.x + c.sonar_offset * Math.cos(this.yaw), sy = this.y + c.sonar_offset * Math.sin(this.yaw);
      for (const da of [-c.sonar_spread, 0, c.sonar_spread]) {
        const a = this.yaw + da, dx = Math.cos(a), dy = Math.sin(a);
        let best = c.sonar_range;
        for (const o of this.allObstacles()) {
          const t = (o.kind === "cyl" || o.kind === "mover")
            ? rayCircle(sx, sy, dx, dy, o.x, o.y, o.r)
            : rayBox(sx, sy, dx, dy, o.x, o.y, o.hx, o.hy);
          if (t < best) best = t;
        }
        out.push([sx, sy, sx + best * dx, sy + best * dy, best]);
      }
      return out;
    }

    yoloTargets() {                 // vật YOLO có thể "thấy" (không gồm tường)
      return this.sc.obstacles.filter(o => o.kind !== "wall");
    }

    fakeYolo() {
      const c = this.cfg;
      let best = null;
      for (const o of this.yoloTargets()) {
        const r = o.kind === "box" ? Math.hypot(o.hx, o.hy) : o.r;
        const dx = o.x - this.x, dy = o.y - this.y;
        const dist = Math.max(Math.hypot(dx, dy) - r, 0);
        const ang = wrap(Math.atan2(dy, dx) - this.yaw);
        if (Math.abs(ang) <= c.cam_fov_half && dist <= c.cam_range && (!best || dist < best.dist))
          best = { ang, dist, o };
      }
      this.yoloSeen = best ? best.o : null;
      if (!best || this.R() < this.miss) { this.yoloSeen = null; return [0, 1, 0]; }
      const ang = best.ang + this.noise * this.R.normal(0, 0.03);
      const dist = best.dist * (1 + this.noise * this.R.normal(0, 0.15));
      return [ang, dist, 1];
    }

    observe() {
      const c = this.cfg, n = this.noise;
      const rays = this.sonarRays();
      const sonar = Math.min(...rays.map(r => r[4])) + n * this.R.normal(0, 0.01);
      this.rays = rays;
      const [oa, od, os] = this.fakeYolo();
      const [gd, ga] = this.goalPolar();
      const v = (this.wheel[0] + this.wheel[1]) / 2;
      const w = (this.wheel[1] - this.wheel[0]) / c.wheel_base;
      const yawRate = w + n * this.R.normal(0, 0.02);
      this.lastSonar = sonar;
      this.v = v; this.w = w;
      return [
        clamp(sonar / c.sonar_range, 0, 1),
        clamp(oa / c.cam_fov_half, -1, 1),
        clamp(od / c.cam_range, 0, 1),
        os,
        clamp(gd / 5.0, 0, 1),
        Math.sin(ga), Math.cos(ga),
        clamp(yawRate / 3.0, -1, 1),
        clamp(this.wheel[0] / c.wheel_v_max, -1, 1),
        clamp(this.wheel[1] / c.wheel_v_max, -1, 1),
        this.prevAction[0], this.prevAction[1],
      ];
    }

    /* Động học vi sai + lớp an toàn: hành động [-1,1] -> tốc độ 2 bánh */
    kinematics(action) {
      const c = this.cfg;
      let v = clamp(action[0], -1, 1) * c.v_max;
      const w = clamp(action[1], -1, 1) * c.w_max;
      this.safetyActive = this.lastSonar < c.safety_stop && v > 0;
      if (this.safetyActive) v = 0;
      this.cmdV = v; this.cmdW = w;
      const lim = c.wheel_v_max;
      return [clamp(v - w * c.wheel_base / 2, -lim, lim), clamp(v + w * c.wheel_base / 2, -lim, lim)];
    }

    step(action) {
      if (this.done) return { obs: this.obs, reward: 0, done: true, info: { result: this.result } };
      const c = this.cfg;
      action = [clamp(action[0], -1, 1), clamp(action[1], -1, 1)];
      const target = this.kinematics(action).map((t, i) => t * this.motorGain[i]);
      const dtc = 1 / c.control_hz, half = c.arena / 2 - 0.3;
      for (const o of this.sc.obstacles) if (o.kind === "mover") {     // người đi lại
        o.x += o.vx * dtc; o.y += o.vy * dtc;
        if (Math.abs(o.x) > half) o.vx = -o.vx;
        if (Math.abs(o.y) > half) o.vy = -o.vy;
      }
      const sub = Math.round(c.physics_hz / c.control_hz), dt = 1 / c.physics_hz;
      let collided = false;
      for (let k = 0; k < sub; k++) {                                   // mô hình motor bậc 1
        for (let i = 0; i < 2; i++) {
          this.wheelCmd[i] += (target[i] - this.wheelCmd[i]) * (1 - this.motorLag) * 0.25;
          this.wheel[i] = this.wheelCmd[i];
        }
        const v = (this.wheel[0] + this.wheel[1]) / 2, w = (this.wheel[1] - this.wheel[0]) / c.wheel_base;
        this.x += v * Math.cos(this.yaw) * dt; this.y += v * Math.sin(this.yaw) * dt;
        this.yaw = wrap(this.yaw + w * dt);
      }
      for (const o of this.allObstacles()) if (circleHits(this.x, this.y, c.collide_r, o)) { collided = true; this.hitObstacle = o; break; }
      this.steps++;
      this.trail.push([this.x, this.y]);
      const [gd] = this.goalPolar();
      let reward = (this.prevGoalDist - gd) * 10 - 0.01
        - 0.02 * (Math.abs(action[0] - this.prevAction[0]) + Math.abs(action[1] - this.prevAction[1]));
      this.prevGoalDist = gd;
      if (gd < c.goal_tol) { reward += 100; this.done = true; this.result = "dich"; }
      else if (collided) { reward -= 100; this.done = true; this.result = "vacham"; }
      else if (this.steps >= c.max_steps) { this.done = true; this.result = "hetgio"; }
      this.ret += reward;
      this.prevAction = action;
      this.obs = this.observe();
      return { obs: this.obs, reward, done: this.done, info: { result: this.result } };
    }
  }

  // ---------------------------------------------------------- bộ não MLP
  class MLPBrain {
    constructor(json) {
      if (!json || !json.layers) throw new Error("File bộ não không đúng định dạng robot2wd-mlp-v1");
      this.name = json.name || "Bộ não";
      this.layers = json.layers.map(l => ({ W: l.W.map(r => Float64Array.from(r)), b: Float64Array.from(l.b), act: l.act }));
      if (this.layers[0].W[0].length !== 12) throw new Error("Bộ não cần đầu vào 12 số");
      this.params = this.layers.reduce((s, l) => s + l.W.length * l.W[0].length + l.b.length, 0);
    }
    act(obs) {
      let h = obs;
      this.activations = [];
      for (const l of this.layers) {
        const o = new Float64Array(l.b.length);
        for (let i = 0; i < o.length; i++) {
          let s = l.b[i]; const row = l.W[i];
          for (let j = 0; j < h.length; j++) s += row[j] * h[j];
          o[i] = l.act === "tanh" ? Math.tanh(s) : l.act === "relu" ? Math.max(0, s) : clamp(s, -1, 1);
        }
        h = o; this.activations.push(o);
      }
      return [h[0], h[1]];
    }
  }

  /* Đọc file .npz (zip chứa .npy) – cần JSZip trong trình duyệt */
  function npyParse(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    const major = u8[6];
    const headerLen = major === 1 ? dv.getUint16(8, true) : dv.getUint32(8, true);
    const off = major === 1 ? 10 : 12;
    const header = new TextDecoder().decode(u8.slice(off, off + headerLen));
    const descr = /'descr':\s*'([^']+)'/.exec(header)[1];
    const shape = /'shape':\s*\(([^)]*)\)/.exec(header)[1].split(",").map(s => s.trim()).filter(Boolean).map(Number);
    const data = buf.slice(off + headerLen);
    const arr = descr.endsWith("f4") ? new Float32Array(data) : new Float64Array(data);
    return { shape, arr };
  }
  function npzToBrainJSON(files, name) {   // files: {key: ArrayBuffer}
    const get = k => {
      const { shape, arr } = npyParse(files[k + ".npy"]);
      if (shape.length === 1) return Array.from(arr);
      const out = [];
      for (let i = 0; i < shape[0]; i++) out.push(Array.from(arr.slice(i * shape[1], (i + 1) * shape[1])));
      return out;
    };
    return {
      format: "robot2wd-mlp-v1", name,
      layers: [
        { W: get("mlp_extractor_policy_net_0_weight"), b: get("mlp_extractor_policy_net_0_bias"), act: "tanh" },
        { W: get("mlp_extractor_policy_net_2_weight"), b: get("mlp_extractor_policy_net_2_bias"), act: "tanh" },
        { W: get("action_net_weight"), b: get("action_net_bias"), act: "clip" },
      ],
    };
  }

  // ---------------------------------------------- chấm điểm hàng loạt
  function benchmark(controller, level, episodes, seed0 = 50000, cfg = {}) {
    const sim = new Sim(cfg);
    const res = { level, episodes, dich: 0, vacham: 0, hetgio: 0, steps: 0, lui: 0, rows: [] };
    for (let i = 0; i < episodes; i++) {
      const seed = seed0 + 100 * level + i;
      let obs = sim.load(generateScenario(level, seed, sim.cfg), { seed });
      while (!sim.done) { obs = sim.step(controller(obs, sim)).obs; if (sim.cmdV < -0.02) res.lui++; }
      res[sim.result]++; res.steps += sim.steps;
      res.rows.push({ level, seed, result: sim.result, steps: sim.steps, return: +sim.ret.toFixed(2) });
    }
    res.succ = res.dich / episodes; res.coll = res.vacham / episodes; res.rev = res.lui / Math.max(1, res.steps);
    return res;
  }

  return { DEFAULT_CFG, LEVELS, OBS_LABELS, rng, wrap, clamp, generateScenario, Sim, MLPBrain, npzToBrainJSON, benchmark };
});
