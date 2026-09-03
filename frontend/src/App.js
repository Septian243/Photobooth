import './App.css';
import React, { useState, useEffect } from "react";
import Photobooth from "./components/Photobooth";
import "./styles/global.css";

function App() {
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const d = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
      const t = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      setClock(d + ' · ' + t);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {/* Decorative: crop marks */}
      <div className="crop-mark cm-tl" aria-hidden="true" />
      <div className="crop-mark cm-tr" aria-hidden="true" />
      <div className="crop-mark cm-bl" aria-hidden="true" />
      <div className="crop-mark cm-br" aria-hidden="true" />

      {/* Decorative: film strip left */}
      <div className="strip-left" aria-hidden="true" />

      {/* Decorative: EXIF text right */}
      <div className="strip-right" aria-hidden="true">
        <span>F/2.8 — 1/125S — ISO 200 — 35MM — F/2.8 — 1/125S — ISO 200 — 35MM</span>
      </div>



      {/* Decorative: halftone & diamond dot */}
      <div className="deco-halftone" aria-hidden="true" />
      <div className="deco-dot" aria-hidden="true" />

      {/* Header */}
      <header className="site-header">
        <div className="topbar">
          <div className="mark">ALL VISUAL <b>CAPTURE</b></div>
          <img
            src="/assets/images/alvic.png"
            className="topbar-logo"
            alt="Alvic Logo"
          />
          <div className="tag">
            When The Visual Matters<i aria-hidden="true" />
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="app-wrap">
        <Photobooth />
      </div>

      {/* Footer */}
      <footer className="site-footer">
        <span>Alvic Photobooth — Tiga Serangkai University</span>
        <span>{clock}</span>
      </footer>
    </>
  );
}

export default App;

