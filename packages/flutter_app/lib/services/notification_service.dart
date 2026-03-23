import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;
    try {
      const android = AndroidInitializationSettings('@mipmap/ic_launcher');
      const ios = DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      );
      const settings = InitializationSettings(android: android, iOS: ios);
      await _plugin.initialize(settings);
      _initialized = true;
    } catch (e) {
      debugPrint('[NotificationService] init error: $e');
    }
  }

  Future<void> requestPermission() async {
    try {
      await _plugin
          .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
          ?.requestPermissions(alert: true, badge: true, sound: true);
      await _plugin
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();
    } catch (_) {}
  }

  Future<void> show({
    required int id,
    required String title,
    required String body,
    String? payload,
  }) async {
    if (!_initialized) return;
    try {
      const androidDetails = AndroidNotificationDetails(
        'opencode_jobs',
        'Job Updates',
        channelDescription: 'Notifications for repo issue job status changes',
        importance: Importance.high,
        priority: Priority.high,
        icon: '@mipmap/ic_launcher',
      );
      const iosDetails = DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
      );
      const details = NotificationDetails(android: androidDetails, iOS: iosDetails);
      await _plugin.show(id, title, body, details, payload: payload);
    } catch (e) {
      debugPrint('[NotificationService] show error: $e');
    }
  }

  void showJobCompleted(String jobTitle, String repoName) {
    show(
      id: jobTitle.hashCode & 0x7FFFFFFF,
      title: '✅ Job completed',
      body: '$jobTitle — $repoName',
      payload: 'job_completed',
    );
  }

  void showJobFailed(String jobTitle, String repoName) {
    show(
      id: (jobTitle.hashCode ^ 1) & 0x7FFFFFFF,
      title: '❌ Job failed',
      body: '$jobTitle — $repoName',
      payload: 'job_failed',
    );
  }

  void showPrOpened(String jobTitle, String repoName) {
    show(
      id: (jobTitle.hashCode ^ 2) & 0x7FFFFFFF,
      title: '🔀 PR opened',
      body: '$jobTitle — $repoName',
      payload: 'pr_opened',
    );
  }
}
