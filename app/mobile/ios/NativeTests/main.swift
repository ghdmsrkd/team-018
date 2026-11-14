// Native logic tests for VisitStore + VisitPlaceMatcher. Run with ios/NativeTests/run.sh.
// Compiles the app's real source files on macOS against a temporary SQLite database.
import CoreLocation
import Foundation
import SQLite3

var failures = 0
func check(_ ok: Bool, _ name: String, line: Int = #line) {
  print(ok ? "PASS" : "FAIL", name)
  if !ok { failures += 1; print("  at line \(line)") }
}
func expectThrows(_ name: String, _ body: () throws -> Void) {
  do { try body(); check(false, name) } catch { check(true, name) }
}

let dir = FileManager.default.temporaryDirectory.appendingPathComponent("visitstore-tests-\(UUID())")
try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
let path = dir.appendingPathComponent("visits.sqlite").path

// 1. Build a v0 database exactly like the shipped schema, with one existing visit.
do {
  var db: OpaquePointer?
  sqlite3_open(path, &db)
  sqlite3_exec(db, """
    CREATE TABLE visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT, latitude REAL NOT NULL, longitude REAL NOT NULL,
      horizontal_accuracy REAL NOT NULL, arrival_at REAL, departure_at REAL, received_at REAL NOT NULL);
    INSERT INTO visits (latitude, longitude, horizontal_accuracy, arrival_at, departure_at, received_at)
    VALUES (37.5, 127.0, 20, 1000, NULL, 2000);
    """, nil, nil, nil)
  sqlite3_close(db)
}

// 2. Migration is non-destructive.
var store = VisitStore(path: path)
var visits = store.fetch(limit: 50)
check(visits.count == 1, "existing visit preserved after migration")
check(visits.first?.departureAt == nil && visits.first?.arrivalAt == 1000, "existing visit fields intact")
check(store.schemaVersionForTesting() == 1, "schema version is 1")
let tags = try! store.tags()
check(tags.filter(\.isPreset).count >= 20, "20+ preset tags (\(tags.count))")
for name in ["집", "회사", "카페", "미용실", "식당"] {
  check(tags.contains { $0.name == name && $0.isPreset }, "preset \(name)")
}

// Reopening does not duplicate presets or lose data.
store = VisitStore(path: path)
check(try! store.tags().count == tags.count, "reopen keeps preset count")
check(store.count() == 1, "reopen keeps visits")

func tagId(_ name: String) -> Int64 { try! store.tags().first { $0.name == name }!.id }
let home = tagId("집"), cafe = tagId("카페"), salon = tagId("미용실")
let oldVisit = visits[0].id

// 3. Tag management.
let custom = try! store.createTag(name: "  단골 빵집 ")
check(custom.name == "단골 빵집" && !custom.isPreset, "create trims name")
expectThrows("duplicate name rejected") { _ = try store.createTag(name: "카페") }
expectThrows("empty name rejected") { _ = try store.createTag(name: "   ") }
expectThrows("preset rename rejected") { _ = try store.renameTag(id: home, name: "우리집") }
let renamed = try! store.renameTag(id: custom.id, name: "빵집")
check(renamed.name == "빵집", "custom rename")
expectThrows("negative sample id cannot be tagged") { try store.setVisitTag(visitId: -1, tagId: home) }
expectThrows("unknown tag rejected") { try store.setVisitTag(visitId: oldVisit, tagId: 999_999) }

// 4. Manual tag on existing visit becomes an anchor.
try! store.setVisitTag(visitId: oldVisit, tagId: home)
check(store.fetch(limit: 50).first { $0.id == oldVisit }?.tag?.source == .manual, "manual assignment stored")

func newest() -> StoredVisit { store.fetch(limit: 1)[0] }
func addVisit(_ lat: Double, _ lon: Double, accuracy: Double = 20) -> StoredVisit {
  _ = store.insert(latitude: lat, longitude: lon, horizontalAccuracy: accuracy,
                   arrivalAt: nil, departureAt: nil, receivedAt: Date().timeIntervalSince1970 + Double(store.count()))
  return newest()
}
func meters(_ a: (Double, Double), _ b: (Double, Double)) -> Double {
  CLLocation(latitude: a.0, longitude: a.1).distance(from: CLLocation(latitude: b.0, longitude: b.1))
}

