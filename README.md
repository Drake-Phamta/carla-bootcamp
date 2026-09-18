# CARLA Bootcamp

Lộ trình 3 ngày tự học **CARLA 0.9.16 (UE4)**: build từ source, Docker image tự viết, sensor và dữ liệu, tích hợp Autoware (ROS 2), dựng scenario từ dữ liệu thật. Kèm trang **Tiến độ** lưu checkpoint năng lực và bằng chứng trực quan (video, point cloud 3D, bản đồ, biểu đồ) để tự review và trình mentor.

- **Bài học:** `index.html`
- **Tiến độ / portfolio:** `progress.html` (`?demo=1` để xem dữ liệu mẫu, `?level=ev` chỉ hiện checkpoint có bằng chứng, `?track=T1` lọc theo mảng, `?present=1` chế độ trình bày)

## Cấu trúc

```
index.html              bài giảng (tab theo Ngày 0–3 + tra cứu)
progress.html           dashboard tiến độ + viewer bằng chứng
assets/                 CSS/JS dùng chung (viewers.js: 10 loại viewer)
data/checkpoints.json   định nghĩa 53 checkpoint (năng lực, bằng chứng yêu cầu, câu hỏi)
data/progress.json      trạng thái của bạn (cấp độ, ngày, ghi chú, bằng chứng, mentor xác nhận)
data/progress.demo.json dữ liệu mẫu
evidence/<MÃ>/          file bằng chứng của từng checkpoint
evidence/_demo/         bằng chứng mẫu (tổng hợp, sinh bởi tools/gen_demo.py)
```

## Xem cục bộ

```powershell
python -m http.server 8000
# mở http://localhost:8000/
```

Mở trực tiếp bằng `file://` sẽ không đọc được JSON — cần chạy qua HTTP.

## Cập nhật tiến độ

1. Lưu file bằng chứng vào `evidence/<MÃ>/`.
2. Trên `progress.html` bấm **✎ Cập nhật** ở thẻ checkpoint → **Lưu** → **Tải progress.json** → chép đè `data/progress.json`.
3. Kiểm tra bí mật, rồi `git add`, `git commit`, `git push`.

## Quy tắc an toàn (repo public)

Không commit IP, username, hostname, SSH key, mật khẩu, file cấu hình VPN, dữ liệu thật của công ty. Che thông tin trong ảnh chụp terminal. Xem mục *Cách tạo bằng chứng → An toàn* trong bài học.
