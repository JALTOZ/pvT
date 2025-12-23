// 1. CONFIGURACIÓN
const MISTRAL_API_KEY = "rlpAYwxDHmTdXoYyTibBmUMUNi9VL9S6";
const AGENT_ID = "ag_019b41cc1f6173f6839c1cb21169a5aa";
const GOOGLE_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbzfaLav5GdU9mCCOVBKwlsD9zcRoddII_P3UbCYYdeTQht2DmJTXHa7JCOko-CcA8OR/exec";

// 2. ESTADO GLOBAL
let chatHistory = [];
let vecinosCache = [];
let visitanteNombre = "";
let vecinoSeleccionado = null;
let visitaConcluida = false;
let intentosSinNombre = 0;
let intentosNoDeseados = 0;
let reconocimiento;
let intentosNombre = 0;
let reintentosIdentidad = 0;

const saludos = [
  "Bienvenido. ¿A quién desea visitar?",
  "Es un gusto saludarle. ¿A qué persona busca?",
  "Saludos cordiales. ¿Con quién desea hablar?",
  "Bienvenido. ¿A quién busca?",
  "Hola. ¿A qué persona viene a visitar hoy?",
];
