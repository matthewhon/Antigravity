import Foundation
import Capacitor
import PushKit
import CallKit
import AVFoundation

@objc(VoipPushPlugin)
public class VoipPushPlugin: CAPPlugin, CAPBridgedPlugin, PKPushRegistryDelegate, CXProviderDelegate {
    public let identifier = "VoipPushPlugin"
    public let jsName = "VoipPush"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise)
    ]

    private var pushRegistry: PKPushRegistry?
    private var provider: CXProvider?
    private let callController = CXCallController()
    private var activeCallUUID: UUID?

    override public func load() {
        let config = CXProviderConfiguration(localizedName: "Pastoral Care")
        config.supportsVideo = false
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.phoneNumber]
        let cxProvider = CXProvider(configuration: config)
        cxProvider.setDelegate(self, queue: nil)
        self.provider = cxProvider
    }

    @objc func register(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let registry = PKPushRegistry(queue: DispatchQueue.main)
            registry.delegate = self
            registry.desiredPushTypes = [.voIP]
            self.pushRegistry = registry
            call.resolve(["registered": true])
        }
    }

    @objc func endCall(_ call: CAPPluginCall) {
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

    // MARK: - PKPushRegistryDelegate

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

    // MARK: - CXProviderDelegate

    public func providerDidReset(_ provider: CXProvider) {
        activeCallUUID = nil
    }

    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker])
        try? session.setActive(true)
        notifyListeners("callAnswered", data: [:])
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        activeCallUUID = nil
        notifyListeners("callEnded", data: [:])
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        notifyListeners("callMuted", data: ["muted": action.isMuted])
        action.fulfill()
    }
}
