import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./Photobooth.css";

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
    const videoRef = useRef(null);
    const [webcamActive, setWebcamActive] = useState(false);
    const [cameraStatus, setCameraStatus] = useState("unavailable");
    const [cameraName, setCameraName] = useState("");
    const [driveSaveStatus, setDriveSaveStatus] = useState("idle");
    const [showQrModal, setShowQrModal] = useState(false);

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

            if (message.type === "photo:saved") {
                setShowQrModal(true); 
                clearPhoto();
            }
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
        setShowQrModal(true);
    };

    const startWebcam = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setWebcamActive(true);
                setCameraStatus("connected");
                setCameraName("Webcam Laptop");
            }
        } catch (err) {
            console.error("Error accessing webcam:", err);
            alert("Tidak dapat mengakses webcam.");
        }
    };

    const captureWebcam = () => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        
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

    useEffect(() => {
        return () => stopWebcam();
    }, []);

    useEffect(() => {
        const handleKeyDown = e => {
            if (e.code === "Space" && webcamActive && !hasPhoto) {
                e.preventDefault();
                captureWebcam();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [webcamActive, photos]);

    const hasPhoto = photos.length > 0;
    
    // Camera status styling mappings
    const statusLabel =
        cameraStatus === "connected"
            ? "Kamera terhubung" + (cameraName ? `: ${cameraName}` : "")
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

                    {/* === WAITING MODE: viewfinder placeholder === */}
                    <div
                        className="camera-col"
                        style={{ display: !hasPhoto ? "flex" : "none" }}
                    >
                        <div className={`viewfinder ${webcamActive ? 'is-live' : ''}`}>
                            <div className="placeholder-grid" />
                            <div className="bracket tl" />
                            <div className="bracket tr" />
                            <div className="bracket bl" />
                            <div className="bracket br" />

                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                            />

                            <div className="cam-hint">
                                <div>
                                    <span className="pb-status-dot" style={{ background: statusColor, display: "inline-block", marginRight: 8 }} />
                                    {statusLabel}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* === PHOTO RESULT MODE === */}
                    <div
                        className="pb-decorate-layout"
                        style={{ display: hasPhoto ? "flex" : "none" }}
                    >
                        <div className="pb-frame-wrap">
                            <canvas
                                ref={canvasRef}
                                className="pb-canvas"
                            />
                        </div>

                        {hasPhoto && (
                            <div className="pb-controls pb-controls--side">
                                <h2 className="pb-decorate-title">Foto kamu sudah jadi.</h2>
                                <p className="pb-decorate-sub">Simpan foto, atau ulangi sesi kalau mau coba lagi.</p>
                                <div className="pb-decorate-actions">
                                    <button 
                                        className="btn-primary" 
                                        onClick={saveToGoogleDrive}
                                        disabled={driveSaveStatus === "saving" || driveSaveStatus === "saved"}
                                    >
                                        {driveSaveStatus === "saving" ? "Menyimpan..." : "Simpan ke Google Drive"}
                                    </button>
                                    <button className="btn-primary" onClick={downloadPhoto}>Download Lokal</button>
                                    <button className="btn-ghost" onClick={redoPhoto}>Ulangi Sesi</button>
                                </div>
                                
                                {driveSaveStatus !== "idle" && (
                                    <p style={{ marginTop: 12, fontSize: 13, color: "var(--carbon-soft)" }}>
                                        {driveSaveStatus === "saved" && "Berhasil disimpan ke Google Drive."}
                                        {driveSaveStatus === "disabled" && "Google Drive belum diaktifkan."}
                                        {driveSaveStatus === "error" && "Gagal menyimpan ke Google Drive."}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Controls untuk waiting mode */}
                    {!hasPhoto && (
                        <div className="pb-controls">
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
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

            {/* QR Modal rendered via Portal */}
            {createPortal(
                <div className={`pb-qr-modal ${showQrModal ? 'show' : ''}`} onClick={(e) => {
                    if (e.target.classList.contains('pb-qr-modal')) setShowQrModal(false);
                }}>
                    <div className="pb-qr-modal-content">
                        <button className="pb-close-qr" aria-label="Tutup" onClick={() => setShowQrModal(false)}>&times;</button>
                        <h3>Foto Tersimpan!</h3>
                        <img src="/assets/images/gdrive-qrcode.png" alt="Google Drive QR Code" />
                        <p>Scan QR code di atas untuk membuka folder Google Drive dan melihat hasil fotomu.</p>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
