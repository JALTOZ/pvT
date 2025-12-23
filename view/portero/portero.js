/**
 * JALTOZ - CONSERJE VIRTUAL (VERSIÓN MAESTRA FINAL)
 * Incluye:
 * 1. Filtro Anti-Vendedores (Prioridad Alta)
 * 2. Validación Inteligente de Nombres (Distingue nombres de dudas)
 * 3. Control de Puerta MQTT
 * 4. Micrófono Persistente
 * 5. Cierre Automático de Sesión
 */

// 1. CONFIGURACIÓN
const MISTRAL_API_KEY = "rlpAYwxDHmTdXoYyTibBmUMUNi9VL9S6";
const AGENT_ID = "ag_019b41cc1f6173f6839c1cb21169a5aa";
const GOOGLE_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbzfaLav5GdU9mCCOVBKwlsD9zcRoddII_P3UbCYYdeTQht2DmJTXHa7JCOko-CcA8OR/exec";

// 2. ESTADO GLOBAL
let chatHistory = [];
let vecinosCache = [];
let visitanteNombre = "";
let vecinoSeleccionado = null;
let visitaConcluida = false;
let intentosSinNombre = 0;
let intentosNoDeseados = 0;
let reconocimiento;

// 3. FUNCIONES DE UI (Declaradas al inicio para evitar errores)
function setInputEstado(bloqueado, mensajePlaceholder = "Escriba aquí...") {
  const input = document.getElementById("userInput");
  const area = document.getElementById("input-area");
  if (input) {
    input.disabled = bloqueado;
    input.placeholder = mensajePlaceholder;
    if (!bloqueado) setTimeout(() => input.focus(), 100);
  }
  if (area) {
    bloqueado
      ? area.classList.add("disabled")
      : area.classList.remove("disabled");
  }
}

function hablar(texto, callback = null, esCierreFinal = false) {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.rate = 1.1; // Velocidad un poco más rápida para naturalidad

  setInputEstado(true, "Portero hablando...");

  // Detenemos micro para que no se escuche a sí mismo
  if (reconocimiento)
    try {
      reconocimiento.stop();
    } catch (e) {}

  u.onend = () => {
    // Si la visita concluyó (puerta abierta o rechazo), reiniciamos
    if (esCierreFinal || visitaConcluida) {
      setTimeout(() => reiniciarSesion(), 1500);
    } else if (callback) {
      callback();
    } else {
      setInputEstado(false, "Escriba aquí...");
      iniciarEscucha(); // Reactivamos micro automáticamente
    }
  };
  window.speechSynthesis.speak(u);
}

function agregarMensaje(texto, tipo, callback = null, esCierreFinal = false) {
  if (tipo === "bot") hablar(texto, callback, esCierreFinal);

  const div = document.createElement("div");
  div.className = `msg ${tipo}`;
  div.innerText = texto;
  const container = document.getElementById("messages");
  if (container) {
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }
}

// 4. LÓGICA DE MICRÓFONO
function inicializarReconocimiento() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  reconocimiento = new SpeechRecognition();
  reconocimiento.lang = "es-ES";
  reconocimiento.continuous = false; // Importante: falso para procesar frase a frase

  reconocimiento.onstart = () => {
    const mic = document.getElementById("mic-container");
    if (mic) mic.classList.add("active");
  };

  reconocimiento.onend = () => {
    const mic = document.getElementById("mic-container");
    if (mic) mic.classList.remove("active");
  };

  reconocimiento.onresult = (event) => {
    const texto = event.results[0][0].transcript;
    const input = document.getElementById("userInput");
    if (input && !input.disabled) {
      input.value = texto;
      enviarMensaje();
    }
  };
}

function iniciarEscucha() {
  if (reconocimiento && !visitaConcluida) {
    try {
      reconocimiento.start();
    } catch (e) {}
  }
}

