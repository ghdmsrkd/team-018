import CoreLocation
import Foundation

/// A place the user tagged by hand on a real, stored visit. Only manual assignments are
/// anchors; automatic matches and JS-only sample rows never are.
struct PlaceAnchor {
  let tagId: Int64
  let latitude: Double
  let longitude: Double
  let horizontalAccuracy: Double
}

struct PlaceMatch: Equatable {
  let tagId: Int64
  let distance: CLLocationDistance
}

enum VisitPlaceMatcher {
  /// Maximum distance between a new visit and a manually tagged place for an automatic match.
  static let maxDistance: CLLocationDistance = 50
  /// Distances closer together than this (1 mm) count as equally near.
  static let tieTolerance: CLLocationDistance = 0.001

  /// A coordinate is usable only if Core Location considers it valid and its accuracy is not
  /// negative (Core Location uses a negative horizontalAccuracy for an invalid location).
  static func isUsable(latitude: Double, longitude: Double, horizontalAccuracy: Double) -> Bool {
    guard latitude.isFinite, longitude.isFinite, horizontalAccuracy.isFinite else { return false }
    guard horizontalAccuracy >= 0 else { return false }
    return CLLocationCoordinate2DIsValid(CLLocationCoordinate2D(latitude: latitude, longitude: longitude))
  }

  /// Returns the tag of the nearest anchor within `maxDistance`, measured with
  /// CLLocation.distance(from:). Returns nil when nothing is close enough, when the visit
  /// coordinate is unusable, or when anchors with different tags are equally nearest.
  static func match(
    latitude: Double, longitude: Double, horizontalAccuracy: Double, anchors: [PlaceAnchor]
  ) -> PlaceMatch? {
    guard isUsable(latitude: latitude, longitude: longitude, horizontalAccuracy: horizontalAccuracy)
    else { return nil }
    let visitLocation = CLLocation(latitude: latitude, longitude: longitude)

    var best: CLLocationDistance = .infinity
    var bestTags = Set<Int64>()
    for anchor in anchors {
      guard isUsable(
        latitude: anchor.latitude, longitude: anchor.longitude,
        horizontalAccuracy: anchor.horizontalAccuracy
      ) else { continue }
      let d = visitLocation.distance(
        from: CLLocation(latitude: anchor.latitude, longitude: anchor.longitude))
      guard d.isFinite, d <= maxDistance else { continue }
      if d < best - tieTolerance {
        best = d
        bestTags = [anchor.tagId]
      } else if abs(d - best) <= tieTolerance {
        best = min(best, d)
        bestTags.insert(anchor.tagId)
      }
    }
    guard bestTags.count == 1, let tagId = bestTags.first else { return nil }
    return PlaceMatch(tagId: tagId, distance: best)
  }
}
