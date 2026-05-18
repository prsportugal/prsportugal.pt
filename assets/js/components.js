import { initGoogleTranslate } from "./translate.js";

const THEME_STORAGE_KEY = "prs-theme";
const FONT_AWESOME_KIT_URL = "https://kit.fontawesome.com/63ee9bf6ef.js";
const LOGO_LIGHT_FILE = "LOGO_DEITADO_ASSOCIAÇÃO_LETRA_PRETA.png";
const LOGO_DARK_FILE = "LOGO_DEITADO_ASSOCIAÇÃO_LETRA_BRANCA.png";
const GLOBAL_IMAGE_SELECTOR = 'img:not(.js-gallery-media):not([data-image-effect="off"])';

function initFontAwesome() {
  if (document.querySelector('script[data-prs-fa="true"]')) {
    return;
  }

  const script = document.createElement("script");
  script.src = FONT_AWESOME_KIT_URL;
  script.crossOrigin = "anonymous";
  script.defer = true;
  script.dataset.prsFa = "true";
  document.head.appendChild(script);
}

async function loadPartial(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha a carregar componente: ${url}`);
  }

  return response.text();
}

function applyBasePath(html, basePath) {
  return html.replaceAll("{{BASE}}", basePath);
}

function setActiveNavigation(activePage) {
  if (!activePage) {
    return;
  }

  const current = document.querySelector(`.main-nav [data-nav="${activePage}"]`);
  if (current) {
    current.classList.add("is-active");
  }
}

function getPreferredTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") {
    return saved;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initGlobalImageLoading(root = document) {
  const images = root.querySelectorAll(GLOBAL_IMAGE_SELECTOR);

  images.forEach((image) => {
    image.classList.add("js-image-load-fx");

    if (image.dataset.imageFxBound !== "true") {
      const markLoaded = () => {
        image.classList.add("is-loaded");
      };

      image.addEventListener("load", markLoaded);
      image.addEventListener("error", markLoaded);
      image.dataset.imageFxBound = "true";
    }

    if (image.complete) {
      image.classList.add("is-loaded");
    } else {
      image.classList.remove("is-loaded");
    }
  });
}

function applyTheme(theme, basePath = ".") {
  document.documentElement.setAttribute("data-theme", theme);

  const isDark = theme === "dark";
  const logoFile = isDark ? LOGO_DARK_FILE : LOGO_LIGHT_FILE;
  const logoPath = `${basePath}/assets/images/${encodeURIComponent(logoFile)}`;
  const iconPath = `${basePath}/assets/images/favicon.png`;

  document.querySelectorAll(".brand-logo, .footer-logo").forEach((logo) => {
    logo.classList.remove("is-loaded");
    logo.setAttribute("src", logoPath);
  });

  const favicon = document.querySelector('link[rel="icon"]');
  if (favicon) {
    favicon.setAttribute("href", iconPath);
  }

  const toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.innerHTML = isDark
      ? '<i class="fa-regular fa-lightbulb"></i>'
      : '<i class="fa-regular fa-moon" aria-hidden="true"></i>';
    toggle.setAttribute("aria-label", isDark ? "Ativar modo claro" : "Ativar modo escuro");
    toggle.setAttribute("title", isDark ? "Ativar modo claro" : "Ativar modo escuro");
  }

  initGlobalImageLoading();
}

function initThemeToggle(basePath) {
  const preferred = getPreferredTheme();
  applyTheme(preferred, basePath);

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", (event) => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (!saved) {
      applyTheme(event.matches ? "dark" : "light", basePath);
    }
  });

  const toggle = document.getElementById("theme-toggle");
  if (!toggle) {
    return;
  }

  toggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next, basePath);
  });
}

function initMobileNav() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");
  if (!toggle || !nav) {
    return;
  }

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 860 && nav.classList.contains("is-open")) {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

function initBackToTop() {
  const button = document.getElementById("back-to-top");
  if (!button) {
    return;
  }

  button.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });
}

function initFloatingLanguageControl() {
  const floatingControl = document.querySelector(".language-floating-control");
  const footer = document.querySelector(".site-footer");

  if (!floatingControl || !footer || typeof IntersectionObserver === "undefined") {
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    const isFooterVisible = entries.some((entry) => entry.isIntersecting);
    floatingControl.classList.toggle("is-footer-visible", isFooterVisible);
  }, {
    threshold: 0.01
  });

  observer.observe(footer);
}

function revealPageWhenLoaded() {
  const reveal = () => {
    document.body.classList.add("page-ready");
  };

  if (document.readyState === "complete") {
    window.requestAnimationFrame(reveal);
    return;
  }

  window.addEventListener("load", () => {
    window.requestAnimationFrame(reveal);
  }, { once: true });
}

export async function loadSharedComponents() {
  const basePath = document.body.dataset.base || ".";
  const activePage = document.body.dataset.page || "";

  try {
    const headerSlot = document.getElementById("site-header");
    const footerSlot = document.getElementById("site-footer");

    if (!headerSlot || !footerSlot) {
      throw new Error("Faltam placeholders #site-header ou #site-footer.");
    }

    const [navbarHtml, footerHtml] = await Promise.all([
      loadPartial(`${basePath}/components/navbar.html`),
      loadPartial(`${basePath}/components/footer.html`)
    ]);

    headerSlot.innerHTML = applyBasePath(navbarHtml, basePath);
    footerSlot.innerHTML = applyBasePath(footerHtml, basePath);

    const year = document.getElementById("year");
    if (year) {
      year.textContent = String(new Date().getFullYear());
    }

    setActiveNavigation(activePage);
    initMobileNav();
    initBackToTop();
    initFontAwesome();
    initGlobalImageLoading();
    initThemeToggle(basePath);
    initGoogleTranslate();
    initFloatingLanguageControl();
  } finally {
    revealPageWhenLoaded();
  }
}
