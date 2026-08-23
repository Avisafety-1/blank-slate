import * as React from "react";

export function useIsTouchDevice() {
  const [isTouch, setIsTouch] = React.useState(false);

  React.useEffect(() => {
    const check = () => {
      setIsTouch(
        "ontouchstart" in window ||
          (navigator.maxTouchPoints !== undefined && navigator.maxTouchPoints > 0)
      );
    };
    check();
  }, []);

  return isTouch;
}
