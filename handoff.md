# Bản bàn giao — dành cho trợ lý AI trên máy 3090 Ti

> Dán nguyên file này (hoặc bảo đọc link raw) cho Claude trên máy mới. Mục đích: nó hiểu ngay bối cảnh và lập kế hoạch luyện tập phù hợp, không hỏi lại từ đầu.

## 1. Tôi là ai, tôi cần gì

- Tôi vừa vào một team mô phỏng xe tự hành, **chưa có kinh nghiệm** về CARLA, ROS 2, Docker, Blender, Unreal. Nền tảng: Python khá; Linux ở mức cơ bản.
- Mục tiêu: **thành thạo công cụ và kiến thức** để làm được 3 task của team (mục 2), chứ không phải hoàn thành một sản phẩm cụ thể.
- Thời gian học: **19–21/09/2026**. Bắt đầu làm việc chính thức **22/09**.
- **Quan trọng:** khi đi làm tôi **không được dùng agent**, chỉ có chatbot hỗ trợ. Vì vậy mọi thứ tôi phải **tự gõ tay, tự hiểu, tự debug**. Đừng làm hộ tôi những phần là kỹ năng (viết Dockerfile, script thu data, file scenario). Hãy: giải thích cơ chế, ra đề bài, review code tôi viết, chỉ ra lỗi và cách tự kiểm chứng. Được phép làm hộ những việc chỉ tốn thời gian chờ (tải file, dựng môi trường, sinh dữ liệu mẫu).

## 2. Ba task của team

1. **Test vị trí đặt sensor trên xe tự hành**, rồi **thu thập dữ liệu đạt chuẩn** để một bên khác đánh giá. Chưa biết họ yêu cầu format nào (KITTI / nuScenes / rosbag2 / OpenLABEL) → phải biết cả mấy chuẩn và biết viết converter.
2. **Tích hợp với self-driving stack: Autoware (ROS 2)**.
3. **Dựng lại scenario từ dữ liệu thật đã kiểm định và gán nhãn**: map lấy từ GPS → OpenStreetMap; các object dựng bằng Blender rồi import vào CARLA.

## 3. Môi trường trên máy này (cần kiểm tra lại đầu buổi)

- GPU **RTX 3090 Ti**, truy cập qua Parsec.
- Đã cài sẵn **CARLA 0.9.16** và **Unreal Engine 4.26** (bản CARLA). Team ưu tiên **UE4 (0.9.16)**; bản 0.10.0 (UE5) học sau.
- Hãy kiểm tra và cho tôi biết: hệ điều hành và phiên bản, CARLA là bản release hay build từ source, có mở được UE4 editor không, Python nào đang có, có Docker / WSL / ROS 2 chưa, dung lượng ổ trống, ai khác có dùng chung máy không.

## 4. Đã làm được gì (trên một server lab khác, ngày 18/09)

- Kết nối VPN + SSH, kiểm kê server, tải và giải nén CARLA 0.9.16 bản release.
- Server đó bị giới hạn (Ubuntu 24.04, không sudo, chỉ còn ~6 GB VRAM, không có X server) nên **không build từ source và không chạy Autoware được**. Máy 3090 Ti này chính là chỗ để làm những phần đó.

## 5. Tài liệu tôi đang dùng (đọc trước khi lập kế hoạch)

- Bài học: https://drake-phamta.github.io/carla-bootcamp/
- Trang tiến độ (53 checkpoint): https://drake-phamta.github.io/carla-bootcamp/progress.html
- Danh sách checkpoint dạng JSON: https://drake-phamta.github.io/carla-bootcamp/data/checkpoints.json
- Repo: https://github.com/Drake-Phamta/carla-bootcamp

Mỗi checkpoint gồm: câu "Tôi có thể…", cấp độ ① Hiểu → ② Làm được → ③ Tự làm, **bằng chứng bắt buộc** (ảnh, video, log, point cloud, bản đồ, biểu đồ), câu hỏi kiểm tra. Tôi lưu bằng chứng vào `evidence/<MÃ>/` rồi cập nhật `data/progress.json` và commit.

Các nhóm checkpoint: `D0` truy cập/Linux · `A` build từ source · `B` Docker tự xây · `C` CARLA core API · `T1` sensor & data · `R` ROS 2 · `T2` Autoware · `T3` map/asset/scenario · `U5` UE5.

## 6. Ràng buộc kỹ thuật đã kiểm chứng (đừng làm sai những điểm này)

