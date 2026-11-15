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
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusIdx, setStatusIdx] = useState(0);
  const done = progress >= 100;
  const usingCamera = stream !== null;

  // Acquire the front camera (and reliably release it on close).
  useEffect(() => {
    if (!liveCamera) return;
    let cancelled = false;
    let acquired: MediaStream | null = null;
    (async () => {
      try {
        const md = navigator.mediaDevices;
        if (!md || !md.getUserMedia) return; // unsupported -> fake fallback
        const s = await md.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        acquired = s;
        setStream(s); // triggers the render that mounts <video>; the effect below attaches it
      } catch {
        /* permission denied / no camera -> fake fallback */
      }
    })();
    return () => {
      cancelled = true;
      if (acquired) acquired.getTracks().forEach((t) => t.stop());
    };
  }, [liveCamera]);

  // Attach the stream only once the <video> element is actually in the DOM.
  // (Setting srcObject in the acquire callback above would race the render that
  // creates the element, so the live feed never appeared.)
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !stream) return;
    v.srcObject = stream;
    v.muted = true; // iOS honors the property, not just the attribute, for autoplay
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => { /* autoPlay will cover it */ });
    return () => { v.srcObject = null; };
  }, [stream]);

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
