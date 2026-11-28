// Kiểm tra nhà lớn 5 phòng (14,4 × 10 m): mỗi đồ vật × nhiều điểm xuất phát, bộ não PPO lái
const C = require("../web/core.js"), H = require("../web/house.js");
H.use("nha5");
const brainFile = process.argv[2] || "hoc_thang_300k";
const brain = new C.MLPBrain(require(`../web/brains/${brainFile}.json`));
const starts = [{ x: -3.4, y: -1.5, yaw: 0 }, { x: -5.5, y: 3.0, yaw: -1 }, { x: 2.2, y: 3.2, yaw: 3 }, { x: 5.7, y: 0.4, yaw: 1.5 }, { x: 3.0, y: -2.8, yaw: 2 }];
const cmds = { tu_lanh: "đi tới tủ lạnh", sofa: "ra chỗ sofa", giuong: "tới giường", giuong2: "tới giường 2", tivi: "tới tivi", ban_an: "tới bàn ăn",
  lavabo: "tới lavabo", ke_khan: "lấy kệ khăn", ban_hoc: "tới bàn học", tu_quan_ao: "tới tủ quần áo", ke_sach: "tới kệ sách", tam: "vào phòng tắm", ngu2: "vào phòng ngủ 2" };
let ok = 0, n = 0, steps = 0; const fails = {};
for (const [t, cmd] of Object.entries(cmds)) for (const [si, s] of starts.entries()) {
  const sim = new C.Sim(); sim.load(H.buildScenario(s), { seed: 7 + si, randomize: true, endOnGoal: false, maxSteps: 6000, bump: true });
  const nav = new H.Navigator(); nav.command(cmd, sim);
  while (!sim.done && nav.busy) sim.step(nav.act(sim, o => brain.act(o)));
  n++; steps += sim.steps; if (nav.phase === "xong") ok++; else (fails[t] = fails[t] || []).push(`${si}:${nav.phase}@${sim.steps}${sim.hitObstacle ? "(" + (sim.hitObstacle.label || sim.hitObstacle.kind) + ")" : ""}`);
}
console.log(brainFile, `nhà lớn: thành công ${ok}/${n}, TB ${(steps / n / 10).toFixed(0)} s`); for (const [k, v] of Object.entries(fails)) console.log(" ", k, v.join(" "));
