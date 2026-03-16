import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { ThemeProvider } from "./lib/theme-context";
import { LandingPage } from "./pages/LandingPage";

export function render(): string {
  return renderToString(
    <StaticRouter location="/">
      <ThemeProvider>
        <LandingPage />
      </ThemeProvider>
    </StaticRouter>,
  );
}
