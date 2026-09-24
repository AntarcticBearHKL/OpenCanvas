import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import UserLayout from "@/layouts/user-layout";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import ConfigPage from "@/pages/config";
import NotFound from "@/pages/not-found";
import WritePage from "@/pages/write";

export const router = createBrowserRouter([
    {
        element: (
            <UserLayout>
                <AnalyticsTracker />
                <Outlet />
            </UserLayout>
        ),
        children: [
            { path: "/", element: <Navigate to="/canvas" replace /> },
            { path: "/canvas", element: <CanvasPage /> },
            { path: "/canvas/:id/:workspace?", element: <CanvasProjectPage /> },
            { path: "/config", element: <ConfigPage /> },
            { path: "/write", element: <WritePage /> },
            { path: "/write/:id", element: <WritePage /> },
        ],
    },
    { path: "*", element: <NotFound /> },
]);
