/**
 * AndroidBackButton — routes the Android hardware/gesture back button.
 *
 * Order: open layers registered via useBackHandler (sheets, photo viewer,
 * open conversations, modals) → leave secondary routes (Settings) →
 * minimize the app, like a native Android app at its root screen.
 * Must render inside the router. No-op on iOS and web.
 */
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { runBackHandlers } from '../ui/backButton';

export const AndroidBackButton: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const pathRef = useRef(location.pathname);
    pathRef.current = location.pathname;

    useEffect(() => {
        if (Capacitor.getPlatform() !== 'android') return;
        // Registering a listener disables Capacitor's default back behaviour,
        // so every path below must handle the press.
        const listener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
            if (runBackHandlers()) return;
            const path = pathRef.current;
            if (path !== '/' && path !== '/login') {
                if (canGoBack) navigate(-1);
                else navigate('/', { replace: true });
                return;
            }
            CapacitorApp.minimizeApp().catch(() => { CapacitorApp.exitApp(); });
        });
        return () => { listener.then(l => l.remove()).catch(() => {}); };
    }, [navigate]);

    return null;
};

