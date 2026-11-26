// Kiểm tra nhà ảo: mỗi đồ vật × nhiều điểm xuất phát, bộ não PPO lái
const C = require("../web/core.js"), H = require("../web/house.js");
const brainFile = process.argv[2] || "hoc_thang_300k";
const brain = new C.MLPBrain(require(`../web/brains/${brainFile}.json`));
const starts = [{ x: -1.4, y: -1.0, yaw: 0 }, { x: -3.0, y: -2.3, yaw: 1.2 }, { x: -0.8, y: 2.2, yaw: -2 },
  { x: 1.3, y: 0.45, yaw: 3 }, { x: 1.5, y: -0.8, yaw: 1.5 }, { x: 3.3, y: 1.3, yaw: -1 }];
const targets = ["tu_lanh", "sofa", "giuong", "tivi", "ban_an", "bon_rua", "tu_quan_ao", "ban_lam_viec", "ke_sach", "cay"];
const _x = 0; const names = { tu_lanh: "đi tới tủ lạnh", sofa: "ra chỗ sofa", giuong: "tới giường", tivi: "tới tivi", ban_an: "tới bàn ăn", bon_rua: "tới bồn rửa", tu_quan_ao: "tới tủ quần áo", ban_lam_viec: "tới bàn làm việc", ke_sach: "tới kệ sách", cay: "tới chậu cây" };
let ok = 0, n = 0, bumps = 0, steps = 0; const fails = {};
for (const t of targets) for (const [si, s] of starts.entries()) {
  const sim = new C.Sim(); sim.load(H.buildScenario(s), { seed: 7 + si, randomize: true, endOnGoal: false, maxSteps: 4000, bump: true });
  const nav = new H.Navigator(); nav.command(names[t], sim);
  while (!sim.done && nav.busy) sim.step(nav.act(sim, o => brain.act(o)));
  if (sim.done && sim.result === "vacham" && nav.phase !== "va_cham") nav.act(sim, () => [0, 0]);
  n++; bumps += nav.bumps || 0; steps += sim.steps; if (nav.phase === "xong") ok++; else (fails[t] = fails[t] || []).push(`${si}:${nav.phase}@${sim.steps}${sim.hitObstacle ? "(" + (sim.hitObstacle.label || "tường") + ")" : ""}`);
}
console.log(brainFile, `thành công ${ok}/${n}, chạm TB ${(bumps/n).toFixed(1)} lần, TB ${(steps/n/10).toFixed(0)} s`); for (const [k, v] of Object.entries(fails)) console.log(" ", k, v.join(" "));
