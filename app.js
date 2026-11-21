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
const arrivedBox = document.getElementById("arrivedBox");
const arrivedText = document.getElementById("arrivedText");

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

  // Arrows are shown only while navigation is running, and hidden again at the destination.
  const navActive = navigationStarted && route.length > 1 && routeIndex < route.length - 1;
  const nextSceneId = navActive ? route[routeIndex + 1] : null;
  const links = scene.links || [];
  const nextLink = nextSceneId ? links.find(link => link.target === nextSceneId) : null;

  const hotSpots = navActive
    ? links.map(link => {
        const label = link.text || (link.target ? `Go to ${graph[link.target]?.title || link.target}` : "End");
        const isNext = Boolean(nextLink && link === nextLink);

        return {
          pitch: Number(link.pitch || 0),
          yaw: Number(link.yaw || 0),
          type: "custom",
          createTooltipFunc: buildArrow,
          createTooltipArgs: { label, isNext },
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
    : [];

  if (nextLink) {
    hotSpots.push(...buildRouteTrail(nextLink));
  }

  viewer = pannellum.viewer("viewer", {
    type: "equirectangular",
    panorama: scene.image,
    autoLoad: true,
    showControls: true,
    compass: false,
    hotSpots
  });

  updateRouteUI();
  updateArrivedBox();
}

/* Visible arrow for each exit, centred exactly on its yaw/pitch point.
   classList.add keeps Pannellum's own positioning classes. */
function buildArrow(div, args) {
  div.classList.add("nav-hotspot");
  div.title = args.label;

  const wrap = document.createElement("div");
  wrap.className = "nav-arrow-wrap";

  const arrow = document.createElement("div");
  arrow.className = "nav-arrow" + (args.isNext ? " next" : "");
  arrow.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l-8 9h5v7h6v-7h5z"/></svg>';
  wrap.appendChild(arrow);

  if (args.isNext) {
    const tag = document.createElement("span");
    tag.className = "nav-arrow-label";
    tag.textContent = args.label;
    wrap.appendChild(tag);
  }

  div.appendChild(wrap);
}

/* Short dotted trail that leads into the next arrow, placed on the same spot as the arrow. */
function buildRouteTrail(nextLink) {
  const yaw = Number(nextLink.yaw || 0);
  const targetPitch = Number(nextLink.pitch || 0);
  const trail = [];
  const dots = 4;

  for (let i = 0; i < dots; i++) {
    const t = (i + 1) / (dots + 1);
    trail.push({
      pitch: targetPitch - 14 + 10 * t,
      yaw,
      type: "custom",
      createTooltipFunc: buildDot,
      createTooltipArgs: { size: 6 + Math.round(t * 4), opacity: 0.4 + t * 0.6 }
    });
  }

  return trail;
}

function buildDot(div, args) {
  div.classList.add("trail-dot");
  div.style.width = args.size + "px";
  div.style.height = args.size + "px";
  div.style.opacity = String(args.opacity);
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

function updateArrivedBox() {
  const arrived = navigationStarted && route.length > 0 && routeIndex === route.length - 1;

  if (arrived) {
    const scene = graph[route[routeIndex]];
    arrivedText.textContent = scene?.title || route[routeIndex];
    arrivedBox.classList.remove("hidden");
  } else {
    arrivedBox.classList.add("hidden");
  }
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
