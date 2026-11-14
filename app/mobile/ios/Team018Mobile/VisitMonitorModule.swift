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
        "googlePlaceId": v.googlePlaceId.map { $0 as Any } ?? NSNull(),
        "seed": v.seed != nil,
        "placeName": v.seed.map { $0.placeName as Any } ?? NSNull(),
        "placeCategory": v.seed?.placeCategory.map { $0 as Any } ?? NSNull(),
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

  @objc func setVisitPlace(
    _ visitId: NSNumber, placeId: String, resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    perform(resolve, reject) {
      try VisitStore.shared.setVisitPlace(visitId: visitId.int64Value, placeId: placeId)
      return nil
    }
  }

  @objc func clearVisitPlace(
    _ visitId: NSNumber, resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    perform(resolve, reject) {
      try VisitStore.shared.clearVisitPlace(visitId: visitId.int64Value)
      return nil
    }
  }

  /// Explicit user action only. Each row: key, placeName, placeCategory?, latitude, longitude,
  /// horizontalAccuracy, arrivalAt (ms), departureAt (ms | null), tagName?. Idempotent by key.
  @objc func seedTestVisits(
    _ rows: [[String: Any]], resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    perform(resolve, reject) {
      let seeds = try rows.map { r -> SeedVisit in
        guard let key = r["key"] as? String, let name = r["placeName"] as? String,
              let lat = (r["latitude"] as? NSNumber)?.doubleValue,
              let lng = (r["longitude"] as? NSNumber)?.doubleValue,
              let acc = (r["horizontalAccuracy"] as? NSNumber)?.doubleValue,
              let arrival = (r["arrivalAt"] as? NSNumber)?.doubleValue
        else { throw VisitStoreError.invalidName }
        return SeedVisit(
          key: key, placeName: name, placeCategory: r["placeCategory"] as? String,
          latitude: lat, longitude: lng, horizontalAccuracy: acc,
          arrivalAt: arrival / 1000,
          departureAt: (r["departureAt"] as? NSNumber).map { $0.doubleValue / 1000 },
          tagName: r["tagName"] as? String
        )
      }
      return try VisitStore.shared.insertSeeds(seeds)
    }
  }

  @objc func deleteTestVisits(
    _ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    perform(resolve, reject) { try VisitStore.shared.deleteSeeds() }
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
    resolve([
      "apiUrl": url.map { $0 as Any } ?? NSNull(),
      // Only whether the test key exists; the key itself never reaches JS.
      "testKakaoDirect": Self.testKakaoKey != nil,
    ])
  }

  // MARK: Test-only direct Kakao search (seed visits only)

  private static var testKakaoKey: String? {
    guard let k = Bundle.main.object(forInfoDictionaryKey: "HaruTestKakaoRestKey") as? String
    else { return nil }
    let t = k.trimmingCharacters(in: .whitespacesAndNewlines)
    return t.isEmpty ? nil : t
  }

  /// Same fixed category set and merge rules as backend/lambda/index.mjs kakaoNearby.
  private static let kakaoCategories = ["FD6", "CE7", "CS2", "MT1", "CT1", "AT4", "AD5"]

  private static func haversine(_ a: (Double, Double), _ b: (Double, Double)) -> Double {
    let r = 6_371_000.0, rad = Double.pi / 180
    let dLat = (b.0 - a.0) * rad, dLng = (b.1 - a.1) * rad
    let s = pow(sin(dLat / 2), 2) + cos(a.0 * rad) * cos(b.0 * rad) * pow(sin(dLng / 2), 2)
    return 2 * r * asin(min(1, sqrt(s)))
  }

  /// Looks up the visit's coordinates natively and refuses anything that is not a stored
  /// test seed row, so real visits can never be sent to Kakao from the device. Called only
  /// from the search button. Response matches PlacesNearbyResponse (provider kakao).
  @objc func kakaoTestNearby(
    _ visitId: NSNumber, resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let key = Self.testKakaoKey else {
      reject("places", "direct_kakao_not_enabled", nil); return
    }
    guard let c = VisitStore.shared.seedCoordinate(visitId: visitId.int64Value) else {
      reject("places", "not_a_seed_visit", nil); return
    }
    guard VisitPlaceMatcher.isUsable(latitude: c.latitude, longitude: c.longitude, horizontalAccuracy: c.accuracy),
          c.accuracy <= 5000
    else { reject("places", "invalid_coordinates", nil); return }
    let radiusMeters = min(300, max(50, c.accuracy))
    let radius = Int(radiusMeters.rounded())
    let group = DispatchGroup()
    let lock = NSLock()
    var docs: [[String: Any]] = []
    var failed = 0
    var firstStatus: Int?
    let session = URLSession(configuration: .ephemeral)
    for code in Self.kakaoCategories {
      var comps = URLComponents(string: "https://dapi.kakao.com/v2/local/search/category.json")!
      comps.queryItems = [
        .init(name: "category_group_code", value: code),
        .init(name: "x", value: String(c.longitude)),
        .init(name: "y", value: String(c.latitude)),
        .init(name: "radius", value: String(radius)),
        .init(name: "sort", value: "distance"),
        .init(name: "size", value: "15"),
      ]
      var req = URLRequest(url: comps.url!, timeoutInterval: 8)
      req.setValue("KakaoAK \(key)", forHTTPHeaderField: "Authorization")
      group.enter()
      session.dataTask(with: req) { data, response, _ in
        defer { group.leave() }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        lock.lock(); defer { lock.unlock() }
        if status == 200, let list = json?["documents"] as? [[String: Any]] {
          docs.append(contentsOf: list)
        } else {
          failed += 1
          if firstStatus == nil { firstStatus = status }
        }
      }.resume()
    }
    group.notify(queue: .global(qos: .userInitiated)) {
      session.finishTasksAndInvalidate()
      if failed == Self.kakaoCategories.count {
        // Status only; no coordinates, key or bodies are logged or returned.
        reject("places", "upstream_\(firstStatus ?? 0)", nil)
        return
      }
      var seen = Set<String>()
      let places = docs.compactMap { d -> [String: Any]? in
        guard let id = d["id"] as? String, !id.isEmpty,
              let la = Double(d["y"] as? String ?? ""), let lo = Double(d["x"] as? String ?? "")
        else { return nil }
        let road = d["road_address_name"] as? String
        let addr = (road?.isEmpty == false ? road : d["address_name"] as? String) ?? ""
        return [
          "id": id, "provider": "kakao", "name": d["place_name"] as? String ?? "",
          "address": addr.isEmpty ? NSNull() : addr, "lat": la, "lng": lo,
          "distanceMeters": Int(Self.haversine((c.latitude, c.longitude), (la, lo)).rounded()),
        ]
      }
      .sorted { ($0["distanceMeters"] as! Int) < ($1["distanceMeters"] as! Int) }
      .filter { seen.insert($0["id"] as! String).inserted }
      var out: [String: Any] = [
        "places": Array(places.prefix(10)), "radiusMeters": radiusMeters,
        "provider": "kakao", "source": "kakao_local",
      ]
      if failed > 0 { out["incomplete"] = true }
      resolve(out)
    }
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
