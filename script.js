(() => {
  "use strict";

  const DAYS = [1, 2, 3, 5, 8, 13, 21];
  const STORAGE_KEY = "dayboard.initiatives.v1";
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

  render();
  if (storageAvailable) persist();
  else saveStatus.textContent = "Not saved — browser storage is unavailable or invalid";
})();
