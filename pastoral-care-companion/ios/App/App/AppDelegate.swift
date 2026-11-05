import UIKit
import Capacitor
import UserNotifications

@objc(CelebrationNotificationsPlugin)
public class CelebrationNotificationsPlugin: CAPPlugin, CAPBridgedPlugin, NotificationHandlerProtocol {
    public let identifier = "CelebrationNotificationsPlugin"
    public let jsName = "CelebrationNotifications"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelAll", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        bridge?.notificationRouter.localNotificationHandler = self
    }

    @objc func requestPermissions(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["granted": granted])
        }
    }

    @objc func scheduleNotifications(_ call: CAPPluginCall) {
        guard let items = call.getArray("notifications", JSObject.self) else {
            call.resolve()
            return
        }

        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { existing in
            let oldIds = existing
                .map { $0.identifier }
                .filter { $0.hasPrefix("pc_celebration_") }
            if !oldIds.isEmpty {
                center.removePendingNotificationRequests(withIdentifiers: oldIds)
            }

            for item in items {
                guard let title = item["title"] as? String,
                      let body = item["body"] as? String,
                      let dateKey = item["dateKey"] as? String,
                      let triggerAtMs = item["triggerAtMs"] as? Double else {
                    continue
                }

                let triggerDate = Date(timeIntervalSince1970: triggerAtMs / 1000.0)
                if triggerDate <= Date() {
                    continue
                }

                let content = UNMutableNotificationContent()
                content.title = title
                content.body = body
                content.sound = .default
                content.userInfo = [
                    "celebrationDateKey": dateKey,
                    "type": "celebrations"
                ]

                let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: triggerDate)
                let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
                let req = UNNotificationRequest(
                    identifier: "pc_celebration_\(dateKey)",
                    content: content,
                    trigger: trigger
                )
                center.add(req, withCompletionHandler: nil)
            }

            call.resolve()
        }
    }

    @objc func cancelAll(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { existing in
            let oldIds = existing
                .map { $0.identifier }
                .filter { $0.hasPrefix("pc_celebration_") }
            if !oldIds.isEmpty {
                center.removePendingNotificationRequests(withIdentifiers: oldIds)
            }
            call.resolve()
        }
    }

    public func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        let userInfo = notification.request.content.userInfo
        let dateKey = userInfo["celebrationDateKey"] as? String ?? ""
        self.notifyListeners("celebrationNotificationReceived", data: [
            "title": notification.request.content.title,
            "body": notification.request.content.body,
            "dateKey": dateKey
        ])
        if #available(iOS 14.0, *) {
            return [.banner, .list, .sound]
        } else {
            return [.alert, .sound]
        }
    }

    public func didReceive(response: UNNotificationResponse) {
        let userInfo = response.notification.request.content.userInfo
        let dateKey = userInfo["celebrationDateKey"] as? String ?? ""
        self.notifyListeners("celebrationNotificationTapped", data: [
            "dateKey": dateKey
        ], retainUntilConsumed: true)
    }
}

@objc(MainBridgeViewController)
class MainBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(CelebrationNotificationsPlugin())
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
