import type { FC, ReactNode, SVGProps } from "react";

export type LineIconName =
  "arrow-down" | "arrow-left" | "arrow-right" | "arrow-up-right" | "book-open" | "code" | "refresh";

interface LineIconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  readonly name: LineIconName;
}

const LineIcon: FC<LineIconProps> = ({ name, ...props }) => {
  let icon: ReactNode;

  switch (name) {
    case "arrow-down":
      icon = (
        <>
          <path d="M12 4v15" />
          <path d="m6.5 13.5 5.5 5.5 5.5-5.5" />
        </>
      );
      break;
    case "arrow-right":
      icon = (
        <>
          <path d="M4 12h15" />
          <path d="m13.5 6.5 5.5 5.5-5.5 5.5" />
        </>
      );
      break;
    case "arrow-left":
      icon = (
        <>
          <path d="M20 12H5" />
          <path d="m10.5 6.5-5.5 5.5 5.5 5.5" />
        </>
      );
      break;
    case "arrow-up-right":
      icon = (
        <>
          <path d="M6 18 18 6" />
          <path d="M9 6h9v9" />
        </>
      );
      break;
    case "book-open":
      icon = (
        <>
          <path d="M4.5 5.5c2.5-.8 5-.2 7.5 1.5v11c-2.5-1.7-5-2.3-7.5-1.5z" />
          <path d="M19.5 5.5c-2.5-.8-5-.2-7.5 1.5v11c2.5-1.7 5-2.3-7.5-1.5z" />
        </>
      );
      break;
    case "code":
      icon = (
        <>
          <path d="m9 7-4 5 4 5" />
          <path d="m15 7 4 5-4 5" />
          <path d="m13 4-4 16" />
        </>
      );
      break;
    case "refresh":
      icon = (
        <>
          <path d="M19 8a7.5 7.5 0 0 0-13.1-1.9L4 8" />
          <path d="M4 4v4h4" />
          <path d="M5 16a7.5 7.5 0 0 0 13.1 1.9L20 16" />
          <path d="M20 20v-4h-4" />
        </>
      );
      break;
  }

  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height="1em"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
      width="1em"
      {...props}
    >
      {icon}
    </svg>
  );
};

export default LineIcon;
