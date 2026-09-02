import React, { useCallback, useEffect, useRef, useState } from "react";

const FRAME_SRC = "/assets/frames/Contoh2.png";
const PHOTO_AREA = {
    // Area foto lingkaran pada Contoh2.png (2000 x 2000).
    x: 130,
    y: 125,
    width: 1740,
    height: 1740,
    shape: "circle",
};
const CAMERA_BRIDGE_URL = process.env.REACT_APP_CAMERA_BRIDGE_URL || "ws://127.0.0.1:8765";
const FRAME_SLOTS = [PHOTO_AREA];

export default function Photobooth() {
    const canvasRef = useRef(null);
    const frameImgRef = useRef(null);
    const socketRef = useRef(null);
    const photosRef = useRef([]);
    const [photos, setPhotos] = useState([]);
    const [frameAspectRatio, setFrameAspectRatio] = useState("1 / 1");
    const [cameraStatus, setCameraStatus] = useState("unavailable");
    const [cameraName, setCameraName] = useState("");
    const [driveSaveStatus, setDriveSaveStatus] = useState("idle");

    photosRef.current = photos;

    const clearPhoto = useCallback(() => {
        photosRef.current = [];
        setPhotos([]);
        setDriveSaveStatus("idle");
    }, []);

    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const frame = frameImgRef.current;
        if (!canvas || !frame) return;

        const ctx = canvas.getContext("2d");
        const frameWidth = frame.width;
        const frameHeight = frame.height;
        canvas.width = frameWidth;
        canvas.height = frameHeight;
        ctx.clearRect(0, 0, frameWidth, frameHeight);

        photosRef.current.forEach(photo => {
            const slot = FRAME_SLOTS[photo.slotIndex];
            const drawWidth = photo.img.width * photo.scale;
            const drawHeight = photo.img.height * photo.scale;
            const drawX = slot.x + photo.offsetX;
            const drawY = slot.y + photo.offsetY;

            ctx.save();
            ctx.beginPath();
            if (slot.shape === "circle") {
                ctx.arc(
                    slot.x + slot.width / 2,
                    slot.y + slot.height / 2,
                    Math.min(slot.width, slot.height) / 2,
                    0,
                    Math.PI * 2
                );
            } else {
                ctx.rect(slot.x, slot.y, slot.width, slot.height);
            }
            ctx.clip();
            ctx.drawImage(photo.img, drawX, drawY, drawWidth, drawHeight);
            ctx.restore();
        });

        // Frame selalu berada di lapisan paling atas.
        ctx.drawImage(frame, 0, 0, frameWidth, frameHeight);
    }, []);

    useEffect(() => {
        const frame = new Image();
        frame.onload = () => {
            frameImgRef.current = frame;
            setFrameAspectRatio(`${frame.width} / ${frame.height}`);
            drawCanvas();
        };
        frame.src = FRAME_SRC;
    }, [drawCanvas]);

    useEffect(() => {
        drawCanvas();
    }, [photos, drawCanvas]);

    const discardSourcePhoto = sourceName => {
        const socket = socketRef.current;
        if (sourceName && socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "photo:discard", sourceName }));
        }
    };

    const addPhoto = (img, sourceName = null) => {
        const slot = FRAME_SLOTS[0];
        const scale = Math.max(slot.width / img.width, slot.height / img.height);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;
        const photo = {
            id: `${Date.now()}-${Math.random()}`,
            img,
            sourceName,
            slotIndex: 0,
            scale,
            offsetX: drawWidth > slot.width ? (slot.width - drawWidth) / 2 : 0,
            offsetY: drawHeight > slot.height ? (slot.height - drawHeight) / 2 : 0,
        };

        photosRef.current = [photo];
        setPhotos([photo]);
        setDriveSaveStatus("idle");
    };

    const addPhotoRef = useRef(addPhoto);
    addPhotoRef.current = addPhoto;

    useEffect(() => {
        let socket;
        let reconnectTimer;
        let stopped = false;

        const loadPhoto = (source, mimeType = "image/jpeg", sourceName = null) => {
            if (!source) return;

            const image = new Image();
            image.onload = () => addPhotoRef.current(image, sourceName);
            image.src = source.startsWith("data:")
                ? source
                : `data:${mimeType};base64,${source}`;
        };

        const handleMessage = event => {
            if (event.data instanceof Blob) {
                const reader = new FileReader();
                reader.onload = () => loadPhoto(reader.result);
                reader.readAsDataURL(event.data);
                return;
            }

            if (event.data instanceof ArrayBuffer) {
                const reader = new FileReader();
                reader.onload = () => loadPhoto(reader.result);
                reader.readAsDataURL(new Blob([event.data], { type: "image/jpeg" }));
                return;
            }

            if (typeof event.data !== "string") return;

            let message;
            try {
                message = JSON.parse(event.data);
            } catch {
                loadPhoto(event.data);
                return;
            }

            if (message.type === "photo" && message.data) {
                loadPhoto(message.data, message.mimeType || "image/jpeg", message.name || null);
            }

            if (message.type === "camera" || message.type === "status") {
                setCameraStatus(message.status || "unavailable");
                setCameraName(message.name || message.camera?.name || "");
            }

            if (message.type === "photo:saved") clearPhoto();
            if (message.type === "photo:save-disabled") setDriveSaveStatus("disabled");
            if (message.type === "photo:save-error") setDriveSaveStatus("error");
        };

        const connect = () => {
            if (stopped) return;
            setCameraStatus("connecting");

            try {
                socket = new WebSocket(CAMERA_BRIDGE_URL);
                socket.onopen = () => {
                    socketRef.current = socket;
                    setCameraStatus("waiting");
                    socket.send(JSON.stringify({ type: "subscribe", events: ["camera", "photo"] }));
                };
                socket.onmessage = handleMessage;
                socket.onerror = () => socket.close();
                socket.onclose = () => {
                    if (socketRef.current === socket) socketRef.current = null;
                    setCameraStatus("unavailable");
                    if (!stopped) reconnectTimer = setTimeout(connect, 3000);
                };
            } catch {
                setCameraStatus("unavailable");
                reconnectTimer = setTimeout(connect, 3000);
            }
        };

        connect();
        return () => {
            stopped = true;
            clearTimeout(reconnectTimer);
            if (socket) socket.close();
            socketRef.current = null;
        };
    }, [clearPhoto]);

    const uploadPhoto = event => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => addPhoto(image);
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
        event.target.value = "";
    };

    const redoPhoto = () => {
        const photo = photosRef.current[0];
        if (!photo) return;

        discardSourcePhoto(photo.sourceName);
        clearPhoto();
    };

    const saveToGoogleDrive = () => {
        const photo = photosRef.current[0];
        const socket = socketRef.current;
        if (!photo || !canvasRef.current || socket?.readyState !== WebSocket.OPEN) {
            setDriveSaveStatus("error");
            return;
        }

        setDriveSaveStatus("saving");
        socket.send(JSON.stringify({
            type: "photo:save",
            sourceName: photo.sourceName,
            mimeType: "image/png",
            data: canvasRef.current.toDataURL("image/png"),
        }));
    };

    const downloadPhoto = () => {
        if (!canvasRef.current) return;
        const photo = photosRef.current[0];
        const link = document.createElement("a");
        link.href = canvasRef.current.toDataURL("image/png");
        link.download = "photobooth.png";
        link.click();
        discardSourcePhoto(photo?.sourceName);
        clearPhoto();
    };

    const hasPhoto = photos.length > 0;

    return (
        <div style={centerCol}>
            <div style={mainContent}>
                <div style={frameColumn}>
                    <canvas
                        ref={canvasRef}
                        style={{ ...canvasStyle, aspectRatio: frameAspectRatio }}
                    />

                    <div style={photoControls}>
                        {!hasPhoto && (
                            <label style={{ ...buttonStyle, cursor: "pointer" }}>
                                Upload foto uji
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={uploadPhoto}
                                    style={{ display: "none" }}
                                />
                            </label>
                        )}
                        {hasPhoto && (
                            <button
                                style={buttonStyle}
                                onClick={redoPhoto}
                                disabled={driveSaveStatus === "saving"}
                            >
                                Ambil ulang
                            </button>
                        )}
                    </div>

                    <div style={bridgeStatus}>
                        <span
                            style={{
                                ...bridgeDot,
                                background:
                                    cameraStatus === "connected" ? "#35a66f" :
                                        cameraStatus === "waiting" ? "#e0a52b" : "#b7a9a3",
                            }}
                        />
                        {cameraStatus === "connected"
                            ? `Kamera terhubung${cameraName ? `: ${cameraName}` : ""}`
                            : cameraStatus === "waiting"
                                ? "Connector aktif — menunggu kamera"
                                : "Connector kamera belum aktif"}
                    </div>

                    {hasPhoto && (
                        <>
                            <div style={{ ...photoControls, marginTop: 16 }}>
                                <button
                                    style={buttonStyle}
                                    onClick={saveToGoogleDrive}
                                    disabled={driveSaveStatus === "saving" || driveSaveStatus === "saved"}
                                >
                                    {driveSaveStatus === "saving" ? "Menyimpan..." : "Simpan ke Google Drive"}
                                </button>
                                <button style={buttonStyle} onClick={downloadPhoto}>
                                    Download
                                </button>
                            </div>

                            {driveSaveStatus !== "idle" && (
                                <div style={saveStatus}>
                                    {driveSaveStatus === "saved" && "Berhasil disimpan ke Google Drive."}
                                    {driveSaveStatus === "disabled" && "Google Drive belum diaktifkan."}
                                    {driveSaveStatus === "error" && "Gagal menyimpan ke Google Drive."}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

const centerCol = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    width: "100%",
};

const canvasStyle = {
    // Preview mengikuti ukuran layar, tetapi rasio asli frame tetap terjaga.
    width: "min(72vw, 720px, calc(100vh - 220px))",
    height: "auto",
    maxWidth: "100%",
    display: "block",
    margin: "0 auto",
};

const buttonStyle = {
    padding: "10px 18px",
    minHeight: 42,
    fontSize: 15,
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 500,
    color: "#222",
    border: "1px solid #b8b8b8",
    borderRadius: 6,
    background: "#fff",
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.06)",
};

const photoControls = {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
};

const bridgeStatus = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 10,
    color: "#555",
    fontSize: 13,
    width: "100%",
};

const bridgeDot = {
    width: 9,
    height: 9,
    borderRadius: "50%",
    display: "inline-block",
};

const mainContent = {
    width: "100%",
    display: "flex",
    justifyContent: "center",
};

const frameColumn = {
    width: "min(100%, 720px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
};

const saveStatus = {
    marginTop: 8,
    textAlign: "center",
    color: "#555",
    fontSize: 13,
};
