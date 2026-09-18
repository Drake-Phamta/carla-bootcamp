/* Evidence viewers — each takes (evidence object, container element). */
(function () {
  "use strict";

  const PALETTE = ["#1f6feb", "#cf222e", "#1a7f37", "#bf8700", "#8250df", "#e16f24", "#0e8a92", "#d6336c"];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const el = (tag, attrs = {}, html) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v; else if (k === "style") e.style.cssText = v; else e.setAttribute(k, v);
    }
    if (html != null) e.innerHTML = html;
    return e;
  };
  const err = (box, msg) => { box.appendChild(el("div", { class: "v-err" }, "⚠ " + esc(msg))); };
  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`Không tải được ${url} (HTTP ${r.status})`);
    return r.text();
  }
  const fetchJSON = async (url) => JSON.parse(await fetchText(url));
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
    const head = lines.shift().split(",").map((s) => s.trim());
    const rows = lines.map((l) => {
      const cells = l.split(",");
      const o = {};
      head.forEach((h, i) => { const v = (cells[i] ?? "").trim(); o[h] = v !== "" && !isNaN(+v) ? +v : v; });
      return o;
    });
    return { head, rows };
  }

  /* ---------------------------------------------------------------- lightbox */
  function openLightbox(src) {
    const d = document.getElementById("lightbox");
    if (!d) { window.open(src, "_blank"); return; }
    d.querySelector("img").src = src;
    d.showModal();
  }
  document.addEventListener("click", (e) => {
    if (e.target.id === "lbClose" || e.target.id === "lightbox") document.getElementById("lightbox")?.close();
  });

  /* ---------------------------------------------------------------- image / video / link */
  function image(ev, box) {
    const img = el("img", { class: "v-img", src: ev.src, alt: ev.caption || ev.src });
    img.addEventListener("click", () => openLightbox(ev.src));
    img.addEventListener("error", () => err(box, "Không tìm thấy ảnh: " + ev.src));
    box.appendChild(img);
  }
  function video(ev, box) {
    const v = el("video", { class: "v-video", src: ev.src, controls: "", loop: "", muted: "", playsinline: "", preload: "metadata" });
    if (ev.poster) v.setAttribute("poster", ev.poster);
    v.muted = true;
    v.addEventListener("error", () => err(box, "Không phát được video: " + ev.src + " (nên dùng MP4 H.264, yuv420p)"));
    box.appendChild(v);
  }
  function link(ev, box) {
    box.appendChild(el("div", { class: "v-link" }, `🔗 <a href="${esc(ev.href)}" target="_blank" rel="noopener">${esc(ev.text || ev.href)}</a>`));
  }

  /* ---------------------------------------------------------------- before/after slider */
  function imageCompare(ev, box) {
    const [la, lb] = ev.labels || ["Trước", "Sau"];
    const w = el("div", { class: "v-compare" });
    w.innerHTML = `<img src="${esc(ev.after)}" alt="${esc(lb)}"><div class="top"><img src="${esc(ev.before)}" alt="${esc(la)}"></div>
      <div class="handle"></div><span class="lbl l">${esc(la)}</span><span class="lbl r">${esc(lb)}</span>`;
    const top = w.querySelector(".top"), handle = w.querySelector(".handle");
    const set = (clientX) => {
      const r = w.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      top.style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
      handle.style.left = p * 100 + "%";
    };
    let drag = false;
    w.addEventListener("pointerdown", (e) => { drag = true; w.setPointerCapture(e.pointerId); set(e.clientX); });
    w.addEventListener("pointermove", (e) => drag && set(e.clientX));
    w.addEventListener("pointerup", () => (drag = false));
    box.appendChild(w);
    box.appendChild(el("div", { class: "grid-note" }, "Kéo thanh trắng sang trái/phải để so sánh."));
  }

  /* ---------------------------------------------------------------- bbox overlay */
  async function bboxOverlay(ev, box) {
    let data;
    try { data = await fetchJSON(ev.boxes); } catch (e) { return err(box, e.message); }
    const objs = data.objects || data.boxes || [];
    const classes = [...new Set(objs.map((o) => o.class || o.type || "object"))];
    const color = (c) => PALETTE[classes.indexOf(c) % PALETTE.length];
    const canvas = el("canvas", { class: "v-canvas" });
    const img = new Image();
    const state = { mode: ev.mode || "both", on: new Set(classes) };
    const draw = () => {
      if (!img.naturalWidth) return;
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const g = canvas.getContext("2d");
      g.drawImage(img, 0, 0);
      const lw = Math.max(2, img.naturalWidth / 480);
      g.lineWidth = lw; g.font = `600 ${Math.round(lw * 6.5)}px sans-serif`;
      for (const o of objs) {
        const c = o.class || o.type || "object";
        if (!state.on.has(c)) continue;
        g.strokeStyle = color(c); g.fillStyle = color(c);
        if ((state.mode === "3d" || state.mode === "both") && o.corners2d && o.corners2d.length === 8) {
          const P = o.corners2d;
          g.globalAlpha = 0.95;
          for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
            const x = i ^ j; if (x === 1 || x === 2 || x === 4) { g.beginPath(); g.moveTo(P[i][0], P[i][1]); g.lineTo(P[j][0], P[j][1]); g.stroke(); }
          }
        }
        if ((state.mode === "2d" || state.mode === "both") && o.box2d) {
          const [x1, y1, x2, y2] = o.box2d;
          g.globalAlpha = 1; g.setLineDash(state.mode === "both" ? [lw * 3, lw * 2] : []);
          g.strokeRect(x1, y1, x2 - x1, y2 - y1); g.setLineDash([]);
          const t = `${c}${o.distance_m != null ? " · " + o.distance_m + "m" : ""}`;
          const tw = g.measureText(t).width + lw * 3;
          g.fillRect(x1, y1 - lw * 9, tw, lw * 9);
          g.fillStyle = "#fff"; g.fillText(t, x1 + lw * 1.5, y1 - lw * 2.2);
        }
      }
    };
    img.onload = draw;
    img.onerror = () => err(box, "Không tìm thấy ảnh: " + ev.image);
    img.src = ev.image;
    canvas.addEventListener("click", () => openLightbox(canvas.toDataURL("image/jpeg", 0.9)));
    box.appendChild(canvas);
    const tg = el("div", { class: "v-toggles" });
    for (const c of classes) {
      const n = objs.filter((o) => (o.class || o.type || "object") === c).length;
      const lab = el("label", {}, `<input type="checkbox" checked><span class="sw" style="background:${color(c)}"></span>${esc(c)} (${n})`);
      lab.querySelector("input").addEventListener("change", (e) => { e.target.checked ? state.on.add(c) : state.on.delete(c); draw(); });
      tg.appendChild(lab);
    }
    const sel = el("select", { style: "width:auto;font-size:.78rem;padding:.1rem .4rem" },
      `<option value="both">2D + 3D</option><option value="2d">Chỉ 2D</option><option value="3d">Chỉ 3D</option>`);
    sel.value = state.mode;
    sel.addEventListener("change", () => { state.mode = sel.value; draw(); });
    tg.appendChild(sel);
    box.appendChild(tg);
  }

  /* ---------------------------------------------------------------- point cloud (three.js) */
  const PLY_T = { char: ["getInt8", 1], int8: ["getInt8", 1], uchar: ["getUint8", 1], uint8: ["getUint8", 1],
    short: ["getInt16", 2], int16: ["getInt16", 2], ushort: ["getUint16", 2], uint16: ["getUint16", 2],
    int: ["getInt32", 4], int32: ["getInt32", 4], uint: ["getUint32", 4], uint32: ["getUint32", 4],
    float: ["getFloat32", 4], float32: ["getFloat32", 4], double: ["getFloat64", 8], float64: ["getFloat64", 8] };
  function parsePLY(buf) {
    const bytes = new Uint8Array(buf);
    let headEnd = -1;
    const needle = "end_header";
    for (let i = 0; i < Math.min(bytes.length, 65536); i++) {
      let ok = true;
      for (let k = 0; k < needle.length; k++) if (bytes[i + k] !== needle.charCodeAt(k)) { ok = false; break; }
      if (ok) { headEnd = i + needle.length; while (bytes[headEnd] === 13 || bytes[headEnd] === 10) { headEnd++; if (bytes[headEnd - 1] === 10) break; } break; }
    }
    if (headEnd < 0) throw new Error("File không phải PLY hợp lệ (thiếu end_header)");
    const header = new TextDecoder().decode(bytes.subarray(0, headEnd)).split(/\r?\n/);
    let format = "ascii", count = 0, props = [], inVertex = false;
    for (const line of header) {
      const p = line.trim().split(/\s+/);
      if (p[0] === "format") format = p[1];
      else if (p[0] === "element") { inVertex = p[1] === "vertex"; if (inVertex) count = +p[2]; }
      else if (p[0] === "property" && inVertex) {
        if (p[1] === "list") throw new Error("PLY có list property trong vertex — không hỗ trợ");
        props.push({ type: p[1], name: p[2] });
      }
    }
    const idx = Object.fromEntries(props.map((p, i) => [p.name, i]));
    if (!("x" in idx && "y" in idx && "z" in idx)) throw new Error("PLY thiếu x/y/z");
    const pos = new Float32Array(count * 3);
    const labName = ["label", "ObjTag", "tag", "semantic", "class"].find((n) => n in idx);
    const intName = ["intensity", "scalar_intensity", "reflectance"].find((n) => n in idx);
    const lab = labName ? new Int32Array(count) : null;
    const inten = intName ? new Float32Array(count) : null;
    if (format === "ascii") {
      const body = new TextDecoder().decode(bytes.subarray(headEnd)).split(/\r?\n/);
      for (let i = 0, n = 0; n < count && i < body.length; i++) {
        const t = body[i].trim(); if (!t) continue;
        const v = t.split(/\s+/).map(Number);
        pos[n * 3] = v[idx.x]; pos[n * 3 + 1] = v[idx.y]; pos[n * 3 + 2] = v[idx.z];
        if (lab) lab[n] = v[idx[labName]];
        if (inten) inten[n] = v[idx[intName]];
        n++;
      }
    } else {
      const le = format === "binary_little_endian";
      const dv = new DataView(buf, headEnd);
      const offs = []; let stride = 0;
      for (const p of props) { const t = PLY_T[p.type]; if (!t) throw new Error("Kiểu PLY lạ: " + p.type); offs.push(stride); stride += t[1]; }
      const rd = (base, i) => dv[PLY_T[props[i].type][0]](base + offs[i], le);
      for (let n = 0; n < count; n++) {
        const b = n * stride;
        pos[n * 3] = rd(b, idx.x); pos[n * 3 + 1] = rd(b, idx.y); pos[n * 3 + 2] = rd(b, idx.z);
        if (lab) lab[n] = rd(b, idx[labName]);
        if (inten) inten[n] = rd(b, idx[intName]);
      }
    }
    return { pos, lab, inten, count, labName };
  }
  function turbo(t) {
    t = Math.min(1, Math.max(0, t));
    const r = 34.61 + t * (1172.33 - t * (10793.56 - t * (33300.12 - t * (38394.49 - t * 14825.05))));
    const g = 23.31 + t * (557.33 + t * (1225.33 - t * (3574.96 - t * (1073.77 + t * 707.56))));
    const b = 27.2 + t * (3211.1 - t * (15327.97 - t * (27814 - t * (22569.18 - t * 6838.66))));
    return [Math.min(255, Math.max(0, r)) / 255, Math.min(255, Math.max(0, g)) / 255, Math.min(255, Math.max(0, b)) / 255];
  }
  let THREE_P = null;
  function loadThree() {
    THREE_P ??= Promise.all([import("three"), import("three/addons/controls/OrbitControls.js")])
      .then(([T, O]) => ({ T, OrbitControls: O.OrbitControls }));
    return THREE_P;
  }
  function pointcloud(ev, box) {
    const srcs = Array.isArray(ev.src) ? ev.src : [ev.src];
    const labels = ev.labels || srcs.map((s) => s.split("/").pop());
    const wrap = el("div", { class: "v-pc" });
    wrap.innerHTML = `<div class="start"><span>▶ Bấm để mở viewer 3D (${srcs.length} point cloud)</span></div>`;
    box.appendChild(wrap);
    const ctl = el("div", { class: "v-toggles" });
    box.appendChild(ctl);
    wrap.querySelector(".start").addEventListener("click", async () => {
      wrap.innerHTML = `<div class="start"><span>Đang tải three.js + dữ liệu…</span></div>`;
      let lib;
      try { lib = await loadThree(); } catch (e) { wrap.innerHTML = ""; return err(box, "Không tải được three.js: " + e.message); }
      const { T, OrbitControls } = lib;
      const renderer = new T.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      const scene = new T.Scene(); scene.background = new T.Color(0x0b0e12);
      const cam = new T.PerspectiveCamera(55, 1.6, 0.1, 2000);
      cam.position.set(-18, 16, 14);
      wrap.innerHTML = ""; wrap.appendChild(renderer.domElement);
      wrap.appendChild(el("div", { class: "hint" }, "Kéo: xoay · Cuộn: zoom · Chuột phải: dịch · Khung trắng = xe ego"));
      const controls = new OrbitControls(cam, renderer.domElement);
      controls.target.set(8, 0, 0); controls.update();
      const grid = new T.GridHelper(120, 24, 0x2c3440, 0x1a2029); scene.add(grid);
      scene.add(new T.AxesHelper(3));
      const ego = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(4.6, 1.5, 1.9)), new T.LineBasicMaterial({ color: 0xffffff }));
      ego.position.set(0, 0.75, 0); scene.add(ego);
      const frame = ev.frame || "carla";
      const clouds = [];
      const mat = new T.PointsMaterial({ size: 0.12, vertexColors: true, sizeAttenuation: true });
      let current = 0, mode = "auto";
      const colorize = (c) => {
        const col = new Float32Array(c.count * 3);
        const useLab = (mode === "auto" && c.lab) || mode === "label";
        let zmin = Infinity, zmax = -Infinity;
        for (let i = 0; i < c.count; i++) { const z = c.pos[i * 3 + 2]; if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
        zmax = Math.min(zmax, zmin + 12);
        for (let i = 0; i < c.count; i++) {
          let rgb;
          if (useLab && c.lab) { const h = new T.Color(PALETTE[((c.lab[i] % PALETTE.length) + PALETTE.length) % PALETTE.length]); rgb = [h.r, h.g, h.b]; }
          else if (mode === "intensity" && c.inten) rgb = turbo(c.inten[i]);
          else if (mode === "range") { const x = c.pos[i * 3], y = c.pos[i * 3 + 1]; rgb = turbo(1 - Math.min(1, Math.hypot(x, y) / 60)); }
          else rgb = turbo((c.pos[i * 3 + 2] - zmin) / (zmax - zmin || 1));
          col.set(rgb, i * 3);
        }
        c.geom.setAttribute("color", new T.BufferAttribute(col, 3));
      };
      for (const s of srcs) {
        try {
          const buf = await (await fetch(s)).arrayBuffer();
          const c = parsePLY(buf);
          const p = new Float32Array(c.count * 3);
          for (let i = 0; i < c.count; i++) { // CARLA(x fwd, y right, z up) / ROS(x fwd, y left, z up) -> three(y up)
            const x = c.pos[i * 3], y = c.pos[i * 3 + 1], z = c.pos[i * 3 + 2];
            p[i * 3] = x; p[i * 3 + 1] = z; p[i * 3 + 2] = frame === "ros" ? -y : y;
          }
          c.geom = new T.BufferGeometry(); c.geom.setAttribute("position", new T.BufferAttribute(p, 3));
          c.obj = new T.Points(c.geom, mat); c.obj.visible = false; scene.add(c.obj);
          colorize(c); clouds.push(c);
        } catch (e) { err(box, s + ": " + e.message); }
      }
      if (!clouds.length) return;
      const show = (k) => { current = k; clouds.forEach((c, i) => (c.obj.visible = i === k)); info.textContent = `${clouds[k].count.toLocaleString("vi-VN")} điểm${clouds[k].labName ? " · có nhãn “" + clouds[k].labName + "”" : ""}`; };
      ctl.innerHTML = "";
      const btns = srcs.map((s, i) => {
        const b = el("button", { class: "btn small", "aria-pressed": i === 0 ? "true" : "false" }, esc(labels[i] || s));
        b.addEventListener("click", () => { btns.forEach((x) => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); show(i); });
        ctl.appendChild(b); return b;
      });
      const sel = el("select", { style: "width:auto;font-size:.78rem;padding:.1rem .4rem" },
        `<option value="auto">Màu: tự động</option><option value="height">Màu: độ cao</option><option value="range">Màu: khoảng cách</option>${clouds.some((c) => c.lab) ? '<option value="label">Màu: nhãn</option>' : ""}${clouds.some((c) => c.inten) ? '<option value="intensity">Màu: intensity</option>' : ""}`);
      sel.addEventListener("change", () => { mode = sel.value; clouds.forEach(colorize); });
      const size = el("input", { type: "range", min: "0.03", max: "0.4", step: "0.01", value: "0.12", style: "width:90px", title: "Kích thước điểm" });
      size.addEventListener("input", () => (mat.size = +size.value));
      const info = el("span", { class: "muted", style: "font-size:.75rem" });
      ctl.append(sel, size, info);
      if (ev.labelNames) ctl.appendChild(el("span", { class: "muted", style: "font-size:.75rem;width:100%" },
        "Nhãn: " + Object.entries(ev.labelNames).map(([k, v]) => `<span class="sw" style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${PALETTE[k % PALETTE.length]}"></span> ${esc(v)}`).join(" · ")));
      show(0);
      const resize = () => { const w = wrap.clientWidth, h = wrap.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
      new ResizeObserver(resize).observe(wrap); resize();
      let visible = true;
      new IntersectionObserver((es) => (visible = es[0].isIntersecting)).observe(wrap);
      renderer.setAnimationLoop(() => { if (visible) { controls.update(); renderer.render(scene, cam); } });
    });
  }

  /* ---------------------------------------------------------------- sensor layout BEV */
  const SENSOR_COL = { lidar: "#4c9aff", camera: "#3fb950", radar: "#f0883e", other: "#d2a8ff" };
  function minGroundRange(s) {
    if (s.min_range != null) return s.min_range;
    const z = s.z ?? 1.5;
    let half;
    if (s.vfov != null) half = s.vfov / 2;
    else if (s.type === "lidar") half = Math.abs(s.lower_fov ?? -30);
    else if (s.type === "radar") half = (s.vertical_fov ?? 30) / 2;
    else if (s.type === "camera") { const asp = s.aspect ?? 16 / 9; half = (Math.atan(Math.tan((s.fov ?? 90) * Math.PI / 360) / asp) * 180) / Math.PI; }
    else half = 45;
    half += -(s.pitch ?? 0); // pitch âm (cúi xuống) giúp thấy gần hơn
    return half <= 0 ? Infinity : z / Math.tan((half * Math.PI) / 180);
  }
  async function sensorLayout(ev, box) {
    let data;
    try { data = await fetchJSON(ev.src); } catch (e) { return err(box, e.message); }
    const R = data.range_m || 12;
    const veh = data.vehicle || { length: 4.6, width: 1.9 };
    const grid = el("div", { class: "v-layouts" });
    for (const L of data.layouts || []) {
      const step = 0.25;
      let tot = 0, cov = 0; let blind = "";
      for (let x = -R; x < R; x += step) for (let y = -R; y < R; y += step) {
        const cx = x + step / 2, cy = y + step / 2;
        if (Math.abs(cx) <= veh.length / 2 && Math.abs(cy) <= veh.width / 2) continue;
        if (Math.hypot(cx, cy) > R) continue;
        tot++;
        const seen = L.sensors.some((s) => {
          const dx = cx - s.x, dy = cy - s.y, d = Math.hypot(dx, dy);
          if (d > (s.range ?? 50) || d < minGroundRange(s)) return false;
          if ((s.fov ?? 360) >= 360) return true;
          let a = (Math.atan2(dy, dx) * 180) / Math.PI - (s.yaw ?? 0);
          a = ((a + 540) % 360) - 180;
          return Math.abs(a) <= (s.fov ?? 90) / 2;
        });
        if (seen) cov++; else blind += `<rect x="${y.toFixed(2)}" y="${(-x - step).toFixed(2)}" width="${step}" height="${step}"/>`;
      }
      let wedges = "";
      for (const s of L.sensors) {
        const col = SENSOR_COL[s.type] || SENSOR_COL.other;
        const r = Math.min(s.range ?? 50, R * 1.5);
        const sx = s.y, sy = -s.x; // svg: phải = +y CARLA, lên = +x CARLA
        if ((s.fov ?? 360) >= 360) wedges += `<circle cx="${sx}" cy="${sy}" r="${r}" fill="${col}" fill-opacity=".10" stroke="${col}" stroke-opacity=".5" stroke-width=".06"/>`;
        else {
          const a0 = ((s.yaw - s.fov / 2) * Math.PI) / 180, a1 = ((s.yaw + s.fov / 2) * Math.PI) / 180;
          const p = (a) => `${(sx + r * Math.sin(a)).toFixed(2)},${(sy - r * Math.cos(a)).toFixed(2)}`;
          wedges += `<path d="M${sx},${sy} L${p(a0)} A${r},${r} 0 ${s.fov > 180 ? 1 : 0} 1 ${p(a1)} Z" fill="${col}" fill-opacity=".16" stroke="${col}" stroke-opacity=".6" stroke-width=".06"/>`;
        }
      }
      let marks = "";
      for (const s of L.sensors) marks += `<circle cx="${s.y}" cy="${-s.x}" r=".22" fill="${SENSOR_COL[s.type] || SENSOR_COL.other}" stroke="#fff" stroke-width=".05"><title>${esc(s.name)} (${s.type}) x=${s.x} y=${s.y} z=${s.z ?? "?"} yaw=${s.yaw ?? 0}° fov=${s.fov ?? 360}°</title></circle>`;
      let rings = "";
      for (let r = 5; r <= R; r += 5) rings += `<circle cx="0" cy="0" r="${r}" fill="none" stroke="#39414c" stroke-width=".04" stroke-dasharray=".3 .3"/><text x=".2" y="${-r + 0.6}" font-size=".55" fill="#6e7781">${r} m</text>`;
      const pct = tot ? (100 * cov) / tot : 0;
      const blindArea = (tot - cov) * step * step;
      const f = el("figure");
      f.innerHTML = `<figcaption>${esc(L.name)}</figcaption>
        <svg viewBox="${-R} ${-R} ${2 * R} ${2 * R}" role="img" aria-label="Sơ đồ phủ sensor ${esc(L.name)}">
          <defs><clipPath id="clip-${Math.random().toString(36).slice(2)}"><circle r="${R}"/></clipPath></defs>
          ${rings}
          <g>${wedges}</g>
          <g fill="#f85149" fill-opacity=".75">${blind}</g>
          <rect x="${-veh.width / 2}" y="${-veh.length / 2}" width="${veh.width}" height="${veh.length}" rx=".3" fill="#e6e9ee" stroke="#1f6feb" stroke-width=".08"/>
          <path d="M0,${-veh.length / 2 - 0.9} l-.45,.7 h.9 z" fill="#e6e9ee"/>
          ${marks}
        </svg>
        <div class="stat">Phủ <b>${pct.toFixed(1)}%</b> mặt đất trong bán kính ${R} m · vùng mù ≈ <b>${blindArea.toFixed(1)} m²</b> (đỏ) · ${L.sensors.length} sensor</div>`;
      grid.appendChild(f);
    }
    box.appendChild(grid);
    box.appendChild(el("div", { class: "v-toggles" },
      Object.entries(SENSOR_COL).slice(0, 3).map(([k, c]) => `<span class="chip"><span class="sw" style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${c}"></span>${k}</span>`).join("") +
      `<span class="chip"><span class="sw" style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#f85149"></span>vùng mù mặt đất</span><span class="muted" style="font-size:.74rem">Đầu xe hướng lên trên · vùng mù gần xe tính từ chiều cao gắn và FOV dọc</span>`));
  }

  /* ---------------------------------------------------------------- map (Leaflet) */
  async function map(ev, box) {
    if (!window.L) return err(box, "Leaflet chưa tải được (kiểm tra mạng)");
    let gj;
    try { gj = await fetchJSON(ev.src); } catch (e) { return err(box, e.message); }
    const div = el("div", { class: "v-map" });
    box.appendChild(div);
    const m = L.map(div, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(m);
    const legend = [];
    const layer = L.geoJSON(gj, {
      style: (f) => ({ color: f.properties?.stroke || "#1f6feb", weight: f.properties?.["stroke-width"] || 3, opacity: 0.9 }),
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 6, color: "#111", weight: 2, fillColor: "#ffd33d", fillOpacity: 1 }),
      onEachFeature: (f, lay) => {
        const p = f.properties || {};
        if (p.name) { lay.bindTooltip(esc(p.name)); legend.push([p.stroke || (f.geometry.type === "Point" ? "#ffd33d" : "#1f6feb"), p.name]); }
        if (p.points && f.geometry.type === "LineString")
          f.geometry.coordinates.forEach(([lo, la]) => L.circleMarker([la, lo], { radius: 2.2, color: p.stroke || "#cf222e", weight: 1, fillOpacity: 0.9 }).addTo(m));
      },
    }).addTo(m);
    m.fitBounds(layer.getBounds(), { padding: [20, 20] });
    new ResizeObserver(() => m.invalidateSize()).observe(div);
    box.appendChild(el("div", { class: "v-toggles" }, legend.map(([c, n]) => `<span class="chip"><span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c}"></span>${esc(n)}</span>`).join("")));
  }

  /* ---------------------------------------------------------------- charts */
  function chartTheme() {
    return { grid: css("--border") || "#ddd", text: css("--muted") || "#666" };
  }
  async function chart(ev, box) {
    if (!window.Chart) return err(box, "Chart.js chưa tải được (kiểm tra mạng)");
    let csv;
    try { csv = parseCSV(await fetchText(ev.src)); } catch (e) { return err(box, e.message); }
    const xk = ev.x || csv.head[0];
    const ys = ev.y || csv.head.filter((h) => h !== xk);
    const th = chartTheme();
    const wrap = el("div", { class: "v-chart" }); const cv = el("canvas"); wrap.appendChild(cv); box.appendChild(wrap);
    const kind = ev.kind || "line";
    const numericX = csv.rows.every((r) => typeof r[xk] === "number");
    const datasets = ys.map((y, i) => ({
      label: y, borderColor: PALETTE[i % PALETTE.length], backgroundColor: PALETTE[i % PALETTE.length] + (kind === "bar" ? "cc" : "33"),
      data: kind === "line" && numericX ? csv.rows.map((r) => ({ x: r[xk], y: r[y] })) : csv.rows.map((r) => r[y]),
      pointRadius: csv.rows.length > 60 ? 0 : 3, borderWidth: 2, tension: 0.15,
    }));
    new Chart(cv, {
      type: kind,
      data: { labels: kind === "line" && numericX ? undefined : csv.rows.map((r) => r[xk]), datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { color: th.text, boxWidth: 12 } } },
        scales: {
          x: { type: kind === "line" && numericX ? "linear" : "category", title: { display: true, text: ev.xLabel || xk, color: th.text }, ticks: { color: th.text }, grid: { color: th.grid } },
          y: { title: { display: !!ev.yLabel, text: ev.yLabel, color: th.text }, ticks: { color: th.text }, grid: { color: th.grid }, beginAtZero: kind === "bar" },
        },
      },
    });
  }
  async function trajectory(ev, box) {
    if (!window.Chart) return err(box, "Chart.js chưa tải được (kiểm tra mạng)");
    let csv;
    try { csv = parseCSV(await fetchText(ev.src)); } catch (e) { return err(box, e.message); }
    const th = chartTheme();
    const R = csv.rows;
    const errs = R.map((r) => ({ x: r.t, y: Math.hypot(r.x_sim - r.x_ref, r.y_sim - r.y_ref) }));
    const mean = errs.reduce((a, b) => a + b.y, 0) / errs.length, max = Math.max(...errs.map((e) => e.y));
    const two = el("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:.6rem" });
    const mk = () => { const w = el("div", { class: "v-chart" }); const c = el("canvas"); w.appendChild(c); two.appendChild(w); return c; };
    const c1 = mk(), c2 = mk(); box.appendChild(two);
    const common = (xt, yt) => ({ responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { labels: { color: th.text, boxWidth: 12 } } },
      scales: { x: { type: "linear", title: { display: true, text: xt, color: th.text }, ticks: { color: th.text }, grid: { color: th.grid } },
                y: { title: { display: true, text: yt, color: th.text }, ticks: { color: th.text }, grid: { color: th.grid } } } });
    new Chart(c1, { type: "scatter", data: { datasets: [
      { label: "Annotation (thật)", data: R.map((r) => ({ x: r.x_ref, y: r.y_ref })), showLine: true, borderColor: PALETTE[1], backgroundColor: PALETTE[1], pointRadius: 0, borderWidth: 3 },
      { label: "Replay trong CARLA", data: R.map((r) => ({ x: r.x_sim, y: r.y_sim })), showLine: true, borderColor: PALETTE[0], backgroundColor: PALETTE[0], pointRadius: 0, borderWidth: 2, borderDash: [5, 4] },
    ] }, options: common("x (m)", "y (m)") });
    new Chart(c2, { type: "line", data: { datasets: [{ label: "Sai số vị trí (m)", data: errs, borderColor: PALETTE[3], backgroundColor: PALETTE[3] + "33", fill: true, pointRadius: 0, borderWidth: 2 }] },
      options: common("t (s)", "sai số (m)") });
    box.appendChild(el("div", { class: "v-toggles" }, `<span class="chip">Sai số TB: <b>&nbsp;${mean.toFixed(2)} m</b></span><span class="chip">Lớn nhất: <b>&nbsp;${max.toFixed(2)} m</b></span><span class="chip">${R.length} mẫu</span>`));
  }

  /* ---------------------------------------------------------------- log / code */
  async function logView(ev, box) {
    let txt = ev.text;
    if (txt == null) { try { txt = await fetchText(ev.src); } catch (e) { return err(box, e.message); } }
    const w = el("div", { class: "v-log" });
    const pre = el("pre"); const code = el("code"); code.textContent = txt; pre.appendChild(code); w.appendChild(pre);
    if (ev.lang || ev.src) w.appendChild(el("div", { class: "grid-note" }, `${esc(ev.lang || "")} ${ev.src ? `· <a href="${esc(ev.src)}" target="_blank">mở file gốc</a>` : ""}`));
    box.appendChild(w);
    window.addCopyButtons?.(w);
  }

  const R = { image, video, link, "image-compare": imageCompare, "bbox-overlay": bboxOverlay, pointcloud, "sensor-layout": sensorLayout,
    map, chart, trajectory, log: logView, code: logView, gif: image };
  const NAMES = { image: "Ảnh", video: "Video", link: "Link", "image-compare": "So sánh", "bbox-overlay": "BBox", pointcloud: "Point cloud 3D",
    "sensor-layout": "Sensor layout", map: "Bản đồ", chart: "Biểu đồ", trajectory: "Quỹ đạo", log: "Log", code: "Code", gif: "GIF" };
  window.Viewers = {
    names: NAMES,
    render(ev, box) {
      const f = R[ev.type];
      if (!f) return err(box, "Loại bằng chứng chưa hỗ trợ: " + ev.type);
      try { const p = f(ev, box); if (p && p.catch) p.catch((e) => err(box, e.message)); } catch (e) { err(box, e.message); }
    },
    parseCSV, esc, el,
  };

  /* ---------------------------------------------------------------- copy buttons (shared) */
  window.addCopyButtons = function (root = document) {
    root.querySelectorAll("pre").forEach((pre) => {
      if (pre.querySelector(".copy")) return;
      const b = el("button", { class: "copy", type: "button" }, "Copy");
      b.addEventListener("click", async () => {
        const t = (pre.querySelector("code") || pre).innerText.replace(/\nCopy$/, "");
        try { await navigator.clipboard.writeText(t); } catch { const ta = el("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
        b.textContent = "Đã copy"; b.classList.add("done"); setTimeout(() => { b.textContent = "Copy"; b.classList.remove("done"); }, 1400);
      });
      pre.appendChild(b);
    });
  };
})();
