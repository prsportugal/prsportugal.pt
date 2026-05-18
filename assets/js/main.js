import { calculateCountdown, formatCountdownParts } from "./countdown.js";
import { fetchEventsFromSheet } from "./sheets.js";
import { initGoogleTranslate, refreshGoogleTranslate } from "./translate.js";

const config = window.PRS_CONFIG || {};
const locale = config.locale || "pt-PT";
const basePath = (document.body?.dataset.base || ".").replace(/\/+$/, "");

const eventsGrid = document.getElementById("events-grid");
const emptyState = document.getElementById("events-empty");
const nextEventName = document.getElementById("next-event-name");
const nextEventWhen = document.getElementById("next-event-when");
const nextEventCountdown = document.getElementById("next-event-countdown");

let liveEvents = [];
let liveCompetitionEvents = [];
let currentHeroEventId = "";
let hasBoundCountdownLanguageSwitcher = false;

const UI_LANGUAGE_STORAGE_KEY = "prs-lang";
const COMPETITIONS_PAGE_KEY = "competicoes";
const COUNTDOWN_LABELS = {
  pt: { d: "dias", h: "horas", m: "min", s: "seg" },
  en: { d: "days", h: "hours", m: "min", s: "sec" },
  es: { d: "días", h: "horas", m: "min", s: "seg" },
  fr: { d: "jours", h: "heures", m: "min", s: "sec" },
  de: { d: "tage", h: "stunden", m: "min", s: "sek" },
  it: { d: "giorni", h: "ore", m: "min", s: "sec" }
};

const COUNTRY_CODE_BY_NAME = {
  portugal: "pt",
  espanha: "es",
  spain: "es",
  franca: "fr",
  france: "fr",
  alemanha: "de",
  germany: "de",
  italia: "it",
  italy: "it",
  "reino unido": "gb",
  "united kingdom": "gb",
  uk: "gb",
  "estados unidos": "us",
  "united states": "us",
  usa: "us",
  eua: "us",
  andorra: "ad"
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(date) {
  const hasTime =
    date.getHours() !== 0 ||
    date.getMinutes() !== 0 ||
    date.getSeconds() !== 0 ||
    date.getMilliseconds() !== 0;

  const formatterOptions = hasTime
    ? { dateStyle: "full", timeStyle: "short" }
    : { dateStyle: "full" };

  const formatted = new Intl.DateTimeFormat(locale, formatterOptions).format(date);

  return formatted.charAt(0).toLocaleUpperCase(locale) + formatted.slice(1);
}

function normalizeCountryName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.+$/, "");
}

function resolveCountryCode(location) {
  const source = String(location || "").trim();
  if (!source) {
    return "";
  }

  const lastSegment = source.split(",").pop()?.trim() || source;
  const normalized = normalizeCountryName(lastSegment);

  if (/^[a-z]{2}$/i.test(normalized)) {
    return normalized.toLowerCase();
  }

  return COUNTRY_CODE_BY_NAME[normalized] || "";
}

function isCompetitionEvent(event) {
  return (event?.type || "competicao") === "competicao";
}

function resolveSiteUrl(value) {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }

  if (/^(?:[a-z]+:)?\/\//i.test(source) || source.startsWith("data:") || source.startsWith("blob:")) {
    return source;
  }

  const normalized = source.startsWith("/") ? source.slice(1) : source;
  return `${basePath}/${normalized}`;
}

function initImageLoadFx(root) {
  if (!root) {
    return;
  }

  const images = root.querySelectorAll("img.js-image-load-fx");
  images.forEach((image) => {
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
    }
  });
}

function eventRowTemplate(event) {
  const safeName = escapeHtml(event.name);
  const locationText = event.location || "Local por anunciar";
  const safeLocation = escapeHtml(locationText);
  const countryCode = resolveCountryCode(locationText);
  const locationWithFlag = countryCode
    ? `<span class="event-location-display"><img class="event-country-flag" src="https://flagicons.lipis.dev/flags/4x3/${countryCode}.svg" alt="" aria-hidden="true" loading="lazy" decoding="async" /><span>${safeLocation}</span></span>`
    : safeLocation;
  const safeRegistrationUrl = event.registrationUrl ? escapeHtml(event.registrationUrl) : "";

  return `
    <article class="event-row" data-event-id="${event.id}">
      <h3>${safeName}</h3>
      <p class="event-meta">${formatDate(event.date)}</p>
      <p class="event-meta event-location">${locationWithFlag}</p>
      ${safeRegistrationUrl
      ? `<a class="btn btn-secondary event-action" href="${safeRegistrationUrl}" target="_blank" rel="noopener noreferrer">+ Informações</a>`
      : ""
    }
      </article>
  `;
}

