/**
 * JALTOZ - CONSERJE VIRTUAL (VERSIÓN OPTIMIZADA)
 * Mejoras: Manejo de errores, mejor lógica de cierre, código más limpio
 */

// ============================================================================
// 3. FUNCIONES DE UI Y AUDIO
// ============================================================================

function setInputEstado(bloqueado, mensajePlaceholder = "Escriba aquí...") {
  const input = document.getElementById("userInput");
  const area = document.getElementById("input-area");

  if (input) {
    input.disabled = bloqueado;
    input.placeholder = mensajePlaceholder;
    if (!bloqueado) {
      setTimeout(() => input.focus(), 100);
    }
  }

  if (area) {
    bloqueado
      ? area.classList.add("disabled")
      : area.classList.remove("disabled");
  }
}

function hablar(texto, callback = null, esCierreFinal = false) {
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(texto);
  utterance.rate = 1.1;
  utterance.lang = "es-ES";

  setInputEstado(true, "Portero hablando...");

  // Detener reconocimiento de voz mientras habla
  detenerReconocimiento();

  utterance.onend = () => {
    if (esCierreFinal) {
      // Cierre inmediato después de hablar
      setTimeout(() => reiniciarSesion(), 1500);
    } else if (callback) {
      callback();
    } else {
      setInputEstado(false, "Escriba aquí...");
      iniciarEscucha();
    }
  };

  utterance.onerror = (event) => {
    console.error("Error en síntesis de voz:", event);
    // Continuar con el flujo normal aunque falle el audio
    if (esCierreFinal) {
      setTimeout(() => reiniciarSesion(), 1500);
    } else if (callback) {
      callback();
    } else {
      setInputEstado(false, "Escriba aquí...");
      iniciarEscucha();
    }
  };

  window.speechSynthesis.speak(utterance);
}

function agregarMensaje(texto, tipo, callback = null, esCierreFinal = false) {
  // Agregar mensaje visual
  const div = document.createElement("div");
  div.className = `msg ${tipo}`;
  div.innerText = texto;

  const container = document.getElementById("messages");
  if (container) {
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  // Si es mensaje del bot, hacerlo hablar
  if (tipo === "bot") {
    hablar(texto, callback, esCierreFinal);
  }
}

// ============================================================================
// 4. LÓGICA DE MICRÓFONO
// ============================================================================

function inicializarReconocimiento() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn("Reconocimiento de voz no disponible en este navegador");
    return;
  }

  reconocimiento = new SpeechRecognition();
  reconocimiento.lang = "es-ES";
  reconocimiento.continuous = false;
  reconocimiento.interimResults = false;

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

  reconocimiento.onerror = (event) => {
    console.error("Error en reconocimiento de voz:", event.error);
    const mic = document.getElementById("mic-container");
    if (mic) mic.classList.remove("active");
  };
}

function iniciarEscucha() {
  if (reconocimiento && !visitaConcluida) {
    try {
      reconocimiento.start();
    } catch (error) {
      // Ignorar error si ya está activo
      if (error.name !== "InvalidStateError") {
        console.error("Error al iniciar reconocimiento:", error);
      }
    }
  }
}

function detenerReconocimiento() {
  if (reconocimiento) {
    try {
      reconocimiento.stop();
    } catch (error) {
      // Ignorar errores al detener
    }
  }
}

// ============================================================================
// 5. CEREBRO CENTRAL - LÓGICA DE CONVERSACIÓN
// ============================================================================

async function enviarMensaje() {
  const input = document.getElementById("userInput");
  const texto = input.value.trim();

  // Validaciones iniciales
  if (!texto || input.disabled || visitaConcluida) return;

  // Detener reconocimiento de voz
  detenerReconocimiento();

  // Mostrar mensaje del usuario
  agregarMensaje(texto, "user");
  input.value = "";

  const textoLower = texto.toLowerCase();

  try {
    // -----------------------------------------------------------------------
    // FASE 1: IDENTIFICAR AL RESIDENTE QUE BUSCA
    // -----------------------------------------------------------------------
    if (!vecinoSeleccionado) {
      await procesarFaseBusquedaResidente(texto, textoLower);
      return;
    }

    // -----------------------------------------------------------------------
    // FASE 2: CAPTURAR NOMBRE DEL VISITANTE
    // -----------------------------------------------------------------------
    if (vecinoSeleccionado && !visitanteNombre) {
      await procesarFaseCapturaVisitante(texto);
      return;
    }
  } catch (error) {
    console.error("Error en enviarMensaje:", error);
    agregarMensaje(
      "Disculpe, tuve un problema técnico. ¿Puede repetir por favor?",
      "bot"
    );
    setInputEstado(false, "Escriba aquí...");
  }
}

