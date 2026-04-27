importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyApS-zhVhYU0WGoSe6B30UjzSouJEWJX3Q",
  authDomain: "test-e45d6.firebaseapp.com",
  projectId: "test-e45d6",
  storageBucket: "test-e45d6.firebasestorage.app",
  messagingSenderId: "780751184961",
  appId: "1:780751184961:web:3ef7d56e07bbef9ede12c0"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icons/Icon-192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
