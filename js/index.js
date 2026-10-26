// Frases que se eligen al azar para el titulo de la pestana del navegador.
const motds = [
  "Ingenieria!!!",
  "Son zombis?!?!",
  "Siempre el primero!!!",
  "Helicoptero de chocolate",
  "No llores",
  ":D",
  ":P",
  ":)",
  "Arroz",
  "Maicra maicra",
];

const randomMOTD = motds[Math.floor(Math.random() * motds.length)];
document.title = randomMOTD;



// Ajustes generales de la pagina principal y conexiones con sus elementos HTML.
const API_URL = "/api/publicaciones";
const ITEMS_PER_PAGE = 6;
const OWNER_DELETE_KEY = "INDIE_CREATE_OWNER_2026";
const ADMIN_STORAGE_KEY = "indie_admin_access";
const form = document.getElementById("publicationForm");
const list = document.getElementById("publicationsList");
const pagination = document.getElementById("pagination");
const imageUrlInput = document.getElementById("publicationImageUrl");
const imageFileInput = document.getElementById("publicationImage");
const videoUrlInput = document.getElementById("publicationVideoUrl");
const videoFileInput = document.getElementById("publicationVideo");
const publisherInput = document.getElementById("publicationPublisher");
const submitButton = form.querySelector('button[type="submit"]');
let currentPage = 1;
let lastRenderedPublicationIds = new Set();
let lastPublicationsSnapshot = "";
let lastRenderedPageKey = "";
let publicationCache = [];
let isRenderingPublications = false;

// Estado del juego y permisos usados para mostrar acciones de administracion.
const isAdminSession = () => localStorage.getItem(ADMIN_STORAGE_KEY) === "true";
const isDeleteEnabled = () =>
  localStorage.getItem("indie_delete_enabled") !== "false";
const getSelectedGameIcon = () =>
  localStorage.getItem("indie_game_icon") || "/img/game/gameminecraft.png";

const HERO_ELEMENT_IDS = {
  eyebrow: "heroEyebrow",
  title: "heroTitle",
  description: "heroDescription",
  peopleLabel: "heroPeopleLabel",
  peopleValue: "heroPeopleValue",
  peopleDetail: "heroPeopleDetail",
  auraLabel: "heroAuraLabel",
  auraValue: "heroAuraValue",
  auraDetail: "heroAuraDetail",
  finishedLabel: "heroFinishedLabel",
  finishedValue: "heroFinishedValue",
  finishedDetail: "heroFinishedDetail",
  ipLabel: "heroIpLabel",
  ipValue: "heroIpValue",
  ipDetail: "heroIpDetail",
};

const applyHeroSettings = (hero) => {
  if (!hero || typeof hero !== "object") return;
  Object.entries(HERO_ELEMENT_IDS).forEach(([key, id]) => {
    const element = document.getElementById(id);
    if (element && typeof hero[key] === "string") {
      element.textContent = hero[key];
    }
  });
};

const loadSettings = async () => {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      throw new Error("No se pudo cargar la configuración");
    }
    const settings = await response.json();
    if (settings && typeof settings === "object") {
      if (settings.gameIcon) {
        localStorage.setItem("indie_game_icon", settings.gameIcon);
      }
      localStorage.setItem(
        "indie_delete_enabled",
        settings.deleteEnabled === false ? "false" : "true",
      );
      applyHeroSettings(settings.hero);
    }
    return settings || {};
  } catch (error) {
    return {};
  }
};

const updateGameStatusBadge = () => {
  const badge = document.getElementById("gameStatusBadge");
  const icon = document.getElementById("gameStatusIcon");
  const label = badge?.querySelector("span");
  if (!badge) return;

  const gameIcon = getSelectedGameIcon();
  if (gameIcon === "offline") {
    if (icon) icon.remove();
    if (label) {
      label.textContent = "Offline";
      label.className = "font-semibold text-red-600";
    }
    badge.classList.remove("hidden");
    return;
  }

  if (icon) {
    icon.src = gameIcon;
    icon.classList.remove("hidden");
  } else if (badge) {
    const img = document.createElement("img");
    img.id = "gameStatusIcon";
    img.src = gameIcon;
    img.alt = "Juego actual";
    img.className = "h-6 w-6 object-contain opacity-90";
    badge.insertBefore(img, label || badge.firstChild);
  }

  if (label) {
    label.textContent = "Juego actual";
    label.className = "text-emerald-600 font-semibold";
  }
  badge.classList.remove("hidden");
};

