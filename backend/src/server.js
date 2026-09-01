const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");
const { WebSocketServer, WebSocket } = require("ws");

function loadDotEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  try {
    const contents = fs.readFileSync(envPath, "utf8");
    for (const line of contents.replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") console.warn(`Tidak dapat membaca backend/.env: ${error.message}`);
  }
}

loadDotEnv();

const PORT = Number(process.env.PORT || 8765);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 500);
const PHOTO_DIR = process.env.PHOTO_DIR || process.argv[2] || path.join(__dirname, "..", "inbox");
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
const GOOGLE_CREDENTIALS_PATH = path.resolve(process.env.GOOGLE_CREDENTIALS_PATH || path.join(__dirname, "..", "credentials.json"));
const GOOGLE_TOKEN_PATH = path.resolve(process.env.GOOGLE_TOKEN_PATH || path.join(__dirname, "..", "token.json"));
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const watchedFolder = path.resolve(PHOTO_DIR);
const clients = new Set();
const seenFiles = new Set();
const pendingFiles = new Map();
let folderAvailable = false;
let drivePromise = null;

function sendJson(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(message) {
  for (const client of clients) sendJson(client, message);
}

function cameraStatusMessage() {
  return {
    type: "camera",
    status: folderAvailable ? "connected" : "waiting",
    name: folderAvailable ? "Sony Camera - Imaging Edge" : "Imaging Edge folder belum tersedia",
  };
}

function isImage(fileName) {
  return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

async function listImages() {
  try {
    const entries = await fs.promises.readdir(watchedFolder, { withFileTypes: true });
    folderAvailable = true;
    return entries.filter((entry) => entry.isFile() && isImage(entry.name)).map((entry) => entry.name);
  } catch (error) {
    folderAvailable = false;
    return [];
  }
}

async function fileIsStable(filePath, fileName) {
  try {
    const current = await fs.promises.stat(filePath);
    const previous = pendingFiles.get(fileName);
    if (!previous || previous.size !== current.size) {
      pendingFiles.set(fileName, { size: current.size });
      return false;
    }
    pendingFiles.delete(fileName);
    return true;
  } catch (error) {
    return false;
  }
}

async function sendPhoto(fileName) {
  if (seenFiles.has(fileName) || clients.size === 0) return;
  const filePath = path.join(watchedFolder, fileName);
  if (!(await fileIsStable(filePath, fileName))) return;

  try {
    const buffer = await fs.promises.readFile(filePath);
    const mimeType = path.extname(fileName).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
    broadcast({
      type: "photo",
      name: fileName,
      mimeType,
      data: `data:${mimeType};base64,${buffer.toString("base64")}`,
    });
    seenFiles.add(fileName);
  } catch (error) {
    console.warn(`Gagal membaca foto ${fileName}: ${error.message}`);
  }
}

function googleDriveEnabled() {
  return Boolean(GOOGLE_DRIVE_FOLDER_ID);
}

async function getDriveClient() {
  if (!googleDriveEnabled()) return null;
  if (!drivePromise) {
    drivePromise = (async () => {
      const credentials = JSON.parse(await fs.promises.readFile(GOOGLE_CREDENTIALS_PATH, "utf8"));
      const config = credentials.installed || credentials.web;
      if (!config || !config.client_id || !config.client_secret) {
        throw new Error("credentials.json tidak berisi OAuth client yang valid");
      }

      let auth;
      try {
        const savedTokens = JSON.parse(await fs.promises.readFile(GOOGLE_TOKEN_PATH, "utf8"));
        auth = new google.auth.OAuth2(config.client_id, config.client_secret, config.redirect_uris?.[0]);
        auth.setCredentials(savedTokens);
      } catch (error) {
        if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
        auth = await authenticate({
          keyfilePath: GOOGLE_CREDENTIALS_PATH,
          scopes: ["https://www.googleapis.com/auth/drive.file"],
        });
        await fs.promises.writeFile(GOOGLE_TOKEN_PATH, JSON.stringify(auth.credentials, null, 2));
      }

      auth.on("tokens", (tokens) => {
        const mergedTokens = { ...auth.credentials, ...tokens };
        void fs.promises.writeFile(GOOGLE_TOKEN_PATH, JSON.stringify(mergedTokens, null, 2));
      });
      return google.drive({ version: "v3", auth });
    })();
  }
  return drivePromise;
}

async function saveFramedPhoto(message, socket) {
  if (!googleDriveEnabled()) {
    sendJson(socket, { type: "photo:save-disabled", message: "Upload Google Drive belum diaktifkan" });
    return;
  }
  if (typeof message.data !== "string") return;
  const separator = message.data.indexOf(",");
  const encoded = separator >= 0 ? message.data.slice(separator + 1) : message.data;
  const mimeType = message.mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
  const extension = mimeType === "image/jpeg" ? ".jpg" : ".png";
  const fileName = `photo-strip-${Date.now()}${extension}`;

  try {
    const drive = await getDriveClient();
    const uploaded = await drive.files.create({
      requestBody: { name: fileName, parents: [GOOGLE_DRIVE_FOLDER_ID] },
      media: { mimeType, body: Readable.from(Buffer.from(encoded, "base64")) },
      fields: "id,name,webViewLink",
    });

    const sourceName = typeof message.sourceName === "string" ? path.basename(message.sourceName) : "";
    if (sourceName && isImage(sourceName)) {
      await fs.promises.unlink(path.join(watchedFolder, sourceName)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      seenFiles.add(sourceName);
      pendingFiles.delete(sourceName);
    }

    sendJson(socket, {
      type: "photo:saved",
      sourceName,
      outputName: fileName,
      destination: "google-drive",
      fileId: uploaded.data.id,
      webViewLink: uploaded.data.webViewLink || "",
    });
  } catch (error) {
    drivePromise = null;
    sendJson(socket, { type: "photo:save-error", sourceName: message.sourceName || "", message: error.message });
  }
}

async function markExistingFiles() {
  const files = await listImages();
  for (const fileName of files) seenFiles.add(fileName);
}

const server = new WebSocketServer({ host: "127.0.0.1", port: PORT });

server.on("listening", async () => {
  await fs.promises.mkdir(watchedFolder, { recursive: true });
  console.log(`Connector berjalan di ws://127.0.0.1:${PORT}`);
  console.log(`Memantau folder Imaging Edge: ${watchedFolder}`);
  await markExistingFiles();
  broadcast(cameraStatusMessage());
});

server.on("connection", (socket) => {
  clients.add(socket);
  sendJson(socket, cameraStatusMessage());
  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === "subscribe") sendJson(socket, cameraStatusMessage());
      if (message.type === "photo:save") void saveFramedPhoto(message, socket);
    } catch (error) {
      sendJson(socket, { type: "error", message: "Pesan connector tidak valid" });
    }
  });
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
});

setInterval(async () => {
  const wasAvailable = folderAvailable;
  const files = await listImages();
  if (wasAvailable !== folderAvailable) broadcast(cameraStatusMessage());
  if (!folderAvailable) return;
  for (const fileName of files) await sendPhoto(fileName);
}, POLL_INTERVAL_MS);

process.on("SIGINT", () => server.close(() => process.exit(0)));