- **CARLA 0.9.16 (UE4 4.26)** là bản chính. Docs hỗ trợ Ubuntu 20.04/22.04; cần ~130 GB để build từ source; **không dùng `make -j$(nproc)`** (docs nói sẽ lỗi).
- Wheel PyPI `carla==0.9.16` có cho **Python 3.10/3.11/3.12**; bản release kèm sẵn wheel trong `PythonAPI/carla/dist/`. Client phải **khớp đúng version** server.
- **`autoware_carla_interface`** (autoware_universe) README ghi mới kiểm thử với **CARLA 0.9.15**, ROS 2 Humble, Ubuntu 22.04 — chưa nhắc 0.9.16. Map Town01 cho Autoware lấy ở bitbucket `carla-simulator/autoware-contents` (`pointcloud_map.pcd`, `lanelet2_map.osm`, `map_projector_info.yaml` với `projector_type: Local`; các map này **lật trục y**).
- **CARLA 0.10.0 (UE5 5.5)**: chỉ có Town10 + map mỏ, **chưa hỗ trợ import OpenDRIVE**, chưa đổi được weather, khuyến nghị ≥16 GB VRAM → **Task 3 phải làm trên UE4**.
- Asset mới **phải được UE4 editor "cook"** (source build: `make import` → `make package`; hoặc Docker monolith). Bản release chỉ nhận package đã cook qua `Util/ImportAssets.sh`.
- ScenarioRunner phải **cùng version** với CARLA (v0.9.16).
- Thu data **bắt buộc synchronous mode** + `fixed_delta_seconds`, Traffic Manager cũng sync; `rotation_frequency` của LiDAR = `1 / fixed_delta_seconds`.
- Hệ tọa độ: CARLA/UE **tay trái** (x tới, y phải, z lên) ↔ ROS **tay phải** (y đổi dấu, pitch/yaw đổi dấu) ↔ camera OpenCV (z tới, x phải, y xuống).

## 7. Việc tôi muốn làm trên máy 3090 Ti, theo thứ tự ưu tiên

Ưu tiên những phần **máy server kia không làm được**:

1. **Build CARLA 0.9.16 từ source (UE4 4.26)** và hiểu từng bước: `Update.sh`, `make PythonAPI`, `make launch`, `make package`, `make import`; đọc log khi lỗi; hiểu cấu trúc repo. (Checkpoint A-01…A-07)
2. **Tự viết Docker image** chạy CARLA headless trên GPU — **không dùng image `carlasim/carla`**, phải tự viết Dockerfile, hiểu Vulkan/NVIDIA capabilities, user non-root. (B-01…B-06)
3. **Mở UE4 editor**, chạy thử `make import` với một asset Blender đơn giản và spawn được nó trong CARLA. (T3-06, T3-07)
4. **Autoware + CARLA**: dựng, cho xe tự lái trong Town01, đổi sensor kit theo layout của tôi. (T2-01…T2-05)
5. **Task 1 — sensor & data**: gắn đủ loại sensor, tính intrinsic/extrinsic, chiếu LiDAR lên ảnh, so sánh layout bằng số liệu, pipeline thu data đồng bộ, ground truth 2D/3D, xuất KITTI, QA. (T1-01…T1-10, C-01…C-06)
6. **Task 3 — scenario**: GPS → OSM → OpenDRIVE → CARLA, georeference, replay quỹ đạo từ annotation, viết OpenSCENARIO chạy bằng ScenarioRunner. (T3-01…T3-04, T3-08…T3-10)
7. Nếu còn thời gian: CARLA 0.10.0 (UE5) khác gì. (U5-01)

## 8. Tôi muốn bạn (Claude trên máy này) làm gì

1. **Kiểm tra môi trường** theo mục 3 và báo cáo ngắn gọn cái gì có, cái gì thiếu.
2. **Lập kế hoạch theo giờ cho 19–21/09** dựa trên mục 7, ưu tiên việc chỉ máy này làm được; nói rõ việc nào chạy nền (build lâu) và việc nào tôi học song song trong lúc chờ.
3. Với mỗi phần: giải thích cơ chế → ra **bài lab tôi tự gõ** → review kết quả → nêu lỗi thường gặp → hỏi tôi vài câu kiểm tra.
4. Nhắc tôi **lưu bằng chứng** cho từng checkpoint (ảnh/video/log/point cloud/biểu đồ) và đặt vào `evidence/<MÃ>/` theo repo ở mục 5.
5. **Nói thật** khi điều gì không chắc hoặc không kiểm chứng được, thay vì đoán tên hàm/tham số. Dẫn nguồn khi đưa lệnh quan trọng.
6. Cuối mỗi ngày: tóm tắt tôi đã đạt checkpoint nào, còn thiếu gì, và 5 gạch đầu dòng để tôi báo cáo mentor.

## 9. Câu tôi cần hỏi mentor (nhắc tôi nếu chưa có câu trả lời)

Format dữ liệu bên đánh giá yêu cầu · version Autoware team dùng và đã chạy với 0.9.16 chưa · team dùng tag 0.9.16 hay branch `ue4-dev` có patch · quy chuẩn export asset từ Blender · định dạng GPS và annotation của dữ liệu thật · quy tắc dùng chung GPU.
