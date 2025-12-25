"use client";

import { useEffect } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      (window as any).serwist === undefined
    ) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("/sw.js").then(
          function (registration) {
            console.log("Service Worker registration successful with scope: ", registration.scope);
          },
          function (err) {
            console.log("Service Worker registration failed: ", err);
          }
        );
      });
    }
  }, []);

  return (
    <>
      {children}
    </>
  );
}
