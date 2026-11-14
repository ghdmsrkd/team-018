#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (PhotoLibraryModule, NSObject)

RCT_EXTERN_METHOD(getAuthorization : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(requestAuthorization : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getAssets : (nonnull NSNumber *)fromMs toMs : (nonnull NSNumber *)toMs resolve : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getThumbnail : (nonnull NSString *)assetId size : (nonnull NSNumber *)size resolve : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)

@end
