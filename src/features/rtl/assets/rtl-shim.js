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

  function findChatHeader() {
    // Prefer the top-level chat header (aqhumA module hash), fall back to any other header.
    var preferred = document.querySelector('[class*="header_"][class*="aqhumA"]');
    if (preferred) return preferred;
    var all = document.querySelectorAll('[class*="header_"]');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      // Skip headers that live inside tools / thinking blocks / message bubbles.
      if (el.closest('[class*="toolUse_"], [class*="thinking_"], [class*="userMessage_"], [class*="root_-a7MRw"]')) continue;
      return el;
    }
    return null;
  }

  function tryInsertButton() {
    var header = findChatHeader();
    var existing = document.getElementById(BTN_ID);

    if (existing && header && header.contains(existing)) return;

    if (header && existing) {
      var oldWrap = document.getElementById(WRAP_ID);
      if (oldWrap) oldWrap.remove(); else existing.remove();
      header.appendChild(makeButton());
      return;
    }

    if (header && !existing) {
      header.appendChild(makeButton());
      return;
    }

    if (existing) return;

    // Fallback: insert as a slim row above the input box.
    var input = document.querySelector('[class*="inputContainer_"]');
    if (input && input.parentNode) {
      var wrap = document.createElement("div");
      wrap.id = WRAP_ID;
      wrap.appendChild(makeButton());
      input.parentNode.insertBefore(wrap, input);
      return;
    }

    // Last-resort fallback: pin a small button to bottom-left (a corner Claude Code never uses)
    // so the user always has a visible toggle even when the DOM isn't where we expect.
    if (document.body) {
      var floatBtn = makeButton();
      floatBtn.classList.add("is-floating");
      document.body.appendChild(floatBtn);
    }
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
