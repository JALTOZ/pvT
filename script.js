const MISTRAL_API_KEY = CONFIG.MISTRAL_API_KEY;
const AGENT_ID = CONFIG.AGENT_ID;
const GOOGLE_SHEET_URL = CONFIG.GOOGLE_SHEET_URL;

let chatHistory = [];

async function enviarMensaje() {
  const input = document.getElementById("userInput");
  const texto = input.value.trim();
  if (!texto) return;

  agregarMensaje(texto, "user");
  input.value = "";

  try {
    // 1. Obtener datos de Google Sheets
    const resSheets = await fetch(GOOGLE_SHEET_URL, {
      method: "GET",
      mode: "cors",
      redirect: "follow",
    });

    if (!resSheets.ok) throw new Error("Error en Sheets");
    const vecinos = await resSheets.json();

    // 2. Lógica de búsqueda avanzada
    const textoMin = texto.toLowerCase();
    const encontrados = vecinos.filter(
      (v) =>
        (v.nombre && textoMin.includes(v.nombre.toLowerCase())) ||
        (v.apellido && textoMin.includes(v.apellido.toLowerCase()))
    );

    // 3. Determinar el contexto para el Agente basado en PROTOCOLO
    let contextoInstruccion = "";

    if (encontrados.length === 0) {
      contextoInstruccion =
        "PROTOCOLO: El nombre no coincide. Indica que no está en registro de forma breve.";
    } else if (encontrados.length > 1) {
      contextoInstruccion = `PROTOCOLO: Se encontraron varios: ${encontrados
        .map((v) => v.nombre + " " + v.apellido)
        .join(", ")}. Pide el apellido de forma natural.`;
    } else {
      const residente = encontrados[0];
      contextoInstruccion = `PROTOCOLO: Coincidencia encontrada. Residente: ${residente.nombre} ${residente.apellido}. Estado: ${residente.estado}. Confirma que vas a verificar si se encuentra.`;
    }

    // 4. Llamada a Mistral (Usando el Agente)
    const resMistral = await fetch(
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
              content: `INFORMACIÓN REAL DE PORTERÍA: ${contextoInstruccion}. Recuerda: Máximo 2 frases, lenguaje humano, nada de tecnología.`,
            },
            ...chatHistory,
            { role: "user", content: texto },
          ],
        }),
      }
    );

    const data = await resMistral.json();
    const respuestaBot = data.choices[0].message.content;

    // Guardar en historial y mostrar
    chatHistory.push({ role: "user", content: texto });
    chatHistory.push({ role: "assistant", content: respuestaBot });

    // Limitar historial para no saturar tokens
    if (chatHistory.length > 10) chatHistory.shift();

    agregarMensaje(respuestaBot, "bot");
  } catch (error) {
    console.error("Error:", error);
    agregarMensaje(
      "Un momento, por favor... tengo un problema con el libro de registro.",
      "bot"
    );
  }
}

function agregarMensaje(texto, tipo) {
  const messagesDiv = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = `msg ${tipo}`;
  div.innerText = texto;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
