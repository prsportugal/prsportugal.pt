const STORAGE_KEY = "prs-lang";
const DEFAULT_LANGUAGE = "pt";
const TRANSLATED_LANGUAGES = ["en", "es", "fr", "de", "it"];
const SUPPORTED_LANGUAGES = [DEFAULT_LANGUAGE, ...TRANSLATED_LANGUAGES];
const GOOGLE_TRANSLATE_ELEMENT_ID = "google_translate_element";
const GOOGLE_TRANSLATE_SCRIPT_URL =
  "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
const FLAG_BY_LANGUAGE = { pt: "pt", en: "gb", es: "es", fr: "fr", de: "de", it: "it" };

let scriptPromise = null;
let refreshTimer = null;

function normalizeLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
}

function getFlagSvgUrl(language) {
  const basePath = (document.body?.dataset.base || ".").replace(/\/+$/, "");
  const flag = FLAG_BY_LANGUAGE[normalizeLanguage(language)] || FLAG_BY_LANGUAGE.pt;
  return `${basePath}/assets/images/flags/${flag}.svg`;
}

function readStoredLanguage() {
  try {
    return normalizeLanguage(localStorage.getItem(STORAGE_KEY));
  } catch (_error) {
    return DEFAULT_LANGUAGE;
  }
}

function writeStoredLanguage(language) {
  try {
    localStorage.setItem(STORAGE_KEY, normalizeLanguage(language));
  } catch (_error) {
    // The preference remains available in the Google Translate cookie.
  }
}

function getCookiePaths() {
  const paths = new Set(["/"]);
  const firstPathPart = window.location.pathname.split("/").filter(Boolean)[0];

  if (firstPathPart) {
    paths.add(`/${firstPathPart}`);
  }

  return Array.from(paths);
}

function getLegacyCookieDomains() {
  const host = window.location.hostname;
  if (!host || host === "localhost" || /^[\d.]+$/.test(host)) {
    return [""];
  }

  const parts = host.split(".").filter(Boolean);
  const domains = new Set(["", host]);
  if (parts.length >= 2) {
    domains.add(`.${parts.slice(-2).join(".")}`);
  }

  return Array.from(domains);
}

function cookieSecurityAttributes() {
  return window.location.protocol === "https:" ? ";SameSite=Lax;Secure" : ";SameSite=Lax";
}

function clearTranslateCookie() {
  // Also clears cookie scopes created by previous versions of this integration.
  getCookiePaths().forEach((path) => {
    getLegacyCookieDomains().forEach((domain) => {
      const domainAttribute = domain ? `;Domain=${domain}` : "";
      document.cookie = `googtrans=;Max-Age=0;Path=${path}${domainAttribute}${cookieSecurityAttributes()}`;
    });
  });
}

function setTranslateCookie(language) {
  const normalized = normalizeLanguage(language);
  clearTranslateCookie();

  if (normalized === DEFAULT_LANGUAGE) {
    return;
  }

  // Keep one host-scoped cookie. Multiple domain/path variants can make the
  // Google widget read an older value on nested pages.
  document.cookie = `googtrans=/${DEFAULT_LANGUAGE}/${normalized};Path=/${cookieSecurityAttributes()}`;
}

function getPicker() {
  return document.getElementById("language-switcher");
}

function getCustomPicker(picker = getPicker()) {
  return picker?.parentElement?.querySelector(".language-picker") || null;
}

function setPickerStatus(message = "", isError = false) {
  const custom = getCustomPicker();
  if (!custom) {
    return;
  }

  const status = custom.querySelector(".language-picker-status");
  custom.classList.toggle("is-error", isError);

  if (status) {
    status.textContent = message;
  }
}

