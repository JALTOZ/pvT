// portero.js - CONSERJE VIRTUAL (VERSIÓN INTEGRAL 2025 - CORREGIDA)

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
let intentosSilencio = 0;
let temporizadorInactividad = null;
let intentosNotificacion = 0;
let temporizadorRespuestaVecino = null;

// 3. FUNCIONES DE UI Y CONTROL
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

async function agregarMensaje(texto, tipo, esCierreFinal = false) {
  const div = document.createElement("div");
  div.className = `msg ${tipo}`;
  div.innerText = texto;
  const container = document.getElementById("messages");
  if (container) {
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  if (tipo === "bot") {
    if (typeof leerTexto === "function") {
      await leerTexto(texto, esCierreFinal || visitaConcluida);
    }

    if (!esCierreFinal && !visitaConcluida) {
      reiniciarTemporizadorInactividad();
    }

    if (esCierreFinal || visitaConcluida) {
      setTimeout(() => reiniciarSesion(), 2500);
    }
  }
}

// 4. LÓGICA DE INACTIVIDAD (SILENCIO REPARADA)
function reiniciarTemporizadorInactividad() {
  clearTimeout(temporizadorInactividad);
  temporizadorInactividad = setTimeout(() => manejarSilencio(), 12000);
}

async function manejarSilencio() {
  // Si el usuario ya escribió o la sesión terminó, no hacer nada
  const input = document.getElementById("userInput");
  if (
    visitaConcluida ||
    (vecinoSeleccionado && visitanteNombre) ||
    input.value.length > 0
  )
    return;

  intentosSilencio++;
  if (intentosSilencio === 1) {
    // Lógica contextual del primer silencio
    if (!vecinoSeleccionado) {
      await agregarMensaje(
        "Disculpe, no le escucho. ¿Podría decirme el nombre del residente a quien busca?",
        "bot"
      );
    } else {
      await agregarMensaje(
        `No le escucho. ¿Podría decirme su nombre para anunciarlo con ${vecinoSeleccionado.nombre}?`,
        "bot"
      );
    }
  } else {
    visitaConcluida = true;
    await agregarMensaje(
      "No detecto respuesta. Si desea comunicarse con algún vecino vuelva a llamar. Pase bien.",
      "bot",
      true
    );
  }
}

function iniciarEsperaVecino() {
  clearTimeout(temporizadorRespuestaVecino);
  temporizadorRespuestaVecino = setTimeout(async () => {
    intentosNotificacion++;
    if (intentosNotificacion === 1) {
      await agregarMensaje(
        "El residente aún no responde. Voy a intentar notificarle una vez más, por favor espere.",
        "bot"
      );
      notificarVecino(vecinoSeleccionado, visitanteNombre, null);
      iniciarEsperaVecino();
    } else {
      visitaConcluida = true;
      await agregarMensaje(
        "Lo siento, el residente no responde a la llamada. Por favor, intente comunicarse por otro medio. Tenga un buen día.",
        "bot",
        true
      );
    }
  }, 10000);
}

// 5. CEREBRO CENTRAL (PROCESAMIENTO DE MENSAJES)
async function enviarMensaje() {
  // CANCELACIÓN INMEDIATA DE SILENCIO Y VOZ ANTERIOR
  clearTimeout(temporizadorInactividad);
  window.speechSynthesis.cancel();
  intentosSilencio = 0;

  const input = document.getElementById("userInput");
  const texto = input.value.trim();
  if (!texto || input.disabled) return;

  await agregarMensaje(texto, "user");
  input.value = "";
  const t = texto.toLowerCase();

  // --- PASO 1: FILTRO DE SEGURIDAD ---
  if (!vecinoSeleccionado) {
    const validacionSeguridad = await llamarIA(
      `Analiza: "${texto}". ¿Es spam, ventas, encuestas o alguien que NO busca a un residente? Responde ÚNICAMENTE 'BUSCAR' o 'RECHAZAR'.`,
      texto,
      true
    );

    if (validacionSeguridad.includes("RECHAZAR")) {
      visitaConcluida = true;
      await agregarMensaje(
        "Disculpe, el acceso está reservado únicamente para personas autorizadas. No puedo permitir el ingreso. Quedo atento.",
        "bot",
        true
      );
      return;
    }
  }

  // --- PASO 2: IDENTIFICACIÓN DEL RESIDENTE ---
  if (!vecinoSeleccionado) {
    const textoLimpio = t.replace(/\s+/g, " ");
    const palabras = textoLimpio.split(" ").filter((p) => p.length > 2);

    if (palabras.length < 2) {
      await agregarMensaje(
        "Para poder localizar al residente, necesito el nombre y apellido, por favor",
        "bot"
      );
      return;
    }

    const quitarTildes = (str) =>
      str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const nombreBuscado = quitarTildes(textoLimpio);

    const encontrado = vecinosCache.find((v) => {
      const nombreDB = quitarTildes(v.nombre.toLowerCase());
      return nombreDB
        .split(" ")
        .every((parte) => nombreBuscado.includes(parte));
    });

    if (encontrado) {
      vecinoSeleccionado = encontrado;
      intentosSinNombre = 0;
      await agregarMensaje(
        `Perfecto, buscando a ${vecinoSeleccionado.nombre}. ¿Cuál es su nombre para anunciarlo?`,
        "bot"
      );
    } else {
      const listaNombres = vecinosCache.map((v) => v.nombre).join(", ");
      const checkIA = await llamarIA(
        `¿"${textoLimpio}" se refiere a alguien de esta lista: [${listaNombres}]? Responde SI:NombreExacto o NO.`,
        textoLimpio,
        true
      );

      if (checkIA.startsWith("SI")) {
        const nombreReal = checkIA.split(":")[1];
        vecinoSeleccionado = vecinosCache.find(
          (v) => v.nombre.trim() === nombreReal.trim()
        );
        await agregarMensaje(
          `Entendido, ¿busca a ${vecinoSeleccionado.nombre}? Dígame su nombre para anunciarlo.`,
          "bot"
        );
      } else {
        intentosSinNombre++;
        if (intentosSinNombre >= 2) {
          visitaConcluida = true;
          await agregarMensaje(
            "No localizo a ese residente en el sistema. No puedo autorizar el ingreso. Adiós.",
            "bot",
            true
          );
        } else {
          await agregarMensaje(
            "Ese nombre no coincide con nuestros registros. Repita nombre y apellido claramente.",
            "bot"
          );
        }
      }
    }
    return;
  }

  // --- PASO 3: IDENTIFICACIÓN DEL VISITANTE (REPARADO) ---
  if (vecinoSeleccionado && !visitanteNombre) {
    const nombreEntrada = texto.trim();
    const quitarTildes = (str) =>
      str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Evitar que el visitante se ponga el mismo nombre que el vecino
    if (
      quitarTildes(nombreEntrada.toLowerCase()) ===
      quitarTildes(vecinoSeleccionado.nombre.toLowerCase())
    ) {
      await agregarMensaje(
        `Usted busca a ${vecinoSeleccionado.nombre}, pero necesito saber SU nombre (el de usted) para anunciarlo. ¿Cómo se llama?`,
        "bot"
      );
      return;
    }

    if (nombreEntrada.length < 3) {
      await agregarMensaje(
        "Por favor, ¿podría decirme su nombre claramente para informarle al residente?",
        "bot"
      );
      return;
    }

    const checkVisitante = await llamarIA(
      `El usuario dijo "${nombreEntrada}". ¿Es un nombre propio? SI o NO.`,
      nombreEntrada,
      true
    );

    if (checkVisitante.includes("NO") && nombreEntrada.split(" ").length < 2) {
      await agregarMensaje(
        `Necesito su nombre para anunciarlo con ${vecinoSeleccionado.nombre}. ¿Cómo se llama usted?`,
        "bot"
      );
      return;
    }

    visitanteNombre = nombreEntrada;
    await agregarMensaje(
      `Entendido, ${visitanteNombre}. Mire a la cámara un segundo mientras le anuncio...`,
      "bot"
    );

    const foto =
      typeof capturarFoto === "function" ? await capturarFoto() : null;
    notificarVecino(vecinoSeleccionado, visitanteNombre, foto);
    iniciarEsperaVecino();

    await agregarMensaje(
      `He enviado su información a ${vecinoSeleccionado.nombre}. Por favor, espere un momento.`,
      "bot"
    );
    setInputEstado(true, "Esperando respuesta del residente...");
  }
}

// 6. SERVICIOS EXTERNOS (IA, MQTT)
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
          {
            role: "system",
            content: instruccion + " Sé extremadamente breve.",
          },
          ...chatHistory.slice(-2),
          { role: "user", content: textoUsuario },
        ],
      }),
    });
    const data = await res.json();
    const respuesta = data.choices[0].message.content;

    if (!esValidacionSilenciosa) {
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
  if (typeof mqttClient !== "undefined" && mqttClient.connected) {
    mqttClient.publish(
      canal,
      JSON.stringify({
        de: "Portería",
        visitante: nombreVisita,
        mensaje: `En la puerta se encuentra ${nombreVisita} busca a ${vecino.nombre}.`,
        foto: foto,
      })
    );
  }
}

