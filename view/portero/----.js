/**
 * JALTOZ - CONSERJE VIRTUAL (VERSIÓN MAESTRA FINAL OPTIMIZADA)
 */

// 3. FUNCIONES DE UI Y AUDIO
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
  u.rate = 1.1;

  setInputEstado(true, "Portero hablando...");

  // APAGAR MICRO MIENTRAS HABLA
  if (reconocimiento)
    try {
      reconocimiento.stop();
    } catch (e) {}

  u.onend = () => {
    if (esCierreFinal) {
      // ⬅️ CIERRE INMEDIATO AL TERMINAR DE HABLAR
      setTimeout(() => reiniciarSesion(), 1500);
    } else if (callback) {
      callback();
    } else {
      setInputEstado(false, "Escriba aquí...");
      iniciarEscucha();
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
  reconocimiento.continuous = false;

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

// 5. CEREBRO CENTRAL
async function enviarMensaje() {
  const input = document.getElementById("userInput");
  const texto = input.value.trim();

  // ⬅️ BLOQUEO TOTAL SI YA CONCLUYÓ
  if (!texto || input.disabled || visitaConcluida) return;

  if (reconocimiento)
    try {
      reconocimiento.stop();
    } catch (e) {}

  agregarMensaje(texto, "user");
  input.value = "";
  const t = texto.toLowerCase();

  // --- FASE 1: BUSCAR AL RESIDENTE ---
  if (!vecinoSeleccionado) {
    // DETECTAR PERSONAS NO DESEADAS
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
        // ⬅️ SEGUNDO INTENTO: CIERRE INMEDIATO
        visitaConcluida = true;
        setInputEstado(true, "Sesión finalizada");

        // ⬅️ Llamada con cierre forzado
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
                  content: `SISTEMA: Es el segundo intento de una persona no autorizada.
Despídete firmemente diciendo que no se permite el ingreso sin autorización de un residente.
Responde en texto plano, sin asteriscos ni negritas. Sé muy breve.`,
                },
                ...chatHistory.slice(-2),
                { role: "user", content: texto },
              ],
            }),
          }
        );

        const data = await respuesta.json();
        let mensaje = data.choices[0].message.content.replace(/\*/g, "");

        chatHistory.push(
          { role: "user", content: texto },
          { role: "assistant", content: mensaje }
        );

        // ⬅️ AGREGAR MENSAJE CON CIERRE FORZADO (esCierreFinal = true)
        agregarMensaje(mensaje, "bot", null, true);
        return;
      } else {
        // PRIMER INTENTO: Advertencia
        await llamarIA(
          `SISTEMA: La persona no menciona a quién busca o pide entrar directamente.
Explícale cortésmente que necesitas el nombre del residente que busca para poder anunciarlo.`,
          texto
        );
        return;
      }
    }

    // Buscar vecino mencionado
    const encontrado = vecinosCache.find(
      (v) => v.nombre && t.includes(v.nombre.toLowerCase())
    );

    if (encontrado) {
      vecinoSeleccionado = encontrado;
      intentosNoDeseados = 0; // ⬅️ RESET al encontrar vecino válido
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
    return;
  }

  // --- FASE 2: CAPTURAR NOMBRE DEL VISITANTE ---
  if (vecinoSeleccionado && !visitanteNombre) {
    const validacion = await llamarIA(
      `SISTEMA: El usuario dijo "${texto}". ¿Es un nombre propio? Responde SI o NO.`,
      texto,
      true
    );

    if (validacion.includes("SI")) {
      // CASO ÉXITO
      const nombreExtraido = await llamarIA(
        `SISTEMA: Extrae solo el nombre de "${texto}".`,
        texto,
        true
      );
      visitanteNombre = nombreExtraido.replace(/[*.]/g, "").trim();
      reintentosIdentidad = 0;

      const foto = await capturarFoto();
      notificarVecino(vecinoSeleccionado, visitanteNombre, foto);
      await llamarIA(
        `SISTEMA: Avisa a ${visitanteNombre} que ya estás llamando a ${vecinoSeleccionado.nombre}.`,
        texto
      );
    } else {
      // CASO ERROR
      reintentosIdentidad++;

      if (reintentosIdentidad >= 2) {
        // ⬅️ SEGUNDO ERROR: CIERRE INMEDIATO
        visitaConcluida = true;
        setInputEstado(true, "Sesión finalizada");

        // ⬅️ Llamada con cierre forzado
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
                  content: `SISTEMA: Es el segundo intento fallido. El usuario no se identifica.
Dile que por seguridad no puedes anunciarlo sin su nombre y despídete definitivamente.
Responde en texto plano, sin asteriscos ni negritas. Sé muy breve.`,
                },
                ...chatHistory.slice(-2),
                { role: "user", content: texto },
              ],
            }),
          }
        );

        const data = await respuesta.json();
        let mensaje = data.choices[0].message.content.replace(/\*/g, "");

        chatHistory.push(
          { role: "user", content: texto },
          { role: "assistant", content: mensaje }
        );

        // ⬅️ AGREGAR MENSAJE CON CIERRE FORZADO (esCierreFinal = true)
        agregarMensaje(mensaje, "bot", null, true);
        return;
      } else {
        await llamarIA(
          `SISTEMA: El usuario respondió "${texto}". Explícale que el nombre es OBLIGATORIO para el citófono de ${vecinoSeleccionado.nombre}.`,
          texto
        );
      }
    }
    return;
  }
}

// 6. SERVICIOS EXTERNOS
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
            content:
              instruccion +
              " Responde en texto plano, sin asteriscos ni negritas. Sé muy breve.",
          },
          ...chatHistory.slice(-2),
          { role: "user", content: textoUsuario },
        ],
      }),
    });
    const data = await res.json();
    let respuesta = data.choices[0].message.content;
    respuesta = respuesta.replace(/\*/g, "");

    if (!esValidacionSilenciosa) {
      agregarMensaje(respuesta, "bot");
      chatHistory.push(
        { role: "user", content: textoUsuario },
        { role: "assistant", content: respuesta }
      );
    }
    return respuesta;
  } catch (e) {
    console.error("Error en llamarIA:", e);
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
  visitaConcluida = true;
  setInputEstado(true, "Sesión finalizada");

  if (msg.includes("si") || msg.includes("pasa") || msg.includes("abre")) {
    if (mqttClient?.connected) {
      mqttClient.publish(
        "/pvT/puerta",
        JSON.stringify({
          accion: "ABRIR",
          apto: vecinoSeleccionado?.apartamento,
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
    agregarMensaje(
      "El residente informa que no puede recibirlo ahora. Buen día.",
      "bot",
      null,
      true
    );
  }
}

// 7. ARRANQUE
async function iniciarServicio() {
  const welcome = document.getElementById("welcome-screen");
  if (welcome) welcome.style.display = "none";

  reiniciarDatosInternos();
  inicializarReconocimiento();

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

  const saludoElegido = saludos[Math.floor(Math.random() * saludos.length)];
  agregarMensaje(saludoElegido, "bot");

  try {
    const res = await fetch(GOOGLE_SHEET_URL);
    vecinosCache = await res.json();
  } catch (e) {
    console.error("Error cargando vecinos:", e);
  }
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
    return canvas.toDataURL("image/jpeg", 0.1);
  } catch (e) {
    console.error("Error capturando foto:", e);
    return null;
  }
}

function reiniciarDatosInternos() {
  visitanteNombre = "";
  vecinoSeleccionado = null;
  visitaConcluida = false;
  intentosSinNombre = 0;
  intentosNoDeseados = 0;
  intentosNombre = 0;
  reintentosIdentidad = 0;
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