function getUiLanguage() {
  const stored = localStorage.getItem(UI_LANGUAGE_STORAGE_KEY) || "pt";
  return COUNTDOWN_LABELS[stored] ? stored : "pt";
}

function getCountdownLabels() {
  return COUNTDOWN_LABELS[getUiLanguage()] || COUNTDOWN_LABELS.pt;
}

function buildCountdownMarkup(labels) {
  return `
    <div><strong data-countdown-unit="d">0</strong><span data-countdown-label="d">${labels.d}</span></div>
    <div><strong data-countdown-unit="h">0</strong><span data-countdown-label="h">${labels.h}</span></div>
    <div><strong data-countdown-unit="m">0</strong><span data-countdown-label="m">${labels.m}</span></div>
    <div><strong data-countdown-unit="s">0</strong><span data-countdown-label="s">${labels.s}</span></div>
  `;
}

function ensureCountdownMarkup(container) {
  if (!container) {
    return;
  }

  const hasMarkup = Boolean(container.querySelector("[data-countdown-unit='d']"));
  if (hasMarkup) {
    return;
  }

  container.innerHTML = buildCountdownMarkup(getCountdownLabels());
}

function applyCountdownLabels(container) {
  if (!container) {
    return;
  }

  const labels = getCountdownLabels();
  Object.entries(labels).forEach(([unit, text]) => {
    const labelNode = container.querySelector(`[data-countdown-label='${unit}']`);
    if (labelNode) {
      labelNode.textContent = text;
    }
  });
}

function getHighlightCountdownContainer() {
  const card = document.getElementById("next-event-highlight");
  return card ? card.querySelector("[data-highlight-countdown]") : null;
}

function ensureHighlightCountdownMarkup() {
  const container = getHighlightCountdownContainer();
  ensureCountdownMarkup(container);
}

function updateCountdownValues(container, nextEvent) {
  if (!container || !nextEvent) {
    return;
  }

  const cd = calculateCountdown(nextEvent.date);
  const [d, h, m, s] = formatCountdownParts(cd);
  const values = {
    d: d.replace("d", ""),
    h: h.replace("h", ""),
    m: m.replace("m", ""),
    s: s.replace("s", "")
  };

  Object.entries(values).forEach(([unit, value]) => {
    const node = container.querySelector(`[data-countdown-unit='${unit}']`);
    if (node) {
      node.textContent = value;
    }
  });
}

function refreshCountdownLabels() {
  applyCountdownLabels(nextEventCountdown);
  applyCountdownLabels(getHighlightCountdownContainer());
}

function bindCountdownLanguageSwitcher() {
  if (hasBoundCountdownLanguageSwitcher) {
    return;
  }

  const picker = document.getElementById("language-switcher");
  if (!picker) {
    return;
  }

  picker.addEventListener("change", () => {
    refreshCountdownLabels();

    const next = getCurrentHeroEvent();
    if (next) {
      updateHeroCountdownValues(next);
      updateHighlightCountdownValues(next);
    }
  });

  hasBoundCountdownLanguageSwitcher = true;
}

function getCurrentHeroEvent(now = new Date()) {
  if (liveCompetitionEvents.length === 0) {
    return null;
  }

  return liveCompetitionEvents.find((event) => event.date > now) || liveCompetitionEvents[0];
}

function ensureHeroCountdownMarkup() {
  ensureCountdownMarkup(nextEventCountdown);
}

function updateHeroCountdownValues(nextEvent) {
  if (!nextEventCountdown || !nextEvent) {
    return;
  }

  ensureHeroCountdownMarkup();
  applyCountdownLabels(nextEventCountdown);
  updateCountdownValues(nextEventCountdown, nextEvent);
}

function updateHighlightCountdownValues(nextEvent) {
  const container = getHighlightCountdownContainer();
  if (!container || !nextEvent) {
    return;
  }

  ensureHighlightCountdownMarkup();
  applyCountdownLabels(container);
  updateCountdownValues(container, nextEvent);
}

function renderHeroCountdown() {
  if (liveCompetitionEvents.length === 0) {
    currentHeroEventId = "";
    if (nextEventCountdown) {
      nextEventCountdown.innerHTML = "";
    }
    const highlight = getHighlightCountdownContainer();
    if (highlight) {
      highlight.innerHTML = "";
    }
    return;
  }

  const next = getCurrentHeroEvent();
  if (!next) {
    currentHeroEventId = "";
    if (nextEventCountdown) {
      nextEventCountdown.innerHTML = "";
    }
    const highlight = getHighlightCountdownContainer();
    if (highlight) {
      highlight.innerHTML = "";
    }
    return;
  }

  if (!nextEventCountdown) {
    if (currentHeroEventId !== next.id) {
      currentHeroEventId = next.id;
      renderNextEventHighlight();
    }

    updateHighlightCountdownValues(next);
    return;
  }

  if (currentHeroEventId !== next.id) {
    renderHeroNextEvent();
    renderNextEventHighlight();
  }

  updateHeroCountdownValues(next);
}

