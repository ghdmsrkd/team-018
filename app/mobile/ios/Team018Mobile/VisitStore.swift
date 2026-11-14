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
  /// Place ID the user picked for this visit, if any: a Google place ID as-is, or a Kakao
  /// place id prefixed with "kakao:". Names, addresses and coordinates from the provider are
  /// not stored; showing a name again needs a later lookup by ID.
  var googlePlaceId: String? = nil
  /// Set only for test seed rows (visit_seeds), never for real CLVisit callbacks.
  var seed: SeedInfo? = nil
}

struct SeedInfo {
  let key: String
  let placeName: String
  let placeCategory: String?
}

/// One test seed visit supplied by JS: a public place with made-up times.
struct SeedVisit {
  let key: String
  let placeName: String
  let placeCategory: String?
  let latitude: Double
  let longitude: Double
  let horizontalAccuracy: Double
  let arrivalAt: Double
  let departureAt: Double?
  /// Preset tag name to apply as a manual tag, if it exists in the catalog.
  let tagName: String?
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
/// - 2: adds `visit_places` (visit → provider place ID only; Google as-is, Kakao as
///   "kakao:<id>"). Additive only.
/// - 3: adds `visit_seeds` (marks test seed rows, with their public place name). Additive only.
final class VisitStore {
  static let shared = VisitStore(path: nil)
  static let schemaVersion: Int32 = 3
  static let maxSeedCount = 200
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
    if userVersion(db) < 1, !migrateV1(db) { return false }
    if userVersion(db) < 2, !migrateV2(db) { return false }
    if userVersion(db) < 3, !migrateV3(db) { return false }
    return true
  }

  /// Visit → Google place ID, chosen by the user from nearby candidates. Separate table so
  /// existing visit rows are never altered; one row per visit.
  private func migrateV2(_ db: OpaquePointer) -> Bool {
    let v2 = """
    CREATE TABLE IF NOT EXISTS visit_places (
      visit_id INTEGER PRIMARY KEY REFERENCES visits(id) ON DELETE CASCADE,
      google_place_id TEXT NOT NULL,
      chosen_at REAL NOT NULL
    );
    """
    guard exec(db, "BEGIN IMMEDIATE;") else { return false }
    if exec(db, v2), exec(db, "PRAGMA user_version = 2;"), exec(db, "COMMIT;") { return true }
    exec(db, "ROLLBACK;")
    return false
  }

  /// Test seed markers. A visit is a seed only if it has a row here; real CLVisit rows never do.
  private func migrateV3(_ db: OpaquePointer) -> Bool {
    let v3 = """
    CREATE TABLE IF NOT EXISTS visit_seeds (
      visit_id INTEGER PRIMARY KEY REFERENCES visits(id) ON DELETE CASCADE,
      seed_key TEXT NOT NULL UNIQUE,
      place_name TEXT NOT NULL,
      place_category TEXT,
      seeded_at REAL NOT NULL
    );
    """
    guard exec(db, "BEGIN IMMEDIATE;") else { return false }
    if exec(db, v3), exec(db, "PRAGMA user_version = 3;"), exec(db, "COMMIT;") { return true }
    exec(db, "ROLLBACK;")
    return false
  }

