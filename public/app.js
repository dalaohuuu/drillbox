const $ = (id) => document.getElementById(id);

let token = localStorage.getItem("drill_token") || "";
let current = null;
let starred = false;

function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // JSON 请求默认加 Content-Type（multipart 不加）
  const isForm = opts.body instanceof FormData;
  if (!isForm && !headers["Content-Type"] && opts.method && opts.method !== "GET") {
    headers["Content-Type"] = "application/json";
  }

  return fetch(path, { ...opts, headers }).then(async (r) => {
    const ct = r.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await r.json() : { ok: false, error: await r.text() };
    return data;
  });
}

function setHidden(el, yes) {
  if (!el) return;
  el.classList.toggle("hidden", yes);
}

function toast(msg) {
  const fb = $("feedback");
  if (!fb) return;
  fb.textContent = msg;
  setHidden(fb, false);
  setTimeout(() => setHidden(fb, true), 2200);
}

function clearOptionStates() {
  const box = $("optionsBox");
  if (!box) return;
  [...box.querySelectorAll(".opt")].forEach((b) => {
    b.classList.remove("picked", "correct", "wrong");
    const tag = b.querySelector(".tag");
    if (tag) tag.remove();
  });
}

function showAnswerPanel() {
  if (!current) return;
  const answerBox = $("answerBox");
  const atv = $("answerTextView");
  const itv = $("analysisTextView");

  const answerText = current.hasAnswer ? current.answer : "（无标准答案，可自评）";
  const analysisText = current.analysis ? current.analysis : "（无解析）";

  if (answerBox && atv && itv) {
    atv.textContent = answerText;
    itv.textContent = analysisText;
    setHidden(answerBox, false);
  } else {
    alert(`参考答案：${answerText}\n\n解析：${analysisText}`);
  }
}

function hideAnswerPanel() {
  const answerBox = $("answerBox");
  if (answerBox) setHidden(answerBox, true);
}

function countBlanksInStem(stem) {
  const m = String(stem || "").match(/_{3,}/g);
  return m ? m.length : 0;
}

function renderBlankInputs(n) {
  const box = $("blankInputs");
  if (!box) return;
  box.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `第 ${i + 1} 空`;
    input.className = "blank";
    box.appendChild(input);
  }
}

function collectBlankInputs() {
  const box = $("blankInputs");
  if (!box) return "";
  const vals = [...box.querySelectorAll("input.blank")]
    .map((i) => (i.value || "").trim())
    .filter((v) => v.length > 0);
  return vals.join("；");
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

  typeSel.innerHTML =
    `<option value="">全部题型</option>` +
    res.types.map((t) => `<option value="${t.type}">${t.type} (${t.c})</option>`).join("");

  secSel.innerHTML =
    `<option value="">全部章节</option>` +
    res.sections.map((s) => `<option value="${s.section}">${s.section || "(空)"} (${s.c})</option>`).join("");
}

