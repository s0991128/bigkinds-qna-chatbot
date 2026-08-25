(function () {
  "use strict";

  const config = window.BIGKINDS_CHATBOT_CONFIG || {};
  const kb = window.BIGKINDS_KNOWLEDGE_BASE || { documents: [], synonyms: {} };
  const root = document.getElementById("bigkinds-chatbot-root") || document.body;
  const conversation = [];
  let busy = false;

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[ch]);

  const answerText = (value) => esc(String(value ?? "").replace(/¶/g, "\n"));

  const pageSuggestions = () => {
    const context = document.body?.dataset?.bkContext;
    return config.contextSuggestions?.[context] || config.suggestions || [];
  };

  const normalize = (value) =>
    String(value)
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[^0-9a-z가-힣\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const tokens = (value) => normalize(value).split(" ").filter((token) => token.length > 1);

  const expand = (value) => {
    let text = normalize(value);
    for (const [key, values] of Object.entries(kb.synonyms || {})) {
      const list = [key, ...(values || [])].map(normalize);
      if (list.some((word) => word && text.includes(word))) {
        text += " " + list.join(" ");
      }
    }
    return text;
  };

  const hasSensitive = (value) => {
    const text = normalize(value);
    const blocked = config.privacy?.blockedPatterns || [];
    if (blocked.some((pattern) => text.includes(normalize(pattern)))) return true;
    return /\b\d{6}[- ]?[1-4]\d{6}\b/.test(String(value));
  };

  function scoreDocument(question, doc) {
    const q = expand(question);
    const questionTokens = new Set(tokens(question));
    const title = normalize(`${doc.title} ${doc.category}`);
    const keywords = (doc.keywords || []).map(normalize);
    let score = 0;

    for (const keyword of keywords) {
      if (keyword && q.includes(keyword)) {
        score += keyword.length > 4 ? 0.16 : 0.1;
      }
    }

    for (const token of tokens(title)) {
      if (questionTokens.has(token)) score += 0.08;
    }

    for (const example of doc.questions || []) {
      const exampleTokens = tokens(example);
      const overlap =
        exampleTokens.filter((token) => questionTokens.has(token)).length /
        Math.max(exampleTokens.length, 1);
      score = Math.max(score, overlap * 0.9);
    }

    if (normalize(question).includes("api") && !keywords.some((keyword) => keyword.includes("api"))) {
      score *= 0.55;
    }

    return Math.min(score, 1);
  }

  function search(question) {
    return kb.documents
      .map((doc) => ({ doc, score: scoreDocument(question, doc) }))
      .sort((a, b) => b.score - a.score);
  }

  function shouldEscalate(question, result) {
    const doc = result?.doc;
    if (!doc) return true;
    const tagMatch = (doc.escalationTags || []).some((tag) =>
      normalize(question).includes(normalize(tag))
    );
    return (
      Boolean(doc.alwaysEscalate) ||
      Boolean(doc.requiresReview) ||
      tagMatch ||
      result.score < (config.search?.escalationConfidence ?? 0.13)
    );
  }

  function sourceHtml(doc) {
    if (!doc) return "";
    const label = esc(doc.source?.label || doc.title);
    const source = doc.source?.url
      ? `<a href="${esc(doc.source.url)}" target="_blank" rel="noopener">${label}</a>`
      : label;
    const pages = doc.source?.pages ? ` · ${esc(doc.source.pages)}` : "";
    return `<div class="bk-meta">근거 · ${source}${pages}<br>기준일 · ${esc(
      doc.effectiveDate || kb.updatedAt
    )}${doc.requiresReview ? " · <strong>검토 필요</strong>" : ""}</div>`;
  }

  function answerFromKb(question) {
    const results = search(question);
    const top = results[0];

    if (hasSensitive(question)) {
      const safe = kb.documents.find((doc) => doc.id === "privacy-security");
      return {
        html: `<strong>${esc(safe?.title || "민감 정보 입력 주의")}</strong><br>${answerText(
          safe?.answer || config.privacy.warning
        )}${sourceHtml(safe)}`,
        escalate: true,
        category: "개인정보·보안",
        confidence: 1,
        doc: safe
      };
    }

    if (!top || top.score < (config.search?.minConfidence ?? 0.2)) {
      return {
        html: "공식 자료에서 바로 확인되는 답을 찾지 못했습니다. 질문을 조금 더 구체적으로 적어 주시거나 담당자 안내가 필요합니다.",
        escalate: true,
        category: "기타",
        confidence: top?.score || 0
      };
    }

    const doc = top.doc;
    const steps = (doc.steps || []).length
      ? `<ol class="bk-steps">${doc.steps.map((item) => `<li>${esc(item)}</li>`).join("")}</ol>`
      : "";
    const facts = (doc.facts || []).length
      ? `<ul class="bk-steps">${doc.facts.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
      : "";

    return {
      html: `<strong>${esc(doc.title)}</strong><br>${answerText(doc.answer)}${facts}${steps}${sourceHtml(doc)}`,
      escalate: shouldEscalate(question, top),
      category: doc.category,
      confidence: top.score,
      doc
    };
  }

  async function answerWithAi(question, retrieved) {
    if (!config.ai?.enabled || !config.ai.proxyEndpoint) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs || 12000);

    try {
      const response = await fetch(config.ai.proxyEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          history: conversation.slice(-6),
          sources: retrieved.slice(0, 3).map((item) => ({
            id: item.doc.id,
            title: item.doc.title,
            answer: item.doc.answer,
            effectiveDate: item.doc.effectiveDate,
            score: item.score
          }))
        }),
        signal: controller.signal
      });

      if (!response.ok) return null;
      return await response.json();
    } catch (_error) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function addMessage(role, html, extra = "") {
    const box = root.querySelector(".bk-messages");
    const row = document.createElement("div");
    row.className = `bk-row ${role}`;
    row.innerHTML = `<div class="bk-bubble">${html}${extra}</div>`;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
    return row;
  }

  function feedbackHtml(docId) {
    return `<div class="bk-feedback"><span>도움이 되었나요?</span><button type="button" data-feedback="helpful" data-doc-id="${esc(
      docId || "unknown"
    )}">예</button><button type="button" data-feedback="unhelpful" data-doc-id="${esc(
      docId || "unknown"
    )}">아니요</button></div>`;
  }

  function escalationHtml(question, category) {
    const item = config.escalation || {};
    const payload = `질문 유형: ${category}\n질문: ${question}\n작성 시각: ${new Date().toLocaleString(
      "ko-KR"
    )}`;
    const purchase = item.purchaseRequestUrl
      ? `<a class="bk-action" href="${esc(item.purchaseRequestUrl)}" target="_blank" rel="noopener">${esc(
          item.purchaseRequestLabel || "구매 요청"
        )}</a>`
      : "";
    const contact = item.contactUrl
      ? `<a class="bk-action" href="${esc(item.contactUrl)}" target="_blank" rel="noopener">${esc(
          item.contactLabel || "문의하기"
        )}</a>`
      : "";
    const phone = item.phone
      ? `<div class="bk-contact">전화 · ${esc(item.phone)} · ${esc(item.businessHours || "")}</div>`
      : "";

    return `<div class="bk-escalate"><strong>${esc(item.label || "담당자 이관")}</strong><br>${esc(
      item.message || ""
    )}${phone}<div class="bk-actions"><button class="bk-action" type="button" data-copy="${esc(
      payload
    )}">문의 정보 복사</button>${contact}${purchase}</div></div>`;
  }

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent("bigkinds-chatbot", { detail: { name, ...detail } }));
  }

  async function send(raw) {
    const question = String(raw || "").trim();
    if (!question || busy) return;
    busy = true;

    addMessage("user", esc(question));
    conversation.push({ role: "user", content: question });

    const typing = addMessage("assistant", '<span class="bk-typing"><i></i><i></i><i></i></span>');
    const found = search(question);
    const fallback = answerFromKb(question);
    const ai = await answerWithAi(question, found);
    typing.remove();

    const html = ai?.answer ? `${esc(ai.answer)}${sourceHtml(fallback.doc)}` : fallback.html;
    const escalate = ai?.escalate ?? fallback.escalate;

    addMessage(
      "assistant",
      html,
      (escalate && config.escalation?.enabled ? escalationHtml(question, ai?.category || fallback.category) : "") +
        feedbackHtml(fallback.doc?.id)
    );

    conversation.push({
      role: "assistant",
      content: ai?.answer || fallback.doc?.answer || "답변 완료"
    });

    emit("answer", {
      documentId: fallback.doc?.id || null,
      category: fallback.category,
      confidence: fallback.confidence,
      escalated: escalate,
      usedAi: Boolean(ai)
    });
    busy = false;
  }

  function mount() {
    root.style.setProperty("--bk-primary", config.theme?.primary || "#2457d6");
    root.style.setProperty("--bk-accent", config.theme?.accent || "#18a77b");

    root.innerHTML = `
      <button class="bk-launcher" type="button" aria-label="${esc(config.launcherLabel || config.serviceName)} 열기" aria-expanded="false" aria-controls="bigkinds-chatbot-panel">
        <span class="bk-launcher-label">${esc(config.launcherLabel || "빅카인즈 이용안내")}</span>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 5.8A2.8 2.8 0 0 1 7.8 3h8.4A2.8 2.8 0 0 1 19 5.8v5.4a2.8 2.8 0 0 1-2.8 2.8h-5.7L6 18v-4.2a2.8 2.8 0 0 1-1-2.1V5.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
          <path d="M8.5 8.5h7M8.5 11h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
        </svg>
      </button>
      <section class="bk-panel" id="bigkinds-chatbot-panel" role="dialog" aria-label="${esc(config.serviceName)}" hidden>
        <header class="bk-chat-head">
          <span class="bk-avatar">B</span>
          <span class="bk-head-copy">
            <strong>${esc(config.assistantName)}</strong>
            <span>공식 자료 검색형 안내</span>
          </span>
          <button class="bk-close" type="button" aria-label="챗봇 닫기">×</button>
        </header>
        <div class="bk-notice">${esc(config.notice || "")}</div>
        <div class="bk-messages" aria-live="polite"></div>
        <div class="bk-chips">
          ${pageSuggestions()
            .map((question) => `<button class="bk-chip" type="button" data-question="${esc(question)}">${esc(question)}</button>`)
            .join("")}
        </div>
        <form class="bk-compose">
          <p class="bk-privacy">${esc(config.privacy?.warning || "")}</p>
          <div class="bk-input-row">
            <textarea class="bk-input" rows="1" maxlength="500" placeholder="질문을 입력하세요" aria-label="질문"></textarea>
            <button class="bk-send" type="submit" aria-label="질문 보내기">전송</button>
          </div>
        </form>
      </section>
    `;

    const launcher = root.querySelector(".bk-launcher");
    const panel = root.querySelector(".bk-panel");
    const close = root.querySelector(".bk-close");
    const form = root.querySelector("form");
    const input = root.querySelector("textarea");

    const toggle = (open) => {
      panel.hidden = !open;
      launcher.setAttribute("aria-expanded", String(open));
      launcher.querySelector(".bk-launcher-label").hidden = open;
      if (open) {
        if (!conversation.length) addMessage("assistant", esc(config.welcomeMessage || ""));
        setTimeout(() => input.focus(), 0);
      }
    };

    launcher.addEventListener("click", () => toggle(panel.hidden));
    close.addEventListener("click", () => toggle(false));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      send(input.value);
      input.value = "";
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    root.addEventListener("click", (event) => {
      const quick = event.target.closest("[data-question]");
      if (quick) {
        toggle(true);
        send(quick.dataset.question);
      }

      const copy = event.target.closest("[data-copy]");
      if (copy) {
        navigator.clipboard
          .writeText(copy.dataset.copy)
          .then(() => {
            copy.textContent = "복사 완료";
          })
          .catch(() => {
            copy.textContent = "복사 실패";
          });
        return;
      }

      const feedback = event.target.closest("[data-feedback]");
      if (feedback) {
        feedback.parentElement.innerHTML = "<span>의견 감사합니다.</span>";
        emit("feedback", {
          value: feedback.dataset.feedback,
          documentId: feedback.dataset.docId
        });
      }
    });

    document.querySelectorAll("[data-quick-question]").forEach((button) => {
      button.addEventListener("click", () => {
        toggle(true);
        send(button.dataset.quickQuestion);
      });
    });

    document.querySelectorAll("[data-open-chatbot]").forEach((button) => {
      button.addEventListener("click", () => {
        if (launcher.getAttribute("aria-expanded") !== "true") launcher.click();
      });
    });
  }

  window.BigKindsChatbot = {
    open(question) {
      const launcher = root.querySelector(".bk-launcher");
      if (launcher?.getAttribute("aria-expanded") !== "true") launcher?.click();
      if (question) send(question);
    },
    search
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();