// ============================================================================
// FUNCIONES AUXILIARES PARA FASES DE CONVERSACIÓN
// ============================================================================

async function procesarFaseBusquedaResidente(texto, textoLower) {
  // Detectar personas no deseadas (vendedores, etc.)
  const esNoDeseado = await llamarIA(
    `SISTEMA: El usuario dijo "${texto}". 
     ¿Es una persona que NO busca a nadie específico? (vendedor, repartidor genérico, pide entrar sin nombre, dice "déjame entrar", "quiero entrar", etc.)
     Responde SOLO "SI" o "NO".`,
    texto,
    true
  );

  if (esNoDeseado.includes("SI")) {
    intentosNoDeseados++;

    if (intentosNoDeseados >= 2) {
      // Segundo intento: cerrar sesión
      await finalizarPorNoAutorizado(texto);
    } else {
      // Primer intento: advertencia
      await llamarIA(
        `SISTEMA: La persona no menciona a quién busca o pide entrar directamente. 
         Explícale cortésmente que necesitas el nombre del residente que busca para poder anunciarlo.`,
        texto
      );
    }
    return;
  }

  // Buscar vecino mencionado en la base de datos
  const encontrado = vecinosCache.find(
    (v) => v.nombre && textoLower.includes(v.nombre.toLowerCase())
  );

  if (encontrado) {
    vecinoSeleccionado = encontrado;
    intentosNoDeseados = 0; // Reset al encontrar vecino válido

    await llamarIA(
      `SISTEMA: Confirmaste que busca a ${vecinoSeleccionado.nombre}. 
       Dile que con gusto lo anuncias, pero que necesitas su nombre primero. 
       PROHIBIDO: No digas "verificando", "un segundo" ni "está o no está". Solo pide el nombre.`,
      texto
    );
  } else {
    await llamarIA(
      `SISTEMA: No se reconoce al vecino. Pregunta cortésmente a quién busca sin dar más información.`,
      texto
    );
  }
}

async function procesarFaseCapturaVisitante(texto) {
  const validacion = await llamarIA(
    `SISTEMA: El usuario dijo "${texto}". ¿Es un nombre propio? Responde SI o NO.`,
    texto,
    true
  );

  if (validacion.includes("SI")) {
    // Nombre válido proporcionado
    const nombreExtraido = await llamarIA(
      `SISTEMA: Extrae solo el nombre de "${texto}".`,
      texto,
      true
    );

    visitanteNombre = nombreExtraido.replace(/[*.]/g, "").trim();
    reintentosIdentidad = 0;

    // Capturar foto y notificar
    const foto = await capturarFoto();
    notificarVecino(vecinoSeleccionado, visitanteNombre, foto);

    await llamarIA(
      `SISTEMA: Avisa a ${visitanteNombre} que ya estás llamando a ${vecinoSeleccionado.nombre}.`,
      texto
    );
  } else {
    // Nombre no válido
    reintentosIdentidad++;

    if (reintentosIdentidad >= 2) {
      // Segundo error: cerrar sesión
      await finalizarPorSinIdentidad(texto);
    } else {
      // Primer error: pedir de nuevo
      await llamarIA(
        `SISTEMA: El usuario respondió "${texto}". Explícale que el nombre es OBLIGATORIO para el citófono de ${vecinoSeleccionado.nombre}.`,
        texto
      );
    }
  }
}

// ============================================================================
// FUNCIONES DE FINALIZACIÓN
// ============================================================================

async function finalizarPorNoAutorizado(texto) {
  visitaConcluida = true;
  setInputEstado(true, "Sesión finalizada");

  const mensaje = await obtenerMensajeDespedida(
    `SISTEMA: Es el segundo intento de una persona no autorizada. 
     Despídete firmemente diciendo que no se permite el ingreso sin autorización de un residente.
     Responde en texto plano, sin asteriscos ni negritas. Sé muy breve.`,
    texto
  );

  agregarMensaje(mensaje, "bot", null, true);
}

