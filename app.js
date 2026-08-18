let viewer;
let graph;

fetch('data.json')
  .then(res => res.json())
  .then(data => {
    graph = data.nodes;
    loadScene('entrance');
  });

function loadScene(sceneId) {
  const scene = graph[sceneId];

  if (viewer) {
    viewer.destroy();
  }

  viewer = pannellum.viewer('viewer', {
    type: 'equirectangular',
    panorama: scene.image,
    autoLoad: true,
    hotSpots: scene.links.map(link => ({
      pitch: link.pitch,
      yaw: link.yaw,
      type: "info",
      text: link.text,
      clickHandlerFunc: () => loadScene(link.target)
    }))
  });
}