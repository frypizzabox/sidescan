import { Routes, Route } from "react-router-dom";
import { ProjectList } from "@/pages/ProjectList";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectList />} />
    </Routes>
  );
}
