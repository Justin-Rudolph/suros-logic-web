import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  latestRelease,
  releases,
  RELEASE_NOTES_STORAGE_KEY,
} from "@/data/releaseNotes";
import "./ReleaseNotes.css";

export default function ReleaseNotes() {
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem(RELEASE_NOTES_STORAGE_KEY, latestRelease.version);
  }, []);

  return (
    <div className="release-notes-page">
      <button
        onClick={() => navigate("/dashboard")}
        style={{
          position: "fixed",
          top: "20px",
          left: "20px",
          background: "#1e73be",
          color: "#fff",
          padding: "10px 18px",
          fontSize: "15px",
          borderRadius: "6px",
          cursor: "pointer",
          fontWeight: 600,
          border: "none",
          zIndex: 10,
        }}
      >
        ← Back
      </button>

      <div className="release-notes-container">
        <div className="release-notes-hero">
          <p className="release-notes-kicker">Software Updates</p>
          <h1 className="release-notes-heading">Release Notes</h1>
          <p className="release-notes-date">
            Latest release: {latestRelease.version} · {latestRelease.date}
          </p>
        </div>

        <section className="release-notes-featured">
          <p className="release-notes-featured-label">Newest release</p>
          <h2 className="release-notes-featured-title">{latestRelease.version}</h2>
          <p className="release-notes-featured-date">{latestRelease.date}</p>
          <ul className="release-notes-list">
            {latestRelease.highlights.map((item) => (
              <li key={item} className="release-notes-item">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <div className="release-notes-timeline">
          {releases.slice(1).map((release) => (
            <section key={release.version} className="release-notes-card">
              <div className="release-notes-card-header">
                <div>
                  <h2 className="release-notes-section-title">{release.version}</h2>
                  <p className="release-notes-card-date">{release.date}</p>
                </div>
              </div>

              <ul className="release-notes-list">
                {release.highlights.map((item) => (
                  <li key={item} className="release-notes-item">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
