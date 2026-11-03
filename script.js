(() => {
  "use strict";

  const DAYS = [1, 2, 3, 5, 8, 13, 21];
  const STORAGE_KEY = "dayboard.initiatives.v1";
  const DAILY_THROUGHPUT = [
    0, 2, 10, 3, 0, 0, 2, 3, 7, 0, 0, 0, 0, 5, 2, 0, 0, 0, 0, 0, 1, 1, 0, 5, 4, 0, 0,
    7, 0, 2, 2, 12, 0, 0, 1, 0, 0, 2, 12, 0, 0, 1, 0, 0, 3, 11, 0, 0, 6, 0, 0, 6, 7,
    0, 0, 2, 0, 0, 3, 5, 0, 0, 1, 0, 0, 9, 7, 0, 0, 3, 0, 0, 4, 10, 0, 0, 1, 0, 0, 5,
    1, 0, 0, 2, 0, 0, 2, 11, 0, 0, 1, 0, 0, 5, 2, 0, 0, 1, 0, 0, 4, 7, 0,
  ];
  const LEAD_TIMES = [
    ["2024-07-15", 49], ["2024-08-22", 48], ["2024-09-10", 87],
    ["2024-09-25", 57], ["2024-10-05", 148], ["2024-10-14", 53],
    ["2024-10-28", 45], ["2024-11-18", 145], ["2024-12-04", 105],
    ["2025-01-08", 5], ["2025-01-20", 163], ["2025-02-14", 43],
    ["2025-02-26", 415], ["2025-03-15", 123], ["2025-04-10", 103],
    ["2025-05-05", 104], ["2025-06-12", 302], ["2025-06-25", 158],
    ["2025-07-02", 98], ["2025-07-11", 52], ["2025-07-18", 95],
    ["2025-07-29", 70], ["2025-08-03", 95], ["2025-08-14", 101],
    ["2025-08-21", 57], ["2025-08-29", 57], ["2025-09-08", 53],
    ["2025-09-22", 137], ["2025-10-04", 73], ["2025-10-12", 60],
    ["2025-10-19", 126], ["2025-10-27", 57], ["2025-11-05", 124],
    ["2025-11-15", 75], ["2025-11-25", 89], ["2025-12-10", 44],
  ];
  const examples = [
    { id: "example-1", name: "Refresh onboarding", description: "A warmer welcome for new users", estimate: 3 },
    { id: "example-2", name: "Customer interviews", description: "Listen, learn, find the patterns", estimate: 5 },
    { id: "example-3", name: "Quick wins & fixes", description: "Small changes, meaningful impact", estimate: 1 },
    { id: "example-4", name: "Analytics dashboard", description: "Make the important numbers visible", estimate: 13 },
    { id: "example-5", name: "Help center update", description: "Clear answers, fewer questions", estimate: 2 },
  ];
  const rows = document.querySelector("#initiative-rows");
  const dialog = document.querySelector("#initiative-dialog");
  const form = document.querySelector("#initiative-form");
  const nameInput = document.querySelector("#initiative-name");
  const descriptionInput = document.querySelector("#initiative-description");
  const estimateInput = document.querySelector("#initiative-estimate");
  const error = document.querySelector("#form-error");
  const deleteButton = document.querySelector("#delete-initiative");
  const saveStatus = document.querySelector("#save-status");
  const announcement = document.querySelector("#announcement");
  let editingId = null;
  let returnFocus = null;
  let storageAvailable = true;
  let initiatives = load();

  function isInitiative(item) {
    return item && typeof item.id === "string" && item.id.length > 0 &&
      typeof item.name === "string" && item.name.trim().length > 0 && item.name.length <= 120 &&
      typeof item.description === "string" && item.description.length <= 1000 &&
      DAYS.includes(item.estimate);
  }

  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed) || !parsed.every(isInitiative) ||
            new Set(parsed.map(item => item.id)).size !== parsed.length) {
          throw new Error("Invalid saved board");
        }
        return parsed;
      }
    } catch {
      storageAvailable = false;
      return [];
    }
    return examples.map(item => ({ ...item }));
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initiatives));
      storageAvailable = true;
    } catch {
      storageAvailable = false;
    }
    saveStatus.textContent = storageAvailable
      ? "Saved in this browser"
      : "Not saved — browser storage is unavailable or invalid";
  }

  function announce(message) {
    announcement.textContent = message;
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function drawChart(svg, points, { valueName, unit, lines = [] }) {
    const width = 960;
    const height = 340;
    const margin = { top: 24, right: 94, bottom: 58, left: 62 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const values = points.map(point => point.value).concat(lines.map(line => line.value));
    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);
    const padding = (maxValue - minValue || Math.max(maxValue, 1)) * 0.12;
    minValue -= padding;
    maxValue += padding;
    const minX = Math.min(...points.map(point => point.x));
    const maxX = Math.max(...points.map(point => point.x));
    const x = value => margin.left + (maxX === minX ? 0.5 : (value - minX) / (maxX - minX)) * plotWidth;
    const y = value => margin.top + (maxValue - value) / (maxValue - minValue) * plotHeight;
    const format = value => Number.isInteger(value) ? String(value) : value.toFixed(1);
    const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.replaceChildren();

    for (let tick = 0; tick <= 4; tick += 1) {
      const value = minValue + (maxValue - minValue) * tick / 4;
      const position = y(value);
      svg.append(
        svgElement("line", { x1: margin.left, x2: width - margin.right, y1: position, y2: position, class: "chart-grid" }),
      );
      const label = svgElement("text", { x: margin.left - 10, y: position + 4, "text-anchor": "end", class: "chart-axis-label" });
      label.textContent = format(value);
      svg.append(label);
    }

    lines.forEach(line => {
      const position = y(line.value);
      svg.append(svgElement("line", {
        x1: margin.left, x2: width - margin.right, y1: position, y2: position,
        class: `chart-control ${line.className}`,
      }));
      const label = svgElement("text", { x: width - margin.right + 8, y: position + 4, class: "chart-control-label" });
      label.textContent = `${line.label} ${format(line.value)}`;
      svg.append(label);
    });

    const polyline = svgElement("polyline", {
      points: points.map(point => `${x(point.x)},${y(point.value)}`).join(" "),
      class: "chart-series",
    });
    svg.append(polyline);
    points.forEach(point => {
      const circle = svgElement("circle", { cx: x(point.x), cy: y(point.value), r: 4, class: "chart-point" });
      const title = svgElement("title");
      title.textContent = `${point.label}: ${format(point.value)} ${unit}`;
      circle.append(title);
      svg.append(circle);
    });

    const labelCount = Math.min(points.length, 7);
    const labelIndexes = new Set(Array.from({ length: labelCount }, (_, index) =>
      Math.round(index * (points.length - 1) / Math.max(labelCount - 1, 1))));
    labelIndexes.forEach(index => {
      const point = points[index];
      const label = svgElement("text", {
        x: x(point.x), y: height - margin.bottom + 22,
        "text-anchor": "middle", class: "chart-axis-label",
      });
      label.textContent = dateFormat.format(new Date(point.x));
      svg.append(label);
    });

    const yTitle = svgElement("text", {
      x: 16, y: height / 2, transform: `rotate(-90 16 ${height / 2})`,
      "text-anchor": "middle", class: "chart-axis-title",
    });
    yTitle.textContent = `${valueName} (${unit})`;
    svg.append(yTitle);
  }

  function renderInsightCharts() {
    const leadWeeksByStart = new Map();
    LEAD_TIMES.forEach(([date, leadTime]) => {
      const timestamp = Date.parse(`${date}T00:00:00Z`);
      const dayOfWeek = new Date(timestamp).getUTCDay();
      const weekStart = timestamp - ((dayOfWeek + 6) % 7) * 86400000;
      const week = leadWeeksByStart.get(weekStart) || { start: weekStart, total: 0, count: 0 };
      week.total += leadTime;
      week.count += 1;
      leadWeeksByStart.set(weekStart, week);
    });
    const leadWeeks = [...leadWeeksByStart.values()]
      .sort((a, b) => a.start - b.start)
      .map(week => ({ ...week, value: week.total / week.count }));
    const leadAverage = leadWeeks.reduce((total, week) => total + week.value, 0) / leadWeeks.length;
    const leadMovingRanges = leadWeeks.slice(1).map((week, index) => ({
      x: week.start,
      value: Math.abs(week.value - leadWeeks[index].value),
      label: new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" })
        .format(new Date(week.start)),
    }));
    const leadAverageMovingRange = leadMovingRanges
      .reduce((total, point) => total + point.value, 0) / leadMovingRanges.length;
    const leadXLimits = [
      { value: leadAverage + 2.66 * leadAverageMovingRange, label: "UCL", className: "chart-ucl" },
      { value: leadAverage, label: "CL", className: "chart-mean" },
      { value: leadAverage - 2.66 * leadAverageMovingRange, label: "LCL", className: "chart-lcl" },
    ];
    const leadMrLimits = [
      { value: leadAverageMovingRange + 3.27 * leadAverageMovingRange, label: "UCL", className: "chart-ucl" },
      { value: leadAverageMovingRange, label: "CL", className: "chart-mean" },
      { value: leadAverageMovingRange - 3.27 * leadAverageMovingRange, label: "LCL", className: "chart-lcl" },
    ];
    const weekRangeLabel = (start, days) => {
      const end = start + (days - 1) * 86400000;
      const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
      return `${dateFormat.format(new Date(start))}–${dateFormat.format(new Date(end))}`;
    };
    drawChart(document.querySelector("#lead-time-x-chart"), leadWeeks.map(week => ({
      x: week.start,
      value: week.value,
      label: `${weekRangeLabel(week.start, 7)} (${week.count} ${week.count === 1 ? "item" : "items"})`,
    })), { valueName: "Lead time", unit: "days", lines: leadXLimits });
    drawChart(document.querySelector("#lead-time-mr-chart"), leadMovingRanges, {
      valueName: "Moving range",
      unit: "days",
      lines: leadMrLimits,
    });
    document.querySelector("#lead-time-chart-note").textContent =
      `Each point is the average lead time for completed items in a Monday–Sunday calendar week; weeks without completions are omitted. MR compares consecutive weeks with data. X limits: mean ± 2.66 × average MR; MR limits: mean ± 3.27 × average MR. Mean weekly lead time: ${leadAverage.toFixed(2)} days; average MR: ${leadAverageMovingRange.toFixed(2)} days. Source: Lead Times - 2024-25.xlsx.`;

    const firstDay = Date.UTC(2025, 0, 7);
    const weeks = [];
    for (let index = 0; index < DAILY_THROUGHPUT.length; index += 7) {
      const values = DAILY_THROUGHPUT.slice(index, index + 7);
      const start = firstDay + index * 86400000;
      const end = start + (values.length - 1) * 86400000;
      weeks.push({ start, end, value: values.reduce((total, value) => total + value, 0) });
    }
    const average = weeks.reduce((total, week) => total + week.value, 0) / weeks.length;
    const movingRanges = weeks.slice(1).map((week, index) => ({
      x: week.start,
      value: Math.abs(week.value - weeks[index].value),
      label: new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" })
        .format(new Date(week.start)),
    }));
    const averageMovingRange = movingRanges.reduce((total, point) => total + point.value, 0) / movingRanges.length;
    const xLimits = [
      { value: average + 2.66 * averageMovingRange, label: "UCL", className: "chart-ucl" },
      { value: average, label: "CL", className: "chart-mean" },
      { value: average - 2.66 * averageMovingRange, label: "LCL", className: "chart-lcl" },
    ];
    const mrLimits = [
      { value: averageMovingRange + 3.27 * averageMovingRange, label: "UCL", className: "chart-ucl" },
      { value: averageMovingRange, label: "CL", className: "chart-mean" },
      { value: averageMovingRange - 3.27 * averageMovingRange, label: "LCL", className: "chart-lcl" },
    ];
    drawChart(document.querySelector("#throughput-x-chart"), weeks.map(week => ({
      x: week.start, value: week.value,
      label: `${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(week.start))}–${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(week.end))}`,
    })), { valueName: "Throughput", unit: "items", lines: xLimits });
    drawChart(document.querySelector("#throughput-mr-chart"), movingRanges, {
      valueName: "Moving range",
      unit: "items",
      lines: mrLimits,
    });

    const lastWeek = weeks[weeks.length - 1];
    const lastDate = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(lastWeek.end));
    document.querySelector("#throughput-chart-note").textContent =
      `Weekly totals are grouped in consecutive 7-day periods from Jan 7, 2025; the last period is partial and ends ${lastDate}. X limits: mean ± 2.66 × average MR. MR limits: mean ± 3.27 × average MR. Mean throughput: ${average.toFixed(2)} items/week; average MR: ${averageMovingRange.toFixed(2)} items. Source: Throughput Daily.xlsx.`;
  }

  function dayLabel(days) {
    return `${days} ${days === 1 ? "day" : "days"}`;
  }

  function updateEstimate(item, estimate) {
    if (!DAYS.includes(estimate) || item.estimate === estimate) return;
    item.estimate = estimate;
    persist();
    updateSummary();
    announce(`${item.name}: ${dayLabel(estimate)} of estimated effort.`);
  }

  function updateSummary() {
    document.querySelector("#initiative-count").textContent = initiatives.length;
    document.querySelector("#total-effort").textContent =
      initiatives.reduce((total, item) => total + item.estimate, 0);
    document.querySelector("#empty-state").hidden = initiatives.length !== 0;
  }

  function render() {
    rows.replaceChildren();
    initiatives.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "initiative-row";
      const card = document.createElement("article");
      card.className = "initiative-card";
      card.dataset.color = index % 5;
      card.setAttribute("aria-label", item.name);
      positionCard(card, item.estimate);

      const heading = document.createElement("div");
      heading.className = "card-heading";
      const grip = document.createElement("span");
      grip.className = "grip";
      grip.textContent = "⠿";
      grip.setAttribute("aria-hidden", "true");
      const title = document.createElement("h3");
      title.className = "card-title";
      title.textContent = item.name;
      title.title = item.name;
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "edit-button";
      edit.textContent = "✎";
      edit.setAttribute("aria-label", `Edit ${item.name}`);
      edit.addEventListener("click", () => openDialog(item, edit));
      heading.append(grip, title, edit);

      const description = document.createElement("p");
      description.className = "card-description";
      description.textContent = item.description || "No description";
      description.title = item.description;

      const selector = document.createElement("select");
      selector.className = "card-estimate";
      selector.setAttribute("aria-label", `Estimated effort for ${item.name}`);
      DAYS.forEach(days => {
        const option = document.createElement("option");
        option.value = days;
        option.textContent = dayLabel(days);
        selector.append(option);
      });
      selector.value = item.estimate;
      selector.addEventListener("change", () => {
        const estimate = Number(selector.value);
        updateEstimate(item, estimate);
        positionCard(card, item.estimate);
        card.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
      card.append(heading, description, selector);
      row.append(card);
      rows.append(row);
      enableDrag(card, row, selector, item);
    });
    updateSummary();
  }

  function positionCard(card, estimate) {
    card.style.left = `${DAYS.indexOf(estimate) / (DAYS.length - 1) * 100}%`;
  }

  function enableDrag(card, row, selector, item) {
    let drag = null;
    const markers = document.querySelectorAll(".axis > span");
    const clearDrag = () => {
      drag = null;
      card.classList.remove("dragging");
      markers.forEach(marker => marker.classList.remove("active"));
    };
    card.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !event.isPrimary || event.target.closest("button, select")) return;
      const bounds = row.getBoundingClientRect();
      const cardCenter = bounds.left + DAYS.indexOf(item.estimate) / (DAYS.length - 1) * bounds.width;
      drag = { pointerId: event.pointerId, offset: event.clientX - cardCenter, estimate: item.estimate };
      card.setPointerCapture(event.pointerId);
      card.classList.add("dragging");
    });
    card.addEventListener("pointermove", event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const bounds = row.getBoundingClientRect();
      const fraction = (event.clientX - drag.offset - bounds.left) / bounds.width;
      const index = Math.max(0, Math.min(DAYS.length - 1, Math.round(fraction * (DAYS.length - 1))));
      drag.estimate = DAYS[index];
      positionCard(card, drag.estimate);
      markers.forEach((marker, markerIndex) => marker.classList.toggle("active", markerIndex === index));
    });
    card.addEventListener("pointerup", event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      updateEstimate(item, drag.estimate);
      selector.value = item.estimate;
      positionCard(card, item.estimate);
      clearDrag();
    });
    card.addEventListener("lostpointercapture", () => {
      positionCard(card, item.estimate);
      clearDrag();
    });
    card.addEventListener("pointercancel", () => {
      positionCard(card, item.estimate);
      clearDrag();
    });
  }

  function openDialog(item = null, trigger = document.activeElement) {
    editingId = item ? item.id : null;
    returnFocus = trigger;
    form.reset();
    error.textContent = "";
    document.querySelector("#dialog-title").textContent = item ? "Edit initiative" : "Add initiative";
    nameInput.value = item ? item.name : "";
    descriptionInput.value = item ? item.description : "";
    estimateInput.value = item ? item.estimate : 3;
    deleteButton.hidden = !item;
    dialog.showModal();
    nameInput.focus();
  }

  dialog.addEventListener("close", () => {
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
    else document.querySelector("#add-initiative").focus();
  });
  document.querySelector("#add-initiative").addEventListener("click", event => openDialog(null, event.currentTarget));
  document.querySelector("#add-first").addEventListener("click", event => openDialog(null, event.currentTarget));
  ["#close-dialog", "#cancel-dialog"].forEach(id => {
    document.querySelector(id).addEventListener("click", () => dialog.close());
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const description = descriptionInput.value.trim();
    const estimate = Number(estimateInput.value);
    if (!name || name.length > 120 || description.length > 1000 || !DAYS.includes(estimate)) {
      error.textContent = "Enter an initiative name and select a supported day estimate.";
      if (!name) nameInput.focus();
      else estimateInput.focus();
      return;
    }
    const existing = initiatives.find(item => item.id === editingId);
    if (existing) {
      Object.assign(existing, { name, description, estimate });
    } else {
      const id = typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      initiatives.push({ id, name, description, estimate });
    }
    persist();
    render();
    dialog.close();
    announce(`${name} ${existing ? "updated" : "added"}.`);
  });

  deleteButton.addEventListener("click", () => {
    const item = initiatives.find(initiative => initiative.id === editingId);
    if (!item || !window.confirm(`Delete “${item.name}”? This cannot be undone.`)) return;
    initiatives = initiatives.filter(initiative => initiative.id !== editingId);
    persist();
    render();
    dialog.close();
    announce(`${item.name} deleted.`);
  });

  const tabs = [...document.querySelectorAll('[role="tab"]')];
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? tabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      selectTab(tabs[nextIndex]);
      tabs[nextIndex].focus();
    });
  });

  function selectTab(tab) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.querySelector(`#${item.getAttribute("aria-controls")}`).hidden = !selected;
    });
  }

  renderInsightCharts();
  render();
  if (storageAvailable) persist();
  else saveStatus.textContent = "Not saved — browser storage is unavailable or invalid";
})();