async function finalizarPorSinIdentidad(texto) {
  visitaConcluida = true;
  setInputEstado(true, "Sesión finalizada");

  const mensaje = await obtenerMensajeDespedida(
    `SISTEMA: Es el segundo intento fallido. El usuario no se identifica. 
     Dile que por seguridad no puedes anunciarlo sin su nombre y despídete definitivamente.
     Responde en texto plano, sin asteriscos ni negritas. Sé muy breve.`,
    texto
  );

  agregarMensaje(mensaje, "bot", null, true);
}

async function obtenerMensajeDespedida(instruccion, textoUsuario) {
  try {
    const respuesta = await fetch(
      "https://api.mistral.ai/v1/agents/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MISTRAL_API_KEY}`,
        },
        body: JSON.stringify({
          agent_id: AGENT_ID,
          messages: [
            { role: "system", content: instruccion },
            ...chatHistory.slice(-2),
            { role: "user", content: textoUsuario },
          ],
        }),
      }
    );

    const data = await respuesta.json();
    let mensaje = data.choices[0].message.content.replace(/\*/g, "");

    chatHistory.push(
      { role: "user", content: textoUsuario },
      { role: "assistant", content: mensaje }
    );

    return mensaje;
  } catch (error) {
    console.error("Error obteniendo mensaje de despedida:", error);
    return "Por favor comuníquese con el residente directamente. Buen día.";
  }
}

// ============================================================================
// 6. SERVICIOS EXTERNOS
// ============================================================================

async function llamarIA(
  instruccion,
  textoUsuario,
  esValidacionSilenciosa = false
) {
  try {
    const respuesta = await fetch(
      "https://api.mistral.ai/v1/agents/completions",
      {
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
              content:
                instruccion +
                " Responde en texto plano, sin asteriscos ni negritas. Sé muy breve.",
            },
            ...chatHistory.slice(-2),
            { role: "user", content: textoUsuario },
          ],
        }),
      }
    );

    if (!respuesta.ok) {
      throw new Error(`API Error: ${respuesta.status}`);
    }

    const data = await respuesta.json();
    let mensaje = data.choices[0].message.content;
    mensaje = mensaje.replace(/\*/g, "");

    if (!esValidacionSilenciosa) {
      agregarMensaje(mensaje, "bot");
      chatHistory.push(
        { role: "user", content: textoUsuario },
        { role: "assistant", content: mensaje }
      );
    }

    return mensaje;
  } catch (error) {
    console.error("Error en llamarIA:", error);

    if (!esValidacionSilenciosa) {
      agregarMensaje(
        "Disculpe, tuve un problema técnico. ¿Puede repetir?",
        "bot"
      );
    }

    return "ERROR";
  }
}

function notificarVecino(vecino, nombreVisita, foto) {
  if (!vecino || !vecino.apartamento) {
    console.error("Datos de vecino inválidos");
    return;
  }

  const canal = `/pvT/vecino/${String(vecino.apartamento).trim()}`;

  if (mqttClient && mqttClient.connected) {
    try {
      mqttClient.publish(
        canal,
        JSON.stringify({
          de: "Portería",
          visitante: nombreVisita,
          mensaje: `${nombreVisita} busca a ${vecino.nombre}.`,
          foto: foto,
          timestamp: new Date().toISOString(),
        })
      );
      console.log(`Notificación enviada a ${canal}`);
    } catch (error) {
      console.error("Error al publicar en MQTT:", error);
    }
  } else {
    console.error("Cliente MQTT no conectado");
  }
}

