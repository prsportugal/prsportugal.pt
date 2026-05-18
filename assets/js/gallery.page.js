import { loadSharedComponents } from "./components.js";
import { refreshGoogleTranslate } from "./translate.js";

const config = window.PRS_CONFIG || {};
const basePath = (document.body?.dataset.base || ".").replace(/\/+$/, "");

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

function resolveGalleryMediaUrl(value, slug, folderOverride = "") {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }

  if (/^(?:[a-z]+:)?\/\//i.test(source) || source.startsWith("data:") || source.startsWith("blob:")) {
    return source;
  }

  if (source.includes("/")) {
    return resolveSiteUrl(source);
  }

  const folder = String(folderOverride || slug || "").trim();
  if (!folder) {
    return resolveSiteUrl(source);
  }

  return resolveSiteUrl(`galeria/provas/${folder}/${source}`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  if (!value) {
    return "Data por anunciar";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return escapeHtml(value);
  }

  const formatted = new Intl.DateTimeFormat("pt-PT", { dateStyle: "long" }).format(parsed);
  return formatted.charAt(0).toLocaleUpperCase("pt-PT") + formatted.slice(1);
}

function initElegantImageLoading(root = document) {
  const images = root.querySelectorAll("img.js-gallery-media");

  images.forEach((image) => {
    const shell = image.closest(".gallery-media-shell");
    if (!shell) {
      return;
    }

    const markLoaded = () => {
      shell.classList.add("is-loaded");
    };

    if (image.complete) {
      markLoaded();
      return;
    }

    image.addEventListener("load", markLoaded, { once: true });
    image.addEventListener("error", markLoaded, { once: true });
  });
}

function cardTemplate(slug, info) {
  const title = escapeHtml(info.title || slug);
  const location = escapeHtml(info.location || "Local por anunciar");
  const date = formatDate(info.date);
  const count = Array.isArray(info.images) ? info.images.length : 0;
  const folder = typeof info.folder === "string" ? info.folder.trim() : "";
  const thumbnail = typeof info.thumbnail === "string" ? info.thumbnail.trim() : "";
  const thumbUrl = resolveGalleryMediaUrl(thumbnail, slug, folder);
  const safeThumb = thumbUrl ? escapeHtml(thumbUrl) : "";

  return `
    <article class="gallery-card">
      ${safeThumb
      ? `<div class="gallery-media-shell gallery-card-thumb-shell"><img class="gallery-card-thumb js-gallery-media" src="${safeThumb}" alt="Thumbnail de ${title}" loading="lazy" /></div>`
      : ""
    }
      <h2>${title}</h2>
      <p class="muted">${date} - ${location}</p>
      <p>${count} fotografia(s)</p>
      <a class="btn btn-secondary" href="./competicao/?slug=${encodeURIComponent(slug)}">Abrir galeria</a>
    </article>
  `;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Falha ao carregar ${url}`);
  }

  return response.json();
}

async function loadGalleryList() {
  const host = document.getElementById("gallery-list");
  const empty = document.getElementById("gallery-empty");
  if (!host || !empty) {
    return;
  }

  try {
    const indexPath = String(config.gallery?.indexPath || "galeria/provas/index.json").replace(/^\/+/, "");
    const galleryDataDir = indexPath.replace(/\/[^/]+$/, "");
    const index = await fetchJson(`${basePath}/${indexPath}`);
    const files = Array.isArray(index.competitions) ? index.competitions : [];

    if (files.length === 0) {
      empty.hidden = false;
      host.innerHTML = "";
      empty.textContent = "Sem galerias disponíveis. Atualiza o galeria/provas/index.json.";
      return;
    }

    const infos = await Promise.all(
      files.map(async (entry) => {
        const fileName = String(entry);
        const slug = fileName.replace(/\.json$/i, "");
        try {
          const info = await fetchJson(`${basePath}/${galleryDataDir}/${encodeURIComponent(fileName)}`);
          return { slug, info };
        } catch (_error) {
          return { slug, info: {} };
        }
      })
    );

    host.innerHTML = infos.map(({ slug, info }) => cardTemplate(slug, info)).join("");
    initElegantImageLoading(host);
    empty.hidden = true;
  } catch (_error) {
    empty.hidden = false;
    empty.textContent = "Não foi possível carregar a galeria neste momento.";
  }
}

async function bootstrap() {
  await loadSharedComponents();
  await loadGalleryList();
  refreshGoogleTranslate({ delay: 250 });
}

bootstrap();
