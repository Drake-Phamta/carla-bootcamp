"""Generate synthetic DEMO evidence for carla-bootcamp/progress.html.

Everything is derived from one tiny 3D scene (CARLA-style axes: x forward, y right, z up, metres)
so camera image, 2D/3D boxes, LiDAR and projections are mutually consistent.
"""
import json, math, os, shutil, subprocess, struct, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "evidence", "_demo")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)

# ---------------------------------------------------------------- scene
# box: (cx, cy, cz_bottom, length, width, height, label, color)
CARS = [
    (14.0, -3.5, 0.0, 4.5, 1.9, 1.5, "car", (190, 40, 40)),
    (27.0, 3.5, 0.0, 4.6, 1.9, 1.6, "car", (40, 90, 170)),
    (42.0, -3.5, 0.0, 4.4, 1.8, 1.5, "car", (220, 220, 225)),
    (20.0, 6.3, 0.0, 4.3, 1.8, 1.45, "car", (60, 60, 65)),
    (9.0, 3.5, 0.0, 5.5, 2.1, 2.3, "truck", (230, 170, 40)),
    (60.0, -3.5, 0.0, 4.5, 1.9, 1.5, "car", (40, 140, 90)),
]
PEDS = [
    (17.0, 8.2, 0.15, 0.5, 0.5, 1.75, "pedestrian", (120, 60, 140)),
    (33.0, -8.4, 0.15, 0.5, 0.5, 1.7, "pedestrian", (200, 110, 60)),
]
POLES = [(x, s * 8.6, 0.15, 0.25, 0.25, 6.0, "pole", (110, 110, 115)) for x in range(6, 90, 16) for s in (-1, 1)]
BUILDINGS = []
x0 = -20.0
while x0 < 140:
    L = rng.uniform(10, 18)
    for s in (-1, 1):
        H = rng.uniform(8, 22)
        shade = int(rng.uniform(150, 205))
        BUILDINGS.append((x0 + L / 2, s * (12 + 4), 0.0, L - 1.0, 8.0, H, "building", (shade, shade - 10, shade - 25)))
    x0 += L
SIDEWALK_H = 0.15
OBJECTS = CARS + PEDS + POLES + BUILDINGS
LABEL_ID = {"ground": 0, "road": 0, "car": 1, "truck": 1, "pedestrian": 2, "building": 3, "pole": 4}

def box_corners(b):
    cx, cy, cz, l, w, h = b[:6]
    xs = [cx - l / 2, cx + l / 2]; ys = [cy - w / 2, cy + w / 2]; zs = [cz, cz + h]
    return np.array([[x, y, z] for x in xs for y in ys for z in zs])

# ---------------------------------------------------------------- camera
W, H, FOV = 960, 540, 90.0
F = W / (2 * math.tan(math.radians(FOV) / 2))
CX, CY = W / 2, H / 2
CAM = np.array([0.8, 0.0, 1.6])  # camera on windshield

def project(P, cam=CAM):
    """world (N,3) -> pixels (N,2), depth (N,)"""
    d = P - cam
    X, Y, Z = d[:, 0], d[:, 1], d[:, 2]
    u = F * Y / X + CX
    v = F * (-Z) / X + CY
    return np.stack([u, v], 1), X

def shade(c, k):
    return tuple(int(max(0, min(255, v * k))) for v in c)

