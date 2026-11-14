import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Recreate the CLLocationManager/delegate on every launch, including relaunches the
    // system performs for location events (launchOptions[.location]), so visits delivered
    // while JS is not running are still saved natively. Never requests permission here.
    VisitMonitor.shared.activate()
    return true
  }
}
