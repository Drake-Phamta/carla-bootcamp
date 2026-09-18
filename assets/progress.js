/* progress.html — dashboard: checkpoints.json (định nghĩa) + progress.json (trạng thái của bạn) */
(function () {
  "use strict";
  const { esc, el } = window.Viewers;
  const DRAFT_KEY = "cb-progress-draft-v1";
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  const params = new URLSearchParams(location.search);
  let DEMO = params.get("demo") === "1";
  let DEF, PROG, draft = {};
  const $ = (s) => document.querySelector(s);

  /* ---------------------------------------------------------------- theme */
  const THEME_KEY = "cb-theme";
  const applyTheme = (t) => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };
  applyTheme(store.get(THEME_KEY));
  $("#btnTheme").addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const nxt = cur === "dark" ? "light" : "dark"; applyTheme(nxt); store.set(THEME_KEY, nxt);
  });

  /* ---------------------------------------------------------------- data */
  async function load() {
    try {
      const [d, p] = await Promise.all([
        fetch("data/checkpoints.json", { cache: "no-cache" }).then((r) => r.json()),
        fetch(DEMO ? "data/progress.demo.json" : "data/progress.json", { cache: "no-cache" }).then((r) => r.json()),
      ]);
      DEF = d; PROG = p;
    } catch (e) {
      $("#subtitle").innerHTML = `<span class="v-err">Không đọc được dữ liệu (${esc(e.message)}). Nếu bạn mở file trực tiếp (file://), hãy chạy <code>python -m http.server 8000</code> trong thư mục repo rồi mở <code>http://localhost:8000/progress.html</code>.</span>`;
      return false;
    }
    draft = DEMO ? {} : store.get(DRAFT_KEY) || {};
    return true;
  }
  const item = (id) => draft[id] || PROG.items?.[id] || { level: 0 };
  const lvOf = (id) => +item(id).level || 0;
  const modOf = (m) => DEF.modules.find((x) => x.id === m);
  const cps = () => DEF.checkpoints;

  /* ---------------------------------------------------------------- summary */
  function renderHeader() {
    const learner = PROG.learner ? ` · ${esc(PROG.learner)}` : "";
    $("#title").textContent = DEMO ? "Tiến độ học tập — dữ liệu mẫu" : "Tiến độ học tập";
    const all = cps(), done = all.filter((c) => lvOf(c.id) >= 2).length;
    const ok = all.filter((c) => item(c.id).mentor?.ok).length;
    $("#subtitle").innerHTML = `CARLA 0.9.16 (UE4) · Autoware · bắt đầu ${esc(fmtDate(PROG.started))}${learner} · <b>${done}/${all.length}</b> checkpoint đạt ② trở lên · <b>${ok}</b> mentor đã xác nhận${PROG.updated ? ` · cập nhật ${esc(fmtDate(PROG.updated))}` : ""}`;
    $("#demoBanner").hidden = !DEMO;
    $("#btnDemo").setAttribute("aria-pressed", DEMO ? "true" : "false");
    const n = Object.keys(draft).length;
    $("#draftBanner").hidden = DEMO || n === 0;
    $("#draftCount").textContent = n;
  }
  function renderTracks() {
    const box = $("#tracks"); box.innerHTML = "";
    for (const t of DEF.tracks) {
      const list = cps().filter((c) => modOf(c.module)?.track === t.id);
      const n = list.length || 1;
      const cnt = [0, 0, 0, 0]; list.forEach((c) => cnt[lvOf(c.id)]++);
      const score = Math.round((100 * list.reduce((a, c) => a + lvOf(c.id), 0)) / (3 * n));
      const req = list.filter((c) => c.required), reqDone = req.filter((c) => lvOf(c.id) >= 2).length;
      const ok = list.filter((c) => item(c.id).mentor?.ok).length;
      const card = el("div", { class: "card track" });
      card.innerHTML = `<h3>${esc(t.name)}</h3><div class="desc">${esc(t.desc)}</div>
        <div class="pct">${score}<small>%</small></div>
        <div class="bar" title="① ${cnt[1]} · ② ${cnt[2]} · ③ ${cnt[3]} / ${list.length}">
          <span class="b3" style="width:${(100 * cnt[3]) / n}%"></span><span class="b2" style="width:${(100 * cnt[2]) / n}%"></span><span class="b1" style="width:${(100 * cnt[1]) / n}%"></span></div>
        <div class="counts"><span>① <b>${cnt[1]}</b></span><span>② <b>${cnt[2]}</b></span><span>③ <b>${cnt[3]}</b></span><span>bắt buộc <b>${reqDone}/${req.length}</b></span><span>✔ <b>${ok}</b></span></div>`;
      box.appendChild(card);
    }
  }
  function renderGrid() {
    const g = $("#skillGrid"); g.innerHTML = "";
    for (const m of DEF.modules) {
      const list = cps().filter((c) => c.module === m.id);
      if (!list.length) continue;
      const track = DEF.tracks.find((t) => t.id === m.track);
      g.appendChild(el("div", { class: "mname", title: m.name }, `${esc(m.name)} <small>· ${esc(track?.id || "")}</small>`));
      const cells = el("div", { class: "cells" });
      for (const c of list) {
        const lv = lvOf(c.id), it = item(c.id);
        const b = el("button", { class: `cell c${lv}${c.required ? " req" : ""}${it.mentor?.ok ? " mok" : ""}`, title: `${c.id} — ${c.skill}\nCấp: ${DEF.levels[lv].name}${c.required ? "\n(bắt buộc)" : ""}` }, esc(c.id.split("-")[1]));
        b.addEventListener("click", () => focusCard(c.id));
        cells.appendChild(b);
      }
      g.appendChild(cells);
    }
    if (!$("#gridPanel .grid-note")) $("#gridPanel").appendChild(el("div", { class: "grid-note" }, "Chấm đỏ = checkpoint bắt buộc · viền xanh = mentor đã xác nhận · màu ô = cấp độ hiện tại."));
  }
  function fmtDate(s) { if (!s) return ""; const [y, m, d] = s.split("-"); return d ? `${d}/${m}/${y}` : s; }
  function renderTimeline() {
    const box = $("#timeline"); box.innerHTML = "";
    const byDate = {};
    for (const c of cps()) { const it = item(c.id); if (lvOf(c.id) > 0 && it.date) (byDate[it.date] ||= []).push(c); }
    const dates = Object.keys(byDate).sort();
    if (!dates.length) { box.appendChild(el("div", { class: "tl-empty" }, "Chưa có checkpoint nào có ngày đạt. Bấm “Cập nhật” trên một thẻ để ghi tiến độ đầu tiên.")); return; }
    const start = PROG.started ? new Date(PROG.started) : new Date(dates[0]);
    for (const d of dates) {
      const n = Math.round((new Date(d) - start) / 864e5);
      const col = el("div", { class: "tl-day" });
      col.innerHTML = `<h4>Ngày ${n} · ${esc(fmtDate(d))}</h4>`;
      const chips = el("div", { class: "chips" });
      for (const c of byDate[d]) {
        const b = el("button", { class: `lv lv${lvOf(c.id)}`, style: "border:0;cursor:pointer", title: c.skill }, esc(c.id));
        b.addEventListener("click", () => focusCard(c.id));
        chips.appendChild(b);
      }
      col.appendChild(chips); box.appendChild(col);
    }
  }

  /* ---------------------------------------------------------------- cards */
  function renderCards() {
    const q = $("#q").value.trim().toLowerCase(), ft = $("#fTrack").value, fl = $("#fLevel").value;
    const box = $("#cards"); box.innerHTML = "";
    let shown = 0;
    for (const c of cps()) {
      const m = modOf(c.module), it = item(c.id), lv = lvOf(c.id);
      if (ft && m?.track !== ft) continue;
      if (fl === "ev" && !(it.evidence || []).length) continue;
      if (fl === "req" && !(c.required && lv < 2)) continue;
      if (/^\d$/.test(fl) && lv !== +fl) continue;
      if (q && !(c.id.toLowerCase().includes(q) || c.skill.toLowerCase().includes(q) || (m?.name || "").toLowerCase().includes(q))) continue;
      box.appendChild(card(c, m, it, lv)); shown++;
    }
    $("#countNote").textContent = `${shown} / ${cps().length} checkpoint`;
    window.addCopyButtons?.(box);
  }
  function card(c, m, it, lv) {
    const d = el("article", { class: `card cp lvl${lv}`, id: c.id });
    const evs = it.evidence || [];
    d.innerHTML = `
      <div class="cp-head">
        <span class="cp-id">${esc(c.id)}</span>
        <span class="cp-mod">${esc(m?.name || "")} · Ngày ${c.day}</span>
        ${c.required ? '<span class="chip req">bắt buộc</span>' : '<span class="chip deep">đào sâu</span>'}
        <span class="spacer"></span>
        ${it.mentor?.ok ? `<span class="mentor-ok" title="${esc(it.mentor.comment || "")}">✔ ${esc(it.mentor.by || "Mentor")}</span>` : ""}
        <span class="lv lv${lv}">${esc(DEF.levels[lv].name)}</span>
      </div>
      <div class="cp-skill">${esc(c.skill)}</div>`;
    const media = el("div", { class: "cp-media" });
    if (evs.length) {
      const tabs = el("div", { class: "ev-tabs" }), body = el("div", { class: "ev-body" }), cap = el("div", { class: "ev-cap" });
      const show = (i) => {
        body.innerHTML = ""; window.Viewers.render(evs[i], body);
        cap.textContent = evs[i].caption || "";
        tabs.querySelectorAll("button").forEach((b, k) => b.setAttribute("aria-pressed", k === i ? "true" : "false"));
      };
      if (evs.length > 1) evs.forEach((e, i) => { const b = el("button", { class: "btn small" }, esc(e.caption ? `${window.Viewers.names[e.type] || e.type}: ${e.caption}` : window.Viewers.names[e.type] || e.type)); b.addEventListener("click", () => show(i)); tabs.appendChild(b); });
      media.append(tabs, body, cap);
      // render ngay (để In/PDF có đủ hình); viewer 3D tự chờ người dùng bấm mới tải
      queueMicrotask(() => show(0));
    } else {
      media.appendChild(el("div", { class: "cp-empty" }, `<span class="icon">▢</span><div><b>Chưa có bằng chứng.</b> Cần: ${fmtInline(c.evidence_required)}<br><span class="muted">Loại: ${c.evidence_types.map((t) => window.Viewers.names[t] || t).join(", ")}</span></div>`));
    }
    d.appendChild(media);
    const b = el("div", { class: "cp-body" });
    b.innerHTML = `
      <div class="look"><span class="k">Nhìn vào đâu để đánh giá</span>${fmtInline(c.look_for)}</div>
      ${it.notes ? `<div class="notes"><span class="k">Đã vướng gì / sửa thế nào</span>${esc(it.notes)}</div>` : ""}
      ${evs.length ? `<div class="row"><span class="k">Bằng chứng yêu cầu</span>${fmtInline(c.evidence_required)}</div>` : ""}
      <details><summary>Câu hỏi kiểm tra (${c.quiz.length})</summary>${c.quiz.map((x) => `<p><b>H:</b> ${fmtInline(x.q)}</p><details><summary>Xem đáp án</summary><p>${fmtInline(x.a)}</p></details>`).join("")}</details>
      ${it.date ? `<div class="row muted" style="font-size:.78rem">Đạt ngày ${esc(fmtDate(it.date))}${it.mentor?.comment ? ` · Mentor: “${esc(it.mentor.comment)}”` : ""}</div>` : ""}`;
    d.appendChild(b);
    const f = el("div", { class: "cp-foot" });
    const lesson = m?.lesson ? el("a", { class: "btn small", href: `index.html#${m.lesson}` }, "📖 Bài học") : null;
    const edit = el("button", { class: "btn small" }, "✎ Cập nhật");
    edit.addEventListener("click", () => openEdit(c));
    if (DEMO) edit.disabled = true, edit.title = "Tắt chế độ mẫu để cập nhật tiến độ thật";
    if (lesson) f.appendChild(lesson);
    f.appendChild(edit);
    d.appendChild(f);
    return d;
  }
  function fmtInline(s) { return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>"); }
  function focusCard(id) {
    let n = document.getElementById(id);
    if (!n) { $("#q").value = ""; $("#fTrack").value = ""; $("#fLevel").value = ""; renderCards(); n = document.getElementById(id); }
    if (!n) return;
    n.scrollIntoView({ behavior: "smooth", block: "start" });
    n.classList.remove("flash"); void n.offsetWidth; n.classList.add("flash");
    history.replaceState(null, "", "#" + id);
  }

  /* ---------------------------------------------------------------- edit dialog */
  const TEMPLATES = {
    image: { type: "image", src: "evidence/ID/anh.jpg", caption: "" },
    video: { type: "video", src: "evidence/ID/video.mp4", poster: "", caption: "" },
    "image-compare": { type: "image-compare", before: "evidence/ID/a.jpg", after: "evidence/ID/b.jpg", labels: ["A", "B"], caption: "" },
    "bbox-overlay": { type: "bbox-overlay", image: "evidence/ID/000123.jpg", boxes: "evidence/ID/000123.json", caption: "" },
    pointcloud: { type: "pointcloud", src: ["evidence/ID/a.ply"], labels: ["LiDAR"], frame: "carla", caption: "" },
    "sensor-layout": { type: "sensor-layout", src: "evidence/ID/layouts.json", caption: "" },
    map: { type: "map", src: "evidence/ID/trace.geojson", caption: "" },
    trajectory: { type: "trajectory", src: "evidence/ID/traj.csv", caption: "cột: t,x_ref,y_ref,x_sim,y_sim" },
    chart: { type: "chart", src: "evidence/ID/data.csv", kind: "line", x: "frame", y: ["value"], yLabel: "", caption: "" },
    log: { type: "log", src: "evidence/ID/log.txt", caption: "" },
    code: { type: "code", src: "evidence/ID/Dockerfile", lang: "dockerfile", caption: "" },
    link: { type: "link", href: "https://github.com/...", text: "commit" },
  };
  let editing = null;
  function evRow(ev, id) {
    const r = el("div", { class: "ev-row" });
    const sel = el("select", {}, Object.keys(TEMPLATES).map((t) => `<option value="${t}">${esc(window.Viewers.names[t] || t)}</option>`).join(""));
    sel.value = ev.type;
    const ta = el("textarea", { spellcheck: "false" }); ta.value = JSON.stringify(ev, null, 1);
    const rm = el("button", { class: "btn small", type: "button", title: "Xóa" }, "✕");
    sel.addEventListener("change", () => { ta.value = JSON.stringify(JSON.parse(JSON.stringify(TEMPLATES[sel.value]).replaceAll("/ID/", `/${id}/`)), null, 1); });
    rm.addEventListener("click", () => r.remove());
    r.append(sel, ta, rm); return r;
  }
  function openEdit(c) {
    editing = c;
    const it = item(c.id);
    $("#editTitle").textContent = `Cập nhật ${c.id}`;
    $("#editSkill").textContent = c.skill;
    $("#lvPick").innerHTML = DEF.levels.map((l) => `<label title="${esc(l.desc)}"><input type="radio" name="lv" value="${l.lv}" ${lvOf(c.id) === l.lv ? "checked" : ""}><span class="lv lv${l.lv}">${esc(l.name)}</span></label>`).join("");
    $("#eDate").value = it.date || new Date().toISOString().slice(0, 10);
    $("#eNotes").value = it.notes || "";
    const list = $("#evList"); list.innerHTML = "";
    (it.evidence || []).forEach((e) => list.appendChild(evRow(e, c.id)));
    $("#mOk").checked = !!it.mentor?.ok; $("#mBy").value = it.mentor?.by || PROG.mentor || ""; $("#mComment").value = it.mentor?.comment || "";
    $("#editDlg").showModal();
  }
  $("#evAdd").addEventListener("click", () => {
    const t = editing?.evidence_types?.[0] || "image";
    $("#evList").appendChild(evRow(JSON.parse(JSON.stringify(TEMPLATES[t] || TEMPLATES.image).replaceAll("/ID/", `/${editing.id}/`)), editing.id));
  });
  $("#editDlg").addEventListener("close", () => {
    if ($("#editDlg").returnValue !== "save" || !editing) return;
    const evidence = [];
    for (const ta of $("#evList").querySelectorAll("textarea")) {
      try { evidence.push(JSON.parse(ta.value)); } catch { alert("Một bằng chứng có JSON không hợp lệ — đã bỏ qua dòng đó."); }
    }
    const lv = +(document.querySelector('input[name="lv"]:checked')?.value || 0);
    const it = { level: lv, date: lv ? $("#eDate").value : "", notes: $("#eNotes").value.trim(), evidence };
    if ($("#mOk").checked || $("#mComment").value.trim()) it.mentor = { ok: $("#mOk").checked, by: $("#mBy").value.trim(), date: new Date().toISOString().slice(0, 10), comment: $("#mComment").value.trim() };
    draft[editing.id] = it; store.set(DRAFT_KEY, draft);
    renderAll(); focusCard(editing.id);
  });
  $("#btnDownload").addEventListener("click", () => {
    const out = { ...PROG, updated: new Date().toISOString().slice(0, 10), items: { ...(PROG.items || {}), ...draft } };
    for (const [k, v] of Object.entries(out.items)) if (!v.level && !(v.evidence || []).length && !v.notes) delete out.items[k];
    const blob = new Blob([JSON.stringify(out, null, 2) + "\n"], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: "progress.json" }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => alert("Đã tải progress.json.\n\n1) Chép đè vào data/progress.json trong repo\n2) git add data/progress.json evidence/\n3) git commit -m \"progress: ...\" && git push\n4) Sau khi thấy trang cập nhật, bấm “Bỏ thay đổi” để xóa bản nháp trong trình duyệt."), 50);
  });
  $("#btnDiscard").addEventListener("click", () => { if (confirm("Xóa các thay đổi chưa commit trong trình duyệt này?")) { draft = {}; store.del(DRAFT_KEY); renderAll(); } });

  /* ---------------------------------------------------------------- toolbar */
  $("#btnPresent").addEventListener("click", (e) => {
    const on = document.body.classList.toggle("present");
    e.currentTarget.setAttribute("aria-pressed", on ? "true" : "false");
  });
  $("#btnPrint").addEventListener("click", () => window.print());
  const setDemo = async (on) => {
    DEMO = on; const u = new URL(location.href);
    on ? u.searchParams.set("demo", "1") : u.searchParams.delete("demo");
    history.replaceState(null, "", u);
    if (await load()) renderAll();
  };
  $("#btnDemo").addEventListener("click", () => setDemo(!DEMO));
  $("#btnDemoOff").addEventListener("click", () => setDemo(false));
  ["#q", "#fTrack", "#fLevel"].forEach((s) => $(s).addEventListener("input", renderCards));

  function renderAll() {
    renderHeader(); renderTracks(); renderGrid(); renderTimeline(); renderCards();
  }
  (async () => {
    if (!(await load())) return;
    const ft = $("#fTrack");
    DEF.tracks.forEach((t) => ft.appendChild(el("option", { value: t.id }, esc(t.name))));
    // link lọc sẵn để gửi mentor, vd. progress.html?level=ev&track=T1
    if (params.get("track")) ft.value = params.get("track");
    if (params.get("level")) $("#fLevel").value = params.get("level");
    if (params.get("q")) $("#q").value = params.get("q");
    if (params.get("present") === "1") $("#btnPresent").click();
    renderAll();
    if (location.hash.length > 1) setTimeout(() => focusCard(decodeURIComponent(location.hash.slice(1))), 200);
  })();
})();
