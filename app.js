let viewer = null;
let graph = {};
let route = [];
let routeIndex = 0;
let currentSceneId = null;
let navigationStarted = false;

const startSelect = document.getElementById("startSelect");
const destinationSelect = document.getElementById("destinationSelect");
const navigateBtn = document.getElementById("navigateBtn");
const swapBtn = document.getElementById("swapBtn");
const routeInfo = document.getElementById("routeInfo");
const routeSteps = document.getElementById("routeSteps");
const stepCount = document.getElementById("stepCount");
const currentLocationText = document.getElementById("currentLocationText");
const message = document.getElementById("message");
const navPanel = document.querySelector(".nav-panel");
const panelToggle = document.getElementById("panelToggle");

fetch("data.json")
  .then(response => {
    if (!response.ok) throw new Error("Unable to load data.json");
    return response.json();
  })
  .then(data => {
    graph = data.nodes || {};
    populateLocationDropdowns();
    startSelect.value = "entrance";
    destinationSelect.value = getDefaultDestination();
    loadScene("entrance");
  })
  .catch(error => {
    console.error(error);
    currentLocationText.textContent = "Unable to load navigation data";
    showMessage("Could not load data.json");
  });

function populateLocationDropdowns() {
  startSelect.innerHTML = "";
  destinationSelect.innerHTML = "";

  Object.entries(graph).forEach(([id, scene]) => {
    const label = scene.title || id;

    const startOption = document.createElement("option");
    startOption.value = id;
    startOption.textContent = label;
    startSelect.appendChild(startOption);

    const destinationOption = document.createElement("option");
    destinationOption.value = id;
    destinationOption.textContent = label;
    destinationSelect.appendChild(destinationOption);
  });
}

function getDefaultDestination() {
  const ids = Object.keys(graph);
  return ids.length > 1 ? ids[ids.length - 1] : ids[0];
}

function buildGraph() {
  const adjacency = {};

  Object.entries(graph).forEach(([id, scene]) => {
    adjacency[id] = [];

    (scene.links || []).forEach(link => {
      if (link.target && graph[link.target]) {
        adjacency[id].push(link.target);
      }
    });
  });

  return adjacency;
}

/*
 * Breadth-first search.
 * The JSON file is the source of truth, so adding a new node/link
 * automatically makes it available to the route finder.
 */
function findRoute(start, destination) {
  if (!graph[start] || !graph[destination]) return null;
  if (start === destination) return [start];

  const adjacency = buildGraph();
  const queue = [start];
  const previous = { [start]: null };

  while (queue.length) {
    const current = queue.shift();

    for (const next of adjacency[current] || []) {
      if (Object.prototype.hasOwnProperty.call(previous, next)) continue;

      previous[next] = current;

      if (next === destination) {
        const result = [];
        let node = destination;

        while (node !== null) {
          result.unshift(node);
          node = previous[node];
        }

        return result;
      }

      queue.push(next);
    }
  }

  return null;
}

function loadScene(sceneId) {
  const scene = graph[sceneId];
  if (!scene) return;

  currentSceneId = sceneId;
  currentLocationText.textContent = scene.title || sceneId;

  if (viewer) viewer.destroy();

  const isOnRoute = navigationStarted && route.length > 0;
  const nextSceneId = isOnRoute ? route[routeIndex + 1] : null;

  viewer = pannellum.viewer("viewer", {
    type: "equirectangular",
    panorama: scene.image,
    autoLoad: true,
    showControls: true,
    compass: false,
    hotSpots: (scene.links || []).map(link => {
      const isNext = link.target && link.target === nextSceneId;

      return {
        pitch: Number(link.pitch || 0),
        yaw: Number(link.yaw || 0),
        type: "custom",
        cssClass: isNext ? "route-hotspot" : "",
        text: link.text || (link.target ? `Go to ${graph[link.target]?.title || link.target}` : "End"),
        clickHandlerFunc: () => {
          if (!link.target) {
            showMessage("You have reached the end of this route.");
            return;
          }

          advanceNavigation(link.target);
          loadScene(link.target);
        }
      };
    })
  });

  updateRouteUI();
}

function advanceNavigation(targetId) {
  if (!navigationStarted || !route.length) return;

  const expectedNext = route[routeIndex + 1];

  if (targetId === expectedNext) {
    routeIndex++;
    updateRouteUI();

    if (routeIndex === route.length - 1) {
      showMessage("Destination reached");
      navigateBtn.textContent = "Route Completed";
    }
  }
}

function startNavigation() {
  const start = startSelect.value;
  const destination = destinationSelect.value;

  if (!start || !destination) {
    showMessage("Select an initial location and destination.");
    return;
  }

  if (start === destination) {
    navigationStarted = true;
    route = [start];
    routeIndex = 0;
    loadScene(start);
    navigateBtn.textContent = "At Destination";
    showMessage("Initial location is already the destination.");
    return;
  }

  const foundRoute = findRoute(start, destination);

  if (!foundRoute) {
    navigationStarted = false;
    route = [];
    routeIndex = 0;
    routeInfo.classList.add("hidden");
    showMessage("No connected route found between these locations.");
    return;
  }

  route = foundRoute;
  routeIndex = 0;
  navigationStarted = true;

  loadScene(start);
  navigateBtn.textContent = "Restart Navigation";
  showMessage(`Route found: ${route.length - 1} step${route.length - 1 === 1 ? "" : "s"}`);
}

function updateRouteUI() {
  if (!navigationStarted || !route.length) {
    routeInfo.classList.add("hidden");
    return;
  }

  routeInfo.classList.remove("hidden");
  stepCount.textContent = `${Math.max(route.length - 1, 0)} move${route.length - 1 === 1 ? "" : "s"}`;

  routeSteps.innerHTML = "";

  route.forEach((sceneId, index) => {
    const scene = graph[sceneId];
    const item = document.createElement("div");

    item.className = "route-step" + (index === routeIndex ? " active" : "");

    const number = document.createElement("span");
    number.className = "step-number";
    number.textContent = index + 1;

    const text = document.createElement("span");
    text.textContent =
      index === route.length - 1
        ? `Destination: ${scene.title || sceneId}`
        : scene.title || sceneId;

    item.appendChild(number);
    item.appendChild(text);
    routeSteps.appendChild(item);
  });
}

function showMessage(text) {
  message.textContent = text;
  message.classList.add("show");

  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => {
    message.classList.remove("show");
  }, 2600);
}

swapBtn.addEventListener("click", () => {
  const oldStart = startSelect.value;
  startSelect.value = destinationSelect.value;
  destinationSelect.value = oldStart;
});

navigateBtn.addEventListener("click", startNavigation);

panelToggle.addEventListener("click", () => {
  const collapsed = navPanel.classList.toggle("collapsed");
  panelToggle.classList.toggle("collapsed", collapsed);
  panelToggle.textContent = collapsed ? "›" : "‹";
  panelToggle.setAttribute("aria-expanded", String(!collapsed));
  panelToggle.setAttribute(
    "aria-label",
    collapsed ? "Show navigation panel" : "Hide navigation panel"
  );
});

/* Keep the dropdown selections synchronized with the scene reached manually. */
startSelect.addEventListener("change", () => {
  if (!navigationStarted) {
    loadScene(startSelect.value);
  }
});
