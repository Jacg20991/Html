// Claves y nombres de ajustes compartidos con la pagina principal.
const ADMIN_STORAGE_KEY = "indie_admin_access";
const ADMIN_KEY_STORAGE = ADMIN_STORAGE_KEY + "_key";
const OWNER_DELETE_KEY = "INDIE_CREATE_OWNER_2026";
const GAME_ICON_KEY = "indie_game_icon";
const DELETE_ENABLED_KEY = "indie_delete_enabled";
const HERO_FIELD_IDS = {
  eyebrow: "heroEyebrowInput",
  description: "heroDescriptionInput",
};

const keyInput = document.getElementById("adminKey");
const accessButton = document.getElementById("adminAccessButton");
const statusBox = document.getElementById("adminStatus");
const loginCard = document.getElementById("loginCard");
const adminSettings = document.getElementById("adminSettings");
const deleteToggle = document.getElementById("deleteToggle");
const gameOptions = document.querySelectorAll('input[name="gameIcon"]');
const heroFields = Object.fromEntries(
  Object.entries(HERO_FIELD_IDS).map(([key, id]) => [
    key,
    document.getElementById(id),
  ]),
);
const saveHeroButton = document.getElementById("saveHeroButton");

const setSettingsControlsEnabled = (enabled) => {
  deleteToggle.disabled = !enabled;
  gameOptions.forEach((option) => {
    option.disabled = !enabled;
  });
  saveHeroButton.disabled = !enabled;
};

setSettingsControlsEnabled(false);

// Mensajes que aparecen en el panel despues de cada accion.
const showStatus = (message, isError = false) => {
  statusBox.textContent = message;
  statusBox.classList.remove(
    "hidden",
    "border-red-200",
    "bg-red-50",
    "text-red-700",
    "border-green-200",
    "bg-green-50",
    "text-green-700",
  );
  if (isError) {
    statusBox.classList.add("border-red-200", "bg-red-50", "text-red-700");
  } else {
    statusBox.classList.add(
      "border-green-200",
      "bg-green-50",
      "text-green-700",
    );
  }
};

const loadSettings = async () => {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      throw new Error("No se pudo cargar la configuración");
    }
    const settings = await response.json();
    if (settings && settings.gameIcon) {
      localStorage.setItem(GAME_ICON_KEY, settings.gameIcon);
    }
    localStorage.setItem(
      DELETE_ENABLED_KEY,
      settings.deleteEnabled === false ? "false" : "true",
    );
    applyHeroSettings(settings.hero);
    setSettingsControlsEnabled(true);
    return settings;
  } catch (error) {
    console.error("Error al cargar la configuración:", error);
    showStatus("No se pudo cargar la configuración del sitio.", true);
    return {};
  }
};

const applyHeroSettings = (hero = {}) => {
  Object.entries(heroFields).forEach(([key, input]) => {
    input.value = typeof hero?.[key] === "string" ? hero[key] : "";
  });
};

const readHeroSettings = () =>
  Object.fromEntries(
    Object.entries(heroFields).map(([key, input]) => [key, input.value]),
  );

const saveSettings = async (settings) => {
  const response = await fetch("/api/config", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": OWNER_DELETE_KEY,
    },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error("No se pudo guardar la configuración");
  }
  return await response.json();
};

// Lee los ajustes guardados y refleja las opciones seleccionadas en pantalla.
const applyGameSelection = () => {
  const selected = localStorage.getItem(GAME_ICON_KEY) ||
    "/img/game/gameminecraft.png";
  gameOptions.forEach((option) => {
    const label = option.closest("label");
    const active = option.value === selected;
    option.checked = active;
    label.classList.toggle("border-emerald-400", active);
    label.classList.toggle("bg-emerald-500/5", active);
    label.classList.toggle("shadow-[0_0_12px_rgba(16,185,129,0.18)]", active);
  });
};

const showAdminPanel = async () => {
  const isLogged = localStorage.getItem(ADMIN_STORAGE_KEY) === "true";
  if (!isLogged) {
    loginCard.classList.remove("hidden");
    adminSettings.classList.add("hidden");
    return;
  }

  await loadSettings();
  loginCard.classList.add("hidden");
  adminSettings.classList.remove("hidden");
  deleteToggle.checked = localStorage.getItem(DELETE_ENABLED_KEY) !== "false";
  applyGameSelection();
};

const loginAdmin = () => {
  const value = keyInput.value.trim();
  if (value !== OWNER_DELETE_KEY) {
    showStatus("Clave incorrecta. Solo el propietario puede acceder.", true);
    localStorage.removeItem(ADMIN_STORAGE_KEY);
    localStorage.removeItem(ADMIN_KEY_STORAGE);
    return;
  }

  localStorage.setItem(ADMIN_STORAGE_KEY, "true");
  localStorage.setItem(ADMIN_KEY_STORAGE, OWNER_DELETE_KEY);
  showStatus("Acceso concedido.");
  showAdminPanel();
};

// Guarda los cambios cuando se modifica una opcion del panel.
deleteToggle.addEventListener("change", async () => {
  const enabled = deleteToggle.checked;
  try {
    await saveSettings({
      gameIcon: localStorage.getItem(GAME_ICON_KEY) ||
        "/img/game/gameminecraft.png",
      deleteEnabled: enabled,
      hero: readHeroSettings(),
    });
    localStorage.setItem(DELETE_ENABLED_KEY, String(enabled));
    showStatus(enabled
      ? "El borrado de publicaciones está activado."
      : "El borrado de publicaciones está desactivado.");
  } catch (error) {
    console.error("Error al guardar la configuración:", error);
    deleteToggle.checked = !enabled;
    showStatus("No se pudo guardar la configuración.", true);
  }
});

gameOptions.forEach((option) => {
  option.addEventListener("change", async () => {
    if (!option.checked) return;
    try {
      await saveSettings({
        gameIcon: option.value,
        deleteEnabled: localStorage.getItem(DELETE_ENABLED_KEY) !== "false",
        hero: readHeroSettings(),
      });
      localStorage.setItem(GAME_ICON_KEY, option.value);
      applyGameSelection();
      showStatus("Icono del juego actual actualizado.");
    } catch (error) {
      console.error("Error al guardar la configuración:", error);
      applyGameSelection();
      showStatus("No se pudo guardar la configuración.", true);
    }
  });
});

saveHeroButton.addEventListener("click", async () => {
  try {
    await saveSettings({
      gameIcon: localStorage.getItem(GAME_ICON_KEY) ||
        "/img/game/gameminecraft.png",
      deleteEnabled: localStorage.getItem(DELETE_ENABLED_KEY) !== "false",
      hero: readHeroSettings(),
    });
    showStatus("Contenido de la hero actualizado.");
  } catch (error) {
    console.error("Error al guardar la hero:", error);
    showStatus("No se pudo guardar el contenido de la hero.", true);
  }
});

accessButton.addEventListener("click", loginAdmin);
keyInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loginAdmin();
  }
});

if (localStorage.getItem(ADMIN_STORAGE_KEY) === "true") {
  showAdminPanel();
}
