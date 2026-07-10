const { ipcRenderer } = require("electron");

let prev = { scrollX: 0, scrollY: 0 };

function loop() {
  const sx = window.scrollX;
  const sy = window.scrollY;
  if (sx !== prev.scrollX || sy !== prev.scrollY) {
    prev = { scrollX: sx, scrollY: sy };
    ipcRenderer.sendToHost("__divisor-viewport__", {
      type: "viewport",
      scrollX: sx,
      scrollY: sy,
    });
  }
  requestAnimationFrame(loop);
}

loop();
