import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import UserLayout from "@/layouts/user-layout";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import ConfigPage from "@/pages/config";
import ImagePage from "@/pages/image";
import NotFound from "@/pages/not-found";
import PixelPage from "@/pages/pixel";
import TexturePage from "@/pages/texture";

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
            { path: "/texture", element: <TexturePage /> },
            { path: "/texture/:id", element: <TexturePage /> },
            { path: "/config", element: <ConfigPage /> },
        ],
    },
    { path: "*", element: <NotFound /> },
]);
