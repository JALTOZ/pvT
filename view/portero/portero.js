/**
 * JALTOZ - CONSERJE VIRTUAL
 * Corrección: Notificación al vecino formateada correctamente.
 */

const MISTRAL_API_KEY = "rlpAYwxDHmTdXoYyTibBmUMUNi9VL9S6";
const AGENT_ID = "ag_019b41cc1f6173f6839c1cb21169a5aa";
const GOOGLE_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbzfaLav5GdU9mCCOVBKwlsD9zcRoddII_P3UbCYYdeTQht2DmJTXHa7JCOko-CcA8OR/exec";

let chatHistory = [];
let vecinosCache = [];
let visitanteNombre = "";
let vecinoSeleccionado = null;
let visitaConcluida = false;
let intentosSinNombre = 0;

// Captura de Enter
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const input = document.getElementById("userInput");
    if (input && document.activeElement === input) enviarMensaje();
  }
});

function setInputEstado(bloqueado, mensajePlaceholder = "Escriba aquí...") {
  const input = document.getElementById("userInput");
  const inputArea = document.getElementById("input-area");
  if (input) {
    input.disabled = bloqueado;
    input.placeholder = mensajePlaceholder;
    if (!bloqueado) setTimeout(() => input.focus(), 100);
  }
  if (inputArea) {
    bloqueado
      ? inputArea.classList.add("disabled")
      : inputArea.classList.remove("disabled");
  }
}

async function iniciarServicio() {
  const welcomeScreen = document.getElementById("welcome-screen");
  if (welcomeScreen) welcomeScreen.style.display = "none";
  reiniciarDatosInternos();

  if (typeof conectarMQTT === "function") {
    conectarMQTT(
      (topic, payload) => {
        if (topic === "/pvT/portero") procesarRespuestaVecino(payload);
      },
      async () => {
        document.getElementById("connection-status").innerText = "● En línea";
        mqttClient.subscribe("/pvT/portero");

        const delay = (ms) => new Promise((res) => setTimeout(res, ms));
        await delay(500);
        agregarMensaje("Buen día.", "bot");
        await delay(1200);
        agregarMensaje("¿A quién busca usted?", "bot");
      }
    );
  }

  try {
    const res = await fetch(GOOGLE_SHEET_URL);
    vecinosCache = await res.json();
  } catch (e) {
    console.error("Error cargando residentes");
  }
}

async function enviarMensaje() {
  const input = document.getElementById("userInput");
  const texto = input.value.trim();
  if (!texto || input.disabled) return;

  agregarMensaje(texto, "user");
  input.value = "";

  const t = texto.toLowerCase();
  const esDespedida =
    t.includes("gracias") ||
    t.includes("chau") ||
    t.includes("adiós") ||
    t.includes("nada");

  if (esDespedida) {
    agregarMensaje(
      "Con gusto. Tenga un buen día.",
      "bot",
      () => reiniciarSesion(),
      true
    );
    return;
  }

  // 1. BUSCAR VECINO
  if (!vecinoSeleccionado) {
    const encontrado = vecinosCache.find(
      (v) => v.nombre && t.includes(v.nombre.toLowerCase())
    );
    if (encontrado) {
      vecinoSeleccionado = encontrado;
      intentosSinNombre = 0;
      llamarIA(
        `SISTEMA: El residente es ${vecinoSeleccionado.nombre}. Pregunta al visitante su nombre para consultar si lo puede recibir.`,
        texto
      );
      return;
    } else {
      intentosSinNombre++;
      if (intentosSinNombre === 1) {
        llamarIA(
          "SISTEMA: No encontraste el nombre. Pregunta si lo puede repetir.",
          texto
        );
      } else {
        agregarMensaje(
          "No tengo a nadie con ese nombre. Por seguridad debo terminar la llamada. Buen día.",
          "bot",
          () => reiniciarSesion(),
          true
        );
      }
      return;
    }
  }

  // 2. CAPTURAR VISITANTE Y PREGUNTAR AL VECINO
  if (vecinoSeleccionado && !visitanteNombre) {
    visitanteNombre = texto;
    notificarVecino(vecinoSeleccionado, visitanteNombre);
    llamarIA(
      `SISTEMA: El visitante es ${visitanteNombre}. Dile que vas a consultar con ${vecinoSeleccionado.nombre} si autoriza su ingreso. Que espere un momento.`,
      texto
    );
    return;
  }
}

