import {
  APP_AUTHOR_LABEL,
  APP_AUTHOR_URL,
  APP_ISSUES_URL,
  APP_NAME,
  APP_REPO_URL,
  APP_TAGLINE,
  APP_VERSION
} from "@/config/app";

// About modal copy and links shown from the landing page version badge.
const AboutModalContent = () => {
  return (
    <div className="about-modal">
      <div className="about-modal__heading">
        <p className="about-modal__title">{APP_NAME}</p>
        <p className="about-modal__tagline">{APP_TAGLINE}</p>
      </div>

      <div className="about-modal__list">
        <div className="about-modal__row">
          <span className="about-modal__label">Version</span>
          <span className="about-modal__value">v{APP_VERSION}</span>
        </div>

        <div className="about-modal__row">
          <span className="about-modal__label">Repository</span>
          <a
            className="about-modal__link"
            href={APP_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="BitRot repository on GitHub"
          >
            {APP_REPO_URL}
          </a>
        </div>

        <div className="about-modal__row">
          <span className="about-modal__label">Issues</span>
          <a
            className="about-modal__link"
            href={APP_ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="BitRot issues on GitHub"
          >
            {APP_ISSUES_URL}
          </a>
        </div>

        <div className="about-modal__row">
          <span className="about-modal__label">Author</span>
          <a
            className="about-modal__link"
            href={APP_AUTHOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`GitHub profile for ${APP_AUTHOR_LABEL}`}
          >
            {APP_AUTHOR_LABEL}
          </a>
        </div>
      </div>
    </div>
  );
};

export default AboutModalContent;
