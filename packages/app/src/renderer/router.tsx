import { createMemoryRouter } from "react-router-dom";

import { NotFoundRedirect } from "./Layout";
import { SettingsPage } from "./pages/settings";
import { WorkspacePage } from "./pages/workspace";

export const router = createMemoryRouter([
  {
    path: "/",
    element: <WorkspacePage />,
  },
  {
    path: "/settings",
    element: <SettingsPage />,
  },
  {
    path: "*",
    element: <NotFoundRedirect />,
  },
]);
