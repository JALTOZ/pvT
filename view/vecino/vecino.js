const GOOGLE_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbzfaLav5GdU9mCCOVBKwlsD9zcRoddII_P3UbCYYdeTQht2DmJTXHa7JCOko-CcA8OR/exec";
let MI_DATA = null;

// Escuchar tecla Enter para enviar mensaje
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const input = document.getElementById("userInput");
    if (input && document.activeElement === input) {
      enviarAlPortero();
    }
  }
});

async function verificarResidente() {
  const inputOriginal = document.getElementById("residentName").value.trim();
  const inputLimpio = inputOriginal.toLowerCase();
  const errorEl = document.getElementById("login-error");

  if (!inputOriginal) return;
  errorEl.innerText = "Verificando...";

  try {
    const res = await fetch(GOOGLE_SHEET_URL);
    const vecinos = await res.json();

    MI_DATA = vecinos.find((v) => {
      const nombreCompleto = `${v.nombre} ${v.apellido}`.toLowerCase();
      return (
        v.nombre.toLowerCase() === inputLimpio || nombreCompleto === inputLimpio
      );
    });

    if (MI_DATA && MI_DATA.apartamento) {
      document.getElementById("login-screen").classList.add("hidden");
      iniciarIntercomunicador();
    } else {
      errorEl.innerText = "No encontrado. Intente con Nombre y Apellido.";
    }
  } catch (e) {
    errorEl.innerText = "Error al conectar con el registro.";
  }
}

function iniciarIntercomunicador() {
  const statusEl = document.getElementById("connection-status");
  const displayEl = document.getElementById("display-name");
  const miApto = String(MI_DATA.apartamento).trim();

  // Mostrar nombre en la interfaz
  if (displayEl)
    displayEl.innerText = `${MI_DATA.nombre} ${MI_DATA.apellido} - Depto ${miApto}`;

  if (typeof conectarMQTT === "function") {
    conectarMQTT(
      (topic, payload) => {
        console.log("📥 MENSAJE RECIBIDO:", topic, payload);
        if (topic === `/pvT/vecino/${miApto}`) {
          agregarMensaje(`Portería: ${payload.mensaje}`, "portero");
        }
      },
      () => {
        statusEl.innerText = "● En línea";
        statusEl.className = "status online";
        document.getElementById("input-area").classList.remove("disabled");
        document.getElementById("userInput").disabled = false;

        if (mqttClient) {
          const miCanal = `/pvT/vecino/${miApto}`;
          mqttClient.subscribe(miCanal);
          console.log(`✅ [SUSCRITO] En: ${miCanal}`);
        }
      }
    );
  }
}

function enviarAlPortero() {
  const input = document.getElementById("userInput");
  const texto = input.value.trim();
  if (!texto || !mqttClient) return;

  const datos = {
    de: MI_DATA.apartamento,
    nombre: MI_DATA.nombre,
    mensaje: texto,
  };

  mqttClient.publish("/pvT/portero", JSON.stringify(datos));
  agregarMensaje(texto, "yo");
  input.value = "";
}

function agregarMensaje(texto, tipo) {
  const div = document.createElement("div");
  div.className = `msg ${tipo}`;
  div.innerText = texto;
  const container = document.getElementById("messages");
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}
