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
  return fetch(path, { ...opts, headers }).then((r) => r.json());
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
  // 如果你还没在 index.html 加 answerBox，这里会自动降级为 alert
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
    // fallback
    alert(`参考答案：${answerText}\n\n解析：${analysisText}`);
  }
}

function hideAnswerPanel() {
  const answerBox = $("answerBox");
  if (answerBox) setHidden(answerBox, true);
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
    res.sections
      .map((s) => `<option value="${s.section}">${s.section || "(空)"} (${s.c})</option>`)
      .join("");
}

function renderQuestion(q) {
  current = q;
  starred = false;

  $("btnStar").textContent = "⭐ 易错";
  $("qmeta").textContent = `${q.section || "未分组"} · ${q.type} · ${q.id}`;
  $("stem").textContent = q.stem;

  // reset UI
  if ($("answerText")) $("answerText").value = "";
  hideAnswerPanel();
  setHidden($("feedback"), true);

  const optionsBox = $("optionsBox");
  const inputBox = $("inputBox");

  if (optionsBox) optionsBox.innerHTML = "";
  setHidden(optionsBox, true);
  setHidden(inputBox, true);

  // --- by type ---
  if (q.type === "判断") {
    // 两行：1.对 / 2.错
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
      btn.dataset.value = String.fromCharCode(65 + idx); // A/B/C...
      btn.textContent = opt;

      if (q.type === "单选") {
        // 单选：点击即提交
        btn.onclick = async () => {
          clearOptionStates();
          btn.classList.add("picked");
          await submitAndReveal(btn.dataset.value);
        };
      } else {
        // 多选：先勾选，再点“提交”
        btn.onclick = () => {
          btn.classList.toggle("picked");
        };
      }

      optionsBox.appendChild(btn);
    });

    return;
  }

  // 默认：填空/文字题
  setHidden(inputBox, false);
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

  return ($("answerText")?.value || "").trim();
}

function revealCorrectness(userAnswerText) {
  const q = current;
  if (!q) return;

  // 没有标准答案：不高亮，只展示答案区（会显示“无标准答案，可自评”）
  if (!q.hasAnswer) return;

  const box = $("optionsBox");
  if (!box) return;

  const pickedButtons = [...box.querySelectorAll(".opt.picked")];

  // 判断题：answer 为 true/false（字符串或布尔）
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

  // 单选/多选：answer 形如 "B" 或 "A,C,D"
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

    return;
  }

  // 填空/文字题：没有选项区高亮
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

  // 回答后：显示正确答案（高亮/标记）+ 展示答案区（含解析）
  revealCorrectness(answerText);
  showAnswerPanel();
  await refreshStats();
}

async function submitAttempt() {
  if (!current) return;

  // 单选/判断：已经点击即提交，这里主要给 多选 + 填空/文字题
  const answerText = collectAnswer();
  if (!answerText) {
    toast("先选/填一个答案吧");
    return;
  }

  // 有标准答案：直接提交并 reveal
  if (current.hasAnswer) {
    await submitAndReveal(answerText);
    return;
  }

  // 无标准答案：自评
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

function showAnswer() {
  // 填空/文字题：点按钮显示答案（不算作答）
  // 判断/选择题：你也可以允许点查看答案（不影响）
  showAnswerPanel();
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

  setHidden($("loginCard"), true);
  setHidden($("mainCard"), false);

  await loadMeta();
  await refreshStats();
  await nextQuestion();
}

// bind
if ($("btnLogin")) $("btnLogin").onclick = doLogin;
if ($("btnNext")) $("btnNext").onclick = nextQuestion;
if ($("btnSubmit")) $("btnSubmit").onclick = submitAttempt;
if ($("btnShow")) $("btnShow").onclick = showAnswer;
if ($("btnStar")) $("btnStar").onclick = toggleStar;
if ($("mode")) $("mode").onchange = nextQuestion;
if ($("type")) $("type").onchange = nextQuestion;
if ($("section")) $("section").onchange = nextQuestion;

// auto-login if token exists (session still valid)
(async function boot() {
  if (!token) return;
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