function renderQuestion(q) {
  current = q;
  starred = false;

  $("btnStar").textContent = "⭐ 易错";
  $("qmeta").textContent = `${q.section || "未分组"} · ${q.type} · ${q.id}`;
  $("stem").textContent = q.stem;

  if ($("answerText")) $("answerText").value = "";
  hideAnswerPanel();
  setHidden($("feedback"), true);

  const optionsBox = $("optionsBox");
  const inputBox = $("inputBox");
  const blankInputs = $("blankInputs");
  const textarea = $("answerText");

  if (optionsBox) optionsBox.innerHTML = "";
  setHidden(optionsBox, true);
  setHidden(inputBox, true);

  if (blankInputs) {
    blankInputs.innerHTML = "";
    setHidden(blankInputs, true);
  }
  if (textarea) setHidden(textarea, false);

  if (q.type === "判断") {
    setHidden(optionsBox, false);

    const makeBtn = (label, value) => {
      const btn = document.createElement("button");
      btn.className = "opt";
      btn.dataset.value = value;
      btn.textContent = label;
      btn.onclick = async () => {
        clearOptionStates();
        btn.classList.add("picked");
        await submitAndReveal(value);
      };
      return btn;
    };

    optionsBox.appendChild(makeBtn("1. 对", "true"));
    optionsBox.appendChild(makeBtn("2. 错", "false"));
    return;
  }

  if (q.type === "单选" || q.type === "多选") {
    setHidden(optionsBox, false);

    q.options.forEach((opt, idx) => {
      const btn = document.createElement("button");
      btn.className = "opt";
      btn.dataset.value = String.fromCharCode(65 + idx);
      btn.textContent = opt;

      if (q.type === "单选") {
        btn.onclick = async () => {
          clearOptionStates();
          btn.classList.add("picked");
          await submitAndReveal(btn.dataset.value);
        };
      } else {
        btn.onclick = () => {
          btn.classList.toggle("picked");
        };
      }
      optionsBox.appendChild(btn);
    });

    return;
  }

  // 填空/文字题
  setHidden(inputBox, false);

  const blanks = countBlanksInStem(q.stem);
  if (q.type === "填空" && blanks >= 2) {
    renderBlankInputs(blanks);
    setHidden(blankInputs, false);
    if (textarea) setHidden(textarea, true);
  } else if (q.type === "填空") {
    if (textarea) textarea.placeholder = "输入答案（填空题，支持用“；”分隔多空）";
  } else {
    if (textarea) textarea.placeholder = "输入答案（文字题/简答，可不填直接查看答案）";
  }
}

function collectAnswer() {
  const q = current;
  if (!q) return "";

  const box = $("optionsBox");

  if (q.type === "单选") {
    const picked = box?.querySelector(".opt.picked");
    return picked ? picked.dataset.value : "";
  }

  if (q.type === "多选") {
    const picked = [...(box?.querySelectorAll(".opt.picked") || [])].map((b) => b.dataset.value);
    return picked.join(",");
  }

  if (q.type === "判断") {
    const picked = box?.querySelector(".opt.picked");
    return picked ? picked.dataset.value : "";
  }

  const blankInputs = $("blankInputs");
  if (q.type === "填空" && blankInputs && !blankInputs.classList.contains("hidden")) {
    return collectBlankInputs();
  }

  return ($("answerText")?.value || "").trim();
}

function revealCorrectness() {
  const q = current;
  if (!q || !q.hasAnswer) return;

  const box = $("optionsBox");
  if (!box) return;

  const pickedButtons = [...box.querySelectorAll(".opt.picked")];

  if (q.type === "判断") {
    const ans = String(q.answer).trim().toLowerCase();
    const correctIsTrue = ans === "true" || ans === "对" || ans === "正确" || ans === "1";
    const correctValue = correctIsTrue ? "true" : "false";

    [...box.querySelectorAll(".opt")].forEach((b) => {
      if (b.dataset.value === correctValue) {
        b.classList.add("correct");
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "✅ 正确答案";
        b.appendChild(tag);
      }
    });

    pickedButtons.forEach((b) => {
      if (b.dataset.value !== correctValue) {
        b.classList.add("wrong");
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "❌ 你的选择";
        b.appendChild(tag);
      }
    });
    return;
  }

  if (q.type === "单选" || q.type === "多选") {
    const correctSet = new Set(
      String(q.answer)
        .toUpperCase()
        .split(/[,\s，；;]+/)
        .filter(Boolean)
    );

    [...box.querySelectorAll(".opt")].forEach((b) => {
      const v = String(b.dataset.value).toUpperCase();
      if (correctSet.has(v)) {
        b.classList.add("correct");
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "✅ 正确答案";
        b.appendChild(tag);
      }
    });

    pickedButtons.forEach((b) => {
      const v = String(b.dataset.value).toUpperCase();
      if (!correctSet.has(v)) {
        b.classList.add("wrong");
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "❌ 你的选择";
        b.appendChild(tag);
      }
    });
  }
}

async function submitAndReveal(answerTextOverride = null) {
  if (!current) return;

  const answerText = answerTextOverride ?? collectAnswer();
  if (!answerText) {
    toast("先选/填一个答案吧");
    return;
  }

  const res = await api("/api/attempts", {
    method: "POST",
    body: JSON.stringify({
      questionId: current.id,
      answerText,
      mode: $("mode")?.value || "normal"
    })
  });

  if (!res.ok) return;

  revealCorrectness();
  showAnswerPanel();
  await refreshStats();
}

