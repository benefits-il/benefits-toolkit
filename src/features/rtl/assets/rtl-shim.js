/*
 * Benefit's Toolkit — RTL shim.
 * Adds a toggle button to the chat header and (in auto mode) flips direction per message.
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
  var STORAGE_KEY = "benefit.rtl.activeOn";

  var RTL_REGEX = /[֐-׿؀-ۿ܀-ݏﭐ-﷿ﹰ-﻿]/;

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

  function findHeaderHost() {
    var candidates = document.querySelectorAll('[class*="sessionsButtonText_"], [class*="header_"]');
    return candidates.length > 0 ? candidates[0].parentElement : null;
  }

  function ensureToggleButton() {
    if (document.querySelector(".benefit-rtl-toggle")) return;
    var host = findHeaderHost();
    if (!host) return;
    var btn = document.createElement("button");
    btn.className = "benefit-rtl-toggle";
    btn.type = "button";
    btn.title = "Toggle RTL (Benefit's Toolkit)";
    btn.textContent = "⮨⮩";
    btn.setAttribute("aria-label", "Toggle RTL");
    btn.addEventListener("click", function () {
      var nextOn = !document.body.classList.contains(SCOPE_CLASS);
      applyScope(nextOn);
      btn.classList.toggle("is-on", nextOn);
      writeActiveStored(nextOn);
    });
    if (document.body.classList.contains(SCOPE_CLASS)) {
      btn.classList.add("is-on");
    }
    host.appendChild(btn);
  }

  function boot() {
    applyFonts();
    if (MODE === "always") {
      applyScope(true);
    } else if (MODE === "active") {
      applyScope(readActiveStored());
      ensureToggleButton();
    } else if (MODE === "auto") {
      applyScope(true);
      detectAndMarkBubbles();
    }
  }

  function startObserver() {
    var observer = new MutationObserver(function () {
      if (MODE === "active") {
        ensureToggleButton();
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
