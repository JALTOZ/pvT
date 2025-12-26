var reconocimiento = null; // Usamos 'var' o declaramos al inicio para que sea global

function inicializarPerifericos() {
  window.speechSynthesis.onvoiceschanged = () => console.log("Voces listas");

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    reconocimiento = new SpeechRecognition();
    reconocimiento.lang = "es-ES";
    reconocimiento.continuous = false;

    reconocimiento.onstart = () =>
      document.getElementById("mic-container")?.classList.add("active");
    reconocimiento.onend = () =>
      document.getElementById("mic-container")?.classList.remove("active");

    reconocimiento.onresult = (e) => {
      const texto = e.results[0][0].transcript;
      const input = document.getElementById("userInput");
      if (input && !input.disabled) {
        input.value = texto;
        enviarMensaje();
      }
    };
  }
}

function leerTexto(texto, esCierre = false) {
  return new Promise((resolve) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.rate = 1.1;

    setInputEstado(true, "Portero hablando...");

    u.onend = () => {
      if (!esCierre) {
        setInputEstado(false, "Escriba aquí...");
        try {
          if (reconocimiento) reconocimiento.start();
        } catch (e) {}
      }
      resolve();
    };
    window.speechSynthesis.speak(u);
  });
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
    return canvas.toDataURL("image/jpeg", 0.08);
  } catch (e) {
    console.error("Error cámara:", e);
    return null;
  }
}
