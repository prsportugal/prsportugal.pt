const STORAGE_KEY = "prs-lang";
const DEFAULT_LANGUAGE = "pt";
const TRANSLATED_LANGUAGES = ["en", "es", "fr", "de", "it"];
const SUPPORTED_LANGUAGES = [DEFAULT_LANGUAGE, ...TRANSLATED_LANGUAGES];
const GOOGLE_TRANSLATE_ELEMENT_ID = "google_translate_element";
const GOOGLE_TRANSLATE_SCRIPT_URL =
  "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";

const FLAG_BY_LANGUAGE = {
  pt: "pt",
  en: "gb",
  es: "es",
  fr: "fr",
  de: "de",
  it: "it"
};

let scriptPromise = null;
let comboObserver = null;
let refreshTimer = null;
let languageSwitchTimer = null;

function normalizeLanguage(lang) {
  return SUPPORTED_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
}

function getFlagCode(language) {
  return FLAG_BY_LANGUAGE[language] || "pt";
}

function getFlagSvgUrl(language) {
  return `https://flagicons.lipis.dev/flags/4x3/${getFlagCode(language)}.svg`;
}

function readStoredLanguage() {
  try {
    return normalizeLanguage(localStorage.getItem(STORAGE_KEY));
  } catch (_error) {
    return DEFAULT_LANGUAGE;
  }
}

function writeStoredLanguage(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, normalizeLanguage(lang));
  } catch (_error) {
    // Storage can be unavailable in private browsing; the Google cookie still carries the preference.
  }
}

function getCookieDomains() {
  const host = window.location.hostname;
  if (!host || host === "localhost" || /^[\d.]+$/.test(host) || host.includes(":")) {
    return [""];
  }

  const parts = host.split(".").filter(Boolean);
  const domains = new Set(["", host]);

  if (parts.length >= 2) {
    domains.add(`.${parts.slice(-2).join(".")}`);
  }

  return Array.from(domains);
}

function getCookiePaths() {
  const paths = new Set(["/"]);
  const firstPathPart = window.location.pathname.split("/").filter(Boolean)[0];

  if (firstPathPart) {
    paths.add(`/${firstPathPart}`);
  }

  return Array.from(paths);
}

function buildCookieSuffix(path, domain = "") {
  return `path=${path}${domain ? `;domain=${domain}` : ""}`;
}

function clearTranslateCookie() {
  getCookiePaths().forEach((path) => {
    getCookieDomains().forEach((domain) => {
      document.cookie =
        `googtrans=;expires=Thu, 01 Jan 1970 00:00:00 GMT;Max-Age=0;${buildCookieSuffix(path, domain)}`;
    });
  });
}

function setTranslateCookie(lang) {
  const normalized = normalizeLanguage(lang);

  clearTranslateCookie();
  if (normalized === DEFAULT_LANGUAGE) {
    return;
  }

  const value = `/${DEFAULT_LANGUAGE}/${normalized}`;
  getCookiePaths().forEach((path) => {
    getCookieDomains().forEach((domain) => {
      document.cookie = `googtrans=${value};${buildCookieSuffix(path, domain)}`;
    });
  });
}

function applyLanguageFlagToPicker(picker, language) {
  if (!picker) {
    return;
  }

  const selectedLanguage = normalizeLanguage(language);
  picker.style.backgroundImage = `url("${getFlagSvgUrl(selectedLanguage)}")`;
  updateCustomLanguageSwitcher(picker, selectedLanguage);
}

