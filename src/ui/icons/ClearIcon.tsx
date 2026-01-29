import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

// Clear selection icon used by timeline controls.
const ClearIcon = ({ className = "preview-button-icon", ...props }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 16 16"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M0 8L6 2H16V14H6L0 8ZM6.79289 6.20711L8.58579 8L6.79289 9.79289L8.20711 11.2071L10 9.41421L11.7929 11.2071L13.2071 9.79289L11.4142 8L13.2071 6.20711L11.7929 4.79289L10 6.58579L8.20711 4.79289L6.79289 6.20711Z"
      fill="currentColor"
    />
  </svg>
);

export default ClearIcon;
