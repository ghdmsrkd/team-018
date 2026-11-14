import Foundation
import React
import UIKit

/// JS bridge for VisitMonitor / VisitStore. JS only reads what native already persisted.
@objc(VisitMonitorModule)
final class VisitMonitorModule: RCTEventEmitter {
  private var observer: NSObjectProtocol?

  override static func requiresMainQueueSetup() -> Bool { true }

  override func supportedEvents() -> [String]! { ["visitMonitorChanged"] }

  override func startObserving() {
    observer = NotificationCenter.default.addObserver(
      forName: .visitMonitorDidChange, object: nil, queue: .main
    ) { [weak self] _ in
      self?.sendEvent(withName: "visitMonitorChanged", body: nil)
    }
  }

  override func stopObserving() {
    if let observer = observer { NotificationCenter.default.removeObserver(observer) }
    observer = nil
  }

  @objc func getState(
    _ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { resolve(VisitMonitor.shared.snapshot()) }
  }

  @objc func getVisits(
    _ limit: NSNumber, resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(VisitStore.shared.fetch(limit: limit.intValue).map(Self.visitDict))
  }

  /// All visits that can overlap [fromMs, toMs), without a row limit. Open rows (no
  /// departure) only when they start at or after min(fromMs, openSinceMs). Epoch ms in/out.
  @objc func getVisitsInRange(
    _ fromMs: NSNumber, toMs: NSNumber, openSinceMs: NSNumber,
    resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      let rows = VisitStore.shared.fetchRange(
        from: fromMs.doubleValue / 1000, to: toMs.doubleValue / 1000,
        openSince: openSinceMs.doubleValue / 1000
      )
      resolve(rows.map(Self.visitDict))
    }
  }

  private static func visitDict(_ v: StoredVisit) -> [String: Any] {
      [
        "id": v.id,
        "latitude": v.latitude,
        "longitude": v.longitude,
        "horizontalAccuracy": v.horizontalAccuracy,
        "arrivalAt": v.arrivalAt.map { $0 * 1000 as Any } ?? NSNull(),
        "departureAt": v.departureAt.map { $0 * 1000 as Any } ?? NSNull(),
        "receivedAt": v.receivedAt * 1000,
        "tag": v.tag.map { t -> Any in
          [
            "id": t.tagId,
            "name": t.tagName,
            "source": t.source.rawValue,
            "matchDistance": t.matchDistance.map { $0 as Any } ?? NSNull(),
          ]
        } ?? NSNull(),
      ]
  }

  // MARK: Place tags

  private static func tagDict(_ t: PlaceTag) -> [String: Any] {
    ["id": t.id, "name": t.name, "isPreset": t.isPreset]
  }

  /// Runs a store operation, then tells JS to refresh.
  private func perform(
    _ resolve: @escaping RCTPromiseResolveBlock, _ reject: @escaping RCTPromiseRejectBlock,
    _ work: @escaping () throws -> Any?
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let result = try work()
        resolve(result ?? NSNull())
        NotificationCenter.default.post(name: .visitMonitorDidChange, object: nil)
      } catch {
        reject("visit_tags", error.localizedDescription, error)
      }
    }
  }

  @objc func getTags(
    _ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        resolve(try VisitStore.shared.tags().map(Self.tagDict))
      } catch {
        reject("visit_tags", error.localizedDescription, error)
      }
    }
  }

  @objc func createTag(
    _ name: String, resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    perform(resolve, reject) { Self.tagDict(try VisitStore.shared.createTag(name: name)) }
  }

  @objc func renameTag(
    _ tagId: NSNumber, name: String, resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    perform(resolve, reject) {
      Self.tagDict(try VisitStore.shared.renameTag(id: tagId.int64Value, name: name))
    }
  }

  @objc func setVisitTag(
    _ visitId: NSNumber, tagId: NSNumber, resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    perform(resolve, reject) {
      try VisitStore.shared.setVisitTag(visitId: visitId.int64Value, tagId: tagId.int64Value)
      return nil
    }
  }

  @objc func clearVisitTag(
    _ visitId: NSNumber, resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    perform(resolve, reject) {
      try VisitStore.shared.clearVisitTag(visitId: visitId.int64Value)
      return nil
    }
  }

  @objc func startMonitoring(
    _ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      VisitMonitor.shared.start()
      resolve(VisitMonitor.shared.snapshot())
    }
  }

  /// Explicit user action only (onboarding primary button).
  @objc func requestAlwaysAuthorization(
    _ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      VisitMonitor.shared.requestAlwaysFromUser()
      resolve(VisitMonitor.shared.snapshot())
    }
  }

  @objc func stopMonitoring(
    _ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      VisitMonitor.shared.stop()
      resolve(VisitMonitor.shared.snapshot())
    }
  }

  /// Lambda Function URL injected at build time into Info.plist (HaruApiUrl) from an
  /// untracked env file by ios/scripts/inject-api-url.sh. null when not configured.
  @objc func getApiConfig(
    _ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let raw = Bundle.main.object(forInfoDictionaryKey: "HaruApiUrl") as? String
    let url = raw.flatMap { s -> String? in
      let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
      guard t.hasPrefix("https://"), URL(string: t)?.host != nil else { return nil }
      return t
    }
    resolve(["apiUrl": url.map { $0 as Any } ?? NSNull()])
  }

  /// The key window's real safe-area insets (Dynamic Island / status bar, home indicator).
  /// Used by JS for fixed, non-scrolling content such as the onboarding button footer.
  @objc func getSafeAreaInsets(
    _ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      let windows = UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap { $0.windows }
      let insets = (windows.first { $0.isKeyWindow } ?? windows.first)?.safeAreaInsets ?? .zero
      resolve([
        "top": insets.top, "bottom": insets.bottom, "left": insets.left, "right": insets.right,
      ])
    }
  }

  @objc func openSettings(
    _ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      if let url = URL(string: UIApplication.openSettingsURLString) {
        UIApplication.shared.open(url)
      }
      resolve(nil)
    }
  }
}