def render_camera(rain=False):
    img = Image.new("RGB", (W, H))
    dr = ImageDraw.Draw(img)
    # sky gradient
    for v in range(int(CY) + 1):
        t = v / CY
        top, bot = ((95, 150, 215), (190, 215, 240)) if not rain else ((95, 102, 112), (150, 155, 162))
        dr.line([(0, v), (W, v)], fill=tuple(int(top[i] * (1 - t) + bot[i] * t) for i in range(3)))
    dr.rectangle([0, CY, W, H], fill=(120, 125, 118) if not rain else (85, 88, 90))
    polys = []  # (depth, pts, color)
    def quad(p, color, depth=None):
        P = np.array(p, float)
        if (P[:, 0] - CAM[0] < 0.5).any():
            return
        uv, dep = project(P)
        polys.append((depth if depth is not None else dep.mean(), [tuple(q) for q in uv], color))
    road = (70, 72, 76) if not rain else (48, 50, 54)
    # ground strips (far to near) so painter order works
    for x in np.arange(150, 1, -3.0):
        x2 = x - 3.0 if x - 3.0 > 1.0 else 1.0
        quad([[x, -7, 0], [x, 7, 0], [x2, 7, 0], [x2, -7, 0]], road, depth=1e4 + x)
        for s in (-1, 1):
            quad([[x, s * 7, SIDEWALK_H], [x, s * 12, SIDEWALK_H], [x2, s * 12, SIDEWALK_H], [x2, s * 7, SIDEWALK_H]],
                 (160, 158, 150) if not rain else (105, 105, 104), depth=1e4 + x)
    for x in np.arange(3, 150, 9.0):  # dashed centre line + edge lines
        quad([[x + 3, -0.08, 0.01], [x + 3, 0.08, 0.01], [x, 0.08, 0.01], [x, -0.08, 0.01]], (235, 235, 225), depth=5e3 + x)
    for s in (-1, 1):
        for x in np.arange(150, 1, -6.0):
            quad([[x, s * 6.8 - 0.07, 0.01], [x, s * 6.8 + 0.07, 0.01], [x - 6, s * 6.8 + 0.07, 0.01], [x - 6, s * 6.8 - 0.07, 0.01]], (225, 225, 215), depth=5e3 + x)
    # boxes
    faces = [((0, 1, 3, 2), (-1, 0, 0)), ((4, 5, 7, 6), (1, 0, 0)), ((0, 1, 5, 4), (0, -1, 0)),
             ((2, 3, 7, 6), (0, 1, 0)), ((1, 3, 7, 5), (0, 0, 1))]
    light = np.array([-0.4, -0.5, 0.75]); light /= np.linalg.norm(light)
    box_polys = []
    for b in OBJECTS:
        C = box_corners(b)
        if (C[:, 0] - CAM[0]).max() < 1.0:
            continue
        for idx, n in faces:
            n = np.array(n, float)
            centre = C[list(idx)].mean(0)
            if np.dot(n, CAM - centre) <= 0:
                continue
            P = C[list(idx)]
            if (P[:, 0] - CAM[0] < 0.5).any():
                continue
            k = 0.55 + 0.45 * max(0, np.dot(n, light))
            uv, dep = project(P)
            box_polys.append((np.linalg.norm(centre - CAM), [tuple(q) for q in uv], shade(b[7], k)))
            # windows on cars
            if b[6] in ("car", "truck") and n[2] == 0:
                cz, h = b[2], b[5]
                inner = P.copy()
                if n[0] != 0:
                    inner[:, 1] = np.clip(inner[:, 1], b[1] - b[4] / 2 + 0.15, b[1] + b[4] / 2 - 0.15)
                else:
                    inner[:, 0] = np.clip(inner[:, 0], b[0] - b[3] / 2 + 0.4, b[0] + b[3] / 2 - 0.4)
                inner[:, 2] = np.where(inner[:, 2] > cz + h / 2, cz + h - 0.12, cz + h * 0.6)
                uvw, _ = project(inner)
                box_polys.append((np.linalg.norm(centre - CAM) - 0.01, [tuple(q) for q in uvw], (35, 45, 60)))
    allp = polys + box_polys
    allp.sort(key=lambda t: -t[0])
    for _, pts, col in allp:
        dr.polygon(pts, fill=col)
    if rain:
        arr = np.asarray(img).astype(np.float32)
        fog = np.array([130, 134, 140], np.float32)
        yy = np.linspace(0, 1, H)[:, None, None]
        mix = np.clip(0.55 - 0.35 * np.abs(yy - 0.5) * 2, 0, 1)
        arr = arr * (1 - mix) + fog * mix
        img = Image.fromarray(arr.astype(np.uint8))
        dr = ImageDraw.Draw(img)
        for _ in range(900):
            x, y = rng.uniform(0, W), rng.uniform(0, H)
            L = rng.uniform(10, 26)
            dr.line([(x, y), (x - L * 0.25, y + L)], fill=(200, 205, 215), width=1)
        img = img.filter(ImageFilter.GaussianBlur(0.6))
    return img

