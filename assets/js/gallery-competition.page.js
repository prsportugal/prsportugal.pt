import { loadSharedComponents } from "./components.js";
import { refreshGoogleTranslate } from "./translate.js";

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

async function fetchInfo(slug) {
  const response = await fetch(`../provas/${encodeURIComponent(slug)}.json`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Falha ao carregar dados da competição.");
  }

  return response.json();
}

function initLightbox() {
  const lightbox = document.getElementById("gallery-lightbox");
  const lightboxImage = document.getElementById("gallery-lightbox-image");
  const lightboxCaption = document.getElementById("gallery-lightbox-caption");
  const closeButton = document.getElementById("gallery-lightbox-close");
  const prevButton = document.getElementById("gallery-lightbox-prev");
  const nextButton = document.getElementById("gallery-lightbox-next");

  if (!lightbox || !lightboxImage || !lightboxCaption || !closeButton || !prevButton || !nextButton) {
    return;
  }

  const items = [...document.querySelectorAll("[data-lightbox-src]")];
  let currentIndex = 0;

  const openAt = (index) => {
    if (items.length === 0) {
      return;
    }

    const normalized = (index + items.length) % items.length;
    const node = items[normalized];
    const src = node.getAttribute("data-lightbox-src") || "";
    const caption = node.getAttribute("data-caption") || "";
    const alt = node.getAttribute("data-alt") || caption;

    currentIndex = normalized;
    lightboxImage.setAttribute("src", src);
    lightboxImage.setAttribute("alt", alt);
    lightboxCaption.textContent = caption;
    lightbox.hidden = false;
  };

  const close = () => {
    lightbox.hidden = true;
    lightboxImage.setAttribute("src", "");
    lightboxImage.setAttribute("alt", "");
    lightboxCaption.textContent = "";
  };

  closeButton.addEventListener("click", close);
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      close();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (lightbox.hidden) {
      return;
    }

    if (event.key === "Escape") {
      close();
    }

    if (event.key === "ArrowLeft") {
      openAt(currentIndex - 1);
    }

    if (event.key === "ArrowRight") {
      openAt(currentIndex + 1);
    }
  });

  prevButton.addEventListener("click", () => openAt(currentIndex - 1));
  nextButton.addEventListener("click", () => openAt(currentIndex + 1));

  items.forEach((node, index) => {
    node.addEventListener("click", (event) => {
      event.preventDefault();
      openAt(index);
    });
  });
}

function render(info, slug) {
  const title = document.getElementById("gallery-title");
  const meta = document.getElementById("gallery-meta");
  const photos = document.getElementById("gallery-photos");
  const empty = document.getElementById("gallery-photos-empty");

  if (!title || !meta || !photos || !empty) {
    return;
  }

  const name = info.title || slug;
  const folder = typeof info.folder === "string" ? info.folder.trim() : "";
  title.textContent = name;

  const location = info.location ? ` - ${info.location}` : "";
  const description = info.description ? ` - ${info.description}` : "";
  meta.textContent = `${formatDate(info.date)}${location}${description}`;

  const images = Array.isArray(info.images) ? info.images : [];
  if (images.length === 0) {
    empty.hidden = false;
    photos.innerHTML = "";
    return;
  }

  empty.hidden = true;
  photos.innerHTML = images
    .map((image, index) => {
      const source = typeof image === "string" ? image : image?.url;
      if (!source) {
        return "";
      }

      const src = escapeHtml(resolveGalleryMediaUrl(String(source), slug, folder));
      const caption = typeof image === "object" && typeof image?.caption === "string" ? image.caption : "";
      const alt = escapeHtml(caption || `${name} - Fotografia ${index + 1}`);
      const safeCaption = escapeHtml(caption || `${name} - Fotografia ${index + 1}`);

      return `<a class="gallery-media-shell" href="${src}" target="_blank" rel="noopener noreferrer" data-lightbox-src="${src}" data-caption="${safeCaption}" data-alt="${alt}"><img class="js-gallery-media" src="${src}" alt="${alt}" loading="lazy" /></a>`;
    })
    .join("");

  initElegantImageLoading(photos);
  initLightbox();
}

async function bootstrap() {
  await loadSharedComponents();

  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug") || "";
  if (!slug) {
    const title = document.getElementById("gallery-title");
    const meta = document.getElementById("gallery-meta");
    if (title) {
      title.textContent = "Competição não definida";
    }
    if (meta) {
      meta.textContent = "Abre esta página a partir da lista da galeria.";
    }
    return;
  }

  try {
    const info = await fetchInfo(slug);
    render(info, slug);
    refreshGoogleTranslate({ delay: 250 });
  } catch (_error) {
    const title = document.getElementById("gallery-title");
    const meta = document.getElementById("gallery-meta");
    if (title) {
      title.textContent = "Não foi possível carregar esta galeria";
    }
    if (meta) {
      meta.textContent = "Verifica se o Info.json existe e está válido para esta competição.";
    }
    refreshGoogleTranslate({ delay: 250 });
  }
}

bootstrap();