// NOTIFICACIÓN AL VECINO (Corregida para evitar el 'undefined')
function notificarVecino(vecino, nombreVisita) {
  const apto = vecino.apartamento || "S/N";
  const canal = `/pvT/vecino/${String(apto).trim()}`;

  if (mqttClient?.connected) {
    // Enviamos un objeto plano convertido a String (JSON)
    const mensajeParaVecino = {
      de: "Portería",
      visitante: nombreVisita,
      mensaje: `${nombreVisita} está en la entrada. ¿Lo dejamos pasar?`,
    };

    mqttClient.publish(canal, JSON.stringify(mensajeParaVecino));
    console.log(`Consulta enviada al canal: ${canal}`);
  }
}

function abrirPuertaFisica() {
  if (mqttClient?.connected) {
    mqttClient.publish("/pvT/puerta", JSON.stringify({ accion: "ABRIR" }));
  }
}

async function procesarRespuestaVecino(payload) {
  // Si el payload viene como string, lo convertimos a objeto
  let datos = payload;
  if (typeof payload === "string") {
    try {
      datos = JSON.parse(payload);
    } catch (e) {
      datos = { mensaje: payload };
    }
  }

  visitaConcluida = true;
  const msg = (datos.mensaje || "").toLowerCase();
  let instruccionIA = "";

  if (
    msg.includes("si") ||
    msg.includes("pasa") ||
    msg.includes("abre") ||
    msg.includes("deja")
  ) {
    abrirPuertaFisica();
    instruccionIA = `SISTEMA: ${vecinoSeleccionado.nombre} autorizó el ingreso. Dile que pase.`;
  } else {
    instruccionIA = `SISTEMA: ${vecinoSeleccionado.nombre} no puede recibirlo. Despídete educadamente.`;
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
        messages: [...chatHistory, { role: "user", content: instruccionIA }],
      }),
    });
    const data = await res.json();
    agregarMensaje(
      data.choices[0].message.content,
      "bot",
      () => reiniciarSesion(),
      true
    );
  } catch (e) {
    reiniciarSesion();
  }
}

function hablar(texto, callback = null, esCierreFinal = false) {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.rate = 1.1;
  u.pitch = 0.9;
  setInputEstado(true, "Escuchando al portero...");
  u.onend = () => {
    if (callback) callback();
    else if (!esCierreFinal) setInputEstado(false, "Escriba aquí...");
  };
  window.speechSynthesis.speak(u);
}

function agregarMensaje(texto, tipo, callback = null, esCierreFinal = false) {
  if (tipo === "bot") hablar(texto, callback, esCierreFinal);
  const div = document.createElement("div");
  div.className = `msg ${tipo}`;
  div.innerText = texto;
  document.getElementById("messages").appendChild(div);
  document.getElementById("messages").scrollTop =
    document.getElementById("messages").scrollHeight;
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
          ...chatHistory.slice(-4),
          { role: "user", content: textoUsuario },
        ],
      }),
    });
    const data = await res.json();
    if (data.choices?.[0]) {
      const respuesta = data.choices[0].message.content;
      agregarMensaje(respuesta, "bot");
      chatHistory.push(
        { role: "user", content: textoUsuario },
        { role: "assistant", content: respuesta }
      );
    }
  } catch (e) {
    setInputEstado(false);
  }
}

function reiniciarDatosInternos() {
  visitanteNombre = "";
  vecinoSeleccionado = null;
  visitaConcluida = false;
  intentosSinNombre = 0;
  chatHistory = [];
  document.getElementById("messages").innerHTML = "";
  window.speechSynthesis.cancel();
}

function reiniciarSesion() {
  reiniciarDatosInternos();
  const welcomeScreen = document.getElementById("welcome-screen");
  if (welcomeScreen) welcomeScreen.style.display = "flex";
  setInputEstado(true, "Esperando llamada");
}

function finalizarLlamada() {
  agregarMensaje(
    "Llamada terminada. Que tenga buen día.",
    "bot",
    () => reiniciarSesion(),
    true
  );
}
