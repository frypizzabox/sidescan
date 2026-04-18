import { Routes, Route } from "react-router-dom";
import { Layout } from "@/layout/Layout";
import { ProjectList } from "@/pages/ProjectList";
import {
  ProjectDetail,
  NewsTab,
  InsightsTab,
  GithubTab,
} from "@/pages/ProjectDetail";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ProjectList />} />
        <Route path="/projects/:slug" element={<ProjectDetail />}>
          <Route index element={<NewsTab />} />
          <Route path="insights" element={<InsightsTab />} />
          <Route path="github" element={<GithubTab />} />
        </Route>
      </Route>
    </Routes>
  );
}
