import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import UserLayout from "@/layouts/user-layout";
import AudioPage from "@/pages/audio";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import ConfigPage from "@/pages/config";
import ImagePage from "@/pages/image";
import NotFound from "@/pages/not-found";
import PixelPage from "@/pages/pixel";
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
            { path: "/image", element: <ImagePage /> },
            { path: "/image/:id", element: <ImagePage /> },
            { path: "/pixel", element: <PixelPage /> },
            { path: "/pixel/:id", element: <PixelPage /> },
            { path: "/audio", element: <AudioPage /> },
            { path: "/audio/:id", element: <AudioPage /> },
            { path: "/config", element: <ConfigPage /> },
            { path: "/write", element: <WritePage /> },
            { path: "/write/:id", element: <WritePage /> },
        ],
    },
    { path: "*", element: <NotFound /> },
]);
