import CoreLocation
import Foundation
import UIKit

extension Notification.Name {
  static let visitMonitorDidChange = Notification.Name("team018.visitMonitorDidChange")
}

/// Owns the CLLocationManager used for visit monitoring. Monitoring is automatic: it is
/// registered whenever iOS reports authorizedAlways and stopped when it does not.
/// `activate()` runs at every app launch, including background relaunches the system performs
/// for location events, so CLVisit callbacks are persisted natively before JS runs.
final class VisitMonitor: NSObject, CLLocationManagerDelegate {
  static let shared = VisitMonitor()

  /// Persisted record that the user has asked for Always from each starting status. Used to
  /// tell "not asked yet" apart from "asked but not granted" in the UI.
  private static let requestedFromNotDeterminedKey = "team018.visitMonitoring.alwaysRequested.notDetermined"
  private static let requestedFromWhenInUseKey = "team018.visitMonitoring.alwaysRequested.whenInUse"
  /// Opt-in flag from the earlier manual Start/Stop flow. No longer used; removed on launch.
  private static let legacyOptInKey = "team018.visitMonitoring.optIn"

  private lazy var manager: CLLocationManager = {
    let m = CLLocationManager()
    m.delegate = self
    return m
  }()
  private var activated = false
  private var isMonitoring = false
  /// Set only by the legacy stopMonitoring() bridge method. Not persisted.
  private var pausedUntilRelaunch = false
  /// Starting statuses already requested from in this process, so repeated taps don't stack.
  private var requestedThisProcess = Set<Int32>()
  /// True between requestAlwaysAuthorization from notDetermined and the user's answer.
  private var requestPending = false
  private var lastError: String?

  // MARK: Lifecycle

  /// Call from application(_:didFinishLaunchingWithOptions:). Never requests permission,
  /// because this also runs when iOS relaunches the app in the background.
  func activate() {
    guard !activated else { return }
    activated = true
    UserDefaults.standard.removeObject(forKey: Self.legacyOptInKey)
    NotificationCenter.default.addObserver(
      self, selector: #selector(appDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification, object: nil
    )
    reconcile()
  }

  /// Re-reads authorization on foreground activation. Never requests permission: the only
  /// request path is an explicit user action (requestAlwaysFromUser).
  @objc private func appDidBecomeActive() {
    reconcile()
  }

  /// Legacy bridge method `startMonitoring`: same as the explicit request below.
  func start() {
    requestAlwaysFromUser()
  }

  /// Legacy bridge method `stopMonitoring`: stops visit monitoring until the next app launch
  /// or a start() call. The current UI no longer calls it.
  func stop() {
    pausedUntilRelaunch = true
    reconcile()
  }

  // MARK: Authorization

  /// Called only from an explicit user action (the onboarding primary button), and only
  /// while the app is in the foreground. Never called at launch, on background relaunch or on
  /// activation. Requests at most once per starting status per process.
  /// From notDetermined iOS shows its first prompt; from authorizedWhenInUse it may show the
  /// upgrade prompt, or nothing if it already used it. iOS decides whether and when prompts
  /// appear and, per Apple's documentation, reports provisional Always as authorizedAlways.
  /// The later confirmation step has no delegate callback.
  func requestAlwaysFromUser() {
    pausedUntilRelaunch = false
    lastError = nil
    let status = manager.authorizationStatus
    let key: String?
    switch status {
    case .notDetermined: key = Self.requestedFromNotDeterminedKey
    case .authorizedWhenInUse: key = Self.requestedFromWhenInUseKey
    default: key = nil
    }
    if let key = key, UIApplication.shared.applicationState == .active, !requestPending,
       !requestedThisProcess.contains(status.rawValue) {
      requestedThisProcess.insert(status.rawValue)
      UserDefaults.standard.set(true, forKey: key)
      requestPending = status == .notDetermined
      manager.requestAlwaysAuthorization()
    }
    reconcile()
  }

  private var hasRequestedAlways: Bool {
    let d = UserDefaults.standard
    return d.bool(forKey: Self.requestedFromNotDeterminedKey)
      || d.bool(forKey: Self.requestedFromWhenInUseKey)
  }

  // MARK: State

  func snapshot() -> [String: Any] {
    [
      "authorization": Self.describe(manager.authorizationStatus),
      // Kept for bridge compatibility; monitoring no longer needs an opt-in.
      "optedIn": !pausedUntilRelaunch,
      "monitoring": isMonitoring,
      "alwaysRequested": hasRequestedAlways,
      "requestPending": requestPending,
      "visitCount": VisitStore.shared.count(),
      "seedCount": VisitStore.shared.seedCount(),
      "lastError": lastError.map { $0 as Any } ?? NSNull(),
    ]
  }

  private static func describe(_ status: CLAuthorizationStatus) -> String {
    switch status {
    case .notDetermined: return "notDetermined"
    case .restricted: return "restricted"
    case .denied: return "denied"
    case .authorizedWhenInUse: return "whenInUse"
    case .authorizedAlways: return "always"
    @unknown default: return "unknown"
    }
  }

  /// Registers visit monitoring whenever iOS reports authorizedAlways (which may be
  /// provisional) and stops it otherwise. Visit monitoring is a system-level registration that
  /// can outlive the process, so it is stopped explicitly when authorization is lost, even if
  /// this process never started it.
  private func reconcile() {
    if manager.authorizationStatus == .authorizedAlways && !pausedUntilRelaunch {
      if !isMonitoring {
        manager.startMonitoringVisits()
        isMonitoring = true
      }
    } else {
      manager.stopMonitoringVisits()
      isMonitoring = false
    }
    notifyChange()
  }

  private func notifyChange() {
    NotificationCenter.default.post(name: .visitMonitorDidChange, object: nil)
  }

  // MARK: Visit date handling

  /// CLVisit uses NSDate.distantPast for an unknown arrival and NSDate.distantFuture for a
  /// departure that has not happened yet. Return nil for those (or any non-finite or
  /// implausible date) so they are never shown as real times.
  static func validEpoch(_ date: Date) -> Double? {
    if date == .distantPast || date == .distantFuture { return nil }
    let ref = date.timeIntervalSinceReferenceDate
    guard ref.isFinite, abs(ref) < 3.2e9 else { return nil } // roughly years 1900...2100
    return date.timeIntervalSince1970
  }

  // MARK: CLLocationManagerDelegate

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    if manager.authorizationStatus != .notDetermined { requestPending = false }
    reconcile()
  }

  func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) {
    let saved = VisitStore.shared.insert(
      latitude: visit.coordinate.latitude,
      longitude: visit.coordinate.longitude,
      horizontalAccuracy: visit.horizontalAccuracy,
      arrivalAt: Self.validEpoch(visit.arrivalDate),
      departureAt: Self.validEpoch(visit.departureDate),
      receivedAt: Date().timeIntervalSince1970
    )
    if !saved { lastError = "Failed to save a received visit." }
    notifyChange()
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    lastError = error.localizedDescription
    notifyChange()
  }
}