const canDeletePublications = () =>
  isAdminSession() && ownerKeyMatches() && isDeleteEnabled();

const ownerKeyMatches = () => {
  const storedValue = localStorage.getItem(ADMIN_STORAGE_KEY + "_key");
  return storedValue === OWNER_DELETE_KEY;
};

// Funciones auxiliares para mostrar fechas, mensajes y contenido multimedia.
const formatDateTime = (timestamp) => {
  const value = Number(timestamp);
  if (!value || Number.isNaN(value)) return "Sin fecha";
  const date = new Date(value);
  return new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const createUserVoteId = () => {
  const newId = window.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem("indie_user_vote_id", newId);
  return newId;
};

const showStatus = (message, isError = false) => {
  const existing = document.getElementById("formStatus");
  if (existing) {
    existing.remove();
  }

  const status = document.createElement("div");
  status.id = "formStatus";
  status.className = isError
    ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    : "rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700";
  status.textContent = message;
  form.insertBefore(status, form.lastElementChild);
};

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const validateImageUrl = (value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
};

const isYouTubeUrl = (value = "") => {
  if (!value) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(
      /^m\./,
      "",
    );
    return host === "youtube.com" || host.endsWith(".youtube.com") ||
      host === "youtu.be";
  } catch {
    return false;
  }
};

const getYouTubeEmbedUrl = (value = "") => {
  if (!isYouTubeUrl(value)) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(
      /^m\./,
      "",
    );
    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\//, "");
      return id ? `https://www.youtube.com/embed/${id}` : value;
    }

    const videoId = url.searchParams.get("v") ||
      (url.pathname.startsWith("/shorts/")
        ? url.pathname.split("/").filter(Boolean)[1]
        : null);
    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}`;
    }

    const lastSegment = url.pathname.split("/").filter(Boolean).at(-1);
    return lastSegment ? `https://www.youtube.com/embed/${lastSegment}` : value;
  } catch {
    return value;
  }
};

const getVideoMimeType = (videoPath = "") => {
  const normalized = String(videoPath).toLowerCase();
  if (normalized.endsWith(".webm")) return "video/webm";
  if (normalized.endsWith(".ogg")) return "video/ogg";
  if (normalized.endsWith(".mov")) return "video/quicktime";
  if (normalized.endsWith(".avi")) return "video/x-msvideo";
  return "video/mp4";
};

const setSubmitState = (isLoading) => {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Guardando..." : "Crear publicación";
  submitButton.classList.toggle("opacity-70", isLoading);
  submitButton.classList.toggle("cursor-not-allowed", isLoading);
};

// Lectura, eliminacion y paginacion de las publicaciones del servidor.
const loadPublications = async () => {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error("Error al cargar publicaciones");
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("No se pudieron cargar las publicaciones:", error);
    return [];
  }
};

const removePublication = async (id) => {
  if (!canDeletePublications()) {
    showStatus("Solo el propietario puede eliminar publicaciones.", true);
    return;
  }

  try {
    const response = await fetch(
      `${API_URL}/${id}?key=${encodeURIComponent(OWNER_DELETE_KEY)}`,
      {
        method: "DELETE",
        headers: {
          "X-Delete-Key": OWNER_DELETE_KEY,
        },
      },
    );
    if (!response.ok) {
      throw new Error("No se pudo eliminar la publicación");
    }
    currentPage = 1;
    showStatus("Publicación eliminada correctamente.");
    await renderPublications();
  } catch (error) {
    console.error("No se pudo eliminar la publicación:", error);
    showStatus("No se pudo eliminar la publicación.", true);
  }
};

const renderPagination = (totalItems) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }

  pagination.innerHTML = "";
  const buttons = [];

  for (let page = 1; page <= totalPages; page += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = page;
    button.className = `rounded-md border px-3 py-1.5 text-sm font-medium ${
      page === currentPage
        ? "border-primary bg-primary text-on-primary"
        : "border-outline-variant bg-surface text-on-surface hover:bg-surface-container"
    } `;
    button.addEventListener("click", () => {
      currentPage = page;
      renderPublications();
    });
    buttons.push(button);
  }

  buttons.forEach((button) => pagination.appendChild(button));
};

