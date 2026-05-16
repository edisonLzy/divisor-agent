import { createMemoryRouter } from "react-router-dom";

import { AppLayout, NotFoundRedirect, WorkspaceLayout } from "./Layout";
import { SettingsPage } from "./settings";
import { Chat } from "./workspace/chat";

export const router = createMemoryRouter([
  {
    Component: AppLayout,
    children: [
      {
        path: "/",
        Component: WorkspaceLayout,
        children: [{ index: true, Component: Chat }],
      },
      {
        path: "/settings",
        Component: SettingsPage,
      },
      {
        path: "*",
        Component: NotFoundRedirect,
      },
    ],
  },
]);
