import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { InPageDock } from "./components/InPageDock";

export function PopupApp() {
  const [, setSession] = useState<Session | null>(null);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#111315] flex justify-end">
      <InPageDock onSessionResolved={setSession} localAiConnected />
    </div>
  );
}