// Preparacion de datos y creacion de cada tarjeta de publicacion.
const normalizePublication = (publication = {}) => ({
  id: publication.id || "",
  publisher: typeof publication.publisher === "string"
    ? publication.publisher
    : "",
  title: publication.title || "",
  description: publication.description ?? "",
  image: publication.image || null,
  video: publication.video || null,
  createdAt: Number(publication.createdAt ?? publication.publishedAt ?? 0),
  likes: Number(publication.likes || 0),
  dislikes: Number(publication.dislikes || 0),
  votes: publication.votes && typeof publication.votes === "object"
    ? publication.votes
    : {},
});

const buildPublicationsSnapshot = (items = []) =>
  JSON.stringify(items.map((publication) => ({
    id: publication.id,
    publisher: publication.publisher || "",
    title: publication.title,
    description: publication.description,
    image: publication.image || "",
    video: publication.video || "",
    createdAt: Number(publication.createdAt ?? publication.publishedAt ?? 0),
    likes: Number(publication.likes || 0),
    dislikes: Number(publication.dislikes || 0),
    votes: publication.votes || {},
  })));

const buildPublicationRenderSignature = (publication = {}) =>
  JSON.stringify({
    id: publication.id || "",
    publisher: publication.publisher || "",
    title: publication.title || "",
    description: publication.description ?? "",
    image: publication.image || "",
    video: publication.video || "",
    createdAt: Number(publication.createdAt ?? publication.publishedAt ?? 0),
  });

const updateVoteUI = (publicationId, updatedPublication, userId) => {
  const article = Array.from(list.querySelectorAll("article")).find((node) =>
    node.dataset.publicationId === publicationId
  );
  if (!article || !updatedPublication) {
    return;
  }

  const safeVotes =
    updatedPublication.votes && typeof updatedPublication.votes === "object"
      ? updatedPublication.votes
      : {};
  const currentVote = safeVotes[userId] || null;
  const likeButton = article.querySelector(".vote-like");
  const dislikeButton = article.querySelector(".vote-dislike");
  const likeCount = likeButton?.querySelector("span");
  const dislikeCount = dislikeButton?.querySelector("span");

  if (likeCount) {
    likeCount.textContent = Number(updatedPublication.likes || 0);
  }
  if (dislikeCount) {
    dislikeCount.textContent = Number(updatedPublication.dislikes || 0);
  }

  const syncIconState = (button, reaction, activeReaction) => {
    if (!button) return;
    const icon = button.querySelector("img");
    const isActive = activeReaction === reaction;
    button.classList.toggle("opacity-100", isActive);
    button.classList.toggle("opacity-80", !isActive);
    if (icon) {
      const iconSrc = reaction === "like"
        ? (isActive ? "/img/like_red_filled.png" : "/img/like.png")
        : (isActive ? "/img/nolike_black_filled.png" : "/img/nolike.png");
      icon.src = iconSrc;
    }
  };

  syncIconState(likeButton, "like", currentVote);
  syncIconState(dislikeButton, "dislike", currentVote);
};

