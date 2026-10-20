"use client";

import { useEffect } from "react";

export default function ClearError() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("error")) {
      url.searchParams.delete("error");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, []);
  return null;
}