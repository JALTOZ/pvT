const GOOGLE_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbzfaLav5GdU9mCCOVBKwlsD9zcRoddII_P3UbCYYdeTQht2DmJTXHa7JCOko-CcA8OR/exec";
let MI_DATA = null;

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

  if (displayEl)
    displayEl.innerText = `${MI_DATA.nombre} ${MI_DATA.apellido} - Depto ${miApto}`;

  if (typeof conectarMQTT === "function") {
    conectarMQTT(
      (topic, payload) => {
        let datos;
        try {
          datos = typeof payload === "string" ? JSON.parse(payload) : payload;
        } catch (e) {
          datos = { mensaje: payload };
        }

        if (topic === `/pvT/vecino/${miApto}`) {
          // 1. Mostrar texto del portero
          agregarMensaje(`Portería: ${datos.mensaje}`, "portero");

          // 2. Si viene una foto, mostrarla en el chat
          if (datos.foto) {
            mostrarFotoVisitante(datos.foto);
          }
        }
      },
      () => {
        statusEl.innerText = "● En línea";
        document.getElementById("input-area").classList.remove("disabled");
        document.getElementById("userInput").disabled = false;
        if (mqttClient) mqttClient.subscribe(`/pvT/vecino/${miApto}`);
      }
    );
  }
}

// insertar la imagen en el historial
function mostrarFotoVisitante(base64Data) {
  console.log("Imagen recibida:", base64Data.substring(0, 50) + "..."); // Esto debe salir en la consola
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
  // Envía un "Sí" automático al portero para activar la apertura
  enviarMensajeProcesado("Sí, puede pasar. Abriendo puerta.");
}

function enviarAlPortero() {
  const input = document.getElementById("userInput");
  enviarMensajeProcesado(input.value.trim());
  input.value = "";
}

function enviarMensajeProcesado(texto) {
  if (!texto || !mqttClient) return;
  const datos = {
    de: MI_DATA.apartamento,
    nombre: MI_DATA.nombre,
    mensaje: texto,
  };
  mqttClient.publish("/pvT/portero", JSON.stringify(datos));
  agregarMensaje(texto, "yo");
}

function agregarMensaje(texto, tipo) {
  const miAudio = new Audio("./call.mp3");
  miAudio.play();

  const div = document.createElement("div");
  div.className = `msg ${tipo}`;
  div.innerText = texto;
  const container = document.getElementById("messages");
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}
