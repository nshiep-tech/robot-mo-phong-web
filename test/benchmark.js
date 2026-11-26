// Kiem chung: chay bo nao trong loi JS, so voi bao cao PyBullet. node test/benchmark.js
const C = require("../web/core.js"), fs = require("fs");
const N = +process.argv[2] || 50;
for (const f of ["cap3_kaggle_5cap", "hoc_thang_300k"]) {
  const b = new C.MLPBrain(JSON.parse(fs.readFileSync(`${__dirname}/../web/brains/${f}.json`)));
  const line = [f];
  for (let lv = 1; lv <= 5; lv++) { const r = C.benchmark(o => b.act(o), lv, N); line.push(`C${lv}: ${Math.round(r.succ*100)}%/${Math.round(r.coll*100)}%`); }
  console.log(line.join("  "));
}
