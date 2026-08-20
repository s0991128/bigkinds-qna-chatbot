(function () {
  "use strict";

  if (document.querySelector("[data-bigkinds-chatbot-host]")) return;

  var script = document.currentScript;
  var scriptUrl = new URL(script.src);
  var chatbotUrl = script.dataset.chatbotUrl || scriptUrl.origin;
  var openByDefault = script.dataset.open === "true";
  var host = document.createElement("div");
  host.setAttribute("data-bigkinds-chatbot-host", "");
  var root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
    <style>
      :host { all: initial; }
      .bk-launcher {
        position: fixed; right: 24px; bottom: 24px; z-index: 2147483646;
        width: 58px; height: 58px; display: grid; place-items: center;
        border: 0; border-radius: 19px; cursor: pointer;
        color: #fff; background: linear-gradient(145deg, #2875ed, #104db9);
        box-shadow: 0 14px 34px rgba(16, 64, 145, .32);
        font: 900 24px/1 Arial, sans-serif;
      }
      .bk-launcher:hover { transform: translateY(-2px); }
      .bk-launcher:focus-visible { outline: 3px solid rgba(40,117,237,.4); outline-offset: 3px; }
      .bk-launcher span { position: absolute; right: 0; top: 0; width: 13px; height: 13px; border: 3px solid white; border-radius: 50%; background: #35c77d; }
      .bk-panel {
        position: fixed; right: 24px; bottom: 94px; z-index: 2147483647;
        width: min(400px, calc(100vw - 28px)); height: min(710px, calc(100vh - 118px));
        overflow: hidden; border: 1px solid rgba(16,35,63,.16); border-radius: 26px;
        background: white; box-shadow: 0 30px 90px rgba(15,34,61,.30);
        opacity: 0; visibility: hidden; transform: translateY(14px) scale(.98);
        transform-origin: right bottom; transition: opacity .2s, transform .2s, visibility .2s;
      }
      .bk-panel.open { opacity: 1; visibility: visible; transform: none; }
      iframe { width: 100%; height: 100%; display: block; border: 0; background: white; }
      @media (max-width: 520px) {
        .bk-launcher { right: 14px; bottom: 14px; }
        .bk-panel { right: 12px; bottom: 84px; width: calc(100vw - 24px); height: calc(100vh - 98px); border-radius: 22px; }
      }
      @media (prefers-reduced-motion: reduce) { .bk-panel, .bk-launcher { transition: none; } }
    </style>
    <button class="bk-launcher" type="button" aria-label="빅카인즈 이용 도우미 열기" aria-expanded="false">B<span aria-hidden="true"></span></button>
    <section class="bk-panel" aria-label="빅카인즈 이용 도우미" aria-hidden="true">
      <iframe title="빅카인즈 이용 도우미" loading="lazy" src="${chatbotUrl.replace(/\/$/, "")}/?embed=1"></iframe>
    </section>
  `;

  var button = root.querySelector(".bk-launcher");
  var panel = root.querySelector(".bk-panel");

  function setOpen(open) {
    panel.classList.toggle("open", open);
    panel.setAttribute("aria-hidden", String(!open));
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "빅카인즈 이용 도우미 닫기" : "빅카인즈 이용 도우미 열기");
  }

  button.addEventListener("click", function () {
    setOpen(!panel.classList.contains("open"));
  });

  window.addEventListener("message", function (event) {
    if (event.origin !== new URL(chatbotUrl).origin) return;
    if (event.data && event.data.type === "bigkinds-chatbot-close") setOpen(false);
  });

  document.body.appendChild(host);
  setOpen(openByDefault);
})();
