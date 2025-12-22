const MISTRAL_API_KEY = "rlpAYwxDHmTdXoYyTibBmUMUNi9VL9S6";
const AGENT_ID = "ag_019b41cc1f6173f6839c1cb21169a5aa";
const GOOGLE_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbzfaLav5GdU9mCCOVBKwlsD9zcRoddII_P3UbCYYdeTQht2DmJTXHa7JCOko-CcA8OR/exec";

let chatHistory = [];
let vecinosCache = [];
let visitanteNombre = "";
let vecinoSeleccionado = null;
let esperandoNombre = false;
let visitaConcluida = false;

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const input = document.getElementById("userInput");
    if (input && document.activeElement === input) {
      enviarMensaje();
    }
  }
});

async function iniciarServicio() {
  const statusEl = document.getElementById("connection-status");
  const inputArea = document.getElementById("input-area");
  const welcomeScreen = document.getElementById("welcome-screen");
  const chatContainer = document.getElementById("chat-container"); // Asegúrate de que este ID exista en tu HTML

  // 1. Intercambio de pantallas
  if (welcomeScreen) welcomeScreen.classList.add("hidden");
  if (chatContainer) chatContainer.classList.remove("hidden");

  if (typeof conectarMQTT === "function") {
    conectarMQTT(
      (topic, payload) => {
        if (topic === "/pvT/portero") {
          procesarRespuestaVecino(payload);
        }
      },
      () => {
        if (statusEl) {
          statusEl.innerText = "● En línea";
          statusEl.className = "status online";
        }
        inputArea.classList.remove("disabled");
        document.getElementById("userInput").disabled = false;
        mqttClient.subscribe("/pvT/portero");
        agregarMensaje("Buen día, ¿a quién busca?", "bot");
      }
    );
  }

  try {
    const res = await fetch(GOOGLE_SHEET_URL);
    vecinosCache = await res.json();
  } catch (e) {
    console.error("Error base de datos");
  }
}

async function enviarMensaje() {
  const input = document.getElementById("userInput");
  const texto = input.value.trim();
  if (!texto || input.disabled) return;

  agregarMensaje(texto, "user");
  input.value = "";

  // Lógica de cierre: Si la visita terminó y el usuario se despide
  if (visitaConcluida) {
    const t = texto.toLowerCase();
    if (
      t.includes("no") ||
      t.includes("gracias") ||
      t.includes("chau") ||
      t.includes("adiós")
    ) {
      agregarMensaje("Que tenga un excelente día. Hasta luego.", "bot");
      // Esperamos 2 segundos para que lea el mensaje antes de volver al inicio
      setTimeout(reiniciarSesion, 2000);
      return;
    }
  }

  // Captura de nombre
  if (!visitanteNombre) {
    if (esperandoNombre) {
      visitanteNombre = texto;
      esperandoNombre = false;
    } else if (
      texto.toLowerCase().includes("soy") ||
      texto.toLowerCase().includes("llamo")
    ) {
      visitanteNombre = texto.replace(/soy|me llamo|mi nombre es/gi, "").trim();
    }
  }

  // Búsqueda de vecino
  if (!vecinoSeleccionado) {
    const encontrados = vecinosCache.filter(
      (v) =>
        v.nombre &&
        (texto.toLowerCase().includes(v.nombre.toLowerCase()) ||
          (v.apellido &&
            texto.toLowerCase().includes(v.apellido.toLowerCase())))
    );
    if (encontrados.length === 1) {
      vecinoSeleccionado = encontrados[0];
    }
  }

  let instruccionIA = "Eres el portero de JALTOZ.";

  if (vecinoSeleccionado && !visitanteNombre) {
    esperandoNombre = true;
    instruccionIA = `Has ubicado a ${vecinoSeleccionado.nombre}. Pregunta discretamente quién lo busca.`;
  } else if (vecinoSeleccionado && visitanteNombre && !visitaConcluida) {
    notificarVecino(vecinoSeleccionado, visitanteNombre);
    instruccionIA = `Ya avisaste a ${vecinoSeleccionado.nombre}. Pide al visitante que espere.`;
  } else if (visitaConcluida) {
    instruccionIA = `La gestión terminó. Pregunta si necesita algo más.`;
  } else if (!vecinoSeleccionado && texto.length > 5) {
    instruccionIA = `Esa persona no vive aquí. No inventes datos.`;
  }

  llamarIA(instruccionIA, texto);
}

