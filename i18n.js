/*
 * I'll Be There — lightweight i18n engine (no framework, no build step).
 *
 * How it works:
 *  - English is the source of truth, written directly in the HTML.
 *  - Each translatable element carries a data-i18n="some.key" attribute.
 *  - On load we cache the original English (keyed by data-i18n) from the DOM.
 *  - Other languages live in one file each: /i18n/<lang>.json  (e.g. es.json).
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
    return fetch("/i18n/" + lang + ".json", { cache: "no-cache" })
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
