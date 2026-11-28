# Phòng thí nghiệm robot ảo

**Chạy ngay:** https://nshiep-tech.github.io/robot-mo-phong-web/

**NGUYỄN SỸ HIỆP**, Trường Đại học Công nghệ Thông tin và Truyền thông (ICTU), Đại học Thái Nguyên

Đây là một trang web chạy hoàn toàn trên trình duyệt (máy tính và điện thoại). Trang nạp **bộ não đã huấn luyện trên Kaggle**, rồi thả robot 2 bánh vào sân 5×5 m để xem nó tự lái và né vật cản theo thời gian thực, không cần phần cứng.

```
kaggle-robot (huấn luyện PPO)  →  policy_pi.npz  →  tools/npz2json.py  →  web/brains/*.json  →  trang web (web/)
                                         └──────────── nạp thẳng .npz trên trang ───────────┘
```

## Bật trang chạy trên GitHub (GitHub Pages) – làm 1 lần

Repo đã ở chế độ **Public**. Còn một bước bật Pages, chỉ chủ repo bấm được:

1. Mở trình duyệt (không dùng app GitHub) và đăng nhập **nshiep-tech**.
2. Vào thẳng: https://github.com/nshiep-tech/robot-mo-phong-web/settings/pages
3. Mục **Build and deployment**:
   - **Source**: chọn *Deploy from a branch*
   - **Branch**: chọn `main`, ô bên cạnh chọn `/ (root)`, rồi bấm **Save**
4. Đợi 1–2 phút, tải lại trang. Phía trên sẽ hiện dòng *Your site is live at …*
5. Mở: **https://nshiep-tech.github.io/robot-mo-phong-web/** (tự chuyển vào thư mục `web/`)

Từ đó, mỗi lần đẩy mã mới lên `main`, trang tự cập nhật sau khoảng 1 phút.

## Cấu trúc

| Thư mục / file | Vai trò |
|---|---|
| `web/index.html` | Giao diện (đầu trang ghi tên và trường; hiển thị tốt trên điện thoại) |
| `web/core.js` | Lõi mô phỏng: động học vi sai, động cơ TT, siêu âm, YOLO giả lập, 5 cấp kịch bản, mạng MLP, chấm điểm. Chạy được cả trong Node. |
| `web/house.js` | Nhà ảo 3 phòng, mốc ArUco, bộ điều phối lệnh (hiểu lệnh → nhận phòng → qua cửa → tìm đồ vật → bộ não lái) |
| `web/bay.html` | Lab bầy robot (một file, không phụ thuộc file khác): 4 bản đồ 14,4 × 10 m, kiến trúc 9 lớp, mạng mesh, encoder/IMU/lidar/UWB |
| `web/models.js` | Mô hình 3D đồ đạc (sofa, tủ lạnh, giường…) và robot |
| `web/app.js` | Vẽ 2D/3D, bảng số liệu, sửa bản đồ, cấu hình robot, lái tay, mã tự viết |
| `web/brains/` | Các bộ não đã đổi sang JSON (định dạng `robot2wd-mlp-v1`) |
| `tools/npz2json.py` | Đổi `policy_pi.npz` (Kaggle) thành JSON |
| `test/benchmark.js` | Kiểm tra lõi bằng Node: `node test/benchmark.js` |

## Tính năng

**Chế độ Nhà thông minh** (mặc định): ra lệnh bằng chữ hoặc giọng nói, ví dụ "đi tới tủ lạnh" hay "vào phòng ngủ". Robot đọc mốc ArUco để tự nhận phòng, tìm đường qua các cửa theo sơ đồ mốc, nhận đồ vật bằng YOLO, rồi để bộ não PPO lái tới nơi. Khi bị chắn, robot quay một vòng quét siêu âm để tìm lối vòng. Có công tắc chạm. Có thể bật thêm đối tượng di chuyển: người ở phòng khách, người ở bếp và mèo; họ biết dừng nhường xe.

**Dời đồ đạc:** có nút xáo trộn ngẫu nhiên, hoặc chạm để dời từng món. Robot không được báo khi đồ bị dời. Nó có **trí nhớ đồ vật**: tìm ở phòng cũ không thấy thì đi tìm các phòng khác, và vừa đi vừa nhìn để cập nhật trí nhớ.

Kiểm tra:
- `node test/house_test.js`: đồ ở chỗ cũ, thành công 56–58/60 nhiệm vụ.
- `node test/house_shuffle_test.js`: đồ bị xáo trộn, có người và mèo đi lại, thành công 79/84.

**Chế độ Bầy robot** (`web/bay.html`, nút 🛰 trên thanh đầu trang): sân 14,4 × 10 m (144 m², gấp 3 nhà cũ), không có Wi-Fi.

1. Bốn bản đồ: 🏠 Nhà lớn 5 phòng (lệnh nhiều điểm như `B C E S`), 📦 Kho hàng (4 robot, lối kệ hẹp phải đặt chỗ), 🧱 Tòa nhà mất sóng (robot tự dừng làm trạm tiếp sóng), 🏥 Khoa bệnh viện (giao thuốc, tin "đã giao" đi qua mạng mesh về quầy trực).
2. Kiến trúc 9 lớp hiện trực tiếp cho robot đang chọn: giao tiếp người, nhiệm vụ, bản đồ chung, định vị, tìm đường A*, phối hợp bầy, lái + an toàn, liên lạc mesh, phần cứng.
3. Định vị: encoder + IMU MPU6050, lidar 2D 72 tia so khớp với bản đồ mặt bằng, UWB đo khoảng cách tới trạm và robot đứng yên. Tắt từng cảm biến để thấy vị trí ước lượng lệch dần.
4. Mạng mesh: phát cho tất cả, bắc cầu nhiều bước, đồng bộ kiểu lan truyền, giữ và chuyển khi mất sóng. Sóng suy giảm qua tường gạch (8 dB) và bê tông (16 dB).
5. Lớp lái dùng bộ bám mốc, chưa nạp bộ não PPO. Thông số cảm biến và sóng là giả định để minh họa.

**Chế độ Sân huấn luyện 5 cấp:**

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