async function llamarIA(instruccion, textoUsuario) {
  try {
    const res = await fetch("https://api.mistral.ai/v1/agents/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        agent_id: AGENT_ID,
        messages: [
          { role: "system", content: instruccion },
          ...chatHistory,
          { role: "user", content: textoUsuario },
        ],
      }),
    });

    const data = await res.json();
    if (data.choices && data.choices[0]) {
      const respuesta = data.choices[0].message.content;
      agregarMensaje(respuesta, "bot");
      chatHistory.push(
        { role: "user", content: textoUsuario },
        { role: "assistant", content: respuesta }
      );
    }
  } catch (e) {
    console.error("Error API:", e);
  }
}

function notificarVecino(vecino, nombreVisita) {
  const aptoLimpio = String(vecino.apartamento).trim();
  const canalDestino = `/pvT/vecino/${aptoLimpio}`;
  const aviso = {
    de: "Portería",
    mensaje: `Hola, ${nombreVisita} está afuera. ¿Lo deja pasar?`,
  };
  if (mqttClient && mqttClient.connected) {
    mqttClient.publish(canalDestino, JSON.stringify(aviso));
  }
}

async function procesarRespuestaVecino(payload) {
  const msg = payload.mensaje.toLowerCase();
  visitaConcluida = true;

  let instruccionParaIA = "";
  if (msg.includes("pasa") || msg.includes("abre") || msg.includes("si")) {
    mqttClient.publish(
      "/pvT/puerta",
      JSON.stringify({ accion: "ABRIR", de: payload.de })
    );
    instruccionParaIA =
      "SISTEMA: El residente autorizó. Confirma que la puerta está abierta y pregunta si necesita algo más.";
  } else {
    instruccionParaIA =
      "SISTEMA: El residente no puede recibirlo. Informa amablemente y pregunta si necesita algo más.";
  }

  try {
    const res = await fetch("https://api.mistral.ai/v1/agents/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        agent_id: AGENT_ID,
        messages: [
          ...chatHistory,
          { role: "user", content: instruccionParaIA },
        ],
      }),
    });
    const data = await res.json();
    const respuesta = data.choices[0].message.content;
    agregarMensaje(respuesta, "bot");
    chatHistory.push({ role: "assistant", content: respuesta });
  } catch (e) {
    console.error(e);
  }
}

/**
 * REINICIAR SESIÓN:
 * Limpia los datos y vuelve a la pantalla de "Llamar"
 */
function reiniciarSesion() {
  // 1. Limpiar variables de estado
  visitanteNombre = "";
  vecinoSeleccionado = null;
  esperandoNombre = false;
  visitaConcluida = false;
  chatHistory = [];

  // 2. Limpiar la interfaz de mensajes
  const container = document.getElementById("messages");
  if (container) container.innerHTML = "";

  // 3. Volver a la pantalla de bienvenida
  const welcomeScreen = document.getElementById("welcome-screen");
  const chatContainer = document.getElementById("chat-container");

  if (welcomeScreen) welcomeScreen.classList.remove("hidden"); // Muestra el botón Llamar
  if (chatContainer) chatContainer.classList.add("hidden"); // Oculta el chat
}

function agregarMensaje(texto, tipo) {
  const div = document.createElement("div");
  div.className = `msg ${tipo}`;
  div.innerText = texto;
  const container = document.getElementById("messages");
  if (container) {
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }
}
