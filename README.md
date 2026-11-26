# Phòng thí nghiệm robot ảo

**Chạy ngay:** https://nshiep-tech.github.io/robot-mo-phong-web/

**NGUYỄN SỸ HIỆP**, Trường Đại học Công nghệ Thông tin và Truyền thông (ICTU), Đại học Thái Nguyên

Đây là một trang web chạy hoàn toàn trên trình duyệt (máy tính và điện thoại). Trang nạp **bộ não đã huấn luyện trên Kaggle**, rồi thả robot 2 bánh vào sân 5×5 m để xem nó tự lái và né vật cản theo thời gian thực, không cần phần cứng.

```
kaggle-robot (huấn luyện PPO)  →  policy_pi.npz  →  tools/npz2json.py  →  web/brains/*.json  →  trang web (web/)
                                         └──────────── nạp thẳng .npz trên trang ───────────┘
```

## Cấu trúc

| Thư mục / file | Vai trò |
|---|---|
| `web/index.html` | Giao diện (đầu trang ghi tên và trường; hiển thị tốt trên điện thoại) |
| `web/core.js` | Lõi mô phỏng: động học vi sai, động cơ TT, siêu âm, YOLO giả lập, 5 cấp kịch bản, mạng MLP, chấm điểm. Chạy được cả trong Node. |
| `web/app.js` | Vẽ 2D/3D, bảng số liệu, sửa bản đồ, cấu hình robot, lái tay, mã tự viết |
| `web/brains/` | Các bộ não đã đổi sang JSON (định dạng `robot2wd-mlp-v1`) |
| `tools/npz2json.py` | Đổi `policy_pi.npz` (Kaggle) thành JSON |
| `test/benchmark.js` | Kiểm tra lõi bằng Node: `node test/benchmark.js` |

## Tính năng

1. Năm cấp kịch bản giống lúc huấn luyện, chọn bằng mã bản đồ (seed) nên lặp lại được.
2. Bốn bộ não có sẵn. Có thể tải thêm `.npz` hoặc `.json`, lái tay (phím mũi tên, WASD, nút trên điện thoại), hoặc tự viết bộ điều khiển bằng JavaScript.
3. Bốn góc nhìn: 2D từ trên, 3D xoay, 3D bám xe, mắt robot.
4. Theo dõi trực tiếp 12 số đầu vào và 128 nơ-ron lớp ẩn.
5. Chấm điểm hàng loạt trên 5 cấp và so sánh các bộ não; kết quả xuất CSV.
6. Sửa bản đồ: thêm trụ, hộp, tường, người đi lại; đặt đích và điểm xuất phát; lưu bản đồ, xuất/nhập JSON.
7. Đổi thông số robot (bánh, tốc độ, cảm biến), xuất hồ sơ robot.

## Dự trù cho dự án sau

Trên trang có sẵn đối tượng `window.RobotLab`:

```js
RobotLab.registerRobot({ name: "Robot 4 bánh", wheel_base: 0.18, v_max: 0.5 }); // robot mới
RobotLab.loadBrain(json);            // bộ não mới (MLP nhiều lớp, tanh/relu)
RobotLab.loadScenario(map);          // bản đồ mới
RobotLab.setController(obs => [1, 0]);
RobotLab.benchmark(3, 50);           // chấm điểm cấp 3, 50 lượt
```

Muốn thêm một robot mới (drone, robot chó, xe 4 bánh…), viết một `Sim` mới trong `web/core.js` có cùng giao diện `load()` / `step()` / `obs`. Phần giao diện giữ nguyên.

## Lưu ý

Bộ não bản 1 trên Kaggle (26/11) đi lùi khoảng 95% số bước. Lý do: điểm thưởng không phạt việc đi lùi, còn lớp an toàn chỉ chặn đi tiến, nên lùi trở thành cách "lách luật". Vì xe chỉ có cảm biến ở phía trước, lùi tức là lái mù. Bản 2 đã phạt đi lùi. Bảng chấm điểm trên trang có thêm cột % bước lùi để kiểm tra.


Phần vật lý ở đây là bản 2D gần đúng của PyBullet. Cấp 1 đến 3 khớp với số liệu Kaggle; cấp 4 và 5 thấp hơn khoảng 10–18%. Trang này dùng để so sánh và giảng dạy; số liệu chính thức vẫn lấy từ Kaggle.

Chạy thử trên máy: `cd web && python3 -m http.server`, rồi mở `http://localhost:8000`. Có thể bật GitHub Pages cho thư mục `web/`.

Thêm bộ não mới: `python3 tools/npz2json.py policy_pi.npz web/brains/ten_moi.json "Tên hiển thị"`, rồi thêm một dòng vào `BUILTIN_BRAINS` trong `web/app.js`.
