const STORAGE_KEY = "leadTimeDashboard.points.v1";
const SIZE_COLORS = { S: "#3fbf6f", M: "#f5a623", L: "#e2574c" };
const PERCENTILES = [
  { key: "p50", value: 50, color: "#2bb3a3", dash: [] },
  { key: "p85", value: 85, color: "#f0a33e", dash: [8, 4] },
  { key: "p95", value: 95, color: "#d9534f", dash: [2, 3] },
];
const DAY = 24 * 60 * 60 * 1000;

let points = [];
let activeSizes = new Set(["S", "M", "L"]);
let activePercentiles = new Set(["p50", "p85", "p95"]);
let hitTargets = [];
let chartBounds;

function loadSavedPoints() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === null) return null;

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error("Zapisane dane nie są listą.");
    return parsed.filter(isValidPoint);
  } catch (error) {
    console.error("Nie udało się odczytać zapisanych danych.", error);
    return null;
  }
}

function isValidPoint(point) {
  return point &&
    typeof point.id === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(point.date) &&
    ["S", "M", "L"].includes(point.size) &&
    Number.isFinite(point.leadTime) &&
    point.leadTime > 0;
}

function savePoints() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(points));
}

function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (percentileValue / 100) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function formatDate(value, options = { month: "short", year: "numeric" }) {
  return new Intl.DateTimeFormat("pl-PL", options).format(new Date(`${value}T12:00:00`));
}

async function init() {
  try {
    const savedPoints = loadSavedPoints();
    if (savedPoints !== null) {
      points = savedPoints;
    } else {
      const response = await fetch("data.json");
      if (!response.ok) throw new Error(`Nie udało się wczytać danych (${response.status}).`);
      const source = await response.json();
      points = source.map((point, index) => ({ ...point, id: `pt-${index}`, removed: false }));
      savePoints();
    }

    bindControls();
    render();
    window.addEventListener("resize", renderChart);
  } catch (error) {
    console.error("Nie udało się uruchomić dashboardu.", error);
    document.getElementById("chartError").hidden = false;
  }
}

function bindControls() {
  document.querySelectorAll(".size-toggle").forEach((button) => {
    button.setAttribute("role", "checkbox");
    button.setAttribute("tabindex", "0");
    button.addEventListener("click", () => toggleSize(button));
    button.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        toggleSize(button);
      }
    });
  });

  document.querySelectorAll(".pct-toggle input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) activePercentiles.add(input.dataset.pct);
      else activePercentiles.delete(input.dataset.pct);
      render();
    });
  });

  document.getElementById("addForm").addEventListener("submit", addPoint);
  document.getElementById("resetBtn").addEventListener("click", resetPoints);
  const canvas = document.getElementById("scatterChart");
  canvas.addEventListener("click", onChartClick);
  canvas.addEventListener("keydown", onChartKeydown);
  canvas.addEventListener("pointermove", onChartPointerMove);
  canvas.addEventListener("pointerleave", () => { canvas.style.cursor = "default"; });
}

function toggleSize(button) {
  const size = button.dataset.size;
  if (activeSizes.has(size)) activeSizes.delete(size);
  else activeSizes.add(size);
  button.classList.toggle("active", activeSizes.has(size));
  button.setAttribute("aria-checked", String(activeSizes.has(size)));
  render();
}

function getVisiblePoints() {
  return points.filter((point) => activeSizes.has(point.size));
}

function getForecastPoints() {
  return getVisiblePoints().filter((point) => !point.removed);
}

function render() {
  document.querySelectorAll(".size-toggle").forEach((button) => {
    button.setAttribute("aria-checked", String(activeSizes.has(button.dataset.size)));
  });
  updateStats();
  updatePercentileLabels();
  renderChart();
}

