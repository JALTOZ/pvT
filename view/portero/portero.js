// portero.js - CONSERJE VIRTUAL (VERSIÓN INTEGRAL 2025 - REFACTORIZADA)
// Depende de: config.js, mqtt.js, html5-qrcode

// 1. CONFIGURACIÓN (Usando global CONFIG de config.js)
const MISTRAL_API_KEY = CONFIG.MISTRAL_API_KEY;
const AGENT_ID = CONFIG.AGENT_ID;
const GOOGLE_SHEET_URL = CONFIG.GOOGLE_SHEET_URL;

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
let html5QrCode; // Instancia del scanner

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

// 4. LÓGICA DE INACTIVIDAD (SILENCIO)
function reiniciarTemporizadorInactividad() {
  clearTimeout(temporizadorInactividad);
  temporizadorInactividad = setTimeout(() => manejarSilencio(), 12000);
}

async function manejarSilencio() {
  const input = document.getElementById("userInput");
  // Si hay texto escrito, sesión concluida o ya tenemos vecino+visitante, evitamos interrumpir
  if (
    visitaConcluida ||
    (vecinoSeleccionado && visitanteNombre) ||
    (input && input.value.length > 0)
  )
    return;

  intentosSilencio++;
  if (intentosSilencio === 1) {
    if (!vecinoSeleccionado) {
      await agregarMensaje(
        "Disculpe, no le escucho. ¿Podría decirme el nombre del residente a quien busca o mostrar su código QR?",
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
        "Disculpe, por seguridad solo permitimos visitas anunciadas. No se permite el ingreso para ventas o servicios no solicitados. Que tenga buen día.",
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
        "Gusto en saludarle. Para ubicar al residente en mi lista, ¿me podría indicar su nombre y apellido?",
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
        `Entendido. Busco a ${vecinoSeleccionado.nombre}. ¿Podría darme su nombre para anunciarlo?`,
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
          `Comprendido. ¿Busca a ${vecinoSeleccionado.nombre}? Necesito su nombre, por favor, para avisarle.`,
          "bot"
        );
      } else {
        intentosSinNombre++;
        if (intentosSinNombre >= 2) {
          await agregarMensaje(
            "No me figura esa persona en el sistema. Si tiene un código QR, por favor muéstrelo a la cámara.",
            "bot"
          );
          return;
        } else {
          await agregarMensaje(
            "Disculpe, no encuentro ese nombre en mi lista. ¿Podría repetirme el nombre y apellido del residente?",
            "bot"
          );
        }
      }
    }
    return;
  }

  // --- PASO 3: IDENTIFICACIÓN DEL VISITANTE ---
  if (vecinoSeleccionado && !visitanteNombre) {
    const nombreEntrada = texto.trim();
    const quitarTildes = (str) =>
      str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (
      quitarTildes(nombreEntrada.toLowerCase()) ===
      quitarTildes(vecinoSeleccionado.nombre.toLowerCase())
    ) {
      await agregarMensaje(
        `Correcto, pero necesito SU nombre (el de usted) para anunciarle. ¿Cómo le digo que le busca?`,
        "bot"
      );
      return;
    }

    if (nombreEntrada.length < 3) {
      await agregarMensaje(
        "Disculpe, no le copié bien. ¿Me daría su nombre para anunciarlo?",
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
        `Entiendo, pero necesito su nombre personal para avisarle a ${vecinoSeleccionado.nombre}. ¿Con quién tengo el gusto?`,
        "bot"
      );
      return;
    }

    visitanteNombre = nombreEntrada;
    await agregarMensaje(
      `Gracias, ${visitanteNombre}. Espere un segundo frente a la cámara mientras verfico si se encuentra.`,
      "bot"
    );

    const foto =
      typeof capturarFoto === "function" ? await capturarFoto() : null;
    notificarVecino(vecinoSeleccionado, visitanteNombre, foto);
    iniciarEsperaVecino();

    await agregarMensaje(
      `Ya le he avisado a ${vecinoSeleccionado.nombre}. Aguarde un momento su respuesta, por favor.`,
      "bot"
    );
    setInputEstado(true, "Esperando confirmación...");
  }
}

// 6. SERVICIOS EXTERNOS (IA, MQTT)
async function llamarIA(instruccion, textoUsuario, esValidacionSilenciosa = false) {
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

// Actualizado para usar MQTTService
function notificarVecino(vecino, nombreVisita, foto) {
  const apto = String(vecino.apartamento).trim();
  const canal = `/pvT/vecino/${apto}`;

  MQTTService.publish(canal, {
    de: "Portería",
    visitante: nombreVisita,
    mensaje: `En la puerta se encuentra ${nombreVisita} busca a ${vecino.nombre}.`,
    foto: foto,
  });
}

async function procesarRespuestaVecino(payload) {
  clearTimeout(temporizadorRespuestaVecino);

  // Normalizar payload
  let datos = payload;
  if (typeof payload === "string") {
    try { datos = JSON.parse(payload); } catch (e) { datos = { mensaje: payload }; }
  }

  const msg = (datos.mensaje || "").toLowerCase();
  visitaConcluida = true;

  if (msg.includes("si") || msg.includes("pasa") || msg.includes("abre") || msg === "abrir") {
    // Abrir puerta
    MQTTService.publish(CONFIG.MQTT_TOPICS.PUERTA, {
      accion: "ABRIR",
      apto: vecinoSeleccionado?.apartamento,
      autorizado_por: "VECINO"
    });

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

// 7. FUNCIONALIDAD QR (Integrada y Automática)
function iniciarEscaneoQR() {
  const cameraSection = document.getElementById("camera-section");
  if (cameraSection) cameraSection.style.display = "block";
  document.getElementById("qr-reader-embedded").style.display = "block";

  // Si ya existe instancia, limpiar
  if (html5QrCode) {
    // Ya está corriendo
    return;
  }

  html5QrCode = new Html5Qrcode("qr-reader-embedded");
  const config = { fps: 10, qrbox: { width: 220, height: 220 } };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    onScanSuccess,
    (errorMessage) => { /* ignorar errores frame a frame */ }
  ).catch(err => {
    console.error("Error iniciando cámara QR", err);
    agregarMensaje("No se pudo iniciar la cámara para leer QR.", "bot");
  });
}

function detenerCamara() {
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      html5QrCode = null;
      document.getElementById("camera-section").style.display = "none";
    }).catch(err => console.log("Error deteniendo QR", err));
  }
}