function updateCustomLanguageSwitcher(picker, language) {
  const custom = getCustomPicker(picker);
  if (!custom) {
    return;
  }

  const selectedLanguage = normalizeLanguage(language);
  const selectedOption = Array.from(picker.options).find((option) => option.value === selectedLanguage);
  const trigger = custom.querySelector(".language-picker-trigger");
  const triggerFlag = custom.querySelector(".language-picker-trigger-flag");
  const triggerLabel = custom.querySelector(".language-picker-trigger-label");

  if (triggerFlag) {
    triggerFlag.src = getFlagSvgUrl(selectedLanguage);
  }

  if (triggerLabel) {
    triggerLabel.textContent = selectedOption ? selectedOption.textContent.trim() : selectedLanguage.toUpperCase();
  }

  if (trigger) {
    trigger.setAttribute("aria-label", `Idioma: ${triggerLabel?.textContent || selectedLanguage.toUpperCase()}`);
  }

  custom.querySelectorAll(".language-picker-option").forEach((option) => {
    const isSelected = option.getAttribute("data-lang") === selectedLanguage;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-current", isSelected ? "true" : "false");
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
  trigger.setAttribute("aria-haspopup", "true");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("translate", "no");

  const triggerFlag = document.createElement("img");
  triggerFlag.className = "language-picker-trigger-flag";
  triggerFlag.alt = "";
  triggerFlag.setAttribute("aria-hidden", "true");

  const triggerLabel = document.createElement("span");
  triggerLabel.className = "language-picker-trigger-label";
  triggerLabel.setAttribute("translate", "no");

  const triggerCaret = document.createElement("span");
  triggerCaret.className = "language-picker-caret";
  triggerCaret.setAttribute("aria-hidden", "true");
  triggerCaret.textContent = "▾";
  trigger.append(triggerFlag, triggerLabel, triggerCaret);

  const menu = document.createElement("ul");
  const menuId = "language-picker-menu";
  menu.id = menuId;
  menu.className = "language-picker-menu";
  menu.setAttribute("aria-label", "Escolher idioma");
  menu.setAttribute("translate", "no");
  menu.hidden = true;
  trigger.setAttribute("aria-controls", menuId);

  Array.from(picker.options).forEach((nativeOption) => {
    const item = document.createElement("li");
    item.className = "language-picker-item";

    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = "language-picker-option";
    optionButton.setAttribute("data-lang", nativeOption.value);
    optionButton.setAttribute("translate", "no");

    const optionFlag = document.createElement("img");
    optionFlag.className = "language-picker-option-flag";
    optionFlag.src = getFlagSvgUrl(nativeOption.value);
    optionFlag.alt = "";
    optionFlag.setAttribute("aria-hidden", "true");

    const optionLabel = document.createElement("span");
    optionLabel.textContent = nativeOption.textContent.trim();
    optionButton.append(optionFlag, optionLabel);

    item.appendChild(optionButton);
    menu.appendChild(item);
  });

  const status = document.createElement("span");
  status.className = "language-picker-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  wrapper.append(trigger, menu, status);
  picker.insertAdjacentElement("afterend", wrapper);
  picker.classList.add("language-switcher-native");
  picker.tabIndex = -1;
  picker.setAttribute("aria-hidden", "true");

  const optionButtons = () => Array.from(menu.querySelectorAll(".language-picker-option"));
  const closeMenu = ({ restoreFocus = false } = {}) => {
    wrapper.classList.remove("is-open");
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) {
      trigger.focus();
    }
  };
  const openMenu = () => {
    wrapper.classList.add("is-open");
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    const selected = menu.querySelector(".language-picker-option.is-selected");
    (selected || optionButtons()[0])?.focus();
  };

  trigger.addEventListener("click", () => {
    if (wrapper.classList.contains("is-open")) {
      closeMenu();
    } else {
      openMenu();
    }
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

  menu.addEventListener("keydown", (event) => {
    const buttons = optionButtons();
    const currentIndex = buttons.indexOf(document.activeElement);
    let nextIndex = -1;

    if (event.key === "ArrowDown") nextIndex = Math.min(currentIndex + 1, buttons.length - 1);
    if (event.key === "ArrowUp") nextIndex = Math.max(currentIndex - 1, 0);
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = buttons.length - 1;

    if (nextIndex >= 0) {
      event.preventDefault();
      buttons[nextIndex]?.focus();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu({ restoreFocus: true });
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (event.target instanceof Node && !wrapper.contains(event.target)) {
      closeMenu();
    }
  });

  picker.dataset.customized = "true";
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
      includedLanguages: TRANSLATED_LANGUAGES.join(","),
      autoDisplay: false,
      layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE
    },
    GOOGLE_TRANSLATE_ELEMENT_ID
  );

  host.dataset.initialized = "true";
  return true;
}

function hasGoogleTranslationWidget() {
  return Boolean(document.querySelector("div.skiptranslate"));
}

function waitForGoogleTranslationWidget(timeout = 750) {
  if (hasGoogleTranslationWidget()) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const deadline = Date.now() + timeout;
    const check = () => {
      if (hasGoogleTranslationWidget()) {
        resolve(true);
        return;
      }

      if (Date.now() >= deadline) {
        resolve(false);
        return;
      }

      window.setTimeout(check, 50);
    };

    check();
  });
}