function updateStats() {
  const visible = getVisiblePoints();
  document.getElementById("statTotal").textContent = visible.length;
  document.getElementById("statActive").textContent = visible.filter((point) => !point.removed).length;
  document.getElementById("statRemoved").textContent = visible.filter((point) => point.removed).length;
}

function updatePercentileLabels() {
  const values = getForecastPoints().map((point) => point.leadTime);
  PERCENTILES.forEach(({ key, value }) => {
    const result = percentile(values, value);
    document.querySelector(`[data-pct-label="${key}"]`).textContent =
      result === null ? "—" : `${Math.round(result)} dni`;
  });
}

function renderChart() {
  const canvas = document.getElementById("scatterChart");
  const context = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  hitTargets = [];

  const visible = getVisiblePoints();
  if (visible.length === 0) {
    context.fillStyle = "#6b7a99";
    context.font = "14px Segoe UI, sans-serif";
    context.textAlign = "center";
    context.fillText("Wybierz rozmiar, aby wyświetlić dane.", rect.width / 2, rect.height / 2);
    return;
  }

  const dates = visible.map((point) => Date.parse(`${point.date}T12:00:00`));
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const maxLeadTime = Math.max(...visible.map((point) => point.leadTime));
  const yMax = Math.ceil((maxLeadTime * 1.12) / 50) * 50 || 50;
  const padding = { top: 24, right: 24, bottom: 66, left: 62 };
  const plot = {
    left: padding.left,
    top: padding.top,
    right: rect.width - padding.right,
    bottom: rect.height - padding.bottom,
  };
  chartBounds = plot;

  const x = (date) => plot.left + ((date - minDate) / (maxDate - minDate || DAY)) * (plot.right - plot.left);
  const y = (value) => plot.bottom - (value / yMax) * (plot.bottom - plot.top);

  drawGrid(context, plot, yMax, minDate, maxDate, x, y);
  drawPercentileLines(context, plot, x, y);

  visible.forEach((point) => {
    const date = Date.parse(`${point.date}T12:00:00`);
    const px = x(date);
    const py = y(point.leadTime);
    context.beginPath();
    context.arc(px, py, 6, 0, Math.PI * 2);
    context.fillStyle = point.removed ? "#c6cbd8" : SIZE_COLORS[point.size];
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = point.removed ? "#a9b1c7" : "#ffffff";
    context.stroke();
    hitTargets.push({ point, x: px, y: py });
  });

  drawLegend(context, plot);
}

function drawGrid(context, plot, yMax, minDate, maxDate, x, y) {
  const steps = 5;
  context.font = "12px Segoe UI, sans-serif";
  context.textAlign = "right";
  context.textBaseline = "middle";
  for (let step = 0; step <= steps; step += 1) {
    const value = (yMax / steps) * step;
    const py = y(value);
    context.beginPath();
    context.moveTo(plot.left, py);
    context.lineTo(plot.right, py);
    context.strokeStyle = "#e9edf5";
    context.stroke();
    context.fillStyle = "#6b7a99";
    context.fillText(`${Math.round(value)} d`, plot.left - 10, py);
  }

  context.textAlign = "center";
  context.textBaseline = "top";
  const start = new Date(minDate);
  start.setDate(1);
  for (let date = start.getTime(); date <= maxDate; date = new Date(new Date(date).getFullYear(), new Date(date).getMonth() + 1, 1).getTime()) {
    const px = x(date);
    context.beginPath();
    context.moveTo(px, plot.top);
    context.lineTo(px, plot.bottom);
    context.strokeStyle = "#f1f3f8";
    context.stroke();
    context.fillStyle = "#6b7a99";
    context.fillText(formatDate(new Date(date).toISOString().slice(0, 10)), px, plot.bottom + 10);
  }

  context.fillStyle = "#53617b";
  context.font = "12px Segoe UI, sans-serif";
  context.fillText("Data ukończenia", (plot.left + plot.right) / 2, plot.bottom + 38);
  context.save();
  context.translate(16, (plot.top + plot.bottom) / 2);
  context.rotate(-Math.PI / 2);
  context.fillText("Czas realizacji (dni)", 0, 0);
  context.restore();
}

