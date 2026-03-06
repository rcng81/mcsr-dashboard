import { useState } from "react";
import DashboardView from "./components/DashboardView";
import LandingPage from "./components/LandingPage";

type ViewMode = "home" | "dashboard";

export default function App() {
  const [view, setView] = useState<ViewMode>("home");

  if (view === "home") {
    return <LandingPage onStart={() => setView("dashboard")} />;
  }

  return <DashboardView onBackHome={() => setView("home")} />;
}
