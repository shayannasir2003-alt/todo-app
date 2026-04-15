import { createCookie } from "react-router";

export type Theme = "light" | "dark";

export const themeCookie = createCookie("theme", {
  maxAge: 60 * 60 * 24 * 365,
});

export async function getTheme(request: Request): Promise<Theme> {
  const cookieHeader = request.headers.get("Cookie");
  const theme = await themeCookie.parse(cookieHeader);
  return theme === "dark" ? "dark" : "light";
}
