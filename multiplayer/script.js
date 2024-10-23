let mouseX = 0;
let mouseY = 0;
let counter = 0;
let c = document.getElementById("canvas");
let ctx = c.getContext("2d");
let UID = Math.floor(10000000000 * Math.random());
let players = {}; // Store player data
let playerTimeouts = {}; // Object to hold timeouts for each player

const socket = io({
  auth: {
    serverOffset: 0,
  },
  ackTimeout: 10000,
  retries: 3,
});

const playerImage = new Image();
playerImage.src = "images/player.png"; // Replace with the path to your image
const otherPlayerImage = new Image();
otherPlayerImage.src = "images/otherPlayer.png"; // Replace with the path to your image

// Function to send player data
function send_data(data) {
  const clientOffset = `${socket.id}-${counter++}`;
  socket.emit("packet", data, clientOffset);
}

// Handle incoming player data
socket.on("packet", (msg) => {
  socket.auth.serverOffset = Date.now(); // Update server offset
  Object.assign(players, msg); // Update players with incoming data
});

// Handle player left event
socket.on("left", (uid) => {
  removePlayer(uid);
});

// Variable to control the sending interval
let lastSendTime = 0;
const sendInterval = 100; // milliseconds

// Main render function
function render() {
  ctx.clearRect(0, 0, c.width, c.height); // Clear the canvas

  // Render all players
  for (const uid in players) {
    const player = players[uid];
    if (player['UID'] == UID) {
      ctx.drawImage(playerImage, mouseX, mouseY)
    } else {
        ctx.drawImage(otherPlayerImage, player['mouseX'], player['mouseY'])
    } // Current player in red, others in blue
  }

  // Send player data based on the throttle interval
  const currentTime = Date.now();
  if (currentTime - lastSendTime > sendInterval) {
    send_data({
      UID: UID,
      mouseX: mouseX,
      mouseY: mouseY,
      timestamp: currentTime,
    });
    lastSendTime = currentTime; // Update the last send time
  }

  requestAnimationFrame(render); // Schedule the next render
}

// Handle mouse and touch movement
function handlePointerMove(e) {
  const rect = c.getBoundingClientRect(); // Get canvas position
  const clientX = e.touches ? e.touches[0].clientX : e.clientX; // Use touch or mouse position
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  mouseX = clientX - rect.left; // Adjust for canvas offset
  mouseY = clientY - rect.top; // Adjust for canvas offset
}

// Add event listeners for pointer events
c.addEventListener("mousemove", handlePointerMove);
c.addEventListener("touchmove", handlePointerMove, { passive: false });

// Resize canvas to fit the window
function resizeCanvas() {
  c.width = window.innerWidth;
  c.height = window.innerHeight;
}

// Adjust the canvas size on window resize
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Function to remove a player from the game
function removePlayer(uid) {
  delete players[uid]; // Remove player from the players object
  console.log(`Player ${uid} has left the game`);
}

// Start the rendering loop
requestAnimationFrame(render);
