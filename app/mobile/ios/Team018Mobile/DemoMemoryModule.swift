import Foundation
import React
import SQLite3

/// Read-only access to the bundled fixed demo memory.db (artifacts/memory.db, a synthetic
/// persona). Only the fixed queries below can run; no SQL text from JS or the model is ever
/// executed. Results come from the agent views (v_*) and never include coordinates or
/// place ids (which embed coordinates). The user's CLVisit database is not touched.
@objc(DemoMemoryModule)
final class DemoMemoryModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  private static let tags: Set<String> = ["집", "회사", "밥집", "커피", "운동", "쇼핑", "관광"]
  private let queue = DispatchQueue(label: "team018.demomemory")
  private var db: OpaquePointer?

  private func open() -> OpaquePointer? {
    if let db = db { return db }
    guard let path = Bundle.main.path(forResource: "haru-demo-memory", ofType: "db") else { return nil }
    var handle: OpaquePointer?
    guard sqlite3_open_v2(path, &handle, SQLITE_OPEN_READONLY, nil) == SQLITE_OK, let h = handle else {
      if let handle = handle { sqlite3_close(handle) }
      return nil
    }
    sqlite3_exec(h, "PRAGMA query_only = ON;", nil, nil, nil)
    db = h
    return h
  }

  private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

  /// Runs one of the fixed statements below with bound text parameters.
  private func rows(_ sql: String, _ params: [String], limit: Int = 200) -> [[String: Any]] {
    guard let db = open() else { return [] }
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return [] }
    defer { sqlite3_finalize(stmt) }
    for (i, p) in params.enumerated() { sqlite3_bind_text(stmt, Int32(i + 1), p, -1, Self.transient) }
    var out: [[String: Any]] = []
    while sqlite3_step(stmt) == SQLITE_ROW, out.count < limit {
      var row: [String: Any] = [:]
      for c in 0..<sqlite3_column_count(stmt) {
        let name = String(cString: sqlite3_column_name(stmt, c))
        switch sqlite3_column_type(stmt, c) {
        case SQLITE_INTEGER: row[name] = sqlite3_column_int64(stmt, c)
        case SQLITE_FLOAT: row[name] = sqlite3_column_double(stmt, c)
        case SQLITE_TEXT: row[name] = String(cString: sqlite3_column_text(stmt, c))
        default: row[name] = NSNull()
        }
      }
      out.append(row)
    }
    return out
  }

  private static func isDay(_ s: String?) -> Bool {
    guard let s = s, s.count == 10 else { return false }
    return s.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
  }

  private static func shortText(_ v: Any?, max: Int) -> String? {
    guard let s = (v as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
          !s.isEmpty, s.count <= max else { return nil }
    return s
  }

  private static func isId(_ s: String?, prefix: String) -> Bool {
    guard let s = s, s.hasPrefix(prefix), s.count <= 40 else { return false }
    return s.unicodeScalars.allSatisfy { ($0.isASCII && CharacterSet.alphanumerics.contains($0)) || $0 == "_" }
  }

  /// Fixed demo data range for the UI.
  @objc func getInfo(
    _ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      guard self.open() != nil else { resolve(["available": false]); return }
      var info = self.rows(
        "SELECT MIN(day) AS first_day, MAX(day) AS last_day, SUM(stay_count) AS stay_count FROM v_days;", []
      ).first ?? [:]
      info["trip_count"] = self.rows("SELECT COUNT(*) AS n FROM v_trips;", []).first?["n"] ?? 0
      info["available"] = true
      resolve(info)
    }
  }

  /// Executes one allowlisted tool. `name` must be a known tool; args are validated here.
  @objc func runTool(
    _ name: String, args: [String: Any], resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      guard self.open() != nil else { reject("demo", "demo_db_missing", nil); return }
      switch name {
      case "data_range":
        let r = self.rows(
          "SELECT MIN(day) AS first_day, MAX(day) AS last_day, SUM(stay_count) AS stay_count FROM v_days;", []
        )
        resolve(["result": r.first ?? [:]])
      case "trips_by_region":
        guard let region = Self.shortText(args["region"], max: 30) else {
          reject("demo", "invalid_region", nil); return
        }
        resolve(["result": self.rows(
          """
          SELECT id, name, start_date, end_date, nights, regions FROM v_trips
          WHERE regions LIKE '%' || ? || '%' ORDER BY start_date;
          """, [region], limit: 50)])
      case "day_summary":
        guard let day = args["day"] as? String, Self.isDay(day) else {
          reject("demo", "invalid_day", nil); return
        }
        let d = self.rows("SELECT day, stay_count, first_activity_at, summary FROM v_days WHERE day = ?;", [day])
        let stays = self.rows(
          """
          SELECT stay_id, start_at, minutes, place_name, tag, sigungu, dong FROM v_stay_places
          WHERE day = ? ORDER BY start_at;
          """, [day], limit: 50)
        let dayResult: Any = d.first.map { $0 as Any } ?? NSNull()
        let result: [String: Any] = ["day": dayResult, "stays": stays]
        resolve(["result": result])
      case "count_tag_stays":
        guard let tag = args["tag"] as? String, Self.tags.contains(tag),
              let from = args["from"] as? String, Self.isDay(from),
              let to = args["to"] as? String, Self.isDay(to)
        else { reject("demo", "invalid_args", nil); return }
        let r = self.rows(
          """
          SELECT COUNT(*) AS stays, COALESCE(SUM(minutes), 0) AS minutes, COUNT(DISTINCT day) AS days
          FROM v_stay_places WHERE tag = ? AND day BETWEEN ? AND ?;
          """, [tag, from, to])
        let sample = self.rows(
          """
          SELECT stay_id, day, start_at, minutes, place_name FROM v_stay_places
          WHERE tag = ? AND day BETWEEN ? AND ? ORDER BY start_at DESC;
          """, [tag, from, to], limit: 5)
        resolve(["result": ["summary": r.first ?? [:], "latest": sample]])
      default:
        reject("demo", "unknown_tool", nil)
      }
    }
  }

  /// Evidence card content, re-read locally from the card ref. Unknown refs resolve to null.
  @objc func getCard(
    _ type: String, id: String, resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      var row: [String: Any]?
      switch type {
      case "trip" where Self.isId(id, prefix: "t_"):
        row = self.rows("SELECT id, name, start_date, end_date, nights, regions FROM v_trips WHERE id = ?;", [id]).first
      case "day" where Self.isDay(id):
        row = self.rows("SELECT day, stay_count, first_activity_at, summary FROM v_days WHERE day = ?;", [id]).first
      case "stay" where Self.isId(id, prefix: "s_"):
        row = self.rows(
          "SELECT stay_id, day, start_at, minutes, place_name, tag, sigungu FROM v_stay_places WHERE stay_id = ?;",
          [id]
        ).first
      default:
        row = nil
      }
      let result: Any = row.map { $0 as Any } ?? NSNull()
      resolve(result)
    }
  }
}
