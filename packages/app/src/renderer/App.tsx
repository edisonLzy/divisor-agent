import { RouterProvider } from "react-router-dom";

import { ThemeProvider } from "./components/theme-provider";
import { router } from "./router";

export function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="divisor-agent.theme">
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
