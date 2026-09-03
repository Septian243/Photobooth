import React, { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import "./Photobooth.css";

const frameOptions = [
    "/assets/frames/heart-frame-2.png",
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
    const videoRef = useRef(null);

    const slots = [PHOTO_AREA];

    const selectedFrame = frameOptions[0];
    const [mode, setMode] = useState("photo");

    const [photos, setPhotos] = useState([]);
    const [photoCount, setPhotoCount] = useState(0);
    const [draggingPhoto, setDraggingPhoto] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [cameraStatus, setCameraStatus] = useState("unavailable");
    const [cameraName, setCameraName] = useState("");
    const [webcamActive, setWebcamActive] = useState(false);

    const [stickers, setStickers] = useState([]);
    const [draggingSticker, setDraggingSticker] = useState(null);
    const [selectedSticker, setSelectedSticker] = useState(null);
    const [showQrModal, setShowQrModal] = useState(false);
    const photoCountRef = useRef(photoCount);
    photoCountRef.current = photoCount;

    // frames
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                ctx.strokeStyle = "var(--flash)";
                ctx.lineWidth = 4;
                ctx.strokeRect(s.x, s.y, 150, 150);
            }
        });
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(drawCanvas, [photos, stickers, selectedSticker, photoCount]);

    const handleBack = () => {
        if (mode === "decorate") {
            setMode("photo");
            setStickers([]);
            setSelectedSticker(null);
        } else {
            setPhotos([]);
            photoCountRef.current = 0;
            setPhotoCount(0);
            setStickers([]);
            setSelectedSticker(null);
            setMode("photo");
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

    const startWebcam = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setWebcamActive(true);
                setCameraStatus("connected");
                setCameraName("Webcam");
            }
        } catch (err) {
            console.error("Error accessing webcam:", err);
            alert("Tidak dapat mengakses webcam.");
        }
    };

    const captureWebcam = () => {
        if (!videoRef.current || mode !== "photo") return;
        const video = videoRef.current;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        // Flip horizontally to match the preview
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const img = new Image();
        img.src = canvas.toDataURL("image/jpeg");
        img.onload = () => addPhoto(img, "Webcam");
    };

    const stopWebcam = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(t => t.stop());
            setWebcamActive(false);
            setCameraStatus("unavailable");
            setCameraName("");
        }
    };

    // Clean up webcam when unmounting
    useEffect(() => {
        return () => stopWebcam();
    }, []);

    // Listen for Spacebar when webcam is active
    useEffect(() => {
        const handleKeyDown = e => {
            if (e.code === "Space" && webcamActive && mode === "photo") {
                e.preventDefault();
                captureWebcam();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [webcamActive, mode]);

    const redoLastPhoto = () => {
        if (!photos.length) return;
        setPhotos([]);
        photoCountRef.current = 0;
        setPhotoCount(0);
        setStickers([]);
        setSelectedSticker(null);
        setMode("photo");
    };

    const getCoords = e => {
        const r = canvasRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - r.left) * (canvasRef.current.width / r.width),
            y: (e.clientY - r.top) * (canvasRef.current.height / r.height)
        };
    };

    const handleMouseDown = e => {
        const { x, y } = getCoords(e);
        if (mode === "photo") {
            for (let i = photos.length - 1; i >= 0; i--) {
                const p = photos[i];
                const slot = slots[p.slotIndex];
                const w = p.img.width * p.scale;
                const h = p.img.height * p.scale;
                if (x >= slot.x + p.offsetX && x <= slot.x + p.offsetX + w &&
                    y >= slot.y + p.offsetY && y <= slot.y + p.offsetY + h) {
                    setDraggingPhoto(i);
                    setDragOffset({ x: x - slot.x - p.offsetX, y: y - slot.y - p.offsetY });
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
                u[draggingSticker] = { ...u[draggingSticker], x: x - dragOffset.x, y: y - dragOffset.y };
                return u;
            });
        }
    };

    const handleMouseUp = () => {
        setDraggingPhoto(null);
        setDraggingSticker(null);
    };

    useEffect(() => {
        const handleKeyDown = e => {
            if ((e.key === "Delete" || e.key === "Backspace") && selectedSticker != null && mode === "decorate") {
                setStickers(s => s.filter((_, i) => i !== selectedSticker));
                setSelectedSticker(null);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedSticker, mode]);

    const downloadPhoto = () => {
        setShowQrModal(true);
    };

    // Camera status label
    const statusLabel =
        cameraStatus === "connected"
            ? `Kamera terhubung${cameraName ? `: ${cameraName}` : ""}`
            : cameraStatus === "waiting"
                ? "Connector aktif — menunggu kamera"
                : cameraStatus === "connecting"
                    ? "Menyambungkan connector…"
                    : "Connector kamera belum aktif";

    const statusColor =
        cameraStatus === "connected" ? "#35a66f" :
            cameraStatus === "waiting" ? "#e0a52b" : "var(--carbon-soft)";

    return (
        <>
            <main className="pb-stage">
                <svg className="pb-deco-aperture" viewBox="0 0 400 400" aria-hidden="true">
                    <circle cx="200" cy="200" r="170" />
                    <circle cx="200" cy="200" r="118" />
                    <g>
                        <line x1="200" y1="26" x2="200" y2="86" />
                        <line x1="200" y1="374" x2="200" y2="314" />
                        <line x1="26" y1="200" x2="86" y2="200" />
                        <line x1="374" y1="200" x2="314" y2="200" />
                        <line x1="77" y1="77" x2="119" y2="119" />
                        <line x1="323" y1="323" x2="281" y2="281" />
                        <line x1="323" y1="77" x2="281" y2="119" />
                        <line x1="77" y1="323" x2="119" y2="281" />
                    </g>
                    <circle className="pb-deco-center-dot" cx="200" cy="200" r="5" />
                </svg>

                <div className="pb-body">

                    {/* === PHOTO MODE: viewfinder === */}
                    <div
                        className="camera-col"
                        style={{ display: mode === "photo" ? "flex" : "none" }}
                    >
                        <div className={`viewfinder ${webcamActive ? 'is-live' : ''}`}>
                            <div className="placeholder-grid" />
                            <div className="bracket tl" />
                            <div className="bracket tr" />
                            <div className="bracket bl" />
                            <div className="bracket br" />

                            {/* Webcam video stream */}
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                            />

                            {/* Status hint */}
                            <div className="cam-hint">
                                <div>
                                    <span className="pb-status-dot" style={{ background: statusColor, display: 'inline-block', marginRight: 8 }} />
                                    {statusLabel}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* === DECORATE MODE: photo result + side controls === */}
                    <div
                        className="pb-decorate-layout"
                        style={{ display: mode === 'decorate' ? 'flex' : 'none' }}
                    >
                        <div className="pb-frame-wrap">
                            <canvas
                                ref={canvasRef}
                                className="pb-canvas"
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                            />
                        </div>

                        {mode === 'decorate' && (
                            <div className="pb-controls pb-controls--side">
                                <h2 className="pb-decorate-title">Foto kamu sudah jadi.</h2>
                                <p className="pb-decorate-sub">Simpan foto, atau ulangi sesi kalau mau coba lagi.</p>
                                <div className="pb-decorate-actions">
                                    <button className="btn-primary" onClick={downloadPhoto}>Simpan Foto</button>
                                    <button className="btn-ghost" onClick={redoLastPhoto}>Ulangi sesi</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Controls untuk photo mode saja */}
                    {mode === "photo" && (
                        <div className="pb-controls">
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                                <label className="btn-primary" style={{ cursor: "pointer" }}>
                                    Upload Foto Uji
                                    <input type="file" accept="image/*" onChange={uploadPhoto} style={{ display: "none" }} />
                                </label>
                                {!webcamActive && (
                                    <button className="btn-ghost" onClick={startWebcam}>Akses Webcam</button>
                                )}
                                {webcamActive && (
                                    <button className="btn-primary" onClick={captureWebcam}>Ambil Foto (Spasi)</button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* QR Modal rendered via Portal so it escapes stacking contexts */}
            {createPortal(
                <div className={`pb-qr-modal ${showQrModal ? 'show' : ''}`} onClick={(e) => {
                    if (e.target.classList.contains('pb-qr-modal')) setShowQrModal(false);
                }}>
                    <div className="pb-qr-modal-content">
                        <button className="pb-close-qr" aria-label="Tutup" onClick={() => setShowQrModal(false)}>&times;</button>
                        <h3>QR Google Drive</h3>
                        <img src="/assets/images/gdrive-qrcode.png" alt="Google Drive QR Code" />
                        <p>Scan QR code di atas untuk membuka folder Google Drive.</p>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}