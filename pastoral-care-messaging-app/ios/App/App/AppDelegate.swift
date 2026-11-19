import UIKit
import Capacitor
import UserNotifications
import PushKit
import CallKit
import AVFoundation

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

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
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

@objc(VoipPushPlugin)
public class VoipPushPlugin: CAPPlugin, CAPBridgedPlugin, PKPushRegistryDelegate, CXProviderDelegate {
    public let identifier = "VoipPushPlugin"
    public let jsName = "VoipPush"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureAudioSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSpeakerphone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise)
    ]

    private var pushRegistry: PKPushRegistry?
    private var provider: CXProvider?
    private let callController = CXCallController()
    private var activeCallUUID: UUID?
    private var isSpeakerEnabled = false
    private var isAudioSessionActive = false
    private var routeChangeObserver: NSObjectProtocol?
    private var pendingCallAction: String?
    private var pendingCallActionAt: Date?

    override public func load() {
        let config = CXProviderConfiguration(localizedName: "Pastoral Care")
        config.supportsVideo = false
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.phoneNumber]
        let cxProvider = CXProvider(configuration: config)
        cxProvider.setDelegate(self, queue: nil)
        self.provider = cxProvider

        routeChangeObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] notification in
            guard let self = self, self.isAudioSessionActive else { return }
            guard let reasonValue = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue),
                  reason == .categoryChange || reason == .override else {
                return
            }
            let session = AVAudioSession.sharedInstance()
            let wantsSpeaker = self.isSpeakerEnabled
            let hasSpeakerOption = session.categoryOptions.contains(.defaultToSpeaker)
            let isOutputSpeaker = session.currentRoute.outputs.contains { $0.portType == .builtInSpeaker }
            let hasExternalOutput = session.currentRoute.outputs.contains {
                $0.portType != .builtInReceiver && $0.portType != .builtInSpeaker
            }
            if session.category != .playAndRecord ||
                session.mode != .voiceChat ||
                hasSpeakerOption != wantsSpeaker ||
                (wantsSpeaker && !hasExternalOutput && !isOutputSpeaker) {
                try? self.applyAudioRoute(speaker: wantsSpeaker)
            }
        }
    }

    deinit {
        if let observer = routeChangeObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    private func applyAudioRoute(speaker: Bool) throws {
        let session = AVAudioSession.sharedInstance()
        let options: AVAudioSession.CategoryOptions = speaker
            ? [.allowBluetooth, .defaultToSpeaker]
            : [.allowBluetooth]
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: options)
        try session.setActive(true)
        try session.overrideOutputAudioPort(speaker ? .speaker : .none)
    }

    @objc func register(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.pushRegistry == nil {
                let registry = PKPushRegistry(queue: DispatchQueue.main)
                registry.delegate = self
                registry.desiredPushTypes = [.voIP]
                self.pushRegistry = registry
            }
            var pending: String? = nil
            if let action = self.pendingCallAction, let at = self.pendingCallActionAt,
               Date().timeIntervalSince(at) < 15 {
                pending = action
            }
            self.pendingCallAction = nil
            self.pendingCallActionAt = nil
            var result: [String: Any] = ["registered": true]
            if let pending = pending {
                result["pendingAction"] = pending
            }
            call.resolve(result)
        }
    }

    @objc func configureAudioSession(_ call: CAPPluginCall) {
        let session = AVAudioSession.sharedInstance()
        session.requestRecordPermission { granted in
            DispatchQueue.main.async {
                if !granted {
                    call.reject("Microphone permission is required for voice calls.")
                    return
                }
                do {
                    self.isSpeakerEnabled = false
                    self.isAudioSessionActive = true
                    try self.applyAudioRoute(speaker: false)
                    call.resolve(["granted": true])
                } catch {
                    call.reject("Failed to configure audio session: \(error.localizedDescription)")
                }
            }
        }
    }

    @objc func setSpeakerphone(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async {
            do {
                self.isSpeakerEnabled = enabled
                self.isAudioSessionActive = true
                try self.applyAudioRoute(speaker: enabled)
                call.resolve(["speaker": enabled])
            } catch {
                call.reject("Failed to switch audio route: \(error.localizedDescription)")
            }
        }
    }

    @objc func endCall(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.isSpeakerEnabled = false
            self.isAudioSessionActive = false
            let session = AVAudioSession.sharedInstance()
            try? session.overrideOutputAudioPort(.none)
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
        }
        guard let uuid = activeCallUUID else {
            call.resolve()
            return
        }
        let action = CXEndCallAction(call: uuid)
        let transaction = CXTransaction(action: action)
        callController.request(transaction) { error in
            if let error = error {
                call.reject("Failed to end CallKit call: \(error.localizedDescription)")
            } else {
                self.activeCallUUID = nil
                call.resolve()
            }
        }
    }

    public func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        notifyListeners("voipToken", data: ["token": token])
    }

    public func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        guard type == .voIP else {
            completion()
            return
        }
        let dict = payload.dictionaryPayload
        let callSid = dict["callSid"] as? String ?? UUID().uuidString
        let fromPhone = dict["from"] as? String ?? "Unknown"
        let callerName = dict["callerName"] as? String ?? fromPhone

        let uuid = UUID()
        activeCallUUID = uuid

        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .phoneNumber, value: fromPhone)
        update.localizedCallerName = callerName
        update.hasVideo = false

        provider?.reportNewIncomingCall(with: uuid, update: update) { error in
            if error == nil {
                self.notifyListeners("incomingCall", data: [
                    "callSid": callSid,
                    "from": fromPhone,
                    "callerName": callerName
                ])
            }
            completion()
        }
    }

    public func providerDidReset(_ provider: CXProvider) {
        activeCallUUID = nil
    }

    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        self.isSpeakerEnabled = false
        self.isAudioSessionActive = true
        try? self.applyAudioRoute(speaker: false)
        self.pendingCallAction = "answered"
        self.pendingCallActionAt = Date()
        notifyListeners("callAnswered", data: [:])
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        self.isSpeakerEnabled = false
        self.isAudioSessionActive = false
        let session = AVAudioSession.sharedInstance()
        try? session.overrideOutputAudioPort(.none)
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
        activeCallUUID = nil
        self.pendingCallAction = "ended"
        self.pendingCallActionAt = Date()
        notifyListeners("callEnded", data: [:])
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        notifyListeners("callMuted", data: ["muted": action.isMuted])
        action.fulfill()
    }
}

@objc(MainBridgeViewController)
class MainBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(CelebrationNotificationsPlugin())
        bridge?.registerPluginInstance(VoipPushPlugin())
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
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

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        if let urlContext = connectionOptions.urlContexts.first {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: urlContext.url, options: [:])
        }
        if let userActivity = connectionOptions.userActivities.first {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: [:])
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
}
