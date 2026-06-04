/*
 * I'll Be There — lightweight i18n engine (no framework, no build step).
 *
 * How it works:
 *  - English is the source of truth, written directly in the HTML.
 *  - Each translatable element carries a data-i18n="some.key" attribute.
 *  - On load we cache the original English (keyed by data-i18n) from the DOM.
 *  - Other languages live in one file each: /locales/<lang>.json  (e.g. es.json).
 *    Adding a new language = drop in one JSON file and add it to LANGS below.
 *  - The language choice is remembered (localStorage) and the visitor's browser
 *    language is auto-detected on first visit.
 *
 * Attributes:
 *  - data-i18n="key"                -> replaces the element's innerHTML
 *  - data-i18n-attr="attr:key;..."  -> replaces an attribute's value
 *                                      (e.g. data-i18n-attr="content:meta.description")
 */
(function () {
  "use strict";

  // Add a language here + create /i18n/<code>.json to make it available everywhere.
  var LANGS = { en: "English", es: "Español" };
  var DEFAULT_LANG = "en";
  var STORAGE_KEY = "ibt-lang";

  var dicts = {};        // lang code -> { key: value }  (loaded JSON; en derived from DOM)
  var enBaseline = null; // key -> original English innerHTML
  var enAttrBaseline = {}; // "selectorIndex" not used; we re-walk DOM each apply

  function supported(code) {
    return Object.prototype.hasOwnProperty.call(LANGS, code) ? code : null;
  }

  function detectLang() {
    var saved = supported(localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
    var nav = (navigator.language || navigator.userLanguage || "en")
      .slice(0, 2)
      .toLowerCase();
    return supported(nav) || DEFAULT_LANG;
  }

  function captureBaseline() {
    enBaseline = {};
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      enBaseline[el.getAttribute("data-i18n")] = el.innerHTML;
    }
  }

  function loadDict(lang) {
    if (lang === "en") return Promise.resolve({});
    if (dicts[lang]) return Promise.resolve(dicts[lang]);
    return fetch("/locales/" + lang + ".json", { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("missing dictionary: " + lang);
        return r.json();
      })
      .then(function (json) {
        dicts[lang] = json;
        return json;
      })
      .catch(function (err) {
        console.warn("[i18n]", err.message, "- falling back to English");
        return {};
      });
  }

  function applyDict(lang, dict) {
    // Text / HTML content
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute("data-i18n");
      if (lang === "en") {
        if (enBaseline[key] != null) el.innerHTML = enBaseline[key];
      } else if (dict[key] != null) {
        el.innerHTML = dict[key];
      } else if (enBaseline[key] != null) {
        el.innerHTML = enBaseline[key]; // graceful fallback for untranslated keys
      }
    }

    // Attributes (meta description, etc.)
    var attrNodes = document.querySelectorAll("[data-i18n-attr]");
    for (var j = 0; j < attrNodes.length; j++) {
      var node = attrNodes[j];
      var pairs = node.getAttribute("data-i18n-attr").split(";");
      for (var k = 0; k < pairs.length; k++) {
        var pair = pairs[k].trim();
        if (!pair) continue;
        var bits = pair.split(":");
        var attr = bits[0].trim();
        var aKey = bits[1].trim();
        var baseAttr = "data-i18n-base-" + attr;
        if (!node.getAttribute(baseAttr)) {
          node.setAttribute(baseAttr, node.getAttribute(attr) || "");
        }
        if (lang === "en") {
          node.setAttribute(attr, node.getAttribute(baseAttr));
        } else if (dict[aKey] != null) {
          node.setAttribute(attr, dict[aKey]);
        } else {
          node.setAttribute(attr, node.getAttribute(baseAttr));
        }
      }
    }

    document.documentElement.setAttribute("lang", lang);

    highlightBrand();
  }

  // ---- Brand name emphasis -------------------------------------------------
  // Make the product name "I'll Be There" stand out wherever it appears in body
  // copy (bold + slightly larger). Runs after each translation pass, so it works
  // for English, Spanish, and any future language automatically — no need to mark
  // up the source strings. Skips headings, the nav/footer logo, links, the
  // verbatim SMS example (inside <em>), and copyright lines (inside <footer>).
  var BRAND_NAME = "I'll Be There";

  function injectBrandCSS() {
    if (document.getElementById("ibt-brand-style")) return;
    var s = document.createElement("style");
    s.id = "ibt-brand-style";
    s.textContent = ".ibt{font-weight:700;font-size:1.04em;white-space:nowrap;}";
    document.head.appendChild(s);
  }

  function wrapBrandInElement(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue || node.nodeValue.indexOf(BRAND_NAME) === -1) {
          return NodeFilter.FILTER_REJECT;
        }
        var p = node.parentNode;
        while (p && p !== el) {
          var t = p.nodeName;
          if (t === "A" || t === "EM" || t === "STRONG") {
            return NodeFilter.FILTER_REJECT;
          }
          p = p.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var targets = [];
    while (walker.nextNode()) targets.push(walker.currentNode);
    for (var i = 0; i < targets.length; i++) {
      var node = targets[i];
      var parts = node.nodeValue.split(BRAND_NAME);
      var frag = document.createDocumentFragment();
      for (var j = 0; j < parts.length; j++) {
        if (parts[j]) frag.appendChild(document.createTextNode(parts[j]));
        if (j < parts.length - 1) {
          var strong = document.createElement("strong");
          strong.className = "ibt";
          strong.textContent = BRAND_NAME;
          frag.appendChild(strong);
        }
      }
      node.parentNode.replaceChild(frag, node);
    }
  }

  function highlightBrand() {
    var els = document.querySelectorAll(
      ".lede, .hero p, .story p, .cta-inner p, .feature-card p, .content p, .content li, .consent small"
    );
    for (var i = 0; i < els.length; i++) wrapBrandInElement(els[i]);
  }

  function syncSelectors(lang) {
    var sels = document.querySelectorAll(".lang-select");
    for (var i = 0; i < sels.length; i++) sels[i].value = lang;
  }

  function setLang(lang) {
    lang = supported(lang) || DEFAULT_LANG;
    localStorage.setItem(STORAGE_KEY, lang);
    return loadDict(lang).then(function (dict) {
      applyDict(lang, dict);
      syncSelectors(lang);
    });
  }

  function wireSelectors() {
    var sels = document.querySelectorAll(".lang-select");
    for (var i = 0; i < sels.length; i++) {
      sels[i].addEventListener("change", function (e) {
        setLang(e.target.value);
      });
    }
  }

  function init() {
    injectBrandCSS();
    captureBaseline();
    wireSelectors();
    setLang(detectLang());
  }

  // Expose for debugging / manual control
  window.IBTi18n = { setLang: setLang, langs: LANGS };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