const createPublicationArticle = (publication, userId) => {
  const article = document.createElement("article");
  article.dataset.publicationId = publication.id;
  article.dataset.renderSignature = buildPublicationRenderSignature(
    publication,
  );

  const mediaStamp = publication.createdAt || publication.publishedAt ||
    Date.now();
  const hasVideoSource = typeof publication.video === "string" &&
    publication.video.trim() !== "";
  const hasImageSource = typeof publication.image === "string" &&
    publication.image.trim() !== "";
  const isYouTubeVideo = hasVideoSource && isYouTubeUrl(publication.video);
  const resolvedVideoUrl = hasVideoSource
    ? (isYouTubeVideo
      ? getYouTubeEmbedUrl(publication.video)
      : `${publication.video}${
        publication.video.includes("?") ? "&" : "?"
      }_ts=${mediaStamp}`)
    : "";

  const videoMarkup = hasVideoSource
    ? (isYouTubeVideo
      ? `
          <div class="mb-4 overflow-hidden rounded-md border border-outline-variant/40 bg-surface">
            <div class="aspect-video w-full bg-black">
              <iframe
                src="${escapeHtml(resolvedVideoUrl)}"
                class="h-full w-full"
                title="Video de YouTube"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerpolicy="strict-origin-when-cross-origin"
                allowfullscreen>
              </iframe>
            </div>
          </div>
        `
      : `
          <div class="mb-4 overflow-hidden rounded-md border border-outline-variant/40 bg-surface">
            <video controls preload="auto" class="block max-w-full h-auto w-full bg-black">
              <source src="${escapeHtml(resolvedVideoUrl)}" type="${
        escapeHtml(getVideoMimeType(publication.video))
      }">
              Tu navegador no soporta la reproducción de video.
            </video>
          </div>
        `)
    : "";

  const imageMarkup = hasImageSource
    ? `
      <div class="mb-4 overflow-hidden rounded-md border border-outline-variant/40 bg-surface inline-block">
        <img src="${
      escapeHtml(
        `${publication.image}${
          publication.image.includes("?") ? "&" : "?"
        }_ts=${mediaStamp}`,
      )
    }" alt="${escapeHtml(publication.title)}" class="block max-w-full h-auto" />
      </div>
    `
    : "";

  const publicationTimestamp = Number(
    publication.createdAt ?? publication.publishedAt ?? 0,
  );
  const likes = Number(publication.likes || 0);
  const dislikes = Number(publication.dislikes || 0);
  const safeVotes = publication.votes && typeof publication.votes === "object"
    ? publication.votes
    : {};
  const currentVote = safeVotes[userId] ? safeVotes[userId] : null;
  const likeIcon = currentVote === "like"
    ? "/img/like_red_filled.png"
    : "/img/like.png";
  const dislikeIcon = currentVote === "dislike"
    ? "/img/nolike_black_filled.png"
    : "/img/nolike.png";
  const publicationDescription = publication.description ?? "";
  const publicationPublisher = publication.publisher || "Desconocido";

  article.className =
    "p-6 bg-surface-container-low border border-outline-variant/50 w-full transition-all duration-500 ease-out animate-[fadeIn_0.45s_ease-out]";
  article.innerHTML = `
    <div class="flex items-center justify-between gap-3 mb-2">
      <span class="text-xs font-label text-secondary font-medium tracking-wide uppercase">Publicación</span>
      <button type="button" class="delete-publication rounded-md border border-error/40 bg-error/10 px-2 py-1 text-[11px] font-medium text-error hover:bg-error/20" aria-label="Eliminar publicación">Eliminar</button>
    </div>
    <div class="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-secondary">
      ${escapeHtml(formatDateTime(publicationTimestamp))}
    </div>
    <p class="mb-2 text-xs font-label tracking-wide text-secondary">
      Publicado por <span class="font-semibold text-on-surface">${
    escapeHtml(publicationPublisher)
  }</span>
    </p>
    <h3 class="font-headline text-2xl font-bold text-on-surface mt-2 mb-4">${
    escapeHtml(publication.title)
  }</h3>
    ${videoMarkup || imageMarkup}
    ${publication.image && publication.video ? imageMarkup + videoMarkup : ""}
    <p class="font-body text-sm text-on-surface-variant leading-relaxed mt-4">${
    escapeHtml(publicationDescription)
  }</p>
    <div class="mt-4 flex items-center gap-5">
      <button type="button" class="vote-button vote-like flex items-center gap-2 bg-transparent border-0 p-0 ${
    currentVote === "like" ? "opacity-100" : "opacity-80"
  }" data-id="${
    escapeHtml(publication.id)
  }" data-reaction="like" aria-label="Me gusta">
        <img src="${likeIcon}" alt="Me gusta" class="h-5 w-5 object-contain" />
        <span class="text-sm font-medium" style="color: #808080;">${likes}</span>
      </button>
      <button type="button" class="vote-button vote-dislike flex items-center gap-2 bg-transparent border-0 p-0 ${
    currentVote === "dislike" ? "opacity-100" : "opacity-80"
  }" data-id="${
    escapeHtml(publication.id)
  }" data-reaction="dislike" aria-label="No me gusta">
        <img src="${dislikeIcon}" alt="No me gusta" class="h-5 w-5 object-contain" />
        <span class="text-sm font-medium" style="color: #808080;">${dislikes}</span>
      </button>
    </div>
  `;

  article.querySelectorAll(".vote-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const reaction = button.dataset.reaction;
      const id = button.dataset.id;
      try {
        const response = await fetch(
          `${API_URL}/${id}?reaction=${encodeURIComponent(reaction)}&userId=${
            encodeURIComponent(userId)
          }`,
          {
            method: "DELETE",
          },
        );
        if (!response.ok) {
          throw new Error("No se pudo registrar la reacción");
        }

        const updatedPublication = await response.json();
        const cacheIndex = publicationCache.findIndex((publicationItem) =>
          publicationItem.id === id
        );
        if (cacheIndex >= 0) {
          publicationCache[cacheIndex] = normalizePublication(
            updatedPublication,
          );
          lastPublicationsSnapshot = buildPublicationsSnapshot(
            publicationCache,
          );
        }
        updateVoteUI(id, normalizePublication(updatedPublication), userId);
      } catch (error) {
        console.error("Error al votar:", error);
        showStatus("No se pudo registrar la reacción.", true);
      }
    });
  });

  if (canDeletePublications()) {
    const deleteButton = article.querySelector(".delete-publication");
    deleteButton.disabled = false;
    deleteButton.title = "Eliminar publicación";
    deleteButton.addEventListener(
      "click",
      () => removePublication(publication.id),
    );
  } else {
    article.querySelector(".delete-publication")?.remove();
  }

  return article;
};