  private func migrateV1(_ db: OpaquePointer) -> Bool {
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
    WHERE vt.source = 'manual' AND vt.visit_id != ?
      \(userVersion(db) >= 3 ? "AND vt.visit_id NOT IN (SELECT visit_id FROM visit_seeds)" : "");
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
      return readVisits(
        db, where: "1", order: "v.received_at DESC, v.id DESC LIMIT ?",
        values: [.int(Int64(max(1, limit)))]
      )
    }
  }

  /// Every visit that can overlap [from, to) (Unix seconds), with no row limit, so long
  /// periods (a whole year) are never truncated. Rows with a departure are included when
  /// their stay overlaps the range. Rows without a departure (an arrival callback that never
  /// got its departure row, or a stay in progress) are included only when they start in the
  /// range or after `openSince`, so stale open rows from long ago are not returned for every
  /// later period. The start time is arrival, else departure, else received time.
  func fetchRange(from: Double, to: Double, openSince: Double) -> [StoredVisit] {
    queue.sync {
      guard let db = openIfNeeded() else { return [] }
      let start = "COALESCE(v.arrival_at, v.departure_at, v.received_at)"
      return readVisits(
        db,
        where: """
        \(start) < ? AND (
          (v.departure_at IS NOT NULL AND v.departure_at > ?)
          OR (v.departure_at IS NULL AND \(start) >= MIN(?, ?))
        )
        """,
        order: "\(start) ASC, v.id ASC",
        values: [.double(to), .double(from), .double(from), .double(openSince)]
      )
    }
  }

  private func readVisits(
    _ db: OpaquePointer, where condition: String, order: String, values: [Value]
  ) -> [StoredVisit] {
    do {
      let version = userVersion(db)
      let tagged = version >= 1
      let placed = version >= 2
      let seeded = version >= 3
      let sql = tagged
        ? """
          SELECT v.id, v.latitude, v.longitude, v.horizontal_accuracy, v.arrival_at, v.departure_at,
                 v.received_at, vt.tag_id, t.name, vt.source, vt.match_distance,
                 \(placed ? "vp.google_place_id" : "NULL"),
                 \(seeded ? "vs.seed_key, vs.place_name, vs.place_category" : "NULL, NULL, NULL")
          FROM visits v
          LEFT JOIN visit_tags vt ON vt.visit_id = v.id
          LEFT JOIN tags t ON t.id = vt.tag_id
          \(placed ? "LEFT JOIN visit_places vp ON vp.visit_id = v.id" : "")
          \(seeded ? "LEFT JOIN visit_seeds vs ON vs.visit_id = v.id" : "")
          WHERE \(condition)
          ORDER BY \(order);
          """
        : """
          SELECT v.id, v.latitude, v.longitude, v.horizontal_accuracy, v.arrival_at, v.departure_at,
                 v.received_at
          FROM visits v WHERE \(condition) ORDER BY \(order);
          """
      guard let stmt = prepare(db, sql, values) else { return [] }
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
          tag: tag,
          googlePlaceId: tagged ? text(stmt, 11) : nil,
          seed: tagged ? text(stmt, 12).flatMap { key in
            text(stmt, 13).map {
              SeedInfo(key: key, placeName: $0, placeCategory: text(stmt, 14))
            }
          } : nil
        ))
      }
      return rows
    }
  }

  // MARK: Test seed visits

  static func isValidSeed(_ s: SeedVisit) -> Bool {
    let keyOK = !s.key.isEmpty && s.key.count <= 64 && s.key.unicodeScalars.allSatisfy {
      ($0.isASCII && CharacterSet.alphanumerics.contains($0)) || $0 == "-" || $0 == "_"
    }
    let nameOK = !s.placeName.trimmingCharacters(in: .whitespaces).isEmpty && s.placeName.count <= 60
    let coordOK = VisitPlaceMatcher.isUsable(
      latitude: s.latitude, longitude: s.longitude, horizontalAccuracy: s.horizontalAccuracy
    )
    let timeOK = s.arrivalAt.isFinite && (s.departureAt.map { $0.isFinite && $0 >= s.arrivalAt } ?? true)
    return keyOK && nameOK && coordOK && timeOK
  }

  /// Inserts test seed visits in one transaction. Keys already present are skipped, so
  /// retries and relaunches never duplicate. Seeds never run 50 m auto-matching and are
  /// excluded from matching anchors. Returns how many rows were inserted.
  @discardableResult
  func insertSeeds(_ seeds: [SeedVisit]) throws -> Int {
    guard seeds.count <= Self.maxSeedCount, seeds.allSatisfy(Self.isValidSeed),
          Set(seeds.map(\.key)).count == seeds.count
    else { throw VisitStoreError.invalidName }
    return try queue.sync {
      let db = try readyDB()
      guard exec(db, "BEGIN IMMEDIATE;") else { throw message(db) }
      var inserted = 0
      var ok = true
      let now = Date().timeIntervalSince1970
      for s in seeds where ok {
        guard let stmt = prepare(db, "SELECT 1 FROM visit_seeds WHERE seed_key = ?;", [.text(s.key)])
        else { ok = false; break }
        let exists = sqlite3_step(stmt) == SQLITE_ROW
        sqlite3_finalize(stmt)
        if exists { continue }
        ok = run(
          db,
          """
          INSERT INTO visits (latitude, longitude, horizontal_accuracy, arrival_at, departure_at, received_at)
          VALUES (?, ?, ?, ?, ?, ?);
          """,
          [
            .double(s.latitude), .double(s.longitude), .double(s.horizontalAccuracy),
            .double(s.arrivalAt), s.departureAt.map { .double($0) } ?? .null,
            .double(min(now, (s.departureAt ?? s.arrivalAt) + 12 * 60)),
          ]
        )
        guard ok else { break }
        let visitId = sqlite3_last_insert_rowid(db)
        ok = run(
          db,
          "INSERT INTO visit_seeds (visit_id, seed_key, place_name, place_category, seeded_at) VALUES (?, ?, ?, ?, ?);",
          [.int(visitId), .text(s.key), .text(s.placeName), s.placeCategory.map { .text($0) } ?? .null, .double(now)]
        )
        if ok, let tagName = s.tagName,
           let tstmt = prepare(db, "SELECT id FROM tags WHERE name = ? AND is_preset = 1;", [.text(tagName)]) {
          let tagId: Int64? = sqlite3_step(tstmt) == SQLITE_ROW ? sqlite3_column_int64(tstmt, 0) : nil
          sqlite3_finalize(tstmt)
          if let tagId = tagId {
            ok = run(
              db,
              """
              INSERT INTO visit_tags
                (visit_id, tag_id, source, place_latitude, place_longitude, match_distance, assigned_at)
              VALUES (?, ?, 'manual', ?, ?, NULL, ?);
              """,
              [.int(visitId), .int(tagId), .double(s.latitude), .double(s.longitude), .double(now)]
            )
          }
        }
        if ok { inserted += 1 }
      }
      if ok, exec(db, "COMMIT;") { return inserted }
      exec(db, "ROLLBACK;")
      throw message(db)
    }
  }

  /// Deletes only seed rows (and their tags/place links). Real visits are untouched.
  @discardableResult
  func deleteSeeds() throws -> Int {
    try queue.sync {
      let db = try readyDB()
      let before = seedCountLocked(db)
      guard exec(db, "BEGIN IMMEDIATE;") else { throw message(db) }
      let ids = "SELECT visit_id FROM visit_seeds"
      let ok = exec(db, "DELETE FROM visit_tags WHERE visit_id IN (\(ids));")
        && exec(db, "DELETE FROM visit_places WHERE visit_id IN (\(ids));")
        && exec(db, "DELETE FROM visits WHERE id IN (\(ids));")
        && exec(db, "DELETE FROM visit_seeds;")
      if ok, exec(db, "COMMIT;") { return before }
      exec(db, "ROLLBACK;")
      throw message(db)
    }
  }

  private func seedCountLocked(_ db: OpaquePointer) -> Int {
    guard userVersion(db) >= 3, let stmt = prepare(db, "SELECT COUNT(*) FROM visit_seeds;", [])
    else { return 0 }
    defer { sqlite3_finalize(stmt) }
    return sqlite3_step(stmt) == SQLITE_ROW ? Int(sqlite3_column_int64(stmt, 0)) : 0
  }

  /// The stored coordinates of a test seed visit, or nil if the id is not a seed row.
  func seedCoordinate(visitId: Int64) -> (latitude: Double, longitude: Double, accuracy: Double)? {
    queue.sync {
      guard let db = openIfNeeded(), userVersion(db) >= 3,
            let stmt = prepare(
              db,
              """
              SELECT v.latitude, v.longitude, v.horizontal_accuracy FROM visits v
              JOIN visit_seeds s ON s.visit_id = v.id WHERE v.id = ?;
              """,
              [.int(visitId)]
            ) else { return nil }
      defer { sqlite3_finalize(stmt) }
      guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
      return (sqlite3_column_double(stmt, 0), sqlite3_column_double(stmt, 1), sqlite3_column_double(stmt, 2))
    }
  }

  func seedCount() -> Int {
    queue.sync { openIfNeeded().map(seedCountLocked) ?? 0 }
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
    if userVersion(db) < Self.schemaVersion, !migrate(db) { throw message(db) }
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
  /// Google place IDs (stored as-is) or Kakao ids stored as "kakao:<id>". Opaque IDs made of
  /// URL-safe ASCII only; no other prefix is accepted.
  static func isValidPlaceId(_ id: String) -> Bool {
    let body = id.hasPrefix("kakao:") ? String(id.dropFirst("kakao:".count)) : id
    guard !body.isEmpty, id.count <= 256 else { return false }
    return body.unicodeScalars.allSatisfy {
      ($0.isASCII && CharacterSet.alphanumerics.contains($0)) || $0 == "_" || $0 == "-"
    }
  }

  /// Stores only the provider place ID for a stored visit. Tags and 50 m matching are untouched.
  func setVisitPlace(visitId: Int64, placeId: String) throws {
    guard Self.isValidPlaceId(placeId) else { throw VisitStoreError.invalidName }
    try queue.sync {
      let db = try readyDB()
      guard let stmt = prepare(db, "SELECT 1 FROM visits WHERE id = ?;", [.int(visitId)])
      else { throw message(db) }
      let found = sqlite3_step(stmt) == SQLITE_ROW
      sqlite3_finalize(stmt)
      guard found else { throw VisitStoreError.notFound }
      guard run(
        db,
        "INSERT OR REPLACE INTO visit_places (visit_id, google_place_id, chosen_at) VALUES (?, ?, ?);",
        [.int(visitId), .text(placeId), .double(Date().timeIntervalSince1970)]
      ) else { throw message(db) }
    }
  }

  func clearVisitPlace(visitId: Int64) throws {
    try queue.sync {
      let db = try readyDB()
      guard run(db, "DELETE FROM visit_places WHERE visit_id = ?;", [.int(visitId)])
      else { throw message(db) }
    }
  }

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