// 5. CEREBRO CENTRAL (Lógica de Negocio)
async function enviarMensaje() {
  const input = document.getElementById("userInput");
  const texto = input.value.trim();
  if (!texto || input.disabled) return;

  agregarMensaje(texto, "user");
  input.value = "";
  const t = texto.toLowerCase();

  // --- FILTRO 1: SEGURIDAD Y VENTAS (Prioridad Máxima) ---
  const validacionSeguridad = await llamarIA(
    `SISTEMA: Analiza la intención: "${texto}". 
        ¿Es un vendedor, encuestador o alguien ofreciendo servicios no solicitados? 
        Responde 'RECHAZAR' si es venta/spam. Responde 'PROCESAR' si es una visita normal.`,
    texto,
    true // Validación silenciosa
  );

  if (validacionSeguridad.includes("RECHAZAR")) {
    intentosNoDeseados++;
    if (intentosNoDeseados >= 2) {
      visitaConcluida = true;
      agregarMensaje(
        "Como le indiqué, no se permiten ventas. Debo cerrar la comunicación. Buen día.",
        "bot",
        null,
        true
      );
    } else {
      await llamarIA(
        "SISTEMA: Detectaste un vendedor o persona no autorizada. Dile cortésmente que está prohibido el ingreso para ventas, si desea contantar con algun recidente digame a quien busca",
        texto
      );
    }
    return; // Cortamos flujo aquí
  }

  // --- FILTRO 2: IDENTIFICAR RESIDENTE ---
  if (!vecinoSeleccionado) {
    const encontrado = vecinosCache.find(
      (v) => v.nombre && t.includes(v.nombre.toLowerCase())
    );

    if (encontrado) {
      vecinoSeleccionado = encontrado;
      intentosSinNombre = 0;
      llamarIA(
        `SISTEMA: Encontraste al residente ${vecinoSeleccionado.nombre}. Pregunta el nombre del visitante de forma clara y cordial.`,
        texto
      );
    } else {
      intentosSinNombre++;
      if (intentosSinNombre >= 2) {
        visitaConcluida = true;
        // agregarMensaje(
        //   "No logro entender su solicitud. Por seguridad finalizo la llamada.",
        //   "bot",
        //   null,
        //   true
        // );
        llamarIA(
          `SISTEMA: Si no existe el vecino.Despedirte cordial mente`,
          texto
        );
      } else {
        llamarIA(
          "SISTEMA: No entendiste el nombre del residente. Pide que lo repita.",
          texto
        );
      }
    }
    return;
  }

  // --- FILTRO 3: CAPTURAR NOMBRE VISITANTE (Con Validación de Confusión) ---
  if (vecinoSeleccionado && !visitanteNombre) {
    // Preguntamos a la IA si el texto es un nombre válido o una duda ("que?", "no escuche")
    const validacionNombre = await llamarIA(
      `SISTEMA: El usuario dijo "${texto}". ¿Es un nombre propio de persona o es una expresión de duda/pregunta?
            Responde 'SI' si es un nombre. Responde 'NO' si es duda o no se entiende.`,
      texto,
      true
    );

    if (validacionNombre.includes("NO")) {
      await llamarIA(
        `SISTEMA: El usuario no dio un nombre claro. Pídele su nombre de nuevo para anunciarlo con ${vecinoSeleccionado.nombre}.`,
        texto
      );
      return;
    }

    // Si es un nombre válido:
    visitanteNombre = texto;
    const foto = await capturarFoto();
    notificarVecino(vecinoSeleccionado, visitanteNombre, foto);

    // Mensaje final estático para evitar alucinaciones
    agregarMensaje(
      `Entendido. Ya envié su foto y nombre a ${vecinoSeleccionado.nombre}. Espere un momento.`,
      "bot"
    );
  }
}

