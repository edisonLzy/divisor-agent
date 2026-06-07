import { createMemoryRouter, Navigate } from "react-router-dom";

import { NotFoundRedirect } from "./Layout";
import { SettingsPage } from "./pages/settings";
import { SettingsAppearancePage } from "./pages/settings/appearance";
import { SettingsModelsPage } from "./pages/settings/models";
import { SettingsSkillsPage } from "./pages/settings/skills";
import { WorkspacePage } from "./pages/workspace";

export const router = createMemoryRouter([
  {
    path: "/",
    element: <WorkspacePage />,
  },
  {
    path: "/settings",
    element: <SettingsPage />,
    children: [
      {
        index: true,
        element: <Navigate to="appearance" replace />,
      },
      {
        path: "appearance",
        element: <SettingsAppearancePage />,
      },
      {
        path: "models",
        element: <SettingsModelsPage />,
      },
      {
        path: "skills",
        element: <SettingsSkillsPage />,
      },
    ],
  },
  {
    path: "*",
    element: <NotFoundRedirect />,
  },
]);
