import { APP_NAME, APP_TAGLINE, APP_VERSION } from "@/config/app";
import DropZone from "@/components/DropZone";
import useGlobalVideoDrop from "@/hooks/useGlobalVideoDrop";

// Primary landing screen shown in the desktop app.
type LandingProps = {
  isReady: boolean;
  onVideoSelected: (path: string) => void;
};

const Landing = ({ isReady, onVideoSelected }: LandingProps) => {
  const { isDragging } = useGlobalVideoDrop({
    isEnabled: isReady,
    onVideoSelected
  });

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
          <DropZone isDisabled={!isReady} />

          <div className="details">
            <p className="details-title">What happens next</p>
            <ul>
              <li>Pick a corruption mode and intensity.</li>
              <li>Lock a seed so you can reproduce the glitch.</li>
              <li>Render a preview, then export the full file.</li>
            </ul>
          </div>
        </section>
      </div>

      <div className="drag-overlay" data-active={isDragging}>
        <div className="drag-overlay-inner">
          <p className="drag-title">Drop to corrupt</p>
          <p className="drag-subtitle">We will preview before export.</p>
        </div>
      </div>

    </main>
  );
};

export default Landing;