async function procesarRespuestaVecino(payload) {
  try {
    let datos = typeof payload === "string" ? JSON.parse(payload) : payload;
    const msg = (datos.mensaje || "").toLowerCase();

    visitaConcluida = true;
    setInputEstado(true, "Sesión finalizada");

    if (msg.includes("si") || msg.includes("pasa") || msg.includes("abre")) {
      // Autorización concedida
      if (mqttClient && mqttClient.connected) {
        mqttClient.publish(
          "/pvT/puerta",
          JSON.stringify({
            accion: "ABRIR",
            apto: vecinoSeleccionado?.apartamento,
            timestamp: new Date().toISOString(),
          })
        );
      }

      agregarMensaje(
        `${visitanteNombre}, el residente autoriza su entrada. La puerta está abierta. ¡Bienvenido!`,
        "bot",
        null,
        true
      );
    } else {
      // Autorización denegada
      agregarMensaje(
        "El residente informa que no puede recibirlo ahora. Buen día.",
        "bot",
        null,
        true
      );
    }
  } catch (error) {
    console.error("Error procesando respuesta del vecino:", error);
    agregarMensaje(
      "Hubo un problema al procesar la respuesta. Por favor contacte al residente directamente.",
      "bot",
      null,
      true
    );
  }
}

// ============================================================================
// 7. CAPTURA DE FOTO
// ============================================================================

async function capturarFoto() {
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");

  if (!video || !canvas) {
    console.error("Elementos de video o canvas no encontrados");
    return null;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: 640,
        height: 480,
      },
    });

    video.srcObject = stream;

    // Esperar a que el video esté listo
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.play();
        resolve();
      };
    });

    // Pequeña pausa para asegurar que la imagen esté estable
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Capturar frame
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Detener stream
    stream.getTracks().forEach((track) => track.stop());

    // Convertir a base64 con compresión
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch (error) {
    console.error("Error capturando foto:", error);
    return null;
  }
}

// ============================================================================
// 8. INICIALIZACIÓN Y GESTIÓN DE SESIÓN
// ============================================================================

async function iniciarServicio() {
  const welcome = document.getElementById("welcome-screen");
  if (welcome) {
    welcome.style.display = "none";
  }

  // Resetear datos
  reiniciarDatosInternos();

  // Inicializar reconocimiento de voz
  inicializarReconocimiento();

  // Conectar MQTT
  if (typeof conectarMQTT === "function") {
    conectarMQTT(
      (topic, payload) => {
        if (topic === "/pvT/portero") {
          procesarRespuestaVecino(payload);
        }
      },
      () => {
        const status = document.getElementById("connection-status");
        if (status) {
          status.innerText = "● En línea";
        }
        mqttClient.subscribe("/pvT/portero");
        console.log("MQTT conectado y suscrito");
      }
    );
  }

  // Saludo inicial
  const saludoElegido = saludos[Math.floor(Math.random() * saludos.length)];
  agregarMensaje(saludoElegido, "bot");

  // Cargar base de datos de vecinos
  try {
    const respuesta = await fetch(GOOGLE_SHEET_URL);

    if (!respuesta.ok) {
      throw new Error(`HTTP ${respuesta.status}`);
    }

    vecinosCache = await respuesta.json();
    console.log(`Base de datos cargada: ${vecinosCache.length} vecinos`);
  } catch (error) {
    console.error("Error cargando vecinos:", error);
    agregarMensaje(
      "Advertencia: No se pudo cargar la base de datos de residentes.",
      "bot"
    );
  }
}

function reiniciarDatosInternos() {
  visitanteNombre = "";
  vecinoSeleccionado = null;
  visitaConcluida = false;
  intentosNoDeseados = 0;
  reintentosIdentidad = 0;
  chatHistory = [];

  // Limpiar mensajes
  const container = document.getElementById("messages");
  if (container) {
    container.innerHTML = "";
  }

  // Cancelar cualquier síntesis de voz activa
  window.speechSynthesis.cancel();

  // Detener reconocimiento de voz
  detenerReconocimiento();
}

function reiniciarSesion() {
  console.log("Reiniciando sesión...");

  reiniciarDatosInternos();

  const welcome = document.getElementById("welcome-screen");
  if (welcome) {
    welcome.style.display = "flex";
  }

  setInputEstado(true, "Esperando...");
}

// ============================================================================
// 9. EVENT LISTENERS
// ============================================================================

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    enviarMensaje();
  }
});

// Prevenir pérdida de audio al cambiar de pestaña
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    // Pausar reconocimiento si la página se oculta
    detenerReconocimiento();
  }
});

// ============================================================================
// EXPORTAR (si se usa como módulo)
// ============================================================================

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    iniciarServicio,
    reiniciarSesion,
    enviarMensaje,
  };
}
