/* =====================================================================
 * NHÀ ẢO 3 PHÒNG + BỘ ĐIỀU PHỐI LỆNH ("đi tới tủ lạnh")
 * NGUYỄN SỸ HIỆP – Trường ĐH CNTT&TT (ICTU), ĐH Thái Nguyên
 *
 * Phân tầng (giống xe thật):
 *   Lệnh chữ/giọng nói → hiểu lệnh (đồ vật nào, ở phòng nào)
 *   → tự nhận phòng (đọc mốc phòng ArUco) → tìm đường qua các cửa (sơ đồ mốc)
 *   → từng đoạn: quay tìm mốc/đồ vật bằng camera → BỘ NÃO PPO lái tới, né vật
 * Robot KHÔNG được biết tọa độ thật của mình; nó chỉ biết đích khi camera
 * nhìn thấy mốc hoặc đồ vật (như xe thật dùng camera + ArUco + YOLO).
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.RobotHouse = factory(root.RobotCore);
})(typeof self !== "undefined" ? self : this, function (C) {
  "use strict";
  const T = 0.05;                              // nửa bề dày tường (10 cm)
  const BOUNDS = { x0: -4, x1: 4, y0: -3, y1: 3 };

  const ROOMS = {
    khach: { name: "Phòng khách", rect: [-4, 0.6, -3, 3], floor: "wood", center: { x: -1.4, y: -1.0 } },
    bep:   { name: "Bếp",         rect: [0.6, 4, 0, 3],   floor: "tile", center: { x: 1.3, y: 0.45 } },
    ngu:   { name: "Phòng ngủ",   rect: [0.6, 4, -3, 0],  floor: "carpet", center: { x: 1.5, y: -0.8 } },
  };

  // Tường trong: x = 0,6 có 2 cửa rộng 1 m; y = 0 ngăn bếp và phòng ngủ
  const WALLS = [
    { x: 0.6, y: -2.45, hx: T, hy: 0.55 },
    { x: 0.6, y: 0.0, hx: T, hy: 0.9 },
    { x: 0.6, y: 2.45, hx: T, hy: 0.55 },
    { x: 2.3, y: 0.0, hx: 1.7, hy: T },
  ];

  // Cửa + mốc ArUco gắn trên khung cửa (nhìn thấy từ cả hai phía)
  const DOORS = [
    { id: "cua_bep", marker: 1, name: "cửa bếp", x: 0.6, y: 1.4, width: 1.0, axis: "x",
      side: { khach: { x: -0.05, y: 1.4 }, bep: { x: 1.2, y: 1.4 } } },
    { id: "cua_ngu", marker: 2, name: "cửa phòng ngủ", x: 0.6, y: -1.4, width: 1.0, axis: "x",
      side: { khach: { x: -0.05, y: -1.4 }, ngu: { x: 1.2, y: -1.4 } } },
  ];
  // Mốc phòng (dán cao trên tường) để robot tự nhận ra mình đang ở phòng nào
  const ROOM_MARKERS = [
    { marker: 11, room: "khach", x: -4.0, y: -1.0, n: [1, 0] },
    { marker: 12, room: "khach", x: -1.6, y: 3.0, n: [0, -1] },
    { marker: 13, room: "khach", x: -1.6, y: -3.0, n: [0, 1] },
    { marker: 21, room: "bep", x: 4.0, y: 1.0, n: [-1, 0] },
    { marker: 22, room: "bep", x: 1.2, y: 3.0, n: [0, -1] },
    { marker: 31, room: "ngu", x: 4.0, y: -0.5, n: [-1, 0] },
    { marker: 32, room: "ngu", x: 2.6, y: -3.0, n: [0, 1] },
  ];

  /* Đồ đạc: hình hộp va chạm (hx, hy), cao h, mô hình 3D, hướng mặt trước,
   * lớp YOLO (COCO) nếu có, điểm robot đứng khi "tới" đồ vật đó */
  const F = (id, room, model, label, x, y, w, d, h, face, extra = {}) =>
    Object.assign({ id, room, model, label, kind: "box", x, y, hx: w / 2, hy: d / 2, h, face }, extra);
  const FURNITURE = [
    // Phòng khách
    F("sofa", "khach", "sofa", "Sofa", -3.5, 0.2, 0.85, 2.0, 0.8, "px", { yolo: "couch", approach: { x: -2.75, y: 1.65 } }),
    F("ban_tra", "khach", "coffee", "Bàn trà", -2.3, 0.2, 0.6, 1.0, 0.42, "px", { yolo: "dining table", approach: { x: -1.6, y: 0.2 } }),
    F("tivi", "khach", "tv", "Tivi", 0.28, 0.1, 0.4, 1.4, 0.55, "nx", { yolo: "tv", approach: { x: -0.55, y: 0.1 } }),
    F("ghe_banh", "khach", "armchair", "Ghế bành", -2.3, -2.2, 0.8, 0.8, 0.8, "py", { yolo: "chair", approach: { x: -2.3, y: -1.35 } }),
    F("ke_sach", "khach", "shelf", "Kệ sách", -1.3, 2.78, 1.2, 0.36, 1.8, "ny", { approach: { x: -1.3, y: 2.1 } }),
    { id: "cay_khach", room: "khach", model: "plant", label: "Chậu cây", kind: "cyl", x: -3.55, y: 2.55, r: 0.22, h: 1.1, yolo: "potted plant", approach: { x: -2.95, y: 2.0 } },
    // Bếp
    F("tu_lanh", "bep", "fridge", "Tủ lạnh", 3.6, 2.6, 0.7, 0.7, 1.8, "ny", { yolo: "refrigerator", approach: { x: 3.6, y: 1.85 } }),
    F("bon_rua", "bep", "sink", "Bồn rửa", 1.75, 2.7, 0.9, 0.6, 0.9, "ny", { yolo: "sink", approach: { x: 1.75, y: 2.0 } }),
    F("bep_nau", "bep", "stove", "Bếp nấu", 2.7, 2.7, 1.0, 0.6, 0.9, "ny", { yolo: "oven", approach: { x: 2.7, y: 2.0 } }),
    F("ban_an", "bep", "dining", "Bàn ăn", 2.45, 1.0, 1.2, 0.8, 0.75, "py", { yolo: "dining table", approach: { x: 1.5, y: 1.0 } }),
    F("ghe_an1", "bep", "chair", "Ghế ăn", 2.05, 0.42, 0.42, 0.42, 0.9, "py"),
    F("ghe_an2", "bep", "chair", "Ghế ăn", 2.85, 0.42, 0.42, 0.42, 0.9, "py"),
    F("ghe_an3", "bep", "chair", "Ghế ăn", 2.05, 1.58, 0.42, 0.42, 0.9, "ny"),
    F("ghe_an4", "bep", "chair", "Ghế ăn", 2.85, 1.58, 0.42, 0.42, 0.9, "ny"),
    // Phòng ngủ
    F("giuong", "ngu", "bed", "Giường", 3.05, -2.0, 1.9, 1.6, 0.55, "nx", { yolo: "bed", approach: { x: 1.6, y: -1.7 } }),
    F("tu_quan_ao", "ngu", "wardrobe", "Tủ quần áo", 1.3, -2.72, 1.2, 0.55, 2.0, "py", { approach: { x: 1.3, y: -1.95 }, custom: true }),
    F("ban_lam_viec", "ngu", "desk", "Bàn làm việc", 3.45, -0.3, 1.0, 0.5, 0.75, "ny", { approach: { x: 3.4, y: -0.78 } }),
    { id: "cay_ngu", room: "ngu", model: "plant", label: "Chậu cây", kind: "cyl", x: 0.95, y: -0.3, r: 0.18, h: 0.9, yolo: "potted plant", approach: { x: 1.45, y: -0.55 } },
  ];
  const DECOR = [
    { model: "rug", x: -2.35, y: 0.2, w: 2.1, d: 2.5, color: "#c9d3e3" },
    { model: "rug", x: 3.05, y: -0.95, w: 1.6, d: 0.5, color: "#e8d6d8" },
  ];

  // Đồ có thể dời chỗ (đồ gắn cố định như bồn rửa, bếp, sofa, giường, bộ bàn ăn thì giữ nguyên)
  const MOVABLE = ["tivi", "ghe_banh", "cay_khach", "cay_ngu", "ban_tra", "tu_lanh", "ban_lam_viec", "ke_sach", "tu_quan_ao"];
  // Đối tượng di chuyển: đi theo lộ trình vòng, nhường xe
  const MOVERS = {
    nguoi_khach: { kind: "mover", model: "person", label: "Người", r: 0.2, speed: 0.32, path: [[-0.9, -2.3], [-0.9, 1.9], [-1.6, 2.05], [-1.6, -1.5]], look: { shirt: 0xD62839, pants: 0x13315C, hair: 0x2B1D14 } },
    nguoi_bep: { kind: "mover", model: "person", label: "Người", r: 0.2, speed: 0.24, path: [[1.25, 2.05], [3.05, 2.05]], look: { shirt: 0xF4F6F9, pants: 0x0B2545, hair: 0x4A3426, apron: 0x1F4E8C } },
    meo: { kind: "mover", model: "cat", label: "Mèo", r: 0.13, speed: 0.4, path: [[1.0, -1.25], [1.95, -0.95], [1.95, -2.2], [1.3, -2.25]] },
  };
  const segDist = (px, py, [ax, ay], [bx, by]) => {
    const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
    return Math.hypot(px - ax - t * vx, py - ay - t * vy);
  };
  const ext = o => o.kind === "cyl" ? [o.r, o.r] : [o.hx, o.hy];
  const gap = (a, b) => { const [ax, ay] = ext(a), [bx, by] = ext(b); return Math.max(Math.abs(a.x - b.x) - ax - bx, Math.abs(a.y - b.y) - ay - by); };

  /* Xáo trộn đồ: trả về {id: {x, y, hx, hy, face}} – không chắn cửa, lối đi của người, giữa phòng, chỗ xe đứng */
  function shuffleLayout(seed, start = { x: -1.4, y: -1.0 }) {
    const R = C.rng(seed * 9973 + 1), layout = {};
    const placed = WALLS.map(w => ({ kind: "box", ...w })).concat(FURNITURE.filter(f => !MOVABLE.includes(f.id)));
    const keep = [start].concat(Object.values(ROOMS).map(r => r.center), DOORS.flatMap(d => Object.values(d.side)));
    const paths = Object.values(MOVERS).map(m => m.path);
    for (const id of MOVABLE) {
      const f = FURNITURE.find(x => x.id === id);
      let ok = null;
      for (let k = 0; k < 600 && !ok; k++) {
        const rk = Object.keys(ROOMS)[R.int(0, 2)], [a, b, c, d] = ROOMS[rk].rect;
        const face = ["px", "nx", "py", "ny"][R.int(0, 3)];
        const along = o => o === "px" || o === "nx";
        let hx = f.hx, hy = f.hy;
        if (f.kind !== "cyl" && along(face) !== along(f.face)) [hx, hy] = [hy, hx];
        const [ex, ey] = f.kind === "cyl" ? [f.r, f.r] : [hx, hy];
        const x = R.uniform(a + ex + 0.08, b - ex - 0.08), y = R.uniform(c + ey + 0.08, d - ey - 0.08);
        const o = f.kind === "cyl" ? { kind: "cyl", x, y, r: f.r } : { kind: "box", x, y, hx, hy };
        if (placed.some(p => gap(o, p) < (p.hx === T || p.hy === T ? 0.03 : 0.5))) continue;   // sát tường được, cách đồ khác ≥ 0,5 m để còn lối đi
        if (keep.some(p => gap(o, { kind: "cyl", x: p.x, y: p.y, r: 0 }) < 0.55)) continue;
        if (paths.some(pt => pt.some((q, i) => segDist(x, y, q, pt[(i + 1) % pt.length]) < Math.max(ex, ey) + 0.3))) continue;
        ok = { x, y, hx, hy, face, room: rk }; placed.push({ ...o, ...ok });
      }
      if (ok) layout[id] = ok;
    }
    return layout;
  }

  function buildScenario(start = { x: -1.4, y: -1.0, yaw: 0 }, layout = null, movers = []) {
    const furn = FURNITURE.map(f => {
      const o = JSON.parse(JSON.stringify(f));
      if (layout && layout[o.id]) { Object.assign(o, layout[o.id]); delete o.approach; o.moved = true; }
      return o;
    });
    const mv = movers.filter(k => MOVERS[k]).map(k => Object.assign(JSON.parse(JSON.stringify(MOVERS[k])), { id: k }))
      .map(m => Object.assign(m, { x: m.path[0][0], y: m.path[0][1], vx: 0, vy: 0, pi: 1 }));
    return {
      house: true, level: 2, seed: 1, bounds: BOUNDS,
      obstacles: WALLS.map(w => Object.assign({ kind: "wall", inner: true }, w)).concat(furn, mv),
      start: Object.assign({}, start), goal: Object.assign({}, start),
    };
  }
  const defaultMemory = () => Object.fromEntries(FURNITURE.filter(f => f.label && f.model !== "chair").map(f => [f.id, f.room]));

  // -------------------------------------------------------- hiểu lệnh
  const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim();
  const LEXICON = [
    ["tu_lanh", ["tu lanh", "tu mat", "fridge"]],
    ["tu_quan_ao", ["tu quan ao", "tu do", "tu ao"]],
    ["sofa", ["sofa", "so fa", "ghe dai", "ghe sopha"]],
    ["ban_tra", ["ban tra", "ban nuoc", "ban uong nuoc"]],
    ["tivi", ["tivi", "ti vi", "tv", "man hinh"]],
    ["ghe_banh", ["ghe banh", "ghe don", "ghe tua"]],
    ["ke_sach", ["ke sach", "gia sach", "tu sach"]],
    ["bon_rua", ["bon rua", "chau rua", "voi nuoc", "bon rua bat"]],
    ["bep_nau", ["bep nau", "bep ga", "bep tu", "noi com", "lo nuong"]],
    ["ban_an", ["ban an", "ban com"]],
    ["giuong", ["giuong", "cho ngu", "nem"]],
    ["ban_lam_viec", ["ban lam viec", "ban hoc", "ban may tinh"]],
    ["cay", ["chau cay", "cay canh", "cay xanh", "cai cay", " cay"]],
  ];
  const ROOM_WORDS = [["bep", ["nha bep", "phong bep", "bep"]], ["ngu", ["phong ngu"]], ["khach", ["phong khach"]]];

  function parseCommand(text, robotRoom) {
    const t = " " + norm(text) + " ";
    for (const [id, keys] of LEXICON) {
      if (!keys.some(k => t.includes(k.startsWith(" ") ? k : k))) continue;
      if (id === "cay") {                          // có 2 chậu cây: ưu tiên phòng được nói tới, rồi phòng đang đứng
        const r = ROOM_WORDS.find(([, ks]) => ks.some(k => t.includes(k) && k !== "bep"));
        const room = r ? r[0] : robotRoom === "ngu" ? "ngu" : "khach";
        return { type: "object", id: room === "ngu" ? "cay_ngu" : "cay_khach" };
      }
      return { type: "object", id };
    }
    for (const [id, keys] of ROOM_WORDS) if (keys.some(k => t.includes(k))) return { type: "room", id };
    return null;
  }
  const describe = q => !q ? "" : q.type === "room" ? ROOMS[q.id].name : FURNITURE.find(f => f.id === q.id).label;

  // -------------------------------------------------------- tìm đường qua cửa (BFS trên sơ đồ mốc)
  function planRooms(from, to) {
    if (from === to) return [];
    const prev = { [from]: null }, q = [from];
    while (q.length) {
      const r = q.shift();
      for (const d of DOORS) {
        if (!d.side[r]) continue;
        const nb = Object.keys(d.side).find(k => k !== r);
        if (nb in prev) continue;
        prev[nb] = { room: r, door: d }; q.push(nb);
        if (nb === to) {
          const legs = []; let cur = to;
          while (prev[cur]) { legs.unshift({ door: prev[cur].door, from: prev[cur].room, to: cur }); cur = prev[cur].room; }
          return legs;
        }
      }
    }
    return null;
  }
  const roomAt = (x, y) => Object.keys(ROOMS).find(k => { const [a, b, c, d] = ROOMS[k].rect; return x > a && x < b && y > c && y < d; });

  // -------------------------------------------------------- bộ điều phối
  const PHASE = {
    dinh_vi: "Tự nhận phòng (quay tìm mốc phòng)",
    tim_moc: "Quay tìm mốc cửa",
    toi_moc: "Lái tới cửa",
    qua_cua: "Đi qua cửa",
    tim_vat: "Quay tìm đồ vật (YOLO)",
    toi_vat: "Lái tới đồ vật",
    ve_giua: "Không thấy, ra giữa phòng tìm lại",
    go_ket: "Bị chắn: quay quét tìm lối",
    lui_ra: "Chạm nhẹ: lùi và quay tránh",
    di_vong: "Đi vòng qua vật chắn",
    quay_mat: "Quay mặt về đồ vật",
    xong: "Đã tới nơi",
    that_bai: "Không tìm được",
    va_cham: "Va chạm",
    rong: "Chờ lệnh",
  };
  const MARKER_RANGE = 6.0, YOLO_RANGE = 5.0, SPIN = 0.55;

  class Navigator {
    constructor() { this.mem = defaultMemory(); this.reset(); }
    forget() { this.mem = defaultMemory(); }
    reset() {
      this.phase = "rong"; this.room = null; this.target = null; this.legs = []; this.leg = 0;
      this.goal = null; this.log = []; this.spun = 0; this.retries = 0; this.stuck = 0; this.best = Infinity;
      this.seen = []; this.timer = 0; this.bumps = 0; this.stack = [];
    }
    say(msg, kind = "info") { this.log.push({ msg, kind, t: this.tNow || 0 }); if (this.log.length > 60) this.log.shift(); }
    command(text, sim) {
      const q = parseCommand(text, this.room);
      if (!q) { this.say(`Chưa hiểu lệnh “${text}”. Thử: “đi tới tủ lạnh”, “vào phòng ngủ”.`, "bad"); return false; }
      if (q.type === "object") {
        const o = sim.sc.obstacles.find(x => x.id === q.id) || FURNITURE.find(f => f.id === q.id);
        this.target = Object.assign({}, o, { obj: o, room: this.mem[q.id] || o.room });
      } else this.target = { id: q.id, room: q.id, label: ROOMS[q.id].name, approach: ROOMS[q.id].center, isRoom: true };
      this.legs = []; this.leg = 0; this.retries = 0; this.seen = []; this.searched = new Set();
      this.say(`Hiểu lệnh: tới <b>${this.target.label}</b>` + (q.type === "object" ? ` (theo trí nhớ: ở ${ROOMS[this.target.room].name.toLowerCase()})` : ""), "ok");
      if (this.target.custom) this.say("Tủ quần áo không có trong bộ YOLO chuẩn (COCO) – xe thật cần huấn luyện thêm lớp này.", "warn");
      this.set(this.room ? "plan" : "dinh_vi", sim);
      return true;
    }
    set(p, sim) {
      if (p === "plan") return this.plan(sim);
      this.phase = p; this.spun = 0; this.stuck = 0; this.best = Infinity; this.timer = 0;
    }
    plan(sim) {
      const legs = planRooms(this.room, this.target.room);
      if (!legs) { this.say("Không có đường tới phòng đó.", "bad"); return this.set("that_bai"); }
      this.legs = legs; this.leg = 0;
      const route = [ROOMS[this.room].name].concat(legs.map(l => `${l.door.name} (mốc ${l.door.marker})`), legs.length ? [ROOMS[this.target.room].name] : []);
      this.say(legs.length ? `Tìm đường: ${route.join(" → ")}` : `Đồ vật ở ngay phòng này.`);
      this.set(legs.length ? "tim_moc" : (this.target.isRoom ? "xong" : "tim_vat"), sim);
    }
    setGoal(sim, p) { this.goal = { x: p.x, y: p.y }; sim.sc.goal.x = p.x; sim.sc.goal.y = p.y; sim.prevGoalDist = sim.goalPolar()[0]; }

    /* Gọi mỗi 0,1 s. brainAct(obs) = bộ não PPO. Trả về hành động [tiến, quay]. */
    act(sim, brainAct) {
      if (sim.done && sim.result === "vacham" && this.phase !== "va_cham") { this.say(`Va chạm với ${sim.hitObstacle?.label || "tường"}.`, "bad"); this.set("va_cham"); }
      const d = this.goal ? Math.hypot(this.goal.x - sim.x, this.goal.y - sim.y) : Infinity;
      if (this.busy && sim.steps % 4 === 0) { const r = this.observeObjects(sim); if (r) return r; }
      if (sim.bumped && this.phase !== "lui_ra") {          // công tắc chạm kích hoạt
        this.bumps = (this.bumps || 0) + 1;
        this.say(`Chạm nhẹ ${sim.hitObstacle?.label || "tường"} (lần ${this.bumps}) → dừng, lùi 10 cm, quay tránh.`, "warn");
        if (this.bumps > 12) { this.say("Chạm quá nhiều lần, dừng để an toàn.", "bad"); this.set("that_bai"); return [0, 0]; }
        const o = sim.hitObstacle, a = o ? C.wrap(Math.atan2(o.y - sim.y, o.x - sim.x) - sim.yaw) : 0;
        this.turnDir = a >= 0 ? -1 : 1;                     // vật bên trái thì quay phải và ngược lại
        this.push(); this.set("lui_ra");
      }
      const spin = () => { this.spun += Math.abs(sim.w || SPIN * sim.cfg.w_max) / sim.cfg.control_hz; return [0, SPIN]; };
      const drive = tol => {
        if (d < this.best - 0.05) { this.best = d; this.stuck = 0; } else this.stuck++;
        if (this.stuck > 60) {
          this.say("Không tiến được (bị vật chắn thẳng hướng). Quay một vòng quét siêu âm tìm lối vòng.", "warn");
          this.push(); this.set("go_ket"); this.scan = []; this.scanGoal = this.goal && { ...this.goal };
        }
        return brainAct(sim.obs);
      };
      switch (this.phase) {
        case "dinh_vi": {
          // mốc phòng dán chếch vào trong phòng nên không đọc được qua cửa từ phòng bên cạnh
          const here = roomAt(sim.x, sim.y);
          const m = ROOM_MARKERS.find(k => k.room === here && sim.sees(k.x, k.y, MARKER_RANGE) && (k.n[0] * (sim.x - k.x) + k.n[1] * (sim.y - k.y)) > 0);
          if (m) { this.room = m.room; this.mark(m.x, m.y); this.say(`Thấy mốc phòng số ${m.marker} → đang ở <b>${ROOMS[m.room].name}</b>.`, "ok"); this.plan(sim); return [0, 0]; }
          if (this.spun > 2.2 * Math.PI) { this.say("Không thấy mốc phòng nào.", "bad"); this.set("that_bai"); return [0, 0]; }
          return spin();
        }
        case "tim_moc": {
          const L = this.legs[this.leg], dr = L.door;
          if (sim.sees(dr.x, dr.y, MARKER_RANGE)) { this.mark(dr.x, dr.y); this.say(`Thấy mốc số ${dr.marker} (${dr.name}), cách ${Math.hypot(dr.x - sim.x, dr.y - sim.y).toFixed(1).replace(".", ",")} m.`); this.setGoal(sim, dr.side[L.from]); this.set("toi_moc"); return [0, 0]; }
          return this.spinOrRetry(sim, spin);
        }
        case "toi_moc": if (d < 0.25) { this.setGoal(sim, this.legs[this.leg].door.side[this.legs[this.leg].to]); this.set("qua_cua"); } return drive();
        case "qua_cua":
          if (d < 0.25) {
            const L = this.legs[this.leg]; this.room = L.to; this.leg++;
            this.say(`Qua ${L.door.name} → vào <b>${ROOMS[L.to].name}</b>.`, "ok");
            if (this.leg < this.legs.length) this.set("tim_moc");
            else if (this.target.isRoom) { this.setGoal(sim, this.target.approach); this.set("toi_vat"); }
            else this.set("tim_vat");
            return [0, 0];
          }
          return drive();
        case "tim_vat": {
          const t = this.target.obj || this.target;
          if (sim.sees(t.x, t.y, YOLO_RANGE)) { this.found(sim, t); return [0, 0]; }
          return this.spinOrRetry(sim, spin);
        }
        case "toi_vat":
          if (d < 0.22) {
            if (this.target.isRoom) { this.say(`Đã vào giữa ${this.target.label.toLowerCase()}.`, "ok"); this.set("xong"); return [0, 0]; }
            this.set("quay_mat"); return [0, 0];
          }
          return drive();
        case "quay_mat": {
          const T = this.target.obj || this.target;
          const a = C.wrap(Math.atan2(T.y - sim.y, T.x - sim.x) - sim.yaw);
          if (Math.abs(a) < 0.15 || ++this.timer > 60) { this.say(`Đã tới <b>${this.target.label}</b>. Nhiệm vụ hoàn thành.`, "ok"); this.set("xong"); return [0, 0]; }
          return [0, Math.sign(a) * Math.min(0.6, Math.abs(a))];
        }
        case "ve_giua": if (d < 0.3) { this.pop(sim); return [0, 0]; } return drive();
        case "go_ket": {                                    // quay 360°, ghi khoảng trống phía trước theo từng hướng
          this.scan.push([sim.yaw, sim.lastSonar]);
          this.spun += Math.abs(sim.w || 0) / sim.cfg.control_hz;
          if (this.spun < 2 * Math.PI && ++this.timer < 80) return [0, 0.7];
          const g = this.scanGoal || { x: sim.x, y: sim.y }, ga = Math.atan2(g.y - sim.y, g.x - sim.x);
          let best = null;
          for (const [yaw, free] of this.scan) {
            const off = Math.abs(C.wrap(yaw - ga));
            if (off > 1.9 || free < 0.45) continue;            // không quay lưng hẳn với đích, phải đủ chỗ
            const sc = Math.min(free, 1.5) * (1.3 + Math.cos(off));
            if (!best || sc > best.sc) best = { yaw, free, sc };
          }
          if (!best) { this.pop(sim); return [0, 0]; }
          const L = Math.min(best.free - 0.3, 0.9);
          this.say(`Chọn lối vòng lệch ${Math.round(C.wrap(best.yaw - ga) * 180 / Math.PI)}° so với hướng đích, đi ${L.toFixed(1).replace(".", ",")} m.`);
          this.setGoal(sim, { x: sim.x + L * Math.cos(best.yaw), y: sim.y + L * Math.sin(best.yaw) });
          this.set("di_vong"); return [0, 0];
        }
        case "di_vong": {
          if (d < 0.22 || ++this.timer > 80) { this.pop(sim); return [0, 0]; }
          return brainAct(sim.obs);
        }
        case "lui_ra": { const t = ++this.timer; if (t > 9) { this.pop(sim); return [0, 0]; } return t <= 4 ? [-0.6, 0] : [0, 0.9 * this.turnDir]; }
        default: return [0, 0];
      }
    }
    spinOrRetry(sim, spin) {
      if (this.spun <= 2.1 * Math.PI) return spin();
      if (this.retries++ < (this.phase === "tim_vat" ? 1 : 2)) {
        const c = ROOMS[this.room].center;
        this.say("Quay một vòng chưa thấy (bị che). Ra giữa phòng rồi tìm lại.", "warn");
        this.push(); this.setGoal(sim, c); this.set("ve_giua"); return [0, 0];
      }
      if (this.phase === "tim_vat" && !this.target.isRoom) {          // đồ có thể đã bị dời: đi tìm phòng khác
        this.searched.add(this.room);
        const left = Object.keys(ROOMS).filter(r => !this.searched.has(r))
          .sort((a, b) => (planRooms(this.room, a) || []).length - (planRooms(this.room, b) || []).length);
        if (left.length) {
          this.say(`Không thấy <b>${this.target.label}</b> ở ${ROOMS[this.room].name.toLowerCase()} – có thể đã bị dời chỗ. Đi tìm ở <b>${ROOMS[left[0]].name}</b>.`, "warn");
          this.target.room = left[0]; this.retries = 0; this.plan(sim); return [0, 0];
        }
        this.say(`Đã tìm khắp ${Object.keys(ROOMS).length} phòng vẫn không thấy ${this.target.label}. Dừng và báo người dùng.`, "bad"); this.set("that_bai"); return [0, 0];
      }
      this.say("Đã tìm 3 lần vẫn không thấy. Dừng và báo người dùng.", "bad"); this.set("that_bai"); return [0, 0];
    }
    /* Thấy đồ vật cần tới: ghi nhớ phòng, tính điểm đứng trước đồ vật */
    found(sim, t) {
      this.mark(t.x, t.y);
      this.say(`YOLO nhận ra <b>${t.label}</b>${t.yolo ? ` (lớp “${t.yolo}”)` : ""}, cách ${Math.max(0, Math.hypot(t.x - sim.x, t.y - sim.y) - 0.3).toFixed(1).replace(".", ",")} m.`, "ok");
      this.remember(t);
      this.setGoal(sim, t.approach || this.approachPoint(sim, t)); this.set("toi_vat");
    }
    remember(o) {
      const r = roomAt(o.x, o.y); if (!r || !o.id) return;
      if (this.mem[o.id] !== r) { this.say(`Ghi nhớ: <b>${o.label}</b> giờ ở <b>${ROOMS[r].name}</b> (trước nhớ ở ${ROOMS[this.mem[o.id]]?.name.toLowerCase() || "?"}).`, "ok"); this.mem[o.id] = r; }
    }
    /* Vừa đi vừa nhìn: cập nhật trí nhớ; nếu thấy đúng đồ vật cần tìm ở chỗ khác thì đổi đường */
    observeObjects(sim) {
      for (const o of sim.sc.obstacles) {
        if (!o.id || !o.label || o.model === "chair" || o.kind === "mover" || o.kind === "wall") continue;
        if (!sim.sees(o.x, o.y, YOLO_RANGE)) continue;
        this.remember(o);
        const t = this.target;
        if (t && !t.isRoom && o.id === t.id && ["dinh_vi", "tim_moc", "toi_moc"].includes(this.phase) && this.room) {
          const r = roomAt(o.x, o.y);
          if (r === this.room) { this.say(`Thấy ngay <b>${o.label}</b> trong phòng này, đi thẳng tới.`, "ok"); this.found(sim, o); return [0, 0]; }
          if (r !== t.room) { t.room = r; this.say(`Thấy <b>${o.label}</b> qua cửa, ở ${ROOMS[r].name.toLowerCase()} – đổi đường.`, "ok"); this.plan(sim); return [0, 0]; }
        }
      }
      return null;
    }
    /* Điểm robot đứng trước đồ vật: phía gần robot, trống, cùng phòng với đồ vật */
    approachPoint(sim, o) {
      const room = roomAt(o.x, o.y), base = Math.atan2(sim.y - o.y, sim.x - o.x);
      const clear = p => sim.allObstacles().every(q => q === o || q.kind === "mover" || gap({ kind: "cyl", x: p.x, y: p.y, r: 0 }, q) > 0.2);
      for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.8, -1.8, 2.3, -2.3, 3.1]) {
        const a = base + off, ux = Math.cos(a), uy = Math.sin(a);
        const e = o.kind === "cyl" ? o.r : Math.abs(ux) * o.hx + Math.abs(uy) * o.hy, p = { x: o.x + ux * (e + 0.33), y: o.y + uy * (e + 0.33) };
        if (roomAt(p.x, p.y) === room && clear(p)) return p;
      }
      return { x: o.x + Math.cos(base) * 0.6, y: o.y + Math.sin(base) * 0.6 };
    }
    /* Ngăn xếp pha: hành vi phụ (lùi tránh, gỡ kẹt, ra giữa phòng) xong thì quay lại việc đang làm */
    push() { (this.stack = this.stack || []).push({ phase: this.phase, goal: this.goal && { ...this.goal } }); }
    pop(sim) {
      const top = (this.stack || []).pop();
      if (!top) return this.set("rong");
      if (top.goal) this.setGoal(sim, top.goal);
      this.set(top.phase);
    }
    mark(x, y) { this.seen.push({ x, y, t: Date.now() }); if (this.seen.length > 8) this.seen.shift(); }
    get busy() { return !["rong", "xong", "that_bai", "va_cham"].includes(this.phase); }
  }

  return { BOUNDS, ROOMS, WALLS, DOORS, ROOM_MARKERS, FURNITURE, DECOR, PHASE, MOVABLE, MOVERS, buildScenario, shuffleLayout, defaultMemory, parseCommand, describe, planRooms, roomAt, norm, Navigator };
});