# ---------------------------------------------------------------- boxes (ground truth)
def gt_boxes():
    out = []
    for b in CARS + PEDS:
        C = box_corners(b)
        if (C[:, 0] - CAM[0]).min() < 1.0:
            continue
        uv, _ = project(C)
        x1, y1 = uv.min(0); x2, y2 = uv.max(0)
        if x2 < 0 or x1 > W:
            continue
        trunc = 1 - (min(x2, W) - max(x1, 0)) / (x2 - x1)
        out.append({
            "class": b[6],
            "box2d": [round(float(max(x1, 0)), 1), round(float(max(y1, 0)), 1), round(float(min(x2, W)), 1), round(float(min(y2, H)), 1)],
            "corners2d": [[round(float(a), 1), round(float(c), 1)] for a, c in uv],
            "distance_m": round(float(np.linalg.norm([b[0] - CAM[0], b[1]])), 1),
            "truncated": round(float(trunc), 2),
        })
    return out

# ---------------------------------------------------------------- LiDAR raycast
def lidar_scan(origin, channels=32, up=10.0, low=-30.0, h_res=0.35, max_range=80.0, ego=True):
    elev = np.radians(np.linspace(up, low, channels))
    az = np.radians(np.arange(0, 360, h_res))
    E, A = np.meshgrid(elev, az, indexing="ij")
    D = np.stack([np.cos(E) * np.cos(A), np.cos(E) * np.sin(A), np.sin(E)], -1).reshape(-1, 3)
    o = np.array(origin, float)
    n = len(D)
    t_best = np.full(n, np.inf); lab = np.full(n, -1)
    with np.errstate(divide="ignore", invalid="ignore"):
        tg = -o[2] / D[:, 2]
        hit = (tg > 0) & np.isfinite(tg)
        t_best = np.where(hit, tg, t_best); lab = np.where(hit, 0, lab)
        boxes = OBJECTS + ([(0.0, 0.0, 0.0, 4.6, 1.9, 1.5, "ego", (0, 0, 0))] if ego else [])
        for b in boxes:
            C = box_corners(b)
            lo, hi = C.min(0), C.max(0)
            t1 = (lo - o) / D; t2 = (hi - o) / D
            tmin = np.nanmax(np.minimum(t1, t2), 1); tmax = np.nanmin(np.maximum(t1, t2), 1)
            ok = (tmax >= tmin) & (tmax > 0) & (tmin > 0.05) & (tmin < t_best)
            t_best = np.where(ok, tmin, t_best)
            lab = np.where(ok, -2 if b[6] == "ego" else LABEL_ID[b[6]], lab)
    keep = (t_best < max_range) & (lab >= 0)
    P = o + D[keep] * t_best[keep, None]
    P += rng.normal(0, 0.015, P.shape)
    return P.astype(np.float32), lab[keep].astype(np.uint8)

def write_ply(path, P, L):
    with open(path, "wb") as f:
        f.write(("ply\nformat binary_little_endian 1.0\ncomment DEMO synthetic LiDAR (CARLA axes, m)\n"
                 f"element vertex {len(P)}\nproperty float x\nproperty float y\nproperty float z\n"
                 "property uchar label\nend_header\n").encode())
        rec = np.zeros(len(P), dtype=[("x", "<f4"), ("y", "<f4"), ("z", "<f4"), ("l", "u1")])
        rec["x"], rec["y"], rec["z"], rec["l"] = P[:, 0], P[:, 1], P[:, 2], L
        f.write(rec.tobytes())

def turbo(t):
    t = np.clip(t, 0, 1)
    r = 34.61 + t * (1172.33 - t * (10793.56 - t * (33300.12 - t * (38394.49 - t * 14825.05))))
    g = 23.31 + t * (557.33 + t * (1225.33 - t * (3574.96 - t * (1073.77 + t * 707.56))))
    b = 27.2 + t * (3211.1 - t * (15327.97 - t * (27814 - t * (22569.18 - t * 6838.66))))
    return np.clip(np.stack([r, g, b], -1), 0, 255).astype(np.uint8)