const syncVisibleOrder = (desiredIds = []) => {
  const currentNodes = Array.from(list.querySelectorAll("article"));
  const currentIds = currentNodes.map((article) =>
    article.dataset.publicationId
  );
  if (currentIds.join("|") === desiredIds.join("|")) {
    return;
  }

  const nodeMap = new Map(
    currentNodes.map((article) => [article.dataset.publicationId, article]),
  );
  for (let index = 0; index < desiredIds.length; index += 1) {
    const id = desiredIds[index];
    const node = nodeMap.get(id);
    if (!node) continue;
    const anchor = list.children[index] || null;
    if (anchor !== node) {
      list.insertBefore(node, anchor);
    }
  }
};

// Actualiza la lista y conserva el orden y la pagina visibles.
const renderPublications = async () => {
  if (isRenderingPublications) {
    return;
  }

  isRenderingPublications = true;
  try {
    const publications = (await loadPublications()).map(normalizePublication);
    const sortedPublications = [...publications].sort((a, b) => {
      const aValue = Number(a.createdAt ?? a.publishedAt ?? 0);
      const bValue = Number(b.createdAt ?? b.publishedAt ?? 0);
      return bValue - aValue;
    });
    const totalPages = Math.max(
      1,
      Math.ceil(sortedPublications.length / ITEMS_PER_PAGE),
    );
    if (currentPage > totalPages) {
      currentPage = totalPages;
    }

    const pageKey = `${currentPage}-${totalPages}`;
    const nextSnapshot = buildPublicationsSnapshot(sortedPublications);
    const hasVisiblePagination = pagination.childElementCount > 0;
    if (
      nextSnapshot === lastPublicationsSnapshot &&
      lastRenderedPageKey === pageKey && list.childElementCount > 0 &&
      hasVisiblePagination
    ) {
      return;
    }

    publicationCache = sortedPublications;
    lastPublicationsSnapshot = nextSnapshot;
    lastRenderedPageKey = pageKey;

    const previousIds = new Set(lastRenderedPublicationIds);
    const nextIds = new Set(
      sortedPublications.map((publication) => publication.id),
    );
    const hasNewOrRemovedItems = previousIds.size !== nextIds.size ||
      [...nextIds].some((id) => !previousIds.has(id)) ||
      [...previousIds].some((id) => !nextIds.has(id));
    lastRenderedPublicationIds = nextIds;

    if (!sortedPublications.length) {
      list.innerHTML =
        '<p class="text-sm text-on-surface-variant">No hay publicaciones todavía.</p>';
      pagination.innerHTML = "";
      return;
    }

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const visiblePublications = sortedPublications.slice(
      start,
      start + ITEMS_PER_PAGE,
    );
    const desiredPublicationIds = [];
    const nodeMap = new Map(
      Array.from(list.querySelectorAll("article")).map((
        article,
      ) => [article.dataset.publicationId, article]),
    );

    visiblePublications.forEach((publication) => {
      desiredPublicationIds.push(publication.id);
      const userId = localStorage.getItem("indie_user_vote_id") ||
        createUserVoteId();
      let article = nodeMap.get(publication.id);

      if (!article) {
        article = createPublicationArticle(publication, userId);
        const shouldAnimate = !previousIds.has(publication.id) ||
          hasNewOrRemovedItems;
        if (shouldAnimate) {
          article.style.opacity = "0";
          requestAnimationFrame(() => {
            article.style.opacity = "1";
          });
        }
        if (list.firstChild) {
          list.insertBefore(article, list.firstChild);
        } else {
          list.appendChild(article);
        }
      } else {
        const signature = buildPublicationRenderSignature(publication);
        if (article.dataset.renderSignature !== signature) {
          const replacement = createPublicationArticle(publication, userId);
          article.replaceWith(replacement);
          article = replacement;
        }
      }

      updateVoteUI(publication.id, publication, userId);
      nodeMap.set(publication.id, article);
    });

    Array.from(list.querySelectorAll("article")).forEach((article) => {
      if (!desiredPublicationIds.includes(article.dataset.publicationId)) {
        article.remove();
      }
    });

    syncVisibleOrder(desiredPublicationIds);
    renderPagination(sortedPublications.length);
  } finally {
    isRenderingPublications = false;
  }
};

