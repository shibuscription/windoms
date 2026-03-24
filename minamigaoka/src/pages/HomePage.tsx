import { useEffect } from "react";

export function HomePage() {
  useEffect(() => {
    const hash = window.location.hash;
    if (hash === "" || hash === "#" || hash === "#/") {
      window.location.replace("#/today");
    }
  }, []);

  return null;
}
