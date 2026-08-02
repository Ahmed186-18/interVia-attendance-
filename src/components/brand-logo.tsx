interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: {
    frame: "h-14 w-14 rounded-2xl",
  },
  md: {
    frame: "h-14 w-14 rounded-xl",
  },
  lg: {
    frame: "h-24 w-24 rounded-3xl",
  },
};

export default function BrandLogo({ size = "md", className = "" }: BrandLogoProps) {
  const config = sizes[size];

  return (
    <div
      className={`flex-shrink-0 overflow-hidden bg-white ${config.frame} ${className}`}
    >
      <svg
        viewBox="904 198 1063 1085"
        className="h-full w-full"
        role="img"
        aria-label="InterVia"
        preserveAspectRatio="xMidYMid meet"
      >
        <image href="/logo.png?v=5" width="2869" height="1581" />
      </svg>
    </div>
  );
}
