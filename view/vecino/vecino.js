// vecino.js - Interfaz RESIDENTE JALTOZ
// Depende de: config.js, mqtt.js, qrcode.js

const GOOGLE_SHEET_URL = CONFIG.GOOGLE_SHEET_URL;
let MI_DATA = null;
let currentSubscriptionTopic = null;

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
    console.error(e);
    errorEl.innerText = "Error al conectar con el registro.";
  }
}

function iniciarIntercomunicador() {
  const statusEl = document.getElementById("connection-status");
  const displayEl = document.getElementById("display-name");
  const miApto = String(MI_DATA.apartamento).trim();

  if (displayEl)
    displayEl.innerText = `${MI_DATA.nombre} ${MI_DATA.apellido} - Depto ${miApto}`;

  // Usamos MQTTService
  MQTTService.connect(
    "vecino_" + miApto,
    () => { // On Connect
      statusEl.innerText = "● En línea";
      document.getElementById("input-area").classList.remove("disabled");
      document.getElementById("userInput").disabled = false;

      currentSubscriptionTopic = MQTTService.suscribirApto(miApto);
    },
    (topic, payload) => { // On Message
      // Verificar si es para mí
      if (topic === currentSubscriptionTopic) {
        let datos = payload;
        if (typeof payload === "string") {
          try { datos = JSON.parse(payload); } catch (e) { datos = { mensaje: payload }; }
        }

        // 1. Mostrar texto del portero
        agregarMensaje(`Portería: ${datos.mensaje}`, "portero");

        // 2. Si viene una foto, mostrarla
        if (datos.foto) {
          mostrarFotoVisitante(datos.foto);
        }

        const miAudio = new Audio("./call.mp3");
        miAudio.play().catch(e => console.log("Audio play error", e));
      }
    }
  );
}

