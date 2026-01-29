import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

// Bookmark icon used by timeline selection controls.
const BookmarkIcon = ({ className = "preview-button-icon", ...props }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 512 512"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path
      fill="currentColor"
      d="M410.9,0H85.1C72.3,0,61.8,10.4,61.8,23.3V512L248,325.8L434.2,512V23.3C434.2,10.4,423.8,0,410.9,0z"
    />
  </svg>
);

export default BookmarkIcon;
