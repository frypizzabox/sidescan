import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/layout/Layout";
import { ProjectList } from "@/pages/ProjectList";
import { InsightsTab, ProjectDetail } from "@/pages/ProjectDetail";
import { AcrossProjects } from "@/pages/AcrossProjects";
import { ScanDetail } from "@/pages/ScanDetail";
import { FeedScreen } from "@/components/feed/FeedScreen";
import { CompetitorsScreen } from "@/components/competitors/CompetitorsScreen";
import { ProjectTab } from "@/components/project/ProjectTab";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ProjectList />} />
        <Route path="/across" element={<AcrossProjects />} />
        <Route path="/projects/:slug" element={<ProjectDetail />}>
          <Route index element={<Navigate to="feed" replace />} />
          <Route path="feed" element={<FeedScreen />} />
          <Route path="project" element={<ProjectTab />} />
          <Route path="competitors" element={<CompetitorsScreen />} />
          <Route path="insights" element={<InsightsTab />} />
        </Route>
        <Route
          path="/projects/:slug/scans/:scanId"
          element={<ScanDetail />}
        />
      </Route>
    </Routes>
  );
}