function drawPercentileLines(context, plot, x, y) {
  const values = getForecastPoints().map((point) => point.leadTime);
  PERCENTILES.forEach(({ key, value, color, dash }) => {
    if (!activePercentiles.has(key)) return;
    const result = percentile(values, value);
    if (result === null) return;
    const py = y(result);
    context.beginPath();
    context.setLineDash(dash);
    context.moveTo(plot.left, py);
    context.lineTo(plot.right, py);
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = color;
    context.font = "600 11px Segoe UI, sans-serif";
    context.textAlign = "right";
    context.textBaseline = "bottom";
    context.fillText(`${value}. percentyl: ${Math.round(result)} dni`, plot.right - 4, py - 4);
  });
}

function drawLegend(context, plot) {
  const items = [
    { label: "S", color: SIZE_COLORS.S },
    { label: "M", color: SIZE_COLORS.M },
    { label: "L", color: SIZE_COLORS.L },
    { label: "Odstający (wykluczony)", color: "#c6cbd8" },
  ];
  context.font = "12px Segoe UI, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  let cursor = plot.left;
  const top = 10;
  items.forEach((item) => {
    context.beginPath();
    context.arc(cursor + 5, top + 5, 5, 0, Math.PI * 2);
    context.fillStyle = item.color;
    context.fill();
    context.fillStyle = "#53617b";
    context.fillText(item.label, cursor + 14, top + 5);
    cursor += context.measureText(item.label).width + 30;
  });
}

function pointAt(clientX, clientY) {
  const rect = document.getElementById("scatterChart").getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  return [...hitTargets].reverse().find((target) => Math.hypot(target.x - px, target.y - py) <= 10);
}

function toggleRemoved(point) {
  point.removed = !point.removed;
  savePoints();
  render();
}

function onChartClick(event) {
  const target = pointAt(event.clientX, event.clientY);
  if (target) toggleRemoved(target.point);
}

function onChartKeydown(event) {
  if ((event.key === "Enter" || event.key === " ") && hitTargets.length) {
    event.preventDefault();
    const target = hitTargets[0];
    toggleRemoved(target.point);
    document.getElementById("chartHint").textContent =
      `${target.point.size}, ${target.point.leadTime} dni, ${formatDate(target.point.date, { day: "numeric", month: "long", year: "numeric" })}: ${target.point.removed ? "wykluczono" : "przywrócono"}.`;
  }
}

function onChartPointerMove(event) {
  const target = pointAt(event.clientX, event.clientY);
  const canvas = document.getElementById("scatterChart");
  canvas.style.cursor = target ? "pointer" : "default";
  if (!target) {
    canvas.title = "";
    return;
  }
  const { point } = target;
  canvas.title = `${point.size} • ${point.leadTime} dni • ${formatDate(point.date, { day: "numeric", month: "long", year: "numeric" })}${point.removed ? " • wykluczony" : ""}`;
}

function addPoint(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const size = document.getElementById("newSize").value;
  const leadTime = Number(document.getElementById("newLeadTime").value);
  const date = document.getElementById("newDate").value;
  const message = document.getElementById("formMessage");

  if (!["S", "M", "L"].includes(size) || !Number.isFinite(leadTime) || leadTime <= 0 || !date) {
    message.textContent = "Wybierz rozmiar i datę oraz podaj czas realizacji większy od zera.";
    return;
  }

  const nextId = `pt-${Date.now()}`;
  points.push({ id: nextId, size, leadTime, date, removed: false });
  savePoints();
  message.textContent = "Punkt został dodany.";
  form.reset();
  render();
}

function resetPoints() {
  if (!window.confirm("Przywrócić dane z pliku źródłowego? Dodane punkty i zmiany zostaną utracone.")) return;
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}

init();
