const $ = (id) => document.getElementById(id);

let token = localStorage.getItem("drill_token") || "";
let current = null;
let starred = false;

function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!headers["Content-Type"] && opts.method && opts.method !== "GET") {
    headers["Content-Type"] = "application/json";
  }
  return fetch(path, { ...opts, headers }).then(r => r.json());
}

function setHidden(el, yes) {
  el.classList.toggle("hidden", yes);
}

function toast(msg) {
  const fb = $("feedback");
  fb.textContent = msg;
  setHidden(fb, false);
  setTimeout(() => setHidden(fb, true), 2200);
}

async function refreshStats() {
  const res = await api("/api/stats");
  if (!res.ok) return;
  const { done, correct } = res.last50;
  $("statsPill").textContent = `最近50题：${correct}/${done} | 错题:${res.wrongCount} | ⭐:${res.starredCount}`;
}

async function loadMeta() {
  const res = await api("/api/meta");
  if (!res.ok) return;

  const typeSel = $("type");
  const secSel = $("section");

  typeSel.innerHTML = `<option value="">全部题型</option>` + res.types.map(t => `<option value="${t.type}">${t.type} (${t.c})</option>`).join("");
  secSel.innerHTML = `<option value="">全部章节</option>` + res.sections.map(s => `<option value="${s.section}">${s.section || "(空)"} (${s.c})</option>`).join("");
}

function renderQuestion(q) {
  current = q;
  starred = false;
  $("btnStar").textContent = "⭐ 易错";
  $("qmeta").textContent = `${q.section || "未分组"} · ${q.type} · ${q.id}`;
  $("stem").textContent = q.stem;

  // reset
  $("answerText").value = "";
  setHidden($("optionsBox"), true);
  setHidden($("inputBox"), true);
  setHidden($("feedback"), true);

  // render by type
  if (q.type === "单选" || q.type === "多选") {
    const box = $("optionsBox");
    box.innerHTML = "";
    q.options.forEach((opt, idx) => {
      const btn = document.createElement("button");
      btn.className = "opt";
      btn.dataset.value = String.fromCharCode(65 + idx); // A/B/C...
      btn.textContent = opt;
      btn.onclick = () => {
        if (q.type === "单选") {
          [...box.querySelectorAll(".opt")].forEach(b => b.classList.remove("picked"));
          btn.classList.add("picked");
        } else {
          btn.classList.toggle("picked");
        }
      };
      box.appendChild(btn);
    });
    setHidden(box, false);
  } else if (q.type === "判断") {
    const box = $("optionsBox");
    box.innerHTML = "";
    const t = document.createElement("button");
    t.className = "opt";
    t.textContent = "✅ 对";
    t.dataset.value = "true";
    t.onclick = () => {
      [...box.querySelectorAll(".opt")].forEach(b => b.classList.remove("picked"));
      t.classList.add("picked");
    };
    const f = document.createElement("button");
    f.className = "opt";
    f.textContent = "❌ 错";
    f.dataset.value = "false";
    f.onclick = () => {
      [...box.querySelectorAll(".opt")].forEach(b => b.classList.remove("picked"));
      f.classList.add("picked");
    };
    box.append(t, f);
    setHidden(box, false);
  } else {
    setHidden($("inputBox"), false);
  }
}

function collectAnswer() {
  const q = current;
  if (!q) return "";

  if (q.type === "单选") {
    const picked = $("optionsBox").querySelector(".opt.picked");
    return picked ? picked.dataset.value : "";
  }
  if (q.type === "多选") {
    const picked = [...$("optionsBox").querySelectorAll(".opt.picked")].map(b => b.dataset.value);
    return picked.join(",");
  }
  if (q.type === "判断") {
    const picked = $("optionsBox").querySelector(".opt.picked");
    return picked ? picked.dataset.value : "";
  }
  return $("answerText").value.trim();
}

async function nextQuestion() {
  const mode = $("mode").value;
  const type = $("type").value;
  const section = $("section").value;

  const qs = new URLSearchParams();
  qs.set("mode", mode);
  if (type) qs.set("type", type);
  if (section) qs.set("section", section);

  const res = await api(`/api/questions/next?${qs.toString()}`);
  if (!res.ok) return;

  if (!res.question) {
    toast("没有题目了（或该模式下为空）");
    return;
  }
  renderQuestion(res.question);
  await refreshStats();
}

async function submitAttempt() {
  if (!current) return;

  const answerText = collectAnswer();
  if (!answerText) {
    toast("先选/填一个答案吧");
    return;
  }

  const res = await api("/api/attempts", {
    method: "POST",
    body: JSON.stringify({
      questionId: current.id,
      answerText,
      mode: $("mode").value
    })
  });

  if (!res.ok) return;

  if (res.isCorrect === null) {
    // 自评
    const yes = confirm("这题无标准答案：你觉得自己答对了吗？\n确定=对；取消=错");
    await api("/api/attempts", {
      method: "POST",
      body: JSON.stringify({
        questionId: current.id,
        answerText,
        selfCorrect: yes,
        mode: $("mode").value
      })
    });
    toast(yes ? "已记录：✅对" : "已记录：❌错（进入错题本）");
  } else {
    toast(res.isCorrect ? "✅ 正确" : "❌ 错误（进入错题本）");
  }

  await refreshStats();
}

function showAnswer() {
  if (!current) return;
  const parts = [];
  if (current.hasAnswer) parts.push(`参考答案：${current.answer}`);
  if (current.analysis) parts.push(`解析：${current.analysis}`);
  if (!parts.length) parts.push("无参考答案/解析（可自评）");
  alert(parts.join("\n\n"));
}

async function toggleStar() {
  if (!current) return;
  starred = !starred;
  $("btnStar").textContent = starred ? "⭐ 已标记" : "⭐ 易错";

  await api("/api/marks", {
    method: "POST",
    body: JSON.stringify({
      questionId: current.id,
      markType: "starred",
      enabled: starred
    })
  });

  await refreshStats();
}

async function doLogin() {
  const passcode = $("passcode").value.trim();
  const res = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ passcode })
  });

  if (!res.ok) {
    toast("口令不对");
    return;
  }

  token = res.token;
  localStorage.setItem("drill_token", token);

  setHidden($("loginCard"), true);
  setHidden($("mainCard"), false);

  await loadMeta();
  await refreshStats();
  await nextQuestion();
}

// bind
$("btnLogin").onclick = doLogin;
$("btnNext").onclick = nextQuestion;
$("btnSubmit").onclick = submitAttempt;
$("btnShow").onclick = showAnswer;
$("btnStar").onclick = toggleStar;
$("mode").onchange = nextQuestion;
$("type").onchange = nextQuestion;
$("section").onchange = nextQuestion;

// auto-login if token exists (session still valid)
(async function boot() {
  if (!token) return;
  // 试探一下 token 是否有效
  const res = await api("/api/meta");
  if (res.ok) {
    setHidden($("loginCard"), true);
    setHidden($("mainCard"), false);
    await loadMeta();
    await refreshStats();
    await nextQuestion();
  } else {
    localStorage.removeItem("drill_token");
    token = "";
  }
})();