// 6. SERVICIOS EXTERNOS (IA, MQTT, Cámara)
async function llamarIA(
  instruccion,
  textoUsuario,
  esValidacionSilenciosa = false
) {
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
          { role: "system", content: instruccion + " Sé breve." },
          ...chatHistory.slice(-2), // Memoria corta para no confundir contextos
          { role: "user", content: textoUsuario },
        ],
      }),
    });
    const data = await res.json();
    const respuesta = data.choices[0].message.content;

    if (!esValidacionSilenciosa) {
      agregarMensaje(respuesta, "bot");
      chatHistory.push(
        { role: "user", content: textoUsuario },
        { role: "assistant", content: respuesta }
      );
    }
    return respuesta;
  } catch (e) {
    return "ERROR";
  }
}

function notificarVecino(vecino, nombreVisita, foto) {
  const canal = `/pvT/vecino/${String(vecino.apartamento).trim()}`;
  if (mqttClient?.connected) {
    mqttClient.publish(
      canal,
      JSON.stringify({
        de: "Portería",
        visitante: nombreVisita,
        mensaje: `${nombreVisita} busca a ${vecino.nombre}.`,
        foto: foto,
      })
    );
  }
}

async function procesarRespuestaVecino(payload) {
  let datos = typeof payload === "string" ? JSON.parse(payload) : payload;
  const msg = (datos.mensaje || "").toLowerCase();

  visitaConcluida = true; // Activa el reinicio automático

  if (msg.includes("si") || msg.includes("pasa") || msg.includes("abre")) {
    // 1. Abrir puerta
    if (mqttClient?.connected) {
      mqttClient.publish(
        "/pvT/puerta",
        JSON.stringify({
          accion: "ABRIR",
          apto: vecinoSeleccionado?.apartamento,
        })
      );
    }
    // 2. Despedida positiva
    agregarMensaje(
      "Acceso autorizado. La puerta está abierta. Bienvenido.",
      "bot",
      null,
      true
    );
  } else {
    // 2. Despedida negativa
    agregarMensaje(
      "El residente informa que no puede recibirlo ahora. Buen día.",
      "bot",
      null,
      true
    );
  }
}

// 7. ARRANQUE Y UTILIDADES
async function iniciarServicio() {
  const welcome = document.getElementById("welcome-screen");
  if (welcome) welcome.style.display = "none";

  reiniciarDatosInternos();
  inicializarReconocimiento();
  agregarMensaje(
    "Gusto en saludarle. ¿Digame el nombre de la persona que busca?",
    "bot"
  );

  if (typeof conectarMQTT === "function") {
    conectarMQTT(
      (topic, payload) => {
        if (topic === "/pvT/portero") procesarRespuestaVecino(payload);
      },
      () => {
        document.getElementById("connection-status").innerText = "● En línea";
        mqttClient.subscribe("/pvT/portero");
      }
    );
  }

  try {
    const res = await fetch(GOOGLE_SHEET_URL);
    vecinosCache = await res.json();
  } catch (e) {}
}

async function capturarFoto() {
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  if (!video || !canvas) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await new Promise((res) => setTimeout(res, 800));
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    stream.getTracks().forEach((t) => t.stop());
    return canvas.toDataURL("image/jpeg", 0.05); // Calidad baja para rapidez MQTT
  } catch (e) {
    return null;
  }
}

function reiniciarDatosInternos() {
  visitanteNombre = "";
  vecinoSeleccionado = null;
  visitaConcluida = false;
  intentosSinNombre = 0;
  intentosNoDeseados = 0;
  chatHistory = [];
  const container = document.getElementById("messages");
  if (container) container.innerHTML = "";
  window.speechSynthesis.cancel();
}

function reiniciarSesion() {
  reiniciarDatosInternos();
  const welcome = document.getElementById("welcome-screen");
  if (welcome) welcome.style.display = "flex";
  setInputEstado(true, "Esperando...");
  if (reconocimiento)
    try {
      reconocimiento.stop();
    } catch (e) {}
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") enviarMensaje();
});
