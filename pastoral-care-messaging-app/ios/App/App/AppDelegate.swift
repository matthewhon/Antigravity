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

/// Coordinates PushKit (`PKPushRegistry`) and CallKit (`CXProvider`) from app launch
/// so terminated-state VoIP pushes always report to CallKit before JS finishes booting.
final class VoipPushCoordinator: NSObject, PKPushRegistryDelegate, CXProviderDelegate {
    static let shared = VoipPushCoordinator()

    private var pushRegistry: PKPushRegistry?
    private let provider: CXProvider
    private let callController = CXCallController()
    private var activeCallUUID: UUID?
    private var isSpeakerEnabled = false
    private var isAudioSessionActive = false
    private var isApplyingAudioRoute = false
    private var routeChangeObserver: NSObjectProtocol?
    private var pendingCallAction: String?
    private var pendingCallActionAt: Date?
    private var cachedVoipToken: String?
    weak var plugin: VoipPushPlugin?

    private override init() {
        let config = CXProviderConfiguration(localizedName: "Pastoral Care")
        config.supportsVideo = false
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.phoneNumber]
        self.provider = CXProvider(configuration: config)
        super.init()
        self.provider.setDelegate(self, queue: .main)

        routeChangeObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] notification in
            guard let self = self, self.isAudioSessionActive, !self.isApplyingAudioRoute else { return }
            guard let reasonValue = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue),
                  reason == .categoryChange || reason == .override else {
                return
            }
            let session = AVAudioSession.sharedInstance()
            let wantsSpeaker = self.isSpeakerEnabled
            let expectedMode: AVAudioSession.Mode = wantsSpeaker ? .videoChat : .voiceChat
            let hasSpeakerOption = session.categoryOptions.contains(.defaultToSpeaker)
            let isOutputSpeaker = session.currentRoute.outputs.contains { $0.portType == .builtInSpeaker }
            let hasExternalOutput = session.currentRoute.outputs.contains {
                $0.portType != .builtInReceiver && $0.portType != .builtInSpeaker
            }
            if session.category != .playAndRecord ||
                session.mode != expectedMode ||
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

    func startRegistryIfNeeded() {
        DispatchQueue.main.async {
            if self.pushRegistry == nil {
                let registry = PKPushRegistry(queue: DispatchQueue.main)
                registry.delegate = self
                registry.desiredPushTypes = [.voIP]
                self.pushRegistry = registry
            }
        }
    }

    func consumeRegistrationState() -> (pendingAction: String?, cachedToken: String?) {
        var pending: String? = nil
        if let action = pendingCallAction, let at = pendingCallActionAt,
           Date().timeIntervalSince(at) < 15 {
            pending = action
        }
        pendingCallAction = nil
        pendingCallActionAt = nil
        return (pending, cachedVoipToken)
    }

    func applyAudioRoute(speaker: Bool) throws {
        isApplyingAudioRoute = true
        defer { isApplyingAudioRoute = false }
        let session = AVAudioSession.sharedInstance()
        let expectedMode: AVAudioSession.Mode = speaker ? .videoChat : .voiceChat
        let options: AVAudioSession.CategoryOptions = speaker
            ? [.allowBluetooth, .defaultToSpeaker]
            : [.allowBluetooth]
        if session.category != .playAndRecord || session.mode != expectedMode || session.categoryOptions != options {
            try session.setCategory(.playAndRecord, mode: expectedMode, options: options)
        }
        try session.setActive(true)
        try session.overrideOutputAudioPort(speaker ? .speaker : .none)
    }

    func configureAudioSession(completion: @escaping (Result<Void, Error>) -> Void) {
        let session = AVAudioSession.sharedInstance()
        session.requestRecordPermission { granted in
            DispatchQueue.main.async {
                if !granted {
                    completion(.failure(NSError(domain: "VoipPush", code: 1, userInfo: [
                        NSLocalizedDescriptionKey: "Microphone permission is required for voice calls."
                    ])))
                    return
                }
                do {
                    self.isSpeakerEnabled = false
                    self.isAudioSessionActive = true
                    try self.applyAudioRoute(speaker: false)
                    completion(.success(()))
                } catch {
                    completion(.failure(error))
                }
            }
        }
    }

    func setSpeakerphone(_ enabled: Bool, completion: @escaping (Result<Void, Error>) -> Void) {
        DispatchQueue.main.async {
            do {
                self.isSpeakerEnabled = enabled
                self.isAudioSessionActive = true
                try self.applyAudioRoute(speaker: enabled)
                completion(.success(()))
            } catch {
                completion(.failure(error))
            }
        }
    }

    func endCall(completion: @escaping (Error?) -> Void) {
        DispatchQueue.main.async {
            self.isSpeakerEnabled = false
            self.isAudioSessionActive = false
            let session = AVAudioSession.sharedInstance()
            try? session.overrideOutputAudioPort(.none)
            try? session.setActive(false, options: .notifyOthersOnDeactivation)

            guard let uuid = self.activeCallUUID else {
                completion(nil)
                return
            }
            let action = CXEndCallAction(call: uuid)
            let transaction = CXTransaction(action: action)
            self.callController.request(transaction) { error in
                DispatchQueue.main.async {
                    if error == nil {
                        self.activeCallUUID = nil
                    }
                    completion(error)
                }
            }
        }
    }

    func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        cachedVoipToken = token
        plugin?.emitEvent("voipToken", data: ["token": token])
    }

    func pushRegistry(
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
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .phoneNumber, value: fromPhone)
        update.localizedCallerName = callerName
        update.hasVideo = false

        provider.reportNewIncomingCall(with: uuid, update: update) { error in
            DispatchQueue.main.async {
                if error == nil {
                    self.activeCallUUID = uuid
                    self.plugin?.emitEvent("incomingCall", data: [
                        "callSid": callSid,
                        "from": fromPhone,
                        "callerName": callerName
                    ])
                }
                completion()
            }
        }
    }

    func providerDidReset(_ provider: CXProvider) {
        DispatchQueue.main.async {
            self.activeCallUUID = nil
            self.isSpeakerEnabled = false
            self.isAudioSessionActive = false
        }
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        isSpeakerEnabled = false
        isAudioSessionActive = true
        try? applyAudioRoute(speaker: false)
        pendingCallAction = "answered"
        pendingCallActionAt = Date()
        plugin?.emitEvent("callAnswered", data: [:])
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        isSpeakerEnabled = false
        isAudioSessionActive = false
        let session = AVAudioSession.sharedInstance()
        try? session.overrideOutputAudioPort(.none)
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
        activeCallUUID = nil
        pendingCallAction = "ended"
        pendingCallActionAt = Date()
        plugin?.emitEvent("callEnded", data: [:])
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        plugin?.emitEvent("callMuted", data: ["muted": action.isMuted])
        action.fulfill()
    }
}

