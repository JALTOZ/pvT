const MISTRAL_API_KEY = "rlpAYwxDHmTdXoYyTibBmUMUNi9VL9S6";
const AGENT_ID = "ag_019b41cc1f6173f6839c1cb21169a5aa";
const GOOGLE_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbzfaLav5GdU9mCCOVBKwlsD9zcRoddII_P3UbCYYdeTQht2DmJTXHa7JCOko-CcA8OR/exec";

let chatHistory = []; // Para mantener el hilo de la conversación

async function enviarMensaje() {
  const input = document.getElementById("userInput");
  const texto = input.value.trim();
  if (!texto) return;

  agregarMensaje(texto, "user");
  input.value = "";

  try {
    // 1. Consultar Google Sheets con manejo de redirección
    // Quitamos headers manuales para que el navegador use el modo simple de CORS
    const resSheets = await fetch(
      "https://script.google.com/macros/s/AKfycbzfaLav5GdU9mCCOVBKwlsD9zcRoddII_P3UbCYYdeTQht2DmJTXHa7JCOko-CcA8OR/exec",
      {
        method: "GET",
        mode: "cors",
        redirect: "follow",
      }
    );

    if (!resSheets.ok)
      throw new Error("No se pudo obtener la lista de vecinos");

    const vecinos = await resSheets.json();

    // 2. Buscar coincidencias
    const encontrados = vecinos.filter(
      (v) =>
        v.nombre &&
        v.apellido &&
        (texto.toLowerCase().includes(v.nombre.toLowerCase()) ||
          texto.toLowerCase().includes(v.apellido.toLowerCase()))
    );

    // 3. Contexto para Mistral
    let contextoInterno =
      "El visitante busca a alguien que NO está en el registro.";
    if (encontrados.length > 0) {
      contextoInterno =
        "DATOS REALES DEL REGISTRO (CONFIDENCIAL): " +
        JSON.stringify(encontrados);
    }

    // 4. Llamada a Mistral
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
              content: `REGLAS: Eres el portero. No menciones tecnología. Usa estos datos para decidir: ${contextoInterno}`,
            },
            ...chatHistory,
            { role: "user", content: texto },
          ],
        }),
      }
    );

    const data = await resMistral.json();
    const respuestaBot = data.choices[0].message.content;

    chatHistory.push({ role: "user", content: texto });
    chatHistory.push({ role: "assistant", content: respuestaBot });
    agregarMensaje(respuestaBot, "bot");
  } catch (error) {
    console.error("Error detallado:", error);
    agregarMensaje(
      "Disculpe, tengo problemas para consultar el registro.",
      "bot"
    );
  }
}

function agregarMensaje(texto, tipo) {
  const div = document.createElement("div");
  div.className = `msg ${tipo}`;
  div.innerText = texto;
  document.getElementById("messages").appendChild(div);
  document.getElementById("messages").scrollTop =
    document.getElementById("messages").scrollHeight;
}
