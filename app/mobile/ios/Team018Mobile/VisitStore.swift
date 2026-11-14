import Foundation
import SQLite3

/// One persisted CLVisit callback. Dates are Unix seconds, nil when Core Location
/// reported its "unknown" sentinel (distantPast arrival / distantFuture departure).
struct StoredVisit {
  let id: Int64
  let latitude: Double
  let longitude: Double
  let horizontalAccuracy: Double
  let arrivalAt: Double?
  let departureAt: Double?
  let receivedAt: Double
  let tag: VisitTagAssignment?
}

enum TagSource: String {
  case manual
  case auto
}

struct VisitTagAssignment {
  let tagId: Int64
  let tagName: String
  let source: TagSource
  /// Distance to the matched manual place, for automatic assignments only.
  let matchDistance: Double?
}

struct PlaceTag {
  let id: Int64
  let name: String
  let isPreset: Bool
}

enum VisitStoreError: Error, LocalizedError {
  case unavailable
  case invalidName
  case duplicateName
  case notFound
  case presetNotRenamable
  case sqlite(String)

  var errorDescription: String? {
    switch self {
    case .unavailable: return "The visit database is not available."
    case .invalidName: return "A tag name must be 1 to \(VisitStore.maxTagNameLength) characters."
    case .duplicateName: return "A tag with this name already exists."
    case .notFound: return "The visit or tag was not found."
    case .presetNotRenamable: return "Preset tags cannot be renamed."
    case .sqlite(let message): return message
    }
  }
}

/// SQLite store. Visits are written natively from the CLLocationManager delegate so a visit
/// is saved even when the JS runtime is not running (e.g. location relaunch).
///
/// Schema versions (PRAGMA user_version):
/// - 0: `visits` only (original schema, never altered).
/// - 1: adds `tags` (with Korean place presets) and `visit_tags`. Additive only.
final class VisitStore {
  static let shared = VisitStore(path: nil)
  static let schemaVersion: Int32 = 1
  static let maxTagNameLength = 30

  /// Place-only presets. Inserted with INSERT OR IGNORE, so existing rows are never touched.
  static let presetTagNames = [
    "집", "회사", "학교", "카페", "식당", "미용실", "병원", "약국", "헬스장", "마트",
    "편의점", "은행", "공원", "도서관", "교회", "친구 집", "부모님 댁", "주유소", "영화관",
    "백화점", "서점", "호텔", "공항", "기차역", "버스터미널",
  ]

  private let queue = DispatchQueue(label: "team018.visitstore")
  private let explicitPath: String?
  private var db: OpaquePointer?

  /// `path` is for tests; nil uses Application Support/VisitStore/visits.sqlite.
  init(path: String?) {
    explicitPath = path
  }

  // MARK: Opening and migration

  private func defaultPath() -> String? {
    let fm = FileManager.default
    guard let base = try? fm.url(
      for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
    ) else { return nil }
    let dir = base.appendingPathComponent("VisitStore", isDirectory: true)
    try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
    #if os(iOS)
    // Readable after first unlock so background relaunches can write while the device is locked.
    try? fm.setAttributes(
      [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
      ofItemAtPath: dir.path
    )
    #endif
    return dir.appendingPathComponent("visits.sqlite").path
  }

  private func openIfNeeded() -> OpaquePointer? {
    if let db = db { return db }
    guard let path = explicitPath ?? defaultPath() else { return nil }
    var handle: OpaquePointer?
    let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
    guard sqlite3_open_v2(path, &handle, flags, nil) == SQLITE_OK, let opened = handle else {
      if let handle = handle { sqlite3_close(handle) }
      return nil
    }
    let base = """
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      horizontal_accuracy REAL NOT NULL,
      arrival_at REAL,
      departure_at REAL,
      received_at REAL NOT NULL
    );
    """
    guard sqlite3_exec(opened, base, nil, nil, nil) == SQLITE_OK else {
      sqlite3_close(opened)
      return nil
    }
    sqlite3_exec(opened, "PRAGMA foreign_keys = ON;", nil, nil, nil)
    db = opened
    // A failed migration is rolled back; visits keep working and the next launch retries.
    _ = migrate(opened)
    return opened
  }

  private func userVersion(_ db: OpaquePointer) -> Int32 {
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, "PRAGMA user_version;", -1, &stmt, nil) == SQLITE_OK else { return 0 }
    defer { sqlite3_finalize(stmt) }
    return sqlite3_step(stmt) == SQLITE_ROW ? sqlite3_column_int(stmt, 0) : 0
  }

