import { useEffect } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User } from '../types';

export function usePushNotifications(user: User | null) {
    useEffect(() => {
        if (!user || !Capacitor.isNativePlatform()) {
            return;
        }

        const registerPush = async () => {
            let permStatus = await PushNotifications.checkPermissions();

            if (permStatus.receive === 'prompt') {
                permStatus = await PushNotifications.requestPermissions();
            }

            if (permStatus.receive !== 'granted') {
                console.log('User denied push permission');
                return;
            }

            // Register with Apple/Google
            await PushNotifications.register();
        };

        // On success, we get an APNs/FCM token
        const addRegistrationListener = PushNotifications.addListener('registration', async (token) => {
            console.log('Push registration success, token: ' + token.value);
            
            // Store token in Firestore under the user doc (or a dedicated pushTokens collection)
            try {
                const userRef = doc(db, 'users', user.id);
                // In a real app we'd keep an array of active tokens to notify all devices
                await updateDoc(userRef, {
                    fcmTokens: arrayUnion(token.value)
                });
            } catch (err) {
                console.error("Failed to save push token", err);
            }
        });

        // Some issue with our setup and push will not work
        const addErrorListener = PushNotifications.addListener('registrationError', (error: any) => {
            console.error('Error on registration: ' + JSON.stringify(error));
        });

        // Show us the notification payload if the app is open on our device
        const addNotificationReceivedListener = PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push received: ' + JSON.stringify(notification));
            // We could show a local toast here
        });

        // Method called when tapping on a notification
        const addNotificationActionPerformedListener = PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            console.log('Push action performed: ' + JSON.stringify(notification));
            // We could navigate to the specific inbox here
        });

        registerPush();

        return () => {
            addRegistrationListener.then(l => l.remove());
            addErrorListener.then(l => l.remove());
            addNotificationReceivedListener.then(l => l.remove());
            addNotificationActionPerformedListener.then(l => l.remove());
        };
    }, [user]);
}
