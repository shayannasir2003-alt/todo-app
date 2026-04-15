import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { useEffect } from "react";
import { Toaster } from "sonner";

import type { Route } from "./+types/root";
import { getTheme } from "~/lib/theme.server";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  const theme = await getTheme(request);
  return { theme };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=document.cookie.match(/theme=(light|dark)/);if(m&&m[1]==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen text-gray-900 dark:text-gray-100 antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", loaderData.theme === "dark");
  }, [loaderData.theme]);

  return (
    <>
      <Toaster
        position="bottom-right"
        toastOptions={{
          className:
            "!bg-white dark:!bg-gray-800 !text-gray-900 dark:!text-gray-100 !border !border-gray-200 dark:!border-gray-700 !shadow-lg",
        }}
        richColors
      />
      <Outlet context={{ theme: loaderData.theme }} />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1 className="text-2xl font-bold">{message}</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto mt-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