async function submitAttempt() {
  if (!current) return;

  const answerText = collectAnswer();
  if (!answerText) {
    toast("先选/填一个答案吧");
    return;
  }

  if (current.hasAnswer) {
    await submitAndReveal(answerText);
    return;
  }

  const yes = confirm("这题无标准答案：你觉得自己答对了吗？\n确定=对；取消=错");
  await api("/api/attempts", {
    method: "POST",
    body: JSON.stringify({
      questionId: current.id,
      answerText,
      selfCorrect: yes,
      mode: $("mode")?.value || "normal"
    })
  });

  toast(yes ? "已记录：✅对" : "已记录：❌错（进入错题本）");
  showAnswerPanel();
  await refreshStats();
}

async function nextQuestion() {
  const mode = $("mode")?.value || "random";
  const type = $("type")?.value || "";
  const section = $("section")?.value || "";

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

function setLoggedInUI(isLoggedIn) {
  setHidden($("loginCard"), isLoggedIn);
  setHidden($("mainCard"), !isLoggedIn);
  setHidden($("btnLogout"), !isLoggedIn);
}

async function doLogin() {
  const passcode = ($("passcode")?.value || "").trim();
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

  setLoggedInUI(true);

  await loadMeta();
  await refreshStats();
  await nextQuestion();
}

async function doLogout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {}

  token = "";
  localStorage.removeItem("drill_token");

  $("statsPill").textContent = "—";
  if ($("passcode")) $("passcode").value = "";
  hideAnswerPanel();
  setHidden($("feedback"), true);

  setLoggedInUI(false);
}

/** ✅ 新增：上传 CSV 导入 */
async function doImportCsv() {
  const fileInput = $("csvFile");
  const out = $("importResult");
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    toast("先选择一个 CSV 文件");
    return;
  }

  const file = fileInput.files[0];
  const fd = new FormData();
  fd.append("file", file);

  setHidden(out, false);
  out.textContent = "上传中…";

  const res = await api("/api/import/csv", { method: "POST", body: fd });

  if (!res.ok) {
    out.textContent = `导入失败：${res.error || "unknown"}`;
    return;
  }

  const lines = [];
  lines.push(`文件：${res.filename}`);
  lines.push(`新增：${res.inserted}  跳过(重复ID)：${res.skipped}  失败：${res.failed}`);
  if (res.errors && res.errors.length) {
    lines.push("");
    lines.push("错误示例（最多20条）：");
    for (const e of res.errors) {
      lines.push(`- 第 ${e.row} 行：${e.error}`);
    }
  } else {
    lines.push("");
    lines.push("✅ 导入成功！");
  }

  out.textContent = lines.join("\n");

  // 刷新筛选下拉
  await loadMeta();
  await refreshStats();
}

if ($("btnLogin")) $("btnLogin").onclick = doLogin;
if ($("btnLogout")) $("btnLogout").onclick = doLogout;

if ($("btnNext")) $("btnNext").onclick = nextQuestion;
if ($("btnSubmit")) $("btnSubmit").onclick = submitAttempt;
if ($("btnShow")) $("btnShow").onclick = showAnswerPanel;
if ($("btnStar")) $("btnStar").onclick = toggleStar;

if ($("btnImport")) $("btnImport").onclick = doImportCsv;

if ($("mode")) $("mode").onchange = nextQuestion;
if ($("type")) $("type").onchange = nextQuestion;
if ($("section")) $("section").onchange = nextQuestion;

(async function boot() {
  if (!token) {
    setLoggedInUI(false);
    return;
  }

  const res = await api("/api/meta");
  if (res.ok) {
    setLoggedInUI(true);
    await loadMeta();
    await refreshStats();
    await nextQuestion();
  } else {
    localStorage.removeItem("drill_token");
    token = "";
    setLoggedInUI(false);
  }
})();
