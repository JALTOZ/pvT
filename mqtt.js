// mqtt.js - Configuración y Servicios MQTT
// Depende de: config.js (debe cargarse antes)

const MQTTService = {
  client: null,
  callbacks: {
    onConnect: null,
    onMessage: null
  },

  // Normalizar nombres para tópicos (Ej: "Juan Pérez" -> "juan_perez")
  normalizarTopico: (texto) => {
    return texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
  },

  connect: (clientIdPrefix, onConnectCb, onMessageCb) => {
    if (MQTTService.client) return; // Ya conectado

    MQTTService.callbacks.onConnect = onConnectCb;
    MQTTService.callbacks.onMessage = onMessageCb;

    const clientId = clientIdPrefix + "_" + Math.random().toString(16).substring(2, 8);
    console.log(`🔌 Conectando a MQTT como ${clientId}...`);

    MQTTService.client = mqtt.connect(CONFIG.MQTT_BROKER_URL, { clientId });

    MQTTService.client.on("connect", () => {
      console.log("✅ Conectado al broker MQTT");
      if (MQTTService.callbacks.onConnect) MQTTService.callbacks.onConnect();
    });

    MQTTService.client.on("message", (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        if (MQTTService.callbacks.onMessage) MQTTService.callbacks.onMessage(topic, payload);
      } catch (e) {
        console.warn("Mensaje MQTT no es JSON válido:", message.toString());
        // Opcional: pasar raw message si falla JSON
        if (MQTTService.callbacks.onMessage) MQTTService.callbacks.onMessage(topic, { raw: message.toString() });
      }
    });

    MQTTService.client.on("error", (err) => {
      console.error("❌ Error MQTT:", err);
    });
  },

  subscribe: (topic) => {
    if (MQTTService.client) {
      MQTTService.client.subscribe(topic, (err) => {
        if (!err) console.log(`👂 Suscrito a: ${topic}`);
        else console.error(`❌ Error suscribiendo a ${topic}:`, err);
      });
    }
  },

  publish: (topic, messageObj) => {
    if (MQTTService.client && MQTTService.client.connected) {
      MQTTService.client.publish(topic, JSON.stringify(messageObj), { qos: 1 });
    } else {
      console.warn("⚠️ No hay conexión MQTT para publicar.");
    }
  },

  // Helpers específicos del negocio
  suscribirPortero: () => {
    MQTTService.subscribe(CONFIG.MQTT_TOPICS.PORTERO);
  },

  suscribirVecino: (nombreCompleto) => {
    // Usamos el apartamento si es posible, o nombre normalizado
    // NOTA: El código original usaba nombre normalizado en mqtt.js pero apartamento en portero.js
    // Vamos a estandarizar: si pasas nombreCompleto, trata de usarlo normalizado
    const topic = `${CONFIG.MQTT_TOPICS.VECINOS_PREFIX}${MQTTService.normalizarTopico(nombreCompleto)}`;
    MQTTService.subscribe(topic);
    return topic;
  },

  suscribirApto: (apto) => {
    const topic = `/pvT/vecino/${String(apto).trim()}`;
    MQTTService.subscribe(topic);
    return topic;
  }
};