async function onScanSuccess(decodedText, decodedResult) {
  // Detener escaneo al éxito
  detenerCamara();
  console.log(`QR Detectado: ${decodedText}`);

  try {
    const qrData = JSON.parse(decodedText);

    await agregarMensaje("QR detectado, verificando acceso...", "bot");

    // Cúal es el tipo de pase?
    if (qrData.tipo === "INVITADO") {
      // Verificar si el apartamento que autoriza existe en DB
      // qrData = { tipo, nombre_visitante, autoriza_nombre, apartamento ... }
      const aptoAutoriza = qrData.apartamento;
      const residenteAutoriza = vecinosCache.find(v => v.apartamento == aptoAutoriza);

      if (residenteAutoriza) {
        vecinoSeleccionado = residenteAutoriza;
        // Notificar Apertura
        MQTTService.publish(CONFIG.MQTT_TOPICS.PUERTA, {
          accion: "ABRIR",
          apto: aptoAutoriza,
          autorizado_por: "QR_INVITADO",
          detalle: `Invitado ${qrData.nombre_visitante}`
        });
        // Notificar al dueño de casa
        notificarVecino(residenteAutoriza, qrData.nombre_visitante + " (QR)", null);

        // Mensaje hablado específico
        await agregarMensaje(`Acceso permitido. Bienvenido, ${qrData.nombre_visitante}.`, "bot", true);
      } else {
        await agregarMensaje("El pase de invitado no corresponde a un apartamento válido.", "bot");
      }

    } else {
      // ASUMIMOS PASE DE RESIDENTE
      // Validar existencia real en base de datos
      const vecinoValido = vecinosCache.find(v =>
        v.apartamento == qrData.apartamento &&
        (v.nombre.includes(qrData.nombre) || qrData.nombre_completo.includes(v.nombre))
      );

      if (vecinoValido) {
        vecinoSeleccionado = vecinoValido;
        MQTTService.publish(CONFIG.MQTT_TOPICS.PUERTA, {
          accion: "ABRIR",
          apto: vecinoSeleccionado.apartamento,
          autorizado_por: "QR_VECINO"
        });
        await agregarMensaje(`Acceso autorizado. Hola, ${vecinoValido.nombre}.`, "bot", true);
      } else {
        await agregarMensaje("Código QR de residente no reconocido.", "bot");
      }
    }

  } catch (e) {
    console.error(e);
    await agregarMensaje("El formato del código QR no es válido.", "bot");
  }
}


// 8. ARRANQUE Y REINICIO
async function iniciarServicio() {
  const welcome = document.getElementById("welcome-screen");
  if (welcome) welcome.style.display = "none";

  reiniciarDatosInternos();
  if (typeof inicializarPerifericos === "function") inicializarPerifericos();

  // Conexión Centralizada
  MQTTService.connect(
    "portero",
    () => { // On Connect
      const status = document.getElementById("connection-status");
      if (status) status.innerText = "● En línea";
      MQTTService.suscribirPortero();
    },
    (topic, payload) => { // On Message
      if (topic === CONFIG.MQTT_TOPICS.PORTERO) {
        procesarRespuestaVecino(payload);
      }
    }
  );

  // INICIO AUTOMÁTICO DE CÁMARA
  iniciarEscaneoQR();

  // Saludo Aleatorio
  const saludoAleatorio = typeof saludos !== "undefined" && saludos.length > 0
    ? saludos[Math.floor(Math.random() * saludos.length)]
    : "¡Bienvenido! ¿A quién busca?";

  await agregarMensaje(saludoAleatorio, "bot");

  // Recordatorio QR cortés después de 1 segundo
  setTimeout(() => {
    agregarMensaje("Si dispone de una invitación o código QR, por favor muéstrelo a la cámara.", "bot");
  }, 1000);

  try {
    const res = await fetch(GOOGLE_SHEET_URL);
    vecinosCache = await res.json();
  } catch (e) {
    console.error("Error base de datos", e);
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

  // Detener cámara al reiniciar
  detenerCamara();

  if (typeof reconocimiento !== "undefined" && reconocimiento) {
    try {
      reconocimiento.stop();
    } catch (e) { }
  }
}

function reiniciarSesion() {
  reiniciarDatosInternos();
  const welcome = document.getElementById("welcome-screen");
  if (welcome) welcome.style.display = "flex";
  setInputEstado(true, "Esperando llamada...");
}

// Funciones globales (window) si es necesario para onclicks HTML
window.iniciarServicio = iniciarServicio;
window.finalizarLlamada = reiniciarSesion;
window.enviarMensaje = enviarMensaje;
window.iniciarEscaneoQR = iniciarEscaneoQR;
window.detenerCamara = detenerCamara;

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter") enviarMensaje();
});