  @discardableResult
  private func migrate(_ db: OpaquePointer) -> Bool {
    guard userVersion(db) < 1 else { return true }
    let v1 = """
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_preset INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS visit_tags (
      visit_id INTEGER PRIMARY KEY REFERENCES visits(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id),
      source TEXT NOT NULL CHECK (source IN ('manual', 'auto')),
      place_latitude REAL NOT NULL,
      place_longitude REAL NOT NULL,
      match_distance REAL,
      assigned_at REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS visit_tags_source ON visit_tags(source);
    """
    guard exec(db, "BEGIN IMMEDIATE;") else { return false }
    var ok = exec(db, v1)
    if ok {
      let now = Date().timeIntervalSince1970
      for (index, name) in Self.presetTagNames.enumerated() where ok {
        ok = run(
          db,
          "INSERT OR IGNORE INTO tags (name, is_preset, sort_order, created_at) VALUES (?, 1, ?, ?);",
          [.text(name), .int(Int64(index)), .double(now)]
        )
      }
    }
    if ok { ok = exec(db, "PRAGMA user_version = 1;") }
    if ok, exec(db, "COMMIT;") { return true }
    exec(db, "ROLLBACK;")
    return false
  }

  // MARK: SQL helpers

  private enum Value {
    case int(Int64)
    case double(Double)
    case text(String)
    case null
  }

  private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

  @discardableResult
  private func exec(_ db: OpaquePointer, _ sql: String) -> Bool {
    sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK
  }

