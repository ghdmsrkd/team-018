import CoreLocation
import Foundation
import Photos
import React
import UIKit

/// Read-only access to the user's photos and videos for the timeline. Never writes to the
/// library and never uploads anything. Authorization is requested only from an explicit
/// button in the timeline tab.
@objc(PhotoLibraryModule)
final class PhotoLibraryModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  private static func describe(_ s: PHAuthorizationStatus) -> String {
    switch s {
    case .notDetermined: return "notDetermined"
    case .restricted: return "restricted"
    case .denied: return "denied"
    case .authorized: return "authorized"
    case .limited: return "limited"
    @unknown default: return "unknown"
    }
  }

  private static var status: PHAuthorizationStatus {
    PHPhotoLibrary.authorizationStatus(for: .readWrite)
  }

  private static var canRead: Bool { status == .authorized || status == .limited }

  @objc func getAuthorization(
    _ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(Self.describe(Self.status))
  }

  @objc func requestAuthorization(
    _ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    PHPhotoLibrary.requestAuthorization(for: .readWrite) { s in resolve(Self.describe(s)) }
  }

  /// Photos and videos created in [fromMs, toMs). Metadata only; thumbnails are separate.
  @objc func getAssets(
    _ fromMs: NSNumber, toMs: NSNumber, resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard Self.canRead else { resolve([]); return }
    DispatchQueue.global(qos: .userInitiated).async {
      let options = PHFetchOptions()
      options.predicate = NSPredicate(
        format: "creationDate >= %@ AND creationDate < %@ AND (mediaType == %d OR mediaType == %d)",
        Date(timeIntervalSince1970: fromMs.doubleValue / 1000) as NSDate,
        Date(timeIntervalSince1970: toMs.doubleValue / 1000) as NSDate,
        PHAssetMediaType.image.rawValue, PHAssetMediaType.video.rawValue
      )
      options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
      let result = PHAsset.fetchAssets(with: options)
      var rows: [[String: Any]] = []
      result.enumerateObjects { asset, _, _ in
        guard let created = asset.creationDate else { return }
        var row: [String: Any] = [
          "id": asset.localIdentifier,
          "mediaType": asset.mediaType == .video ? "video" : "photo",
          "createdAt": created.timeIntervalSince1970 * 1000,
          "duration": asset.duration,
          "width": asset.pixelWidth,
          "height": asset.pixelHeight,
        ]
        if let loc = asset.location, CLLocationCoordinate2DIsValid(loc.coordinate),
           loc.horizontalAccuracy >= 0 {
          row["latitude"] = loc.coordinate.latitude
          row["longitude"] = loc.coordinate.longitude
        }
        rows.append(row)
      }
      resolve(rows)
    }
  }

  /// Renders an asset (a video's poster frame) to a JPEG in the caches directory and returns
  /// its file URL. Files are cache only and can be purged by iOS.
  @objc func getThumbnail(
    _ assetId: String, size: NSNumber, resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard Self.canRead else { reject("photos", "Photo access is not granted.", nil); return }
    guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil).firstObject
    else { reject("photos", "Asset not found.", nil); return }
    let px = CGFloat(max(64, min(2048, size.intValue)))
    let safeName = assetId.replacingOccurrences(of: "/", with: "_")
    let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("haru-thumbs", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let file = dir.appendingPathComponent("\(safeName)-\(Int(px)).jpg")
    if FileManager.default.fileExists(atPath: file.path) {
      resolve(file.absoluteString)
      return
    }
    let options = PHImageRequestOptions()
    options.deliveryMode = .highQualityFormat
    options.isNetworkAccessAllowed = true
    options.resizeMode = .fast
    PHImageManager.default().requestImage(
      for: asset, targetSize: CGSize(width: px, height: px), contentMode: .aspectFill,
      options: options
    ) { image, info in
      if (info?[PHImageResultIsDegradedKey] as? Bool) == true { return }
      guard let image = image, let data = image.jpegData(compressionQuality: 0.82) else {
        reject("photos", "Could not load the image.", nil)
        return
      }
      do {
        try data.write(to: file, options: .atomic)
        resolve(file.absoluteString)
      } catch {
        reject("photos", error.localizedDescription, error)
      }
    }
  }
}