function loadGoogleTranslateScript() {
  if (window.google?.translate?.TranslateElement) {
    return Promise.resolve();
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    const sourcePrefix = GOOGLE_TRANSLATE_SCRIPT_URL.split("?")[0];
    const existingScript = document.querySelector(`script[src^="${sourcePrefix}"]`);

    if (existingScript) {
      existingScript.addEventListener("load", resolve, { once: true });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_TRANSLATE_SCRIPT_URL;
    script.async = true;
    script.dataset.prsGoogleTranslate = "true";
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => {
      script.remove();
      reject(new Error("Não foi possível carregar o serviço de tradução."));
    }, { once: true });
    document.body.appendChild(script);
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });

  return scriptPromise;
}

async function activateStoredLanguage() {
  const language = readStoredLanguage();
  setPickerStatus();

  if (language === DEFAULT_LANGUAGE) {
    setTranslateCookie(language);
    document.documentElement.lang = "pt-PT";
    return;
  }

  setTranslateCookie(language);

  try {
    await loadGoogleTranslateScript();
    if (!ensureGoogleWidget()) {
      throw new Error("Não foi possível iniciar o serviço de tradução.");
    }

    // The current Google widget reads googtrans during initialization. It no
    // longer exposes the old .goog-te-combo select, so no private widget API
    // or brittle DOM command is needed here.
    document.documentElement.lang = language;
  } catch (_error) {
    if (await waitForGoogleTranslationWidget()) {
      document.documentElement.lang = language;
      return;
    }

    document.documentElement.lang = "pt-PT";
    setPickerStatus("Não foi possível carregar a tradução. Tenta novamente.", true);
  }
}

function bindLanguageSwitcher() {
  const picker = getPicker();
  if (!picker) {
    return;
  }

  ensureCustomLanguageSwitcher(picker);

  const selectedLanguage = readStoredLanguage();
  picker.value = selectedLanguage;
  updateCustomLanguageSwitcher(picker, selectedLanguage);

  if (picker.dataset.bound === "true") {
    return;
  }

  picker.addEventListener("change", () => {
    const nextLanguage = normalizeLanguage(picker.value);
    picker.value = nextLanguage;
    writeStoredLanguage(nextLanguage);
    updateCustomLanguageSwitcher(picker, nextLanguage);
    setTranslateCookie(nextLanguage);
    document.documentElement.classList.add("is-language-switching");

    // The current Google widget applies the language preference while it is
    // initializing. A short visual transition keeps the switch deliberate
    // without relying on undocumented Google internals.
    window.setTimeout(() => window.location.reload(), 120);
  });

  picker.dataset.bound = "true";
}

export function refreshGoogleTranslate(options = {}) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    activateStoredLanguage();
  }, options.delay ?? 250);
}

export function initGoogleTranslate() {
  bindLanguageSwitcher();

  window.googleTranslateElementInit = function googleTranslateElementInit() {
    ensureGoogleWidget();
  };
}
