/*
 * Benefit's Toolkit — RTL shim.
 * Adds a toggle button into Claude Code's chat panel and (in auto mode) flips direction per message.
 * Placeholders are substituted by css-injector at install time:
 *   __BENEFIT_RTL_MODE__   -> "active" | "always" | "auto"
 *   __BENEFIT_RTL_TEXT__   -> custom text font (or empty)
 *   __BENEFIT_RTL_CODE__   -> custom code font (or empty)
 */
(function () {
  if (window.__benefitRtlBooted) return;
  window.__benefitRtlBooted = true;

  var MODE = "__BENEFIT_RTL_MODE__";
  var TEXT_FONT = "__BENEFIT_RTL_TEXT__";
  var CODE_FONT = "__BENEFIT_RTL_CODE__";
  var SCOPE_CLASS = "benefit-rtl-on";
  var BTN_ID = "benefit-rtl-btn";
  var WRAP_ID = "benefit-rtl-btn-wrap";
  var STORAGE_KEY = "benefit.rtl.activeOn";

  var RTL_REGEX = /[֐-׿؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

  function applyScope(on) {
    var root = document.body || document.documentElement;
    if (!root) return;
    root.classList.toggle(SCOPE_CLASS, !!on);
  }

  function applyFonts() {
    if (!TEXT_FONT && !CODE_FONT) return;
    var style = document.getElementById("benefit-rtl-fonts");
    if (!style) {
      style = document.createElement("style");
      style.id = "benefit-rtl-fonts";
      document.head.appendChild(style);
    }
    var rules = [];
    if (TEXT_FONT) {
      rules.push('body, [class*="userMessage_"], [class*="root_"] { font-family: "' + TEXT_FONT + '", sans-serif; }');
    }
    if (CODE_FONT) {
      rules.push('pre, code, [class*="codeBlockWrapper_"] { font-family: "' + CODE_FONT + '", monospace; }');
    }
    style.textContent = rules.join("\n");
  }

  function detectAndMarkBubbles() {
    var nodes = document.querySelectorAll('[class*="userMessage_"], [class*="root_"]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || !el.textContent) continue;
      var sample = el.textContent.slice(0, 200);
      el.setAttribute("data-benefit-dir", RTL_REGEX.test(sample) ? "rtl" : "ltr");
    }
  }

  function readActiveStored() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }
  function writeActiveStored(on) {
    try {
      localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
    } catch (e) {
      /* ignore */
    }
  }

  function makeButton() {
    var btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = "⇄";
    btn.title = "Toggle RTL (Benefit's Toolkit)";
    btn.setAttribute("aria-label", "Toggle RTL");
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var nextOn = !document.body.classList.contains(SCOPE_CLASS);
      applyScope(nextOn);
      btn.classList.toggle("is-on", nextOn);
      writeActiveStored(nextOn);
    });
    if (document.body.classList.contains(SCOPE_CLASS)) {
      btn.classList.add("is-on");
    }
    return btn;
  }

  // Insertion logic copied verbatim from claude-code-rtl (yechielby.claude-code-rtl):
  // match the FIRST chat header via [class*="header_"] and appendChild. No brittle
  // module-hash selector, no floating corner button — the only fallback is a slim
  // row above the input, and only when there is genuinely no header but messages exist.
  function tryInsertButton() {
    var header = document.querySelector('[class*="header_"]');
    var existing = document.getElementById(BTN_ID);

    // Already placed in the header — nothing to do
    if (existing && header && header.contains(existing)) return;

    // Header appeared but button is in fallback position — migrate to header
    if (header && existing) {
      var oldWrap = document.getElementById(WRAP_ID);
      if (oldWrap) oldWrap.remove(); else existing.remove();
      header.appendChild(makeButton());
      return;
    }

    // Header exists, no button yet — place in header
    if (header && !existing) {
      header.appendChild(makeButton());
      return;
    }

    // No header, button already in fallback — keep it
    if (existing) return;

    // No header, no button — fallback: place above the input when messages are visible
    var input = document.querySelector('[class*="inputContainer_"]');
    if (!input || !input.parentNode) return;
    if (!document.querySelector('[class*="messagesContainer_"]')) return;

    var wrap = document.createElement("div");
    wrap.id = WRAP_ID;
    wrap.appendChild(makeButton());
    input.parentNode.insertBefore(wrap, input);
  }

  function boot() {
    applyFonts();
    if (MODE === "always") {
      applyScope(true);
    } else if (MODE === "active") {
      applyScope(readActiveStored());
      tryInsertButton();
    } else if (MODE === "auto") {
      applyScope(true);
      detectAndMarkBubbles();
    }
  }

  function startObserver() {
    var observer = new MutationObserver(function () {
      if (MODE === "active") {
        tryInsertButton();
      } else if (MODE === "auto") {
        detectAndMarkBubbles();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      boot();
      startObserver();
    });
  } else {
    boot();
    startObserver();
  }
})();