// 5. Auto match within 50 m.
let near = (37.5003, 127.0) // ~33 m north
check(meters((37.5, 127.0), near) < 50, "fixture near is < 50 m")
let v1 = addVisit(near.0, near.1)
check(v1.tag?.tagId == home && v1.tag?.source == .auto, "new visit within 50 m auto-tagged 집")
check(abs((v1.tag?.matchDistance ?? -1) - meters((37.5, 127.0), near)) < 0.01, "match distance recorded")

// 6. No match beyond 50 m.
let far = (37.5006, 127.0) // ~67 m
check(meters((37.5, 127.0), far) > 50, "fixture far is > 50 m")
check(addVisit(far.0, far.1).tag == nil, "visit beyond 50 m unassigned")

// 7. Auto matches are not anchors: v1 (auto 집) is ~33 m from this point, the manual anchor ~65 m.
let chain = (37.5003 + 0.00029, 127.0)
check(meters((37.5, 127.0), chain) > 50 && meters(near, chain) < 50, "chain fixture geometry")
check(addVisit(chain.0, chain.1).tag == nil, "auto-matched visit is not a training anchor")

// 8. Invalid coordinate or accuracy never matches.
check(addVisit(37.5, 127.0, accuracy: -1).tag == nil, "negative accuracy not matched")
check(addVisit(91, 127.0).tag == nil, "invalid coordinate not matched")

// 9. Nearest wins; equally near conflicting tags stay unassigned.
let a = addVisit(35.0, 129.0); try! store.setVisitTag(visitId: a.id, tagId: cafe)
let b = addVisit(35.0, 129.0004); try! store.setVisitTag(visitId: b.id, tagId: salon) // ~36 m east
check(addVisit(35.0, 129.0001).tag?.tagId == cafe, "nearest manual place wins")
let mid = addVisit(35.0, 129.0002) // exactly between a and b
check(mid.tag == nil, "equal distance with different tags stays unassigned")

// Same tag at equal distance is not a conflict.
let c = addVisit(34.0, 128.0); try! store.setVisitTag(visitId: c.id, tagId: cafe)
let d = addVisit(34.0, 128.0004); try! store.setVisitTag(visitId: d.id, tagId: cafe)
check(addVisit(34.0, 128.0002).tag?.tagId == cafe, "equal distance with same tag matches")

// 10. Manual edits preserved: auto -> manual override, clear stays cleared.
try! store.setVisitTag(visitId: v1.id, tagId: salon)
let overridden = store.fetch(limit: 100).first { $0.id == v1.id }?.tag
check(overridden?.tagId == salon && overridden?.source == .manual, "manual change overrides auto")
try! store.clearVisitTag(visitId: v1.id)
_ = addVisit(10, 10) // unrelated new visit must not re-tag old ones
check(store.fetch(limit: 100).first { $0.id == v1.id }?.tag == nil, "cleared visit stays cleared")

// Renamed custom tag is reflected on visits.
try! store.setVisitTag(visitId: a.id, tagId: custom.id)
_ = try! store.renameTag(id: custom.id, name: "동네 빵집")
check(store.fetch(limit: 100).first { $0.id == a.id }?.tag?.tagName == "동네 빵집", "rename reflected on visit")

// Pure matcher: boundary at exactly <= 50 m.
let anchor = PlaceAnchor(tagId: 1, latitude: 0, longitude: 0, horizontalAccuracy: 5)
let edge = VisitPlaceMatcher.match(latitude: 0.0004491, longitude: 0, horizontalAccuracy: 5, anchors: [anchor])
let edgeD = meters((0, 0), (0.0004491, 0))
check((edgeD <= 50) == (edge != nil), "boundary follows distance <= 50 (\(edgeD) m)")

try? FileManager.default.removeItem(at: dir)
print(failures == 0 ? "ALL PASSED" : "\(failures) FAILED")
exit(failures == 0 ? 0 : 1)