function updateCustomLanguageSwitcher(picker, language) {
  const custom = picker?.parentElement?.querySelector(".language-picker");
  if (!custom) {
    return;
  }

  const selectedLanguage = normalizeLanguage(language);
  const selectedOption = Array.from(picker.options).find((option) => option.value === selectedLanguage);
  const trigger = custom.querySelector(".language-picker-trigger");
  const triggerFlag = custom.querySelector(".language-picker-trigger-flag");
  const triggerLabel = custom.querySelector(".language-picker-trigger-label");

  if (trigger) {
    trigger.setAttribute("data-lang", selectedLanguage);
  }

  if (triggerFlag) {
    triggerFlag.setAttribute("src", getFlagSvgUrl(selectedLanguage));
    triggerFlag.setAttribute("alt", "");
  }

  if (triggerLabel) {
    triggerLabel.textContent = selectedOption ? selectedOption.textContent.trim() : selectedLanguage.toUpperCase();
  }

  custom.querySelectorAll(".language-picker-option").forEach((option) => {
    const isSelected = option.getAttribute("data-lang") === selectedLanguage;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-selected", isSelected ? "true" : "false");
  });
}

function ensureCustomLanguageSwitcher(picker) {
  if (!picker || picker.dataset.customized === "true") {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "language-picker notranslate";
  wrapper.setAttribute("translate", "no");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "language-picker-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", "Selecionar idioma");
  trigger.setAttribute("translate", "no");

  const triggerFlag = document.createElement("img");
  triggerFlag.className = "language-picker-trigger-flag";
  triggerFlag.setAttribute("alt", "");
  triggerFlag.setAttribute("aria-hidden", "true");
  triggerFlag.setAttribute("decoding", "async");

  const triggerLabel = document.createElement("span");
  triggerLabel.className = "language-picker-trigger-label";
  triggerLabel.setAttribute("translate", "no");

  const triggerCaret = document.createElement("span");
  triggerCaret.className = "language-picker-caret";
  triggerCaret.setAttribute("aria-hidden", "true");
  triggerCaret.textContent = "▾";

  trigger.append(triggerFlag, triggerLabel, triggerCaret);

  const menu = document.createElement("ul");
  menu.className = "language-picker-menu";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", "Idiomas");
  menu.setAttribute("translate", "no");

  Array.from(picker.options).forEach((nativeOption) => {
    const item = document.createElement("li");
    item.className = "language-picker-item";
    item.setAttribute("role", "presentation");

    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = "language-picker-option";
    optionButton.setAttribute("role", "option");
    optionButton.setAttribute("aria-selected", "false");
    optionButton.setAttribute("data-lang", nativeOption.value);
    optionButton.setAttribute("translate", "no");

    const optionFlag = document.createElement("img");
    optionFlag.className = "language-picker-option-flag";
    optionFlag.setAttribute("src", getFlagSvgUrl(nativeOption.value));
    optionFlag.setAttribute("alt", "");
    optionFlag.setAttribute("aria-hidden", "true");
    optionFlag.setAttribute("loading", "lazy");
    optionFlag.setAttribute("decoding", "async");

    const optionLabel = document.createElement("span");
    optionLabel.className = "language-picker-option-label";
    optionLabel.textContent = nativeOption.textContent.trim();
    optionLabel.setAttribute("translate", "no");

    optionButton.append(optionFlag, optionLabel);
    item.appendChild(optionButton);
    menu.appendChild(item);
  });

  wrapper.append(trigger, menu);
  picker.insertAdjacentElement("afterend", wrapper);
  picker.classList.add("language-switcher-native");
  picker.tabIndex = -1;

  const closeMenu = () => {
    wrapper.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
  };

  trigger.addEventListener("click", () => {
    const isOpen = wrapper.classList.toggle("is-open");
    trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  menu.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest(".language-picker-option")
      : null;

    if (!target) {
      return;
    }

    picker.value = normalizeLanguage(target.getAttribute("data-lang"));
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    closeMenu();
  });

  document.addEventListener("click", (event) => {
    if (event.target instanceof Node && !wrapper.contains(event.target)) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  picker.dataset.customized = "true";
}

function getGoogleCombo() {
  return document.querySelector(".goog-te-combo");
}

function hasComboValue(combo, value) {
  return Array.from(combo.options || []).some((option) => option.value === value);
}

function dispatchComboChange(combo) {
  if (typeof combo.onchange === "function") {
    combo.onchange.call(combo);
  }

  const event = document.createEvent("HTMLEvents");
  event.initEvent("change", true, true);
  combo.dispatchEvent(event);
}

function getGoogleTranslateInstance() {
  return window.google?.translate?.TranslateElement?.getInstance?.() || null;
}

function getGoogleTranslateService() {
  return getGoogleTranslateInstance()?.F || null;
}

function restoreGoogleTranslation() {
  const combo = getGoogleCombo();
  clearTranslateCookie();
  applyDocumentLanguage(DEFAULT_LANGUAGE);

  if (combo && hasComboValue(combo, "")) {
    combo.value = "";
    dispatchComboChange(combo);
  }

  const instance = getGoogleTranslateInstance();
  const service = getGoogleTranslateService();

  if (instance?.l && typeof instance.l.wa === "function") {
    instance.l.wa("");
  }

  if (service && typeof service.restore === "function") {
    window.setTimeout(() => {
      service.restore(null);
    }, 0);
    return true;
  }

  return Boolean(combo);
}

function applyGoogleTranslateServiceLanguage(lang) {
  const normalized = normalizeLanguage(lang);
  if (normalized === DEFAULT_LANGUAGE) {
    return restoreGoogleTranslation();
  }

  const instance = getGoogleTranslateInstance();
  const service = getGoogleTranslateService();
  if (!service || typeof service.Ce !== "function") {
    return false;
  }

  setTranslateCookie(normalized);
  applyDocumentLanguage(normalized);

  if (instance) {
    instance.o = DEFAULT_LANGUAGE;
    instance.j = normalized;

    if (instance.l && typeof instance.l.wa === "function") {
      instance.l.wa(normalized);
    }
  }

  if (typeof service.Rh === "function") {
    service.Rh(false);
  }

  window.setTimeout(() => {
    service.Ce(DEFAULT_LANGUAGE, normalized, () => { }, undefined, undefined);
  }, 0);

  const combo = getGoogleCombo();
  if (combo && hasComboValue(combo, normalized)) {
    combo.value = normalized;
  }

  return true;
}

function ensureGoogleTranslateReady(callback) {
  if (ensureGoogleWidget()) {
    waitForGoogleCombo(callback);
    return;
  }

  loadGoogleTranslateScript()
    .then(() => {
      ensureGoogleWidget();
      waitForGoogleCombo(callback);
    })
    .catch(() => {
      scriptPromise = null;
    });
}

function setGoogleComboLanguage(lang, options = {}) {
  if (applyGoogleTranslateServiceLanguage(lang)) {
    return true;
  }

  const combo = getGoogleCombo();
  if (!combo) {
    return false;
  }

  const normalized = normalizeLanguage(lang);
  const comboValue = normalized === DEFAULT_LANGUAGE && hasComboValue(combo, "") ? "" : normalized;

  if (!hasComboValue(combo, comboValue)) {
    return false;
  }

  if (combo.value === comboValue && !options.reapply) {
    return true;
  }

  combo.value = comboValue;
  dispatchComboChange(combo);
  return true;
}

function switchGoogleComboLanguage(lang, previousLang) {
  const normalized = normalizeLanguage(lang);
  const previous = normalizeLanguage(previousLang);

  if (normalized === DEFAULT_LANGUAGE) {
    return restoreGoogleTranslation();
  }

  const shouldResetFirst =
    previous !== DEFAULT_LANGUAGE &&
    previous !== normalized;

  if (!shouldResetFirst) {
    return setGoogleComboLanguage(normalized, { reapply: true });
  }

  const combo = getGoogleCombo();
  if (!combo || !hasComboValue(combo, "")) {
    return setGoogleComboLanguage(normalized, { reapply: true });
  }

  window.clearTimeout(languageSwitchTimer);
  restoreGoogleTranslation();

  languageSwitchTimer = window.setTimeout(() => {
    setTranslateCookie(normalized);
    applyDocumentLanguage(normalized);
    setGoogleComboLanguage(normalized, { reapply: true });
  }, 180);

  return true;
}

function ensureGoogleWidget() {
  const host = document.getElementById(GOOGLE_TRANSLATE_ELEMENT_ID);
  if (!host || !window.google?.translate?.TranslateElement) {
    return false;
  }

  if (host.dataset.initialized === "true") {
    return true;
  }

  new window.google.translate.TranslateElement(
    {
      pageLanguage: DEFAULT_LANGUAGE,
      includedLanguages: SUPPORTED_LANGUAGES.join(","),
      autoDisplay: false,
      layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE
    },
    GOOGLE_TRANSLATE_ELEMENT_ID
  );

  host.dataset.initialized = "true";
  return true;
}

function loadGoogleTranslateScript() {
  if (window.google?.translate?.TranslateElement) {
    return Promise.resolve();
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src^="${GOOGLE_TRANSLATE_SCRIPT_URL.split("?")[0]}"]`);
    if (existingScript) {
      if (window.google?.translate?.TranslateElement) {
        resolve();
        return;
      }

      existingScript.addEventListener("load", resolve, { once: true });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_TRANSLATE_SCRIPT_URL;
    script.async = true;
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", reject, { once: true });
    document.body.appendChild(script);
  });

  return scriptPromise;
}

function waitForGoogleCombo(callback) {
  if (getGoogleCombo()) {
    callback();
    return;
  }

  comboObserver?.disconnect();
  comboObserver = new MutationObserver(() => {
    if (!getGoogleCombo()) {
      return;
    }

    comboObserver?.disconnect();
    comboObserver = null;
    callback();
  });

  comboObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.setTimeout(() => {
    comboObserver?.disconnect();
    comboObserver = null;
  }, 15000);
}

function applyDocumentLanguage(lang) {
  document.documentElement.lang = normalizeLanguage(lang) === DEFAULT_LANGUAGE ? "pt-PT" : normalizeLanguage(lang);
}

function applyLanguage(lang, options = {}) {
  const normalized = normalizeLanguage(lang);
  setTranslateCookie(normalized);
  applyDocumentLanguage(normalized);

  if (setGoogleComboLanguage(normalized, options)) {
    return true;
  }

  ensureGoogleTranslateReady(() => {
    setGoogleComboLanguage(normalized, options);
  });
  return false;
}

function bindLanguageSwitcher() {
  const picker = document.getElementById("language-switcher");
  if (!picker) {
    return;
  }

  ensureCustomLanguageSwitcher(picker);

  if (picker.dataset.bound !== "true") {
    picker.addEventListener("change", () => {
      const previousLang = readStoredLanguage();
      const nextLang = normalizeLanguage(picker.value);
      picker.value = nextLang;
      writeStoredLanguage(nextLang);
      applyLanguageFlagToPicker(picker, nextLang);
      setTranslateCookie(nextLang);
      applyDocumentLanguage(nextLang);

      if (switchGoogleComboLanguage(nextLang, previousLang)) {
        return;
      }

      ensureGoogleTranslateReady(() => {
        switchGoogleComboLanguage(nextLang, previousLang);
      });
    });

    picker.dataset.bound = "true";
  }

  const selectedLanguage = readStoredLanguage();
  picker.value = selectedLanguage;
  applyLanguageFlagToPicker(picker, selectedLanguage);
}

export function refreshGoogleTranslate(options = {}) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    const language = readStoredLanguage();
    if (language === DEFAULT_LANGUAGE) {
      return;
    }

    applyLanguage(language, { reapply: true });
  }, options.delay ?? 250);
}

export function initGoogleTranslate() {
  bindLanguageSwitcher();
  applyDocumentLanguage(readStoredLanguage());

  window.googleTranslateElementInit = function googleTranslateElementInit() {
    ensureGoogleWidget();
  };
}
