import React, { useRef, useState, useEffect } from "react";

const frameOptions = [
    "/assets/frames/heart-frame-2.png",
];

const stickerOptions = [
    "/assets/stickers/leaf.png",
    "/assets/stickers/sparkles.png"
];

const PHOTO_AREA = {
    x: 123,
    y: 78,
    width: 953,
    height: 599,
    shape: "rect",
};

const CAMERA_BRIDGE_URL = process.env.REACT_APP_CAMERA_BRIDGE_URL || "ws://127.0.0.1:8765";


export default function PhotoBooth() {
    const canvasRef = useRef(null);
    const frameImgRef = useRef(null);
    const socketRef = useRef(null);
    const autoSaveKeyRef = useRef(null);

    const slots = [PHOTO_AREA];

    const selectedFrame = frameOptions[0];
    const [mode, setMode] = useState("photo");

    const [photos, setPhotos] = useState([]);
    const [photoCount, setPhotoCount] = useState(0);
    const [canTakePhoto, setCanTakePhoto] = useState(true);
    const [draggingPhoto, setDraggingPhoto] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [cameraStatus, setCameraStatus] = useState("unavailable");
    const [cameraName, setCameraName] = useState("");

    const [stickers, setStickers] = useState([]);
    const [draggingSticker, setDraggingSticker] = useState(null);
    const [selectedSticker, setSelectedSticker] = useState(null);
    const photoCountRef = useRef(photoCount);
    photoCountRef.current = photoCount;
    // useEffects

    // frames
    useEffect(() => {
        if (!selectedFrame) return;
        const img = new Image();
        img.src = selectedFrame;

        img.onload = () => {
            frameImgRef.current = img;
            drawCanvas();
        }
    }, [selectedFrame]);

    const drawCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas || !frameImgRef.current) return;

        const ctx = canvas.getContext("2d");

        const frameWidth = frameImgRef.current.width;
        const frameHeight = frameImgRef.current.height;
        canvas.width = frameWidth;
        canvas.height = frameHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        photos.forEach(p => {
            const slot = slots[p.slotIndex];
            const drawW = p.img.width * p.scale;
            const drawH = p.img.height * p.scale;
            const dx = slot.x + p.offsetX;
            const dy = slot.y + p.offsetY;

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
            ctx.drawImage(p.img, dx, dy, drawW, drawH);
            ctx.restore();
        });
        ctx.drawImage(frameImgRef.current, 0, 0, frameWidth, frameHeight);

        stickers.forEach((s, i) => {
            ctx.drawImage(s.img, s.x, s.y, 150, 150);
            if (i === selectedSticker) {
                ctx.strokeStyle = "#ff7aa2";
                ctx.lineWidth = 4;
                ctx.strokeRect(s.x, s.y, 150, 150);
            }
        });
    };

    useEffect(drawCanvas, [photos, stickers, selectedSticker, photoCount]);

    const handleBack = () => {
        if (mode == "decorate") {
            setMode("photo");
            setCanTakePhoto(false);
            setStickers([]);
            setSelectedSticker(null);
        } else {
            setPhotos([]);
            photoCountRef.current = 0;
            setPhotoCount(0);
            setStickers([]);
            setSelectedSticker(null);
            setMode("photo");
            setCanTakePhoto(true);
        }
    };

    // photos
    const addPhoto = (img, sourceName = null) => {
        if (photoCountRef.current >= 1) return;
        photoCountRef.current = 1;

        const slot = slots[0];
        const scale = Math.max(slot.width / img.width, slot.height / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const offsetX = drawW > slot.width ? (slot.width - drawW) / 2 : 0;
        const offsetY = drawH > slot.height ? (slot.height - drawH) / 2 : 0;

        setPhotos(p => [
            ...p,
            {
                id: `${Date.now()}-${Math.random()}`,
                img,
                sourceName,
                slotIndex: photoCount,
                scale,
                offsetX,
                offsetY,
            }
        ]);

        setCanTakePhoto(true);

        setPhotoCount(c => {
            const next = c + 1;
            if (next === 1) setMode("decorate");
            return next;
        });
    };

    const addPhotoRef = useRef(addPhoto);
    addPhotoRef.current = addPhoto;
    const selectedFrameRef = useRef(selectedFrame);
    const modeRef = useRef(mode);
    selectedFrameRef.current = selectedFrame;
    modeRef.current = mode;

    useEffect(() => {
        let socket;
        let reconnectTimer;
        let stopped = false;

        const loadPhoto = (source, mimeType = "image/jpeg", sourceName = null) => {
            if (!source || !selectedFrameRef.current || modeRef.current !== "photo") return;

            const img = new Image();
            img.onload = () => addPhotoRef.current(img, sourceName);
            img.src = source.startsWith("data:")
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
                const status = message.status || "unavailable";
                setCameraStatus(status);
                setCameraName(message.name || message.camera?.name || "");
            }
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
    }, []);

    useEffect(() => {
        const photo = photos[0];
        const socket = socketRef.current;
        if (!photo || !canvasRef.current || !socket || socket.readyState !== WebSocket.OPEN) return;
        if (autoSaveKeyRef.current === photo.id) return;

        const data = canvasRef.current.toDataURL("image/png");
        socket.send(JSON.stringify({
            type: "photo:save",
            sourceName: photo.sourceName,
            mimeType: "image/png",
            data,
        }));
        autoSaveKeyRef.current = photo.id;
    }, [photos, cameraStatus]);

    const uploadPhoto = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.src = reader.result;
            img.onload = () => addPhoto(img);
        };

        reader.readAsDataURL(file);
        e.target.value = "";
    };

    const redoLastPhoto = () => {
        if (!photos.length) return;
        setPhotos([]);
        photoCountRef.current = 0;
        setPhotoCount(0);
        setStickers([]);
        setSelectedSticker(null);
        setMode("photo");
        setCanTakePhoto(true);
    };

    const getCoords = e => {
        const r = canvasRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * (canvasRef.current.width / r.width),
            y: (e.clientY - r.top) * (canvasRef.current.height / r.height)
        };
    };

    // drag photos
    const handleMouseDown = e => {
        const { x, y } = getCoords(e);
        if (mode === "photo") {
            for (let i = photos.length - 1; i >= 0; i--) {
                const p = photos[i];
                const slot = slots[p.slotIndex];
                const w = p.img.width * p.scale;
                const h = p.img.height * p.scale;

                if (
                    x >= slot.x + p.offsetX &&
                    x <= slot.x + p.offsetX + w &&
                    y >= slot.y + p.offsetY &&
                    y <= slot.y + p.offsetY + h
                ) {
                    setDraggingPhoto(i);
                    setDragOffset({
                        x: x - slot.x - p.offsetX,
                        y: y - slot.y - p.offsetY
                    });
                    return;
                }

            }
        }

        if (mode === "decorate") {
            for (let i = stickers.length - 1; i >= 0; i--) {
                const s = stickers[i];
                if (x >= s.x && x <= s.x + 150 && y >= s.y && y <= s.y + 150) {
                    setDraggingSticker(i);
                    setSelectedSticker(i);
                    setDragOffset({ x: x - s.x, y: y - s.y });
                    return;
                }
            }
        }
    };

    const handleMouseMove = e => {
        const { x, y } = getCoords(e);

        if (draggingPhoto !== null && mode === "photo") {
            setPhotos(prev => {
                const updated = [...prev];
                const p = updated[draggingPhoto];
                const slot = slots[p.slotIndex];
                const w = p.img.width * p.scale;
                const h = p.img.height * p.scale;

                p.offsetX = x - slot.x - dragOffset.x;
                p.offsetY = y - slot.y - dragOffset.y;
                p.offsetX = Math.min(Math.max(p.offsetX, slot.width - w), 0);
                p.offsetY = Math.min(Math.max(p.offsetY, slot.height - h), 0);

                return updated;
            });
        }

        if (draggingSticker != null && mode === "decorate") {
            setStickers(s => {
                const u = [...s];
                u[draggingSticker] = {
                    ...u[draggingSticker],
                    x: x - dragOffset.x,
                    y: y - dragOffset.y
                };
                return u;
            });
        }
    };

    const handleMouseUp = () => {
        setDraggingPhoto(null);
        setDraggingSticker(null);
    };

    const addSticker = src => {
        const img = new Image();
        img.src = src;
        img.onload = () =>
            setStickers(s => [...s, { img, x: 400, y: 100 }]);
    };

    useEffect(() => {
        const handleKeyDown = e => {
            if (
                (e.key === "Delete" || e.key === "Backspace") &&
                selectedSticker != null &&
                mode === "decorate"
            ) {
                setStickers(s => s.filter((_, i) => i != selectedSticker));
                setSelectedSticker(null);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedSticker, mode]);


    const downloadPhoto = () => {
        const a = document.createElement("a");
        a.href = canvasRef.current.toDataURL("image.png");
        a.download = "photo-strip.png";
        a.click();
    };

    return (
        <div style={centerCol}>
            {/* top bar with back btn and text */}
            <div style={topBar}>
                {false && selectedFrame && (
                    <button
                        style={{
                            ...buttonStyle,
                            position: "absolute",
                            left: 0,
                            top: 10,
                            height: 40,
                            padding: "0 16px",
                            lineHeight: "40px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                        onClick={handleBack}
                    > ← Back</button>
                )}

                <h1 style={titleBar}>
                    {!selectedFrame
                        ? "₊✩‧₊˚ Select a frame౨ৎ ˚₊✩‧₊"
                        : mode === "photo"
                            ? "⋆｡‧˚ʚ Smile :)ɞ˚‧｡⋆"
                            : ". ݁₊ ⊹ . ݁Let’s decorate . ⊹ ₊ ݁."}

                </h1>
            </div>
            <div style={mainContent} >
                <div style={row}>
                    <div>
                        {false && mode === "photo" && (
                            <>
                                <div style={{ position: "relative", width: 400 }}>
                                    <div style={externalCameraPanel}>
                                        <div style={{ fontSize: 48 }}>📷</div>
                                        <strong>{cameraName || "DSLR"}</strong>
                                        <span>
                                            {cameraStatus === "connected"
                                                ? "Tekan tombol shutter pada kamera"
                                                : "Hubungkan DSLR melalui connector"}
                                        </span>
                                        <small>1 frame = 1 foto</small>
                                    </div>
                                </div>

                                {/* Buttons */}
                                <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
                                    {canTakePhoto && cameraStatus !== "connected" && (
                                        <>
                                            <label style={{ ...buttonStyle, cursor: "pointer" }}>
                                                Upload foto uji
                                                <input
                                                    type="file"
                                                    accept="image /*"
                                                    onChange={uploadPhoto}
                                                    style={{ display: "none" }}
                                                />
                                            </label>
                                        </>
                                    )}
                                    {cameraStatus === "connected" && canTakePhoto && (
                                        <div style={cameraHint}>DSLR siap — ambil foto dari kamera</div>
                                    )}
                                    {/* redo btn */}
                                    {photoCount > 0 && (
                                        <button style={{
                                            ...buttonStyle,
                                            fontSize: 22,
                                            padding: "4px 10px"
                                        }}
                                            onClick={redoLastPhoto}
                                        >
                                            ⟳
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
                                        ? `DSLR terhubung${cameraName ? `: ${cameraName}` : ""}`
                                        : cameraStatus === "waiting"
                                            ? "Connector aktif — menunggu DSLR"
                                            : "Menunggu connector DSLR (foto uji bisa di-upload)"}
                                </div>
                            </>
                        )}

                        {false && mode === "decorate" && (
                            stickerOptions.map((src) => (
                                <img
                                    key={src}
                                    src={src}
                                    alt="sticker"
                                    onClick={() => addSticker(src)}
                                    style={{ width: 50, cursor: "pointer" }}
                                />
                            ))
                        )
                        }
                    </div>

                    {/* Display frame */}
                    <div>
                        <canvas ref={canvasRef}
                            style={{
                                // Preserve the native aspect ratio of each frame.
                                width: "auto",
                                height: "auto",
                                maxWidth: 300,
                                maxHeight: 500,
                                display: "block",
                                borderRadius: 16,
                                boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
                            }}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                        />

                        <div style={photoControls}>
                            {photoCount === 0 && (
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
                            {photoCount > 0 && (
                                <button style={buttonStyle} onClick={redoLastPhoto}>
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

                        {mode === "decorate" && (
                            <div style={{
                                marginTop: 16,
                                display: "flex",
                                justifyContent: "center",
                            }}>
                                <button style={buttonStyle} onClick={downloadPhoto}>
                                    Download
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// styles
const centerCol = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 20
};
const topBar = {
    width: 760,
    height: 60,
    position: "relative",
    marginBottom: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
}
const buttonStyle = {
    padding: "10px 20px",
    fontSize: 20,
    cursor: "pointer",
    fontFamily: "CantikaCute",
    color: "#8c5b4a",
    border: "2px solid #8c5b4a",
    borderRadius: 8,
    background: "white"
};

const externalCameraPanel = {
    width: 400,
    height: 300,
    boxSizing: "border-box",
    borderRadius: 12,
    background: "linear-gradient(145deg, #fff8f5, #fce6ee)",
    border: "2px dashed #d99aae",
    color: "#8c5b4a",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    textAlign: "center",
    padding: 24,
};

const cameraHint = {
    color: "#8c5b4a",
    fontSize: 16,
    alignSelf: "center",
    padding: "10px 0",
};

const photoControls = {
    display: "flex",
    justifyContent: "center",
    marginTop: 16,
};

const bridgeStatus = {
    display: "flex",
    alignItems: "center",
    gap: 7,
    marginTop: 10,
    color: "#8c5b4a",
    fontSize: 13,
};

const bridgeDot = {
    width: 9,
    height: 9,
    borderRadius: "50%",
    display: "inline-block",
};

const row = { display: "flex", gap: 40, alignItems: "flex-start" };
const titleBar = {
    margin: 0,
    lineHeight: "60px",      // vertical center
    textAlign: "center",     // horizontal center
    width: "100%",            // occupy full width of top bar
}

const mainContent = {
    height: 600, // fixed content height
    width: 760,
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
}