// Valida y envia el formulario para crear una publicacion.
form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = document.getElementById("publicationTitle").value.trim();
  const publisher = publisherInput.value.trim();
  const description = document.getElementById("publicationDescription").value
    .trim();
  const customUrl = imageUrlInput.value.trim();
  const file = imageFileInput.files[0];
  const customVideoUrl = videoUrlInput.value.trim();
  const videoFile = videoFileInput.files[0];

  const hasDescriptionContent = Boolean(description);
  const hasImageContent = Boolean(customUrl) || Boolean(file);
  const hasVideoContent = Boolean(customVideoUrl) || Boolean(videoFile);

  if (!title) {
    showStatus("Completa el título.", true);
    return;
  }

  if (!publisher) {
    showStatus("Escribe el nombre del publicador.", true);
    publisherInput.focus();
    return;
  }

  if (publisher.length > 60) {
    showStatus("El nombre del publicador no puede superar 60 caracteres.", true);
    publisherInput.focus();
    return;
  }

  if (!hasDescriptionContent && !hasImageContent && !hasVideoContent) {
    showStatus("Añade una descripción, una imagen o un video.", true);
    return;
  }

  if (customUrl && !validateImageUrl(customUrl)) {
    showStatus(
      "La URL de la imagen no es válida. Usa una URL con http:// o https://",
      true,
    );
    return;
  }

  if (customVideoUrl && !validateImageUrl(customVideoUrl)) {
    showStatus(
      "La URL del video no es válida. Usa una URL con http:// o https://",
      true,
    );
    return;
  }

  if (file) {
    const allowedExtensions = ["png", "jpg", "jpeg", "webp", "gif"];
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !allowedExtensions.includes(extension)) {
      showStatus(
        "La imagen debe ser un archivo PNG, JPG, JPEG, WEBP o GIF.",
        true,
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showStatus("La imagen es demasiado grande. Máximo 5 MB.", true);
      return;
    }
  }

  if (videoFile) {
    const allowedVideoExtensions = ["mp4", "webm", "ogg", "mov", "avi"];
    const extension = videoFile.name.split(".").pop()?.toLowerCase();
    if (!extension || !allowedVideoExtensions.includes(extension)) {
      showStatus(
        "El video debe ser un archivo MP4, WEBM, OGG, MOV o AVI.",
        true,
      );
      return;
    }

    if (videoFile.size > 20 * 1024 * 1024) {
      showStatus("El video es demasiado grande. Máximo 20 MB.", true);
      return;
    }
  }

  try {
    setSubmitState(true);
    const formData = new FormData();
    formData.append("publisher", publisher);
    formData.append("title", title);
    formData.append("description", description);

    if (file) {
      formData.append("image", file);
      formData.append("image_filename", file.name);
    }

    if (customUrl) {
      formData.append("imageUrl", customUrl);
    }

    if (videoFile) {
      formData.append("video", videoFile);
      formData.append("video_filename", videoFile.name);
    }

    if (customVideoUrl) {
      formData.append("videoUrl", customVideoUrl);
    }

    const response = await fetch(API_URL, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Error al guardar la publicación");
    }

    currentPage = 1;
    showStatus("Publicación creada correctamente.");
    form.reset();
    await renderPublications();
  } catch (error) {
    console.error("No se pudo guardar la publicación:", error);
    showStatus("No se pudo guardar la publicación.", true);
  } finally {
    setSubmitState(false);
  }
});

// Sincroniza las historias y el juego actual periodicamente.
const refreshLiveContent = async () => {
  await loadSettings();
  updateGameStatusBadge();
  await renderPublications();
};

updateGameStatusBadge();
renderPublications();
setInterval(refreshLiveContent, 1500);
