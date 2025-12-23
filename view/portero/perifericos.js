const Perifericos = {
  reconocimiento: null,

  inicializar() {
    // Configurar Voz
    window.speechSynthesis.onvoiceschanged = () => console.log("Voces listas");

    // Configurar Micrófono
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.reconocimiento = new SpeechRecognition();
      this.reconocimiento.lang = "es-ES";
      this.reconocimiento.onstart = () =>
        document.getElementById("mic-container").classList.add("active");
      this.reconocimiento.onend = () =>
        document.getElementById("mic-container").classList.remove("active");
      this.reconocimiento.onresult = (e) =>
        Conductor.procesarEntrada(e.results[0][0].transcript);
    }
  },

  decir(texto, esCierre = false) {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(texto);
      u.rate = 1.1;
      u.pitch = 1.0;

      // Bloquear entrada mientras habla
      setInputEstado(true, "Portero hablando...");

      u.onend = () => {
        if (!esCierre) {
          setInputEstado(false, "Escriba aquí...");
          if (this.reconocimiento) this.reconocimiento.start();
        }
        resolve();
      };
      window.speechSynthesis.speak(u);
      agregarMensajeVisual(texto, "bot");
    });
  },

  async capturarFoto() {
    const video = document.getElementById("video");
    const canvas = document.getElementById("canvas");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      await new Promise((res) => setTimeout(res, 1000));
      canvas
        .getContext("2d")
        .drawImage(video, 0, 0, canvas.width, canvas.height);
      stream.getTracks().forEach((t) => t.stop());
      return canvas.toDataURL("image/jpeg", 0.05); // Compresión mínima para MQTT
    } catch (e) {
      return null;
    }
  },
};