@objc(VoipPushPlugin)
public class VoipPushPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VoipPushPlugin"
    public let jsName = "VoipPush"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureAudioSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSpeakerphone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        VoipPushCoordinator.shared.plugin = self
    }

    func emitEvent(_ eventName: String, data: [String: Any]) {
        notifyListeners(eventName, data: data)
    }

    @objc func register(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            VoipPushCoordinator.shared.plugin = self
            VoipPushCoordinator.shared.startRegistryIfNeeded()
            let state = VoipPushCoordinator.shared.consumeRegistrationState()
            var result: [String: Any] = ["registered": true]
            if let pending = state.pendingAction {
                result["pendingAction"] = pending
            }
            call.resolve(result)
            if let token = state.cachedToken {
                self.notifyListeners("voipToken", data: ["token": token])
            }
        }
    }

    @objc func configureAudioSession(_ call: CAPPluginCall) {
        VoipPushCoordinator.shared.configureAudioSession { result in
            switch result {
            case .success:
                call.resolve(["granted": true])
            case .failure(let error):
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func setSpeakerphone(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        VoipPushCoordinator.shared.setSpeakerphone(enabled) { result in
            switch result {
            case .success:
                call.resolve(["speaker": enabled])
            case .failure(let error):
                call.reject("Failed to switch audio route: \(error.localizedDescription)")
            }
        }
    }

    @objc func endCall(_ call: CAPPluginCall) {
        VoipPushCoordinator.shared.endCall { error in
            if let error = error {
                call.reject("Failed to end CallKit call: \(error.localizedDescription)")
            } else {
                call.resolve()
            }
        }
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
        VoipPushCoordinator.shared.startRegistryIfNeeded()
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
