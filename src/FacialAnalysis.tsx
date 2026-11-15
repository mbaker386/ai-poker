import { useEffect, useRef, useState } from "react";

/*
  Purely presentational "AI facial analysis" overlay. It shows the live front
  camera (if allowed) or a fake scan animation, runs a scanning / progress
  sequence, and announces completion. It computes NOTHING and influences the
  trick in no way — it is theatre. The camera stream is display-only, never
  recorded or transmitted, and is released as soon as the overlay closes.
*/

const STATUS = [
  "Detecting face…",
  "Mapping facial landmarks…",
  "Analyzing micro-expressions…",
  "Cross-referencing behavioral tells…",
  "Correlating with hole-card priors…",
];

export function FacialAnalysis({ liveCamera, onClose }: { liveCamera: boolean; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [usingCamera, setUsingCamera] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const done = progress >= 100;

  // Acquire (and reliably release) the front camera.
  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!liveCamera) return;
      try {
        const md = navigator.mediaDevices;
        if (!md || !md.getUserMedia) return; // unsupported -> fake fallback
        const stream = await md.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        setUsingCamera(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try { await videoRef.current.play(); } catch { /* autoplay handles it */ }
        }
      } catch {
        setUsingCamera(false); // permission denied / no camera -> fake fallback
      }
    }
    start();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [liveCamera]);

  // Progress fills to 100% over ~4.5s, then holds at "complete".
  useEffect(() => {
    const id = setInterval(() => setProgress((p) => Math.min(100, p + 100 / 75)), 60);
    return () => clearInterval(id);
  }, []);

  // Cycle the status captions until analysis "completes".
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setStatusIdx((i) => (i + 1) % STATUS.length), 1050);
    return () => clearInterval(id);
  }, [done]);

  return (
    <div className="aip-facial" role="dialog" aria-modal aria-label="Facial analysis">
      {usingCamera
        ? <video ref={videoRef} className="aip-facial-video" autoPlay playsInline muted />
        : <div className="aip-facial-fake" aria-hidden />}

      <div className="aip-facial-overlay">
        <div className={"aip-facial-reticle" + (done ? " locked" : "")} aria-hidden>
          <span className="c tl" /><span className="c tr" /><span className="c bl" /><span className="c br" />
          {!done && <span className="aip-facial-scanline" />}
          <span className="aip-facial-dot d1" /><span className="aip-facial-dot d2" />
          <span className="aip-facial-dot d3" /><span className="aip-facial-dot d4" />
          <span className="aip-facial-dot d5" />
        </div>

        <div className="aip-facial-readout">
          <div className={"aip-facial-status" + (done ? " ok" : "")}>
            {done ? "Analysis complete" : STATUS[statusIdx]}
          </div>
          <div className="aip-facial-bar"><div className="aip-facial-bar-fill" style={{ width: `${progress}%` }} /></div>
          <div className="aip-facial-pct">{Math.round(progress)}%</div>
        </div>

        <button className={"aip-facial-done" + (done ? " ready" : "")} onClick={onClose}>
          {done ? "Done" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
