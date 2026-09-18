/* index.html — tabs, checkpoint boxes, sidebar progress, coordinate-frame viewer */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };

  /* ---------------- theme */
  const applyTheme = (t) => { if (t) document.documentElement.dataset.theme = t; };
  applyTheme(store.get("cb-theme") && JSON.parse(store.get("cb-theme")));
  $("#btnTheme")?.addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const n = cur === "dark" ? "light" : "dark"; applyTheme(n); store.set("cb-theme", JSON.stringify(n));
  });

  /* ---------------- tabs (hash routing) */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  // section id = "tab-<id>" để trình duyệt không tự nhảy tới section khi mở link #<id>
  const tabs = $$("section.tab");
  const tabId = (t) => t.id.replace(/^tab-/, "");
  const ids = tabs.map(tabId);
  function show(id, anchor) {
    if (!ids.includes(id)) id = "start";
    tabs.forEach((t) => t.classList.toggle("show", tabId(t) === id));
    $$(".side a[data-tab]").forEach((a) => a.classList.toggle("active", a.dataset.tab === id));
    const sel = $("#mobileSel"); if (sel) sel.value = id;
    store.set("cb-tab", id);
    const target = anchor ? document.getElementById(anchor) : null;
    const go = () => (target ? target.scrollIntoView({ block: "start" }) : window.scrollTo(0, 0));
    go(); setTimeout(go, 0);
    if (document.readyState !== "complete") window.addEventListener("load", () => setTimeout(go, 0), { once: true });
    document.title = ($("#tab-" + id + " h1")?.textContent || "CARLA Bootcamp") + " · CARLA Bootcamp";
  }
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h) return show(store.get("cb-tab") || "start");
    if (ids.includes(h)) return show(h);
    const el = document.getElementById(h);
    const owner = el?.closest("section.tab");
    show(owner ? tabId(owner) : "start", owner ? h : null);
  }
  window.addEventListener("hashchange", route);
  $("#mobileSel")?.addEventListener("change", (e) => (location.hash = e.target.value));
  $("#btnAll")?.addEventListener("click", (e) => {
    const on = document.body.classList.toggle("all-tabs");
    e.currentTarget.setAttribute("aria-pressed", on ? "true" : "false");
  });

  /* ---------------- checkpoint boxes + sidebar progress */
  async function loadCheckpoints() {
    let def, prog = { items: {} };
    try { def = await (await fetch("data/checkpoints.json", { cache: "no-cache" })).json(); } catch { return; }
    try { prog = await (await fetch("data/progress.json", { cache: "no-cache" })).json(); } catch { /* ignore */ }
    let draft = {}; try { draft = JSON.parse(localStorage.getItem("cb-progress-draft-v1")) || {}; } catch { /* ignore */ }
    const lv = (id) => +((draft[id] || prog.items?.[id] || {}).level || 0);
    const LV = ["Chưa", "① Hiểu", "② Làm được", "③ Tự làm"];
    for (const box of $$(".cp-box[data-module]")) {
      const mods = box.dataset.module.split(",");
      const list = def.checkpoints.filter((c) => mods.includes(c.module));
      box.innerHTML = `<div class="h">🎯 Checkpoint của phần này (${list.length}) <a href="progress.html">Mở trang Tiến độ →</a></div><ul>${list.map((c) => `
        <li><code class="id">${esc(c.id)}</code><div>${esc(c.skill)}<span class="ev">Bằng chứng: ${esc(c.evidence_required).replace(/`([^`]+)`/g, "<code>$1</code>")}</span></div>
        <a class="lv lv${lv(c.id)}" href="progress.html#${esc(c.id)}" title="Xem / cập nhật">${LV[lv(c.id)]}</a></li>`).join("")}</ul>`;
    }
    for (const a of $$(".side a[data-mod]")) {
      const list = def.checkpoints.filter((c) => c.module === a.dataset.mod);
      if (!list.length) continue;
      const done = list.filter((c) => lv(c.id) >= 2).length;
      const avg = list.reduce((s, c) => s + lv(c.id), 0) / list.length;
      a.querySelector(".dot").className = "dot" + (avg >= 2.5 ? " p3" : avg >= 1.5 ? " p2" : avg > 0 ? " p1" : "");
      a.querySelector(".n").textContent = `${done}/${list.length}`;
    }
    const all = def.checkpoints, n = all.length, c = [0, 0, 0, 0]; all.forEach((x) => c[lv(x.id)]++);
    const mini = $("#miniProg");
    if (mini) mini.innerHTML = `<b>Tiến độ tổng</b> · ${c[2] + c[3]}/${n} đạt ②+
      <div class="bar"><span style="width:${(100 * c[3]) / n}%;background:var(--lv3)"></span><span style="width:${(100 * c[2]) / n}%;background:var(--lv2)"></span><span style="width:${(100 * c[1]) / n}%;background:var(--lv1)"></span></div>
      <a href="progress.html">Xem chi tiết →</a>`;
  }

  /* ---------------- coordinate frames viewer (three.js) */
  function coordViewer() {
    const box = $("#coordViewer"); if (!box) return;
    box.addEventListener("click", async function start() {
      box.removeEventListener("click", start);
      box.innerHTML = `<div class="start"><span>Đang tải three.js…</span></div>`;
      let T, OrbitControls;
      try { T = await import("three"); ({ OrbitControls } = await import("three/addons/controls/OrbitControls.js")); }
      catch (e) { box.innerHTML = `<div class="start"><span>Không tải được three.js (${esc(e.message)})</span></div>`; return; }
      const r = new T.WebGLRenderer({ antialias: true }); r.setPixelRatio(Math.min(2, devicePixelRatio));
      box.innerHTML = ""; box.appendChild(r.domElement);
      const scene = new T.Scene(); scene.background = new T.Color(0x0b0e12);
      const cam = new T.PerspectiveCamera(45, 2, 0.1, 100); cam.position.set(4, 5, 9);
      const ctl = new OrbitControls(cam, r.domElement); ctl.target.set(0, 0.6, 0); ctl.update();
      scene.add(new T.GridHelper(20, 20, 0x2c3440, 0x1a2029));
      const label = (text, color) => {
        const c = document.createElement("canvas"); c.width = 256; c.height = 64;
        const g = c.getContext("2d"); g.font = "bold 34px sans-serif"; g.fillStyle = color; g.textAlign = "center"; g.fillText(text, 128, 44);
        const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), depthTest: false })); s.scale.set(1.2, 0.3, 1); return s;
      };
      // world display axes: three.js X right, Y up, Z toward viewer. "forward" = -Z screen-ish; we map each convention explicitly.
      // Each frame is described by where its +x,+y,+z point in the DISPLAY world: F = forward, L = left, U = up, R = right, D = down.
      const DIR = { F: [0, 0, -1], B: [0, 0, 1], L: [-1, 0, 0], R: [1, 0, 0], U: [0, 1, 0], D: [0, -1, 0] };
      const frames = [
        { name: "CARLA / UE4 (tay trái)", at: [-4.5, 0, 0], axes: { x: "F", y: "R", z: "U" }, note: "x tới · y phải · z lên" },
        { name: "ROS REP-103 (tay phải)", at: [0, 0, 0], axes: { x: "F", y: "L", z: "U" }, note: "x tới · y trái · z lên" },
        { name: "Camera OpenCV", at: [4.5, 0.4, 0], axes: { x: "R", y: "D", z: "F" }, note: "z tới · x phải · y xuống" },
      ];
      const COL = { x: 0xf85149, y: 0x3fb950, z: 0x4c9aff };
      for (const f of frames) {
        const g = new T.Group(); g.position.set(...f.at);
        for (const k of ["x", "y", "z"]) {
          const d = new T.Vector3(...DIR[f.axes[k]]);
          g.add(new T.ArrowHelper(d, new T.Vector3(0, 0, 0), 1.8, COL[k], 0.35, 0.18));
          const l = label(k, "#" + COL[k].toString(16).padStart(6, "0")); l.position.copy(d.clone().multiplyScalar(2.15)); g.add(l);
        }
        const t = label(f.name, "#e6e9ee"); t.scale.set(3.6, 0.9, 1); t.position.set(0, 2.9, 0); g.add(t);
        const n = label(f.note, "#9aa4b1"); n.scale.set(3.2, 0.8, 1); n.position.set(0, 2.45, 0); g.add(n);
        scene.add(g);
      }
      const car = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1.2, 0.5, 2.4)), new T.LineBasicMaterial({ color: 0x57606a }));
      car.position.set(0, 0.25, 0.6); scene.add(car);
      const fwd = label("↑ hướng xe chạy (forward)", "#d29922"); fwd.scale.set(3.2, 0.8, 1); fwd.position.set(0, 0.05, -3.2); scene.add(fwd);
      const resize = () => { const w = box.clientWidth, h = box.clientHeight; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
      new ResizeObserver(resize).observe(box); resize();
      r.setAnimationLoop(() => { ctl.update(); r.render(scene, cam); });
    });
  }

  /* ---------------- raw code blocks: <pre data-lang="bash"><script type="text/plain">…</script></pre> (không cần escape HTML) */
  function dedent(t) {
    const lines = t.replace(/\t/g, "    ").split("\n");
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
    return lines.map((l) => l.slice(ind)).join("\n");
  }
  $$('pre > script[type="text/plain"]').forEach((s) => {
    const code = document.createElement("code");
    code.textContent = dedent(s.textContent);
    const lang = s.parentElement.dataset.lang;
    if (lang) s.parentElement.setAttribute("aria-label", lang);
    s.replaceWith(code);
  });

  /* ---------------- init */
  window.addCopyButtons?.();
  route();
  loadCheckpoints();
  coordViewer();
})();
