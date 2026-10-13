// Claves y nombres de ajustes compartidos con la pagina principal.
const ADMIN_STORAGE_KEY = "indie_admin_access";
const ADMIN_KEY_STORAGE = ADMIN_STORAGE_KEY + "_key";
const OWNER_DELETE_KEY = "INDIE_CREATE_OWNER_2026";
const GAME_ICON_KEY = "indie_game_icon";
const DELETE_ENABLED_KEY = "indie_delete_enabled";

const keyInput = document.getElementById("adminKey");
const accessButton = document.getElementById("adminAccessButton");
const statusBox = document.getElementById("adminStatus");
const loginCard = document.getElementById("loginCard");
const adminSettings = document.getElementById("adminSettings");
const deleteToggle = document.getElementById("deleteToggle");
const gameOptions = document.querySelectorAll('input[name="gameIcon"]');

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
    return settings;
  } catch (error) {
    return {};
  }
};

const saveSettings = async (gameIcon, deleteEnabled) => {
  try {
    const response = await fetch("/api/config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": OWNER_DELETE_KEY,
      },
      body: JSON.stringify({ gameIcon, deleteEnabled }),
    });
    if (!response.ok) {
      throw new Error("No se pudo guardar la configuración");
    }
    return await response.json();
  } catch (error) {
    return null;
  }
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
  localStorage.setItem(DELETE_ENABLED_KEY, String(enabled));
  await saveSettings(
    localStorage.getItem(GAME_ICON_KEY) || "/img/game/gameminecraft.png",
    enabled,
  );
  showStatus(
    enabled
      ? "El borrado de publicaciones está activado."
      : "El borrado de publicaciones está desactivado.",
  );
});

gameOptions.forEach((option) => {
  option.addEventListener("change", async () => {
    if (!option.checked) return;
    localStorage.setItem(GAME_ICON_KEY, option.value);
    applyGameSelection();
    await saveSettings(
      option.value,
      localStorage.getItem(DELETE_ENABLED_KEY) !== "false",
    );
    showStatus("Icono del juego actual actualizado.");
  });
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
