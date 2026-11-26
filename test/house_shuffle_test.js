// Đồ đạc bị xáo trộn: robot vẫn nhớ chỗ cũ, phải tự tìm và ghi nhớ chỗ mới. Có người + mèo đi lại.
const C = require("../web/core.js"), H = require("../web/house.js");
const brain = new C.MLPBrain(require(`../web/brains/${process.argv[2] || "ban2_phat_lui"}.json`));
const names = { tu_lanh: "đi tới tủ lạnh", tivi: "tới tivi", tu_quan_ao: "tới tủ quần áo", ban_lam_viec: "tới bàn làm việc", ke_sach: "tới kệ sách", ghe_banh: "tới ghế bành", ban_tra: "tới bàn trà" };
let ok = 0, n = 0, moved = 0, t = 0, bumps = 0; const fails = [];
for (let seed = 1; seed <= 12; seed++) {
  const layout = H.shuffleLayout(seed);
  for (const id of Object.keys(names)) {
    const sim = new C.Sim(); sim.load(H.buildScenario({ x: -1.4, y: -1.0, yaw: 0 }, layout, ["nguoi_khach", "nguoi_bep", "meo"]), { seed, randomize: true, endOnGoal: false, maxSteps: 6000, bump: true });
    const nav = new H.Navigator(); nav.command(names[id], sim);
    const obj = sim.sc.obstacles.find(o => o.id === id), wasRoom = H.FURNITURE.find(f => f.id === id).room, nowRoom = H.roomAt(obj.x, obj.y);
    while (!sim.done && nav.busy) sim.step(nav.act(sim, o => brain.act(o)));
    n++; t += sim.steps; bumps += sim.bumps; if (wasRoom !== nowRoom) moved++;
    const gx = Math.max(Math.abs(sim.x - obj.x) - (obj.hx || obj.r), Math.abs(sim.y - obj.y) - (obj.hy || obj.r));
    if (nav.phase === "xong" && gx < 0.8) ok++; else fails.push(`${seed}/${id}:${nav.phase}`);
  }
}
console.log(`xáo trộn: thành công ${ok}/${n} (${moved} lượt đồ vật đã bị dời sang phòng khác), TB ${(t / n / 10).toFixed(0)} s, chạm TB ${(bumps / n).toFixed(1)}`);
console.log(fails.join("  "));