// insertar la imagen en el historial
function mostrarFotoVisitante(base64Data) {
  const container = document.getElementById("messages");
  if (!container) return;

  const div = document.createElement("div");
  div.className = "msg portero";

  const img = document.createElement("img");
  img.src = base64Data;
  img.style.width = "100%";
  img.style.maxWidth = "250px";
  img.style.borderRadius = "8px";

  div.innerHTML = "<strong>Foto del visitante:</strong><br>";
  div.appendChild(img);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function abrirPuertaRapido() {
  // Envía un "Sí" implícito
  enviarMensajeProcesado("SI, abrir puerta.");
}

function enviarAlPortero() {
  const input = document.getElementById("userInput");
  enviarMensajeProcesado(input.value.trim());
  input.value = "";
}

function enviarMensajeProcesado(texto) {
  if (!texto) return;
  const datos = {
    de: MI_DATA.apartamento,
    nombre: MI_DATA.nombre,
    mensaje: texto,
  };

  MQTTService.publish(CONFIG.MQTT_TOPICS.PORTERO, datos);
  agregarMensaje(texto, "yo");
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

// --- GENERACIÓN QR ---
function mostrarFormularioInvitado() {
  document.getElementById("guest-form-container").style.display = "flex";
  document.getElementById("guestNameInput").value = "";
  document.getElementById("guestNameInput").focus();
}

function cerrarFormularioInvitado() {
  document.getElementById("guest-form-container").style.display = "none";
}

function generarQRInvitado() {
  const nombreVisitante = document.getElementById("guestNameInput").value.trim();
  if (!nombreVisitante) return;

  cerrarFormularioInvitado();

  // Generar QR de Invitado
  generarQRGenerico({
    tipo: "INVITADO",
    nombre_visitante: nombreVisitante,
    autoriza_nombre: `${MI_DATA.nombre} ${MI_DATA.apellido}`,
    apartamento: MI_DATA.apartamento,
    timestamp: Date.now()
  }, `Invitación: ${nombreVisitante}`);
}

function mostrarMiQR() {
  if (!MI_DATA) return;
  generarQRGenerico({
    tipo: "RESIDENTE",
    nombre: MI_DATA.nombre,
    apellido: MI_DATA.apellido,
    nombre_completo: `${MI_DATA.nombre} ${MI_DATA.apellido}`,
    apartamento: MI_DATA.apartamento,
    timestamp: Date.now()
  }, "Mi Pase de Residente");
}

function generarQRGenerico(payload, titulo) {
  document.getElementById("qr-display-container").style.display = "flex";
  const container = document.getElementById("qrcode");
  const titleEl = document.getElementById("qr-title");
  const infoEl = document.getElementById("qr-info");

  container.innerHTML = "";
  if (titleEl) titleEl.innerText = titulo;

  // const fechaStr = new Date().toLocaleString("es-ES");
  // const payloadStr = JSON.stringify({ ...payload, fecha_creacion: fechaStr });

  // NUEVO FORMATO COMPACTO: TIPO|APTO|NOMBRE
  let qrText = "";
  const fechaStr = new Date().toLocaleString("es-ES");

  if (payload.tipo === "INVITADO") {
    // I|202|JUAN PEREZ
    qrText = `I|${payload.apartamento}|${payload.nombre_visitante}`;
    if (infoEl) infoEl.innerHTML = `<p>Visita: <strong>${payload.nombre_visitante}</strong></p><p>Autoriza: Apto ${payload.apartamento}</p><p>${fechaStr}</p>`;
  } else {
    // R|202|PEDRO VECINO
    qrText = `R|${payload.apartamento}|${payload.nombre_completo}`;
    if (infoEl) infoEl.innerHTML = `<p><strong>${payload.nombre_completo}</strong></p><p>Apto ${payload.apartamento}</p><p>${fechaStr}</p>`;
  }

  new QRCode(container, {
    text: qrText,
    width: 200,
    height: 200,

    correctLevel: QRCode.CorrectLevel.H

  });
}

function cerrarMiQR() {
  document.getElementById("qr-display-container").style.display = "none";
}

async function compartirQR() {
  const container = document.getElementById("qrcode");
  const sourceImg = container.querySelector("img");
  const sourceCanvas = container.querySelector("canvas");

  if (!sourceImg && !sourceCanvas) {
    alert("No se ha generado el QR aún.");
    return;
  }

  try {
    // Preparar canvas composito para añadir borde blanco
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const padding = 40; // Borde blanco
    const qrSize = 200; // Tamaño base configurado en QRCode lib

    // Dimensiones finales
    canvas.width = qrSize + (padding * 2);
    canvas.height = qrSize + (padding * 2);

    // 1. Fondo Blanco
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Dibujar borde externo (opcional, solicitado "borde por fuera")
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    // 3. Dibujar QR en el centro
    const imgToDraw = new Image();
    // Esperar a que cargue si usamos src, o usar el canvas directo
    await new Promise((resolve) => {
      if (sourceCanvas) {
        resolve(sourceCanvas); // Ya es dibujable
      } else {
        imgToDraw.onload = () => resolve(imgToDraw);
        imgToDraw.src = sourceImg.src;
      }
    }).then(image => {
      ctx.drawImage(image, padding, padding, qrSize, qrSize);
    });

    // 4. Agregar Texto de Pie (Opcional pero útil)
    ctx.font = "16px Arial";
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.fillText("JALTOZ ACCESO", canvas.width / 2, canvas.height - 15);

    // Convertir a Blob
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], "pase_acceso_jaltoz.png", { type: "image/png" });

    if (navigator.share && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'Pase de Acceso JALTOZ',
        text: `Pase de acceso para el apartamento ${MI_DATA ? MI_DATA.apartamento : ''}.`,
        files: [file]
      });
    } else {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "pase_jaltoz_borde.png";
      link.click();
    }
  } catch (error) {
    console.error("Error compartiendo:", error);
    alert("Error al procesar la imagen para compartir.");
  }
}

// Exponer funciones globales
window.verificarResidente = verificarResidente;
window.abrirPuertaRapido = abrirPuertaRapido;
window.enviarAlPortero = enviarAlPortero;
window.mostrarMiQR = mostrarMiQR;
window.cerrarMiQR = cerrarMiQR;
window.compartirQR = compartirQR;
window.mostrarFormularioInvitado = mostrarFormularioInvitado;
window.cerrarFormularioInvitado = cerrarFormularioInvitado;
window.generarQRInvitado = generarQRInvitado;
