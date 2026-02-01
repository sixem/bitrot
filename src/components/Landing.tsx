import { useCallback, type CSSProperties } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { APP_NAME, APP_TAGLINE, APP_VERSION } from "@/config/app";
import DropZone from "@/components/DropZone";
import useGlobalVideoDrop from "@/hooks/useGlobalVideoDrop";
import { videoExtensions } from "@/domain/video";
import { THEME_OPTIONS, type AppTheme } from "@/system/theme";
import makeDebug from "@/utils/debug";

// Primary landing screen shown in the desktop app.
type LandingProps = {
  isReady: boolean;
  onVideoSelected: (path: string) => void;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
};

const debug = makeDebug("landing");

const Landing = ({ isReady, onVideoSelected, theme, onThemeChange }: LandingProps) => {
  const { isDragging, handleDropPaths } = useGlobalVideoDrop({
    isEnabled: isReady,
    onVideoSelected
  });
  const handlePickVideo = useCallback(async () => {
    if (!isReady) {
      return;
    }
    try {
      const selection = await open({
        title: "Select a video",
        multiple: false,
        filters: [
          {
            name: "Video",
            extensions: videoExtensions()
          }
        ]
      });
      if (!selection) {
        return;
      }
      const paths = Array.isArray(selection) ? selection : [selection];
      handleDropPaths(paths);
    } catch (error) {
      debug("file dialog failed: %O", error);
    }
  }, [handleDropPaths, isReady]);

  return (
    <main className="app" data-dragging={isDragging}>
      <div className="app-content">
        <header className="hero">
          <span className="version">v{APP_VERSION}</span>
          <p className="eyebrow">{APP_TAGLINE}</p>
          <h1 className="title">{APP_NAME}</h1>
          <p className="lede">
            Drop a clip, twist the codec, export the chaos.
          </p>
        </header>

        <section className="drop-section">
          <DropZone isDisabled={!isReady} onPickFile={handlePickVideo} />

          <div className="details">
            <p className="details-title">What happens next</p>
            <ul>
              <li>Pick a mode and configure it to your liking.</li>
              <li>Trim the video if required, and set encoding options.</li>
              <li>Render the video and get your result.</li>
            </ul>
          </div>
        </section>
      </div>

      <div className="drag-overlay" data-active={isDragging}>
        <div className="drag-overlay-inner">
          <p className="drag-title">Drop to glitch</p>
          <p className="drag-subtitle">We will preview before export.</p>
        </div>
      </div>

      <footer className="theme-toggle" role="radiogroup" aria-label="Theme">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="theme-toggle__dot"
            data-selected={option.id === theme}
            role="radio"
            aria-checked={option.id === theme}
            aria-label={`${option.label} theme`}
            onClick={() => onThemeChange(option.id)}
            style={
              {
                "--theme-color": option.color,
                "--theme-glow": option.glow
              } as CSSProperties
            }
          >
            <span className="theme-toggle__swatch" aria-hidden="true" />
          </button>
        ))}
      </footer>
    </main>
  );
};

export default Landing;