function renderHeroNextEvent() {
  if (!nextEventName || !nextEventWhen || !nextEventCountdown) {
    return;
  }

  if (liveCompetitionEvents.length === 0) {
    currentHeroEventId = "";
    nextEventName.textContent = "Sem provas previstas";
    nextEventWhen.textContent = "Consulta novamente em breve para novas datas.";
    nextEventCountdown.innerHTML = "";
    return;
  }

  const next = getCurrentHeroEvent();
  if (!next) {
    currentHeroEventId = "";
    nextEventCountdown.innerHTML = "";
    return;
  }

  currentHeroEventId = next.id;
  nextEventName.textContent = next.name;
  nextEventWhen.textContent = `${formatDate(next.date)}${next.location ? ` - ${next.location}` : ""}`;
}




function renderNextEventHighlight() {
  const container = document.getElementById("next-event-highlight");
  const isCompetitionsPage = document.body?.dataset.page === COMPETITIONS_PAGE_KEY;

  if (!container) return;

  if (liveCompetitionEvents.length === 0) {
    container.removeAttribute("data-event-id");
    container.innerHTML = `<p class="muted">Sem competições disponíveis.</p>`;
    return;
  }

  const now = new Date();
  const next = liveCompetitionEvents.find((e) => e.date > now) || liveCompetitionEvents[0];

  const safeName = escapeHtml(next.name);
  const safeLocation = escapeHtml(next.location || "Local por anunciar");
  const safeCoverImageUrl = next.coverImageUrl ? escapeHtml(resolveSiteUrl(next.coverImageUrl)) : "";
  const highlightClasses = `next-event-card highlight${safeCoverImageUrl ? " has-cover" : ""}`;
  container.dataset.eventId = next.id;

  container.innerHTML = `
    <div class="next-event-content">
      <h3>${safeName}</h3>
      <p class="muted">${formatDate(next.date)} • ${safeLocation}</p>
      ${isCompetitionsPage ? '<div class="inline-countdown next-event-inline-countdown" data-highlight-countdown></div>' : ""}
      ${next.registrationUrl
      ? `<a class="btn btn-primary" href="${escapeHtml(next.registrationUrl)}" target="_blank">+ Informações</a>`
      : ""
    }
    </div>
    ${safeCoverImageUrl ? `<img class="event-highlight-cover js-image-load-fx" src="${safeCoverImageUrl}" alt="Capa da competição ${safeName}" loading="lazy" />` : ""}
  `;

  container.className = highlightClasses;
  initImageLoadFx(container);

  if (isCompetitionsPage) {
    ensureHighlightCountdownMarkup();
    updateHighlightCountdownValues(next);
  }
}

function renderEvents() {
  if (!eventsGrid || !emptyState) {
    return;
  }

  if (liveEvents.length === 0) {
    emptyState.hidden = false;
    eventsGrid.innerHTML = "";
    renderHeroNextEvent();
    renderNextEventHighlight();
    return;
  }

  emptyState.hidden = true;
  eventsGrid.innerHTML = liveEvents.map(eventRowTemplate).join("");
  renderHeroNextEvent();
  renderNextEventHighlight();
}

function tickHeroCountdown() {
  renderHeroCountdown();
}

export async function initEventsUi(options = {}) {
  if (!eventsGrid || !emptyState) {
    return;
  }

  const showTrainingsInCalendar = Boolean(options.showTrainingsInCalendar);

  try {
    const allEvents = await fetchEventsFromSheet(config.countdownSheet || {});
    const now = new Date();
    const upcomingEvents = allEvents.filter((event) => event.date.getTime() > now.getTime());
    liveCompetitionEvents = upcomingEvents.filter(isCompetitionEvent);
    liveEvents = showTrainingsInCalendar ? upcomingEvents : liveCompetitionEvents;
    renderEvents();
    bindCountdownLanguageSwitcher();
    refreshCountdownLabels();
    initGoogleTranslate();
    refreshGoogleTranslate({ delay: 700 });
  } catch (error) {
    emptyState.hidden = false;
    emptyState.textContent = "Erro ao carregar competições. Tenta novamente em alguns minutos.";
    initGoogleTranslate();
  }

  setInterval(tickHeroCountdown, 1000);
}