async function procesarRespuestaVecino(payload) {
  clearTimeout(temporizadorRespuestaVecino);
  let datos = typeof payload === "string" ? JSON.parse(payload) : payload;
  const msg = (datos.mensaje || "").toLowerCase();
  visitaConcluida = true;

  if (msg.includes("si") || msg.includes("pasa") || msg.includes("abre")) {
    if (typeof mqttClient !== "undefined") {
      mqttClient.publish(
        "/pvT/puerta",
        JSON.stringify({
          accion: "ABRIR",
          apto: vecinoSeleccionado?.apartamento,
        })
      );
    }
    await agregarMensaje(
      "Acceso autorizado. La puerta se está abriendo. ¡Bienvenido!",
      "bot",
      true
    );
  } else {
    await agregarMensaje(
      "El residente no puede recibirlo por ahora. Tenga un buen día.",
      "bot",
      true
    );
  }
}

// 7. ARRANQUE Y REINICIO
async function iniciarServicio() {
  const welcome = document.getElementById("welcome-screen");
  if (welcome) welcome.style.display = "none";

  reiniciarDatosInternos();
  if (typeof inicializarPerifericos === "function") inicializarPerifericos();

  if (typeof conectarMQTT === "function") {
    conectarMQTT(
      (topic, payload) => {
        if (topic === "/pvT/portero") procesarRespuestaVecino(payload);
      },
      () => {
        const status = document.getElementById("connection-status");
        if (status) status.innerText = "● En línea";
        mqttClient.subscribe("/pvT/portero");
      }
    );
  }

  await agregarMensaje("¡Gusto en saludarle! ¿A quién busca?", "bot");

  try {
    const res = await fetch(GOOGLE_SHEET_URL);
    vecinosCache = await res.json();
  } catch (e) {
    console.error("Error base de datos");
  }
}

function reiniciarDatosInternos() {
  visitanteNombre = "";
  vecinoSeleccionado = null;
  visitaConcluida = false;
  intentosSinNombre = 0;
  intentosSilencio = 0;
  intentosNotificacion = 0;
  clearTimeout(temporizadorInactividad);
  clearTimeout(temporizadorRespuestaVecino);
  chatHistory = [];
  document.getElementById("messages").innerHTML = "";
  window.speechSynthesis.cancel();
  if (typeof reconocimiento !== "undefined" && reconocimiento) {
    try {
      reconocimiento.stop();
    } catch (e) {}
  }
}

function reiniciarSesion() {
  reiniciarDatosInternos();
  const welcome = document.getElementById("welcome-screen");
  if (welcome) welcome.style.display = "flex";
  setInputEstado(true, "Esperando llamada...");
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") enviarMensaje();
});
