// RELOJ PANTALLA INICIO
function actualizarReloj() {
    const now = new Date();
    let h = now.getHours();
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    const am_pm = h >= 12 ? "PM" : "AM";

    h = h % 12;
    h = h ? h : 12; // 0 a 12

    // Elementos DOM (Ids en español según HTML)
    const elHoras = document.getElementById("horas");
    const elMinutos = document.getElementById("minutos");
    const elSegundos = document.getElementById("segundos");
    const elAmpm = document.getElementById("ampm");

    // Actualizar texto
    if (elHoras) elHoras.innerText = h;
    if (elMinutos) elMinutos.innerText = m;
    if (elSegundos) elSegundos.innerText = s;
    if (elAmpm) elAmpm.innerText = " " + am_pm;
}

setInterval(actualizarReloj, 1000);
// Esperar a que el DOM cargue o ejecutar ya si está listo
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", actualizarReloj);
} else {
    actualizarReloj();
}