# ---------------------------------------------------------------- main
def main():
    clear = render_camera(False); clear.save(os.path.join(OUT, "cam_clear.jpg"), quality=86)
    rain = render_camera(True); rain.save(os.path.join(OUT, "cam_rain.jpg"), quality=86)
    boxes = gt_boxes()
    json.dump({"image_size": [W, H], "camera": {"fov_deg": FOV, "fx": round(F, 2), "cx": CX, "cy": CY},
               "objects": boxes}, open(os.path.join(OUT, "cam_clear_boxes.json"), "w"), indent=1)

    roof, roof_l = lidar_scan([0.0, 0.0, 2.0])
    bump, bump_l = lidar_scan([2.45, 0.0, 0.55])
    write_ply(os.path.join(OUT, "lidar_roof.ply"), roof, roof_l)
    write_ply(os.path.join(OUT, "lidar_bumper.ply"), bump, bump_l)

    # LiDAR -> camera projection (calibration check)
    img = clear.copy(); d = ImageDraw.Draw(img)
    uv, dep = project(roof.astype(float))
    m = (dep > 1.0) & (uv[:, 0] >= 0) & (uv[:, 0] < W) & (uv[:, 1] >= 0) & (uv[:, 1] < H)
    cols = turbo(1 - np.clip(dep[m] / 50.0, 0, 1))
    for (u, v), c in zip(uv[m], cols):
        d.ellipse([u - 1.3, v - 1.3, u + 1.3, v + 1.3], fill=tuple(int(x) for x in c))
    img.save(os.path.join(OUT, "lidar_on_cam.jpg"), quality=86)

    # points per object vs distance for both LiDARs
    rows = ["distance_m,roof_lidar,bumper_lidar"]
    for b in sorted(CARS, key=lambda b: b[0]):
        lo, hi = box_corners(b).min(0) - 0.05, box_corners(b).max(0) + 0.05
        cnt = lambda P: int(((P >= lo) & (P <= hi)).all(1).sum())
        rows.append(f"{math.hypot(b[0], b[1]):.1f},{cnt(roof)},{cnt(bump)}")
    open(os.path.join(OUT, "points_vs_distance.csv"), "w").write("\n".join(rows) + "\n")

    # sensor layouts
    veh = {"length": 4.6, "width": 1.9, "name": "Ego (Lincoln MKZ ~ 4.6 x 1.9 m)"}
    layouts = {"vehicle": veh, "range_m": 12, "layouts": [
        {"name": "Layout A — 1 LiDAR nóc + 3 camera trước", "sensors": [
            {"name": "LiDAR nóc", "type": "lidar", "x": 0.0, "y": 0.0, "z": 2.0, "yaw": 0, "fov": 360, "range": 80, "lower_fov": -30},
            {"name": "Cam trước", "type": "camera", "x": 0.8, "y": 0.0, "z": 1.6, "yaw": 0, "fov": 90, "range": 60},
            {"name": "Cam trước-trái", "type": "camera", "x": 0.7, "y": -0.8, "z": 1.5, "yaw": -60, "fov": 70, "range": 40},
            {"name": "Cam trước-phải", "type": "camera", "x": 0.7, "y": 0.8, "z": 1.5, "yaw": 60, "fov": 70, "range": 40}]},
        {"name": "Layout B — LiDAR nóc + cam trước + 4 fisheye surround + 2 radar", "sensors": [
            {"name": "LiDAR nóc", "type": "lidar", "x": 0.0, "y": 0.0, "z": 2.0, "yaw": 0, "fov": 360, "range": 80, "lower_fov": -30},
            {"name": "Cam trước", "type": "camera", "x": 0.8, "y": 0, "z": 1.6, "yaw": 0, "fov": 90, "range": 60},
            {"name": "Fisheye F", "type": "camera", "x": 2.35, "y": 0, "z": 0.6, "yaw": 0, "fov": 180, "vfov": 120, "pitch": -30, "range": 10},
            {"name": "Fisheye B", "type": "camera", "x": -2.35, "y": 0, "z": 0.9, "yaw": 180, "fov": 180, "vfov": 120, "pitch": -30, "range": 10},
            {"name": "Fisheye L (gương)", "type": "camera", "x": 0.9, "y": -1.0, "z": 1.0, "yaw": -90, "fov": 180, "vfov": 120, "pitch": -40, "range": 10},
            {"name": "Fisheye R (gương)", "type": "camera", "x": 0.9, "y": 1.0, "z": 1.0, "yaw": 90, "fov": 180, "vfov": 120, "pitch": -40, "range": 10},
            {"name": "Radar F", "type": "radar", "x": 2.3, "y": 0, "z": 0.5, "yaw": 0, "fov": 30, "range": 100},
            {"name": "Radar B", "type": "radar", "x": -2.3, "y": 0, "z": 0.5, "yaw": 180, "fov": 30, "range": 100}]}]}
    json.dump(layouts, open(os.path.join(OUT, "sensor_layouts.json"), "w"), indent=1, ensure_ascii=False)

    # GPS trace (Hà Nội, synthetic) + CARLA road converted back to lat/lon
    lat0, lon0 = 21.00675, 105.84310
    m_per_deg_lat = 111320.0; m_per_deg_lon = 111320.0 * math.cos(math.radians(lat0))
    s = np.linspace(0, 1, 120)
    ex = 420 * s; ny = 60 * np.sin(s * math.pi * 1.2) + 90 * s ** 2
    gps = [[lon0 + (e + rng.normal(0, 1.6)) / m_per_deg_lon, lat0 + (n + rng.normal(0, 1.6)) / m_per_deg_lat] for e, n in zip(ex, ny)]
    road = [[lon0 + (e + 0.6) / m_per_deg_lon, lat0 + (n - 0.4) / m_per_deg_lat] for e, n in zip(ex[::4], ny[::4])]
    err = float(np.mean([math.hypot((g[0] - lon0) * m_per_deg_lon - e, (g[1] - lat0) * m_per_deg_lat - n) for g, e, n in zip(gps, ex, ny)]))
    geo = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": "GPS trace thật (1 Hz, nhiễu)", "stroke": "#cf222e", "points": True}, "geometry": {"type": "LineString", "coordinates": gps}},
        {"type": "Feature", "properties": {"name": f"Đường CARLA quy đổi ngược (sai số TB ≈ {err:.1f} m)", "stroke": "#1f6feb", "stroke-width": 5}, "geometry": {"type": "LineString", "coordinates": road}},
        {"type": "Feature", "properties": {"name": "Gốc map (geoReference lat_0/lon_0)", "marker": True}, "geometry": {"type": "Point", "coordinates": [lon0, lat0]}}]}
    json.dump(geo, open(os.path.join(OUT, "gps_vs_carla.geojson"), "w"), indent=1, ensure_ascii=False)

    # trajectory: annotated vs replay
    rows = ["t,x_ref,y_ref,x_sim,y_sim"]
    for t in np.arange(0, 12.01, 0.1):
        xr = 8 * t; yr = 3.5 * math.sin(t / 12 * math.pi) if t > 4 else 0.0
        drift = 0.04 * t
        rows.append(f"{t:.1f},{xr:.3f},{yr:.3f},{xr + rng.normal(0, 0.05) + drift:.3f},{yr + rng.normal(0, 0.05):.3f}")
    open(os.path.join(OUT, "trajectory_ped01.csv"), "w").write("\n".join(rows) + "\n")

    # sync vs async sim time
    rows = ["frame,sync_dt_ms,async_dt_ms"]
    for f in range(0, 200):
        rows.append(f"{f},{50.0:.1f},{max(8, rng.normal(33, 9) + (60 if f % 37 == 0 else 0)):.1f}")
    open(os.path.join(OUT, "sim_dt_sync_vs_async.csv"), "w").write("\n".join(rows) + "\n")

    # class distribution
    open(os.path.join(OUT, "class_distribution.csv"), "w").write(
        "class,count\ncar,18432\ntruck,2210\nbus,640\npedestrian,5120\ncyclist,880\nmotorcycle,1950\ntraffic_light,3105\ntraffic_sign,2760\n")

    # logs / code
    open(os.path.join(OUT, "inventory.txt"), "w", encoding="utf-8").write(
        "=== DEMO — kiểm kê server (đã che hostname/IP/user) ===\n"
        "$ lsb_release -ds\nUbuntu 22.04.4 LTS\n"
        "$ nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader\nNVIDIA GeForce RTX 4090, 550.xx, 24564 MiB\n"
        "$ nproc && free -h | head -2\n32\n              total        used        free\nMem:           125Gi        9.1Gi       108Gi\n"
        "$ df -h /home | tail -1\n/dev/nvme0n1p2  1.8T  1.1T  612G  65% /home\n"
        "$ groups\n<user> docker\n"
        "$ docker info --format '{{.ServerVersion}} {{.Runtimes}}'\n27.x map[io.containerd.runc.v2:{...} nvidia:{...} runc:{...}]\n"
        "\nKẾT LUẬN: đủ ổ (612 GB trống > 200 GB), có nhóm docker + runtime nvidia, GPU đang rảnh.\n")
    open(os.path.join(OUT, "Dockerfile.demo"), "w", encoding="utf-8").write(
        "# DEMO — chỉ minh họa cách hiển thị evidence dạng code; bài lab thật ở Module B\n"
        "FROM ubuntu:22.04\n"
        "ENV DEBIAN_FRONTEND=noninteractive \\\n    NVIDIA_DRIVER_CAPABILITIES=all\n"
        "RUN apt-get update && apt-get install -y --no-install-recommends \\\n"
        "      libvulkan1 vulkan-tools libsdl2-2.0-0 libxrandr2 xdg-user-dirs \\\n    && rm -rf /var/lib/apt/lists/*\n"
        "RUN useradd -m carla\n"
        "COPY --chown=carla:carla dist/CARLA_0.9.16/ /home/carla/\n"
        "USER carla\nWORKDIR /home/carla\n"
        "EXPOSE 2000-2002\n"
        "CMD [\"bash\", \"CarlaUE4.sh\", \"-RenderOffScreen\", \"-nosound\"]\n")

    # BEV video
    tmp = tempfile.mkdtemp()
    S = 9.0  # px per metre
    VW, VH = 640, 360
    for k in range(60):
        t = k / 15.0
        ego_x = 5.0 * t
        im = Image.new("RGB", (VW, VH), (32, 35, 40)); d = ImageDraw.Draw(im)
        def w2p(x, y): return (VW * 0.3 + (x - ego_x) * S, VH / 2 + y * S)
        d.rectangle([0, VH / 2 - 7 * S, VW, VH / 2 + 7 * S], fill=(62, 64, 70))
        for x in np.arange(math.floor(ego_x / 9) * 9 - 40, ego_x + 80, 9):
            a, b = w2p(x, 0), w2p(x + 3, 0); d.line([a, b], fill=(230, 230, 220), width=2)
        # LiDAR ring + camera FOV
        c = w2p(ego_x, 0)
        d.ellipse([c[0] - 40 * S, c[1] - 40 * S, c[0] + 40 * S, c[1] + 40 * S], outline=(80, 160, 255), width=1)
        d.pieslice([c[0] - 30 * S, c[1] - 30 * S, c[0] + 30 * S, c[1] + 30 * S], -45, 45, fill=(60, 110, 90))
        for (bx, by, _, l, w, h, lab, col) in CARS:
            vx = bx + (3.0 * t if by < 0 else -6.0 * t) if lab != "truck" else bx
            p1, p2 = w2p(vx - l / 2, by - w / 2), w2p(vx + l / 2, by + w / 2)
            d.rectangle([p1, p2], fill=col, outline=(255, 255, 255))
        p1, p2 = w2p(ego_x - 2.3, -0.95), w2p(ego_x + 2.3, 0.95)
        d.rectangle([p1, p2], fill=(255, 255, 255), outline=(31, 111, 235), width=2)
        d.text((10, 10), f"DEMO  t={t:4.1f}s  frame={k:03d}  sync 15 Hz", fill=(230, 230, 230))
        im.save(os.path.join(tmp, f"f{k:03d}.png"))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "15", "-i", os.path.join(tmp, "f%03d.png"),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-movflags", "+faststart",
                    os.path.join(OUT, "bev_autopilot.mp4")], check=True)
    shutil.copy(os.path.join(tmp, "f030.png"), os.path.join(OUT, "bev_poster.png"))
    shutil.rmtree(tmp, ignore_errors=True)
    print("points roof/bumper:", len(roof), len(bump), "boxes:", len(boxes))
    for fn in sorted(os.listdir(OUT)):
        print(f"{fn:32s} {os.path.getsize(os.path.join(OUT, fn)) / 1024:8.1f} KB")

if __name__ == "__main__":
    main()
