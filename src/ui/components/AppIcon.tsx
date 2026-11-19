import "./AppIcon.css";

const BASE = import.meta.env.BASE_URL;

/** The app icon (Figma 270:433): 92 px, radius 24. Decorative image from `public/art`. */
export function AppIcon() {
  return (
    <div class="app-icon" aria-hidden="true">
      <img
        class="app-icon-img"
        src={`${BASE}art/app-icon-368.png`}
        width={92}
        height={92}
        alt=""
      />
    </div>
  );
}
