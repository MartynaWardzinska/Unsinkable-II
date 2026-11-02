# Dayboard

A simple, local-first dashboard with lead-time and delivery-throughput charts,
alongside an initiative effort board. Plain HTML, CSS, and JavaScript — no
dependencies, build tools, server, or account required.

## Open

Download the repository and open `index.html` directly in a modern browser.
Keep `styles.css` and `script.js` beside it. No installation is needed.

## Insights

- **Lead time** plots completed-item lead times against their completion dates.
- **Delivery throughput** groups daily deliveries into consecutive 7-day periods
  starting January 7, 2025. The final period is partial. Its X chart uses
  limits of mean ± 2.66 × average moving range; its MR chart uses limits of
  mean ± 3.27 × average moving range.
- The chart data comes from `Lead Times - 2024-25.xlsx` and
  `Throughput Daily.xlsx`. Choose **Initiatives** to use the original board.

## Use

- Choose **Add initiative**, enter a name, optional description, and day estimate,
  then save. Supported estimates are **1, 2, 3, 5, 8, 13, and 21 days**.
- Drag a card horizontally to snap it to the nearest marker. The markers are
  evenly spaced estimate categories, not a linear time scale. Each card has its
  own row; vertical position has no scoring meaning.
- Alternatively, use the day selector on each card. Tab to it and use the arrow
  keys to choose an estimate (confirm with Enter where required by your browser).
- Choose a card’s pencil button to edit it or delete it with confirmation.
  Escape or Cancel closes the editor without saving.
- The summary shows initiative count and **total estimated effort**, not calendar
  duration. On narrow screens, scroll the board horizontally; keyboard users can
  focus the board and use arrow keys to scroll.

Changes save automatically in this browser’s `localStorage`. Example initiatives
appear only when no saved board exists; deleting all cards preserves an empty
board on reload. Clearing site data resets the board. Storage is browser- and
location-specific, and `file:` URL storage behavior varies between browsers;
keep using the same browser and file location. If storage is blocked, unavailable,
full, or contains invalid data, a warning appears and the board remains usable
in memory. Existing invalid data is not overwritten until you make a change.
There is no network sync or backend.

## Lead-time dashboard

The [lead-time dashboard](./lead-times/) plots completion dates against lead
times from `Lead Times - 2024-25.xlsx`. It filters S/M/L items, recalculates
50th, 85th, and 95th percentile forecasts for visible, included items, and lets
you exclude/restore points or add new ones. Changes are saved in the current
browser. GitHub Pages publishes both dashboards from the `main` branch.

## Verification

There is no build or automated test setup. To check the page in a browser:

1. Switch among Lead time, Delivery throughput, and Initiatives using the tabs.
   The throughput tab should show weekly X and MR charts.
2. Add an initiative; confirm the count and total effort increase correctly.
3. Edit its name, description, and estimate; cancel a second edit to check it
   does not change anything.
4. Drag it to another marker, then change it again using only its keyboard
   selector. Confirm both position and total effort update.
5. Reload and verify changes persist. Delete it and confirm deletion persists.
6. Delete all initiatives and reload; examples should not reappear.
7. Try an empty or whitespace-only name; it must not save. Enter text such as
   `<b>an idea</b>` and confirm it displays literally, not as HTML.
8. Check keyboard focus, dialog Escape/Cancel behavior, and horizontal board
   scrolling in a narrow window.
