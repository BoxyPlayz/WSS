import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { availableParallelism } from "node:os";
import cluster from "node:cluster";
import { createAdapter, setupPrimary } from "@socket.io/cluster-adapter";

async function initializeDatabase() {
  const db = await open({
    filename: "game.db",
    driver: sqlite3.Database,
  });

  // Create the 'PData' table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS PData (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_offset TEXT UNIQUE,
      content TEXT
    );
  `);

  return db;
}

// Global player storage
const players = {};
const playerTimeouts = {}; // Object to hold timeouts for each player

if (cluster.isPrimary) {
  const numCPUs = availableParallelism();
  // create one worker per available core
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork({
      PORT: 10000 + i,
    });
  }

  // set up the adapter on the primary thread
  setupPrimary();
} else {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    connectionStateRecovery: {},
    // set up the adapter on each worker thread
    adapter: createAdapter(),
  });

  const __dirname = dirname(fileURLToPath(import.meta.url));

  app.get("/", (req, res) => {
    res.sendFile(join(__dirname, "index.html"));
  });

  app.get("/script.js", (req, res) => {
    res.sendFile(join(__dirname, "script.js"));
  });
  
  app.get("/images/player.png", (req, res) => {
    res.sendFile(join(__dirname, "images/player.png"));
  });
  
  app.get("/images/otherPlayer.png", (req, res) => {
    res.sendFile(join(__dirname, "images/otherPlayer.png"));
  });

  const db = await initializeDatabase();

  io.on("connection", async (socket) => {
    // Handle new player connection
    socket.on("packet", async (msg, clientOffset, callback) => {
      const { UID, mouseX, mouseY } = msg;

      // Store player data
      players[UID] = { UID, mouseX, mouseY };

      // Reset the player's timeout
      resetPlayerTimeout(UID); // Use UID instead of socket.id

      // Broadcast updated player data to all clients
      io.emit("packet", players);

      callback(); // Acknowledge the event
    });

    // Function to remove a player from the game
    async function removePlayer(uid) {
      delete players[uid]; // Remove player from the players object
      clearTimeout(playerTimeouts[uid]); // Clean up the timeout
      await db.run("DELETE FROM PData WHERE client_offset = ?", uid); // Remove from DB
      io.emit("left", uid); // Notify all clients about the player leaving
      console.log(`Player ${uid} has left the game`);
    }

    function resetPlayerTimeout(uid) {
      // Clear any existing timeout for the player
      if (playerTimeouts[uid]) {
        clearTimeout(playerTimeouts[uid]);
      }

      // Set a new timeout to remove the player after 5 seconds of inactivity
      playerTimeouts[uid] = setTimeout(() => {
        removePlayer(uid);
      }, 5000);
    }

    // Listen for socket disconnection
    socket.on("disconnect", () => {
      removePlayer(socket.id);
    });

    if (!socket.recovered) {
      try {
        await db.each(
          "SELECT id, content FROM PData WHERE id > ?",
          [socket.handshake.auth.serverOffset || 0],
          (_err, row) => {
            socket.emit("chat message", row.content, row.id);
          }
        );
      } catch (e) {
        // Handle error if necessary
        console.error("Error fetching data from DB:", e);
      }
    }
  });

  // Each worker will listen on a distinct port
  const port = process.env.PORT;

  server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}
