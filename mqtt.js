// mqtt.js - Configuración Central de Mensajería JALTOZ
let mqttClient;

// Función para normalizar nombres para tópicos (Ej: "Juan Pérez" -> "juan_perez")
const normalizarTopico = (texto) => {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
};

// Archivo: mqtt.js (en la raíz)

function conectarMQTT(onMessageCallback, onConnectCallback) {
  // Ajusta la URL y credenciales a las tuyas
  mqttClient = mqtt.connect("wss://emqx.jaltoz.com/mqtt", {
    clientId: "portero_" + Math.random().toString(16).substring(2, 8),
  });

  mqttClient.on("connect", () => {
    console.log("✅ Conectado al broker");
    // ESTA LÍNEA ES LA QUE ACTIVA TU INTERFAZ:
    if (onConnectCallback) onConnectCallback();
  });

  mqttClient.on("message", (topic, message) => {
    const payload = JSON.parse(message.toString());
    if (onMessageCallback) onMessageCallback(topic, payload);
  });
}

function suscribirPortero() {
  if (mqttClient) {
    mqttClient.subscribe("/pvT/portero");
    console.log("Subscrito a /pvT/portero");
  }
}

// Función para que el vecino escuche su canal privado
function suscribirVecino(nombreCompleto) {
  const topico = `/pvT/vecinos/${normalizarTopico(nombreCompleto)}`;
  mqttClient.subscribe(topico);
  console.log(`👂 Suscrito a: ${topico}`);
}

// Función para que el portero escuche las respuestas generales
function suscribirPortero() {
  mqttClient.subscribe("/pvT/portero");
  console.log("👂 Portería escuchando canal general");
}

// Función universal para enviar mensajes
function enviarPorMQTT(destinatarioTopico, objetoMensaje) {
  const topico = destinatarioTopico.startsWith("/")
    ? destinatarioTopico
    : `/pvT/vecinos/${normalizarTopico(destinatarioTopico)}`;

  mqttClient.publish(topico, JSON.stringify(objetoMensaje), { qos: 1 });
}
