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
    // 1. Consultar Google Sheets (ACTUALIZACIÓN INMEDIATA)
    const resSheets = await fetch(GOOGLE_SHEET_URL);
    const vecinos = await resSheets.json();

    // 2. Buscar si el texto menciona a algún vecino (búsqueda simple)
    const encontrados = vecinos.filter(
      (v) =>
        texto.toLowerCase().includes(v.nombre.toLowerCase()) ||
        texto.toLowerCase().includes(v.apellido.toLowerCase())
    );

    // 3. Crear el mensaje de "contexto oculto" para Mistral
    let contextoInterno = "No se encontraron coincidencias en el registro.";
    if (encontrados.length > 0) {
      contextoInterno =
        "COINCIDENCIAS ENCONTRADAS: " + JSON.stringify(encontrados);
    }

    // 4. Llamar a Mistral usando el Agente
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
              content: `CONTEXTO DE SEGURIDAD (NO REVELAR): ${contextoInterno}`,
            },
            ...chatHistory,
            { role: "user", content: texto },
          ],
        }),
      }
    );

    const data = await resMistral.json();
    const respuestaBot = data.choices[0].message.content;

    // 5. Guardar en el historial y mostrar
    chatHistory.push({ role: "user", content: texto });
    chatHistory.push({ role: "assistant", content: respuestaBot });
    agregarMensaje(respuestaBot, "bot");
  } catch (error) {
    console.error(error);
    agregarMensaje("Lo siento, tengo un problema de conexión.", "bot");
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
