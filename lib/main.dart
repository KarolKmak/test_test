import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'dart:convert';

// Replace with your Firebase configuration
const firebaseOptions = FirebaseOptions(
  apiKey: "AIzaSyApS-zhVhYU0WGoSe6B30UjzSouJEWJX3Q",
  appId: "1:780751184961:web:3ef7d56e07bbef9ede12c0",
  messagingSenderId: "780751184961",
  projectId: "test-e45d6",
  authDomain: "test-e45d6.firebaseapp.com",
  storageBucket: "test-e45d6.firebasestorage.app",
  measurementId: "G-GKZHK101K9",
);

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: firebaseOptions);
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PWA Push Test',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
      home: const NotificationTester(),
    );
  }
}

class NotificationTester extends StatefulWidget {
  const NotificationTester({super.key});

  @override
  State<NotificationTester> createState() => _NotificationTesterState();
}

class _NotificationTesterState extends State<NotificationTester> {
  String? _token;
  DateTime _selectedDate = DateTime.now().add(const Duration(minutes: 5));
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _requestPermission();
  }

  Future<void> _requestPermission() async {
    FirebaseMessaging messaging = FirebaseMessaging.instance;

    NotificationSettings settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      String? token = await messaging.getToken(
        vapidKey: "BF2SnAcL-3kXg6KTjm7lclrpmj8T11L8ShuK1WVLb0mXvPHlxR_x985pjYIUIJKVfi-krY0YwYsaAUAm6FSrZ9U",
      );
      setState(() {
        _token = token;
      });
      print('Token: $token');
    }
  }

  Future<void> _scheduleNotification() async {
    if (_token == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Wait for FCM token...')),
      );
      return;
    }

    setState(() => _isLoading = true);

    try {
      // Points to the Cloudflare Pages Function at /schedule
      final url = Uri.parse('/schedule');
      final response = await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'token': _token,
          'scheduledTime': _selectedDate.toIso8601String(),
          'title': 'Test Notification',
          'body': 'This is your scheduled test notification!',
        }),
      );

      if (response.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Notification scheduled!')),
        );
      } else {
        throw Exception('Failed to schedule: ${response.body}');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e')),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _pickDateTime() async {
    DateTime? date = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date == null) return;

    TimeOfDay? time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_selectedDate),
    );
    if (time == null) return;

    setState(() {
      _selectedDate = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('PWA Push Tester')),
      body: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (_token == null)
              const Text('Requesting permission and token...', style: TextStyle(color: Colors.orange))
            else
              const Text('FCM Token Ready ✅', style: TextStyle(color: Colors.green)),
            const SizedBox(height: 30),
            Text('Scheduled For:', style: Theme.of(context).textTheme.titleMedium),
            Text(
              DateFormat('yyyy-MM-dd HH:mm').format(_selectedDate),
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            ElevatedButton(
              onPressed: _pickDateTime,
              child: const Text('Change Date/Time'),
            ),
            const SizedBox(height: 40),
            _isLoading
                ? const CircularProgressIndicator()
                : ElevatedButton(
                    onPressed: _scheduleNotification,
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 50),
                    ),
                    child: const Text('Schedule Push Notification'),
                  ),
            const SizedBox(height: 20),
            const Text(
              'Note: On iOS, you MUST "Add to Home Screen" for push notifications to work.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic),
            ),
          ],
        ),
      ),
    );
  }
}