  private func prepare(_ db: OpaquePointer, _ sql: String, _ values: [Value]) -> OpaquePointer? {
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return nil }
    for (i, value) in values.enumerated() {
      let idx = Int32(i + 1)
      switch value {
      case .int(let v): sqlite3_bind_int64(stmt, idx, v)
      case .double(let v): sqlite3_bind_double(stmt, idx, v)
      case .text(let v): sqlite3_bind_text(stmt, idx, v, -1, Self.transient)
      case .null: sqlite3_bind_null(stmt, idx)
      }
    }
    return stmt
  }

  private func run(_ db: OpaquePointer, _ sql: String, _ values: [Value]) -> Bool {
    guard let stmt = prepare(db, sql, values) else { return false }
    defer { sqlite3_finalize(stmt) }
    return sqlite3_step(stmt) == SQLITE_DONE
  }

  private func optionalDouble(_ stmt: OpaquePointer?, _ col: Int32) -> Double? {
    sqlite3_column_type(stmt, col) == SQLITE_NULL ? nil : sqlite3_column_double(stmt, col)
  }

  private func text(_ stmt: OpaquePointer?, _ col: Int32) -> String? {
    guard let c = sqlite3_column_text(stmt, col) else { return nil }
    return String(cString: c)
  }

  private func message(_ db: OpaquePointer) -> VisitStoreError {
    .sqlite(String(cString: sqlite3_errmsg(db)))
  }

  // MARK: Visits

  /// Saves a genuine CLVisit, then, if the tagging schema is ready, assigns the tag of the
  /// nearest manually tagged place within 50 m. The visit row is committed first, so a
  /// matching failure can never lose the visit.
  @discardableResult
  func insert(
    latitude: Double, longitude: Double, horizontalAccuracy: Double,
    arrivalAt: Double?, departureAt: Double?, receivedAt: Double
  ) -> Bool {
    queue.sync {
      guard let db = openIfNeeded() else { return false }
      let inserted = run(
        db,
        """
        INSERT INTO visits (latitude, longitude, horizontal_accuracy, arrival_at, departure_at, received_at)
        VALUES (?, ?, ?, ?, ?, ?);
        """,
        [
          .double(latitude), .double(longitude), .double(horizontalAccuracy),
          arrivalAt.map { .double($0) } ?? .null, departureAt.map { .double($0) } ?? .null,
          .double(receivedAt),
        ]
      )
      guard inserted else { return false }
      let visitId = sqlite3_last_insert_rowid(db)
      if userVersion(db) >= 1 {
        autoAssign(
          db, visitId: visitId, latitude: latitude, longitude: longitude,
          horizontalAccuracy: horizontalAccuracy
        )
      }
      return true
    }
  }

  /// Anchors are manual assignments only, joined to their stored visit for accuracy.
  private func manualAnchors(_ db: OpaquePointer, excluding visitId: Int64) -> [PlaceAnchor] {
    let sql = """
    SELECT vt.tag_id, vt.place_latitude, vt.place_longitude, v.horizontal_accuracy
    FROM visit_tags vt JOIN visits v ON v.id = vt.visit_id
    WHERE vt.source = 'manual' AND vt.visit_id != ?;
    """
    guard let stmt = prepare(db, sql, [.int(visitId)]) else { return [] }
    defer { sqlite3_finalize(stmt) }
    var anchors: [PlaceAnchor] = []
    while sqlite3_step(stmt) == SQLITE_ROW {
      anchors.append(PlaceAnchor(
        tagId: sqlite3_column_int64(stmt, 0),
        latitude: sqlite3_column_double(stmt, 1),
        longitude: sqlite3_column_double(stmt, 2),
        horizontalAccuracy: sqlite3_column_double(stmt, 3)
      ))
    }
    return anchors
  }

  private func autoAssign(
    _ db: OpaquePointer, visitId: Int64, latitude: Double, longitude: Double,
    horizontalAccuracy: Double
  ) {
    let anchors = manualAnchors(db, excluding: visitId)
    guard let match = VisitPlaceMatcher.match(
      latitude: latitude, longitude: longitude, horizontalAccuracy: horizontalAccuracy,
      anchors: anchors
    ) else { return }
    // INSERT OR IGNORE: never overwrites an assignment that already exists for this visit.
    _ = run(
      db,
      """
      INSERT OR IGNORE INTO visit_tags
        (visit_id, tag_id, source, place_latitude, place_longitude, match_distance, assigned_at)
      VALUES (?, ?, 'auto', ?, ?, ?, ?);
      """,
      [
        .int(visitId), .int(match.tagId), .double(latitude), .double(longitude),
        .double(match.distance), .double(Date().timeIntervalSince1970),
      ]
    )
  }

  func fetch(limit: Int) -> [StoredVisit] {
    queue.sync {
      guard let db = openIfNeeded() else { return [] }
      let tagged = userVersion(db) >= 1
      let sql = tagged
        ? """
          SELECT v.id, v.latitude, v.longitude, v.horizontal_accuracy, v.arrival_at, v.departure_at,
                 v.received_at, vt.tag_id, t.name, vt.source, vt.match_distance
          FROM visits v
          LEFT JOIN visit_tags vt ON vt.visit_id = v.id
          LEFT JOIN tags t ON t.id = vt.tag_id
          ORDER BY v.received_at DESC, v.id DESC LIMIT ?;
          """
        : """
          SELECT id, latitude, longitude, horizontal_accuracy, arrival_at, departure_at, received_at
          FROM visits ORDER BY received_at DESC, id DESC LIMIT ?;
          """
      guard let stmt = prepare(db, sql, [.int(Int64(max(1, limit)))]) else { return [] }
      defer { sqlite3_finalize(stmt) }
      var rows: [StoredVisit] = []
      while sqlite3_step(stmt) == SQLITE_ROW {
        var tag: VisitTagAssignment?
        if tagged, sqlite3_column_type(stmt, 7) != SQLITE_NULL,
           let name = text(stmt, 8), let source = text(stmt, 9).flatMap(TagSource.init) {
          tag = VisitTagAssignment(
            tagId: sqlite3_column_int64(stmt, 7), tagName: name, source: source,
            matchDistance: optionalDouble(stmt, 10)
          )
        }
        rows.append(StoredVisit(
          id: sqlite3_column_int64(stmt, 0),
          latitude: sqlite3_column_double(stmt, 1),
          longitude: sqlite3_column_double(stmt, 2),
          horizontalAccuracy: sqlite3_column_double(stmt, 3),
          arrivalAt: optionalDouble(stmt, 4),
          departureAt: optionalDouble(stmt, 5),
          receivedAt: sqlite3_column_double(stmt, 6),
          tag: tag
        ))
      }
      return rows
    }
  }

  func count() -> Int {
    queue.sync {
      guard let db = openIfNeeded(),
            let stmt = prepare(db, "SELECT COUNT(*) FROM visits;", []) else { return 0 }
      defer { sqlite3_finalize(stmt) }
      return sqlite3_step(stmt) == SQLITE_ROW ? Int(sqlite3_column_int64(stmt, 0)) : 0
    }
  }

  // MARK: Tags

  private func readyDB() throws -> OpaquePointer {
    guard let db = openIfNeeded() else { throw VisitStoreError.unavailable }
    if userVersion(db) < 1, !migrate(db) { throw message(db) }
    return db
  }

  static func normalizedName(_ raw: String) -> String? {
    let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty, name.count <= maxTagNameLength else { return nil }
    return name
  }

  func tags() throws -> [PlaceTag] {
    try queue.sync {
      let db = try readyDB()
      guard let stmt = prepare(
        db, "SELECT id, name, is_preset FROM tags ORDER BY is_preset DESC, sort_order, id;", []
      ) else { throw message(db) }
      defer { sqlite3_finalize(stmt) }
      var rows: [PlaceTag] = []
      while sqlite3_step(stmt) == SQLITE_ROW {
        rows.append(PlaceTag(
          id: sqlite3_column_int64(stmt, 0), name: text(stmt, 1) ?? "",
          isPreset: sqlite3_column_int(stmt, 2) != 0
        ))
      }
      return rows
    }
  }

  private func nameExists(_ db: OpaquePointer, _ name: String, excluding id: Int64) -> Bool {
    guard let stmt = prepare(db, "SELECT 1 FROM tags WHERE name = ? AND id != ?;", [.text(name), .int(id)])
    else { return false }
    defer { sqlite3_finalize(stmt) }
    return sqlite3_step(stmt) == SQLITE_ROW
  }

  func createTag(name raw: String) throws -> PlaceTag {
    guard let name = Self.normalizedName(raw) else { throw VisitStoreError.invalidName }
    return try queue.sync {
      let db = try readyDB()
      if nameExists(db, name, excluding: -1) { throw VisitStoreError.duplicateName }
      guard run(
        db,
        "INSERT INTO tags (name, is_preset, sort_order, created_at) VALUES (?, 0, 0, ?);",
        [.text(name), .double(Date().timeIntervalSince1970)]
      ) else { throw message(db) }
      return PlaceTag(id: sqlite3_last_insert_rowid(db), name: name, isPreset: false)
    }
  }

  func renameTag(id: Int64, name raw: String) throws -> PlaceTag {
    guard let name = Self.normalizedName(raw) else { throw VisitStoreError.invalidName }
    return try queue.sync {
      let db = try readyDB()
      guard let stmt = prepare(db, "SELECT is_preset FROM tags WHERE id = ?;", [.int(id)])
      else { throw message(db) }
      let found = sqlite3_step(stmt) == SQLITE_ROW
      let preset = found && sqlite3_column_int(stmt, 0) != 0
      sqlite3_finalize(stmt)
      guard found else { throw VisitStoreError.notFound }
      guard !preset else { throw VisitStoreError.presetNotRenamable }
      if nameExists(db, name, excluding: id) { throw VisitStoreError.duplicateName }
      guard run(db, "UPDATE tags SET name = ? WHERE id = ?;", [.text(name), .int(id)])
      else { throw message(db) }
      return PlaceTag(id: id, name: name, isPreset: false)
    }
  }

  /// Manual assignment on a stored visit. The visit's own coordinates become the tagged
  /// place, which later visits can match. Replaces any previous manual or auto assignment.
  func setVisitTag(visitId: Int64, tagId: Int64) throws {
    try queue.sync {
      let db = try readyDB()
      guard let stmt = prepare(db, "SELECT latitude, longitude FROM visits WHERE id = ?;", [.int(visitId)])
      else { throw message(db) }
      let found = sqlite3_step(stmt) == SQLITE_ROW
      let lat = found ? sqlite3_column_double(stmt, 0) : 0
      let lon = found ? sqlite3_column_double(stmt, 1) : 0
      sqlite3_finalize(stmt)
      guard found, tagExists(db, tagId) else { throw VisitStoreError.notFound }
      guard run(
        db,
        """
        INSERT OR REPLACE INTO visit_tags
          (visit_id, tag_id, source, place_latitude, place_longitude, match_distance, assigned_at)
        VALUES (?, ?, 'manual', ?, ?, NULL, ?);
        """,
        [.int(visitId), .int(tagId), .double(lat), .double(lon), .double(Date().timeIntervalSince1970)]
      ) else { throw message(db) }
    }
  }

  /// Removes the assignment of a stored visit. Existing visits are never auto-matched again,
  /// so a cleared visit stays cleared.
  func clearVisitTag(visitId: Int64) throws {
    try queue.sync {
      let db = try readyDB()
      guard run(db, "DELETE FROM visit_tags WHERE visit_id = ?;", [.int(visitId)])
      else { throw message(db) }
    }
  }

  private func tagExists(_ db: OpaquePointer, _ id: Int64) -> Bool {
    guard let stmt = prepare(db, "SELECT 1 FROM tags WHERE id = ?;", [.int(id)]) else { return false }
    defer { sqlite3_finalize(stmt) }
    return sqlite3_step(stmt) == SQLITE_ROW
  }

  /// Test support only.
  func schemaVersionForTesting() -> Int32 {
    queue.sync { openIfNeeded().map(userVersion) ?? -1 }
  }
}